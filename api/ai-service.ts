// AIServiceHub 공개 앱/프롬프트 API 프록시 + AIServiceHub → ClassLog 연동 엔드포인트 (통합)
//
// GET  : AIServiceHub의 x-api-key는 서버 비밀값이라 브라우저에서 직접 호출할 수 없음 →
//        클래스로그 서버에서 대신 호출해 결과만 클라이언트로 전달한다. (resource=apps|prompts)
// POST : AIServiceHub 서버가 웹훅 시크릿으로 인증해 호출하는 연동 엔드포인트.
//        resource=class-sync    : AIServiceHub 강좌를 ClassLog 클래스로 동기화(생성)한다.
//        resource=submission    : 바이브코딩 스튜디오 등 외부 앱에서 제출한 학생 결과물을 기록한다.
//
// Vercel Hobby 플랜의 서버리스 함수 개수 제한(배포당 12개)에 걸리지 않도록
// 여러 엔드포인트를 하나로 합쳤다 — ?resource=... 로 구분.

import { createClient } from '@supabase/supabase-js';

const ENTRY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O, 1/I 제외

function randomEntryCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ENTRY_CODE_CHARS[Math.floor(Math.random() * ENTRY_CODE_CHARS.length)];
  }
  return code;
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function checkWebhookSecret(req: any, res: any): boolean {
  const expected = process.env.AISERVICEHUB_WEBHOOK_SECRET;
  const provided = req.headers['x-webhook-secret'];
  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'invalid webhook secret' });
    return false;
  }
  return true;
}

async function handleGet(req: any, res: any) {
  const { resource, id, category, tag, limit, offset } = req.query;
  if (resource !== 'apps' && resource !== 'prompts') {
    return res.status(400).json({ error: 'resource must be "apps" or "prompts"' });
  }

  const baseUrl = process.env.AISERVICEHUB_BASE_URL || 'https://ai-service-hub.vercel.app';
  const apiKey = process.env.AISERVICEHUB_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'AISERVICEHUB_API_KEY not configured on server' });
  }

  const upstreamUrl = new URL(
    id ? `/api/public/${resource}/${encodeURIComponent(String(id))}` : `/api/public/${resource}`,
    baseUrl
  );
  if (!id) {
    // ClassLog는 "학습 도구" 카탈로그 용도로만 apps를 조회하므로, 마켓플레이스 전체 공개 앱이 아니라
    // classlog_only=true로 체크된 앱만 받아오도록 항상 좁혀서 요청한다.
    if (resource === 'apps') upstreamUrl.searchParams.set('classlogOnly', 'true');
    if (category) upstreamUrl.searchParams.set('category', String(category));
    if (tag) upstreamUrl.searchParams.set('tag', String(tag));
    if (limit) upstreamUrl.searchParams.set('limit', String(limit));
    if (offset) upstreamUrl.searchParams.set('offset', String(offset));
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: { 'x-api-key': apiKey },
    });
    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (error: any) {
    console.error('[api/ai-service] error:', error?.message);
    return res.status(500).json({ error: `AIServiceHub ${resource} 조회 중 오류가 발생했습니다.` });
  }
}

// resource=class-sync
// AIServiceHub의 강좌(course)를 ClassLog 클래스로 생성/동기화한다.
// body: { external_ref_id, teacher_email, class_name, subject?, allow_self_signup? }
async function handleClassSync(req: any, res: any) {
  if (!checkWebhookSecret(req, res)) return;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    console.error('[api/ai-service:class-sync] Missing Supabase env variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { external_ref_id, teacher_email, class_name, subject, allow_self_signup } = req.body || {};
  if (!external_ref_id || !teacher_email || !class_name) {
    return res.status(400).json({ error: 'external_ref_id, teacher_email, class_name은 필수입니다.' });
  }

  // idempotency: 이미 동기화된 강좌면 기존 클래스 정보를 그대로 반환
  const { data: existingClass } = await supabaseAdmin
    .from('classes')
    .select('id, entry_code')
    .eq('external_ref_id', external_ref_id)
    .maybeSingle();

  if (existingClass) {
    return res.status(200).json({
      ok: true,
      class_id: existingClass.id,
      entry_code: existingClass.entry_code,
      join_url: `${req.headers.origin ?? ''}/join?code=${existingClass.entry_code}`,
      already_synced: true,
    });
  }

  // 교사 계정 매칭 (email 기준)
  const { data: teacherProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', teacher_email)
    .eq('role', 'teacher')
    .maybeSingle();

  if (!teacherProfile?.id) {
    return res.status(409).json({ error: 'TEACHER_NOT_FOUND', message: 'ClassLog에 가입된 교사 계정을 찾을 수 없습니다.' });
  }

  // entry_code 생성 (충돌 시 재시도) — api/demo-provision.ts와 동일한 패턴
  let classId: string | null = null;
  let entryCode = '';
  for (let attempt = 0; attempt < 5 && !classId; attempt++) {
    entryCode = randomEntryCode();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('classes')
      .insert({
        teacher_id: teacherProfile.id,
        name: class_name,
        subject: subject ?? null,
        entry_code: entryCode,
        class_type: 'subject',
        source: 'aiservicehub',
        external_ref_id,
        allow_self_signup: !!allow_self_signup,
      })
      .select('id')
      .single();

    if (!insertError && inserted) {
      classId = inserted.id;
    } else if (insertError?.code !== '23505') {
      console.error('[api/ai-service:class-sync] failed to create class:', insertError?.message);
      return res.status(500).json({ error: 'Could not create class' });
    }
  }

  if (!classId) {
    return res.status(500).json({ error: 'Could not allocate entry code' });
  }

  return res.status(200).json({
    ok: true,
    class_id: classId,
    entry_code: entryCode,
    join_url: `${req.headers.origin ?? ''}/join?code=${entryCode}`,
    already_synced: false,
  });
}

// resource=submission
// 바이브코딩 스튜디오 등 외부 앱에서 제출한 학생 결과물을 student_results에 기록한다.
// body: { entry_code, student_id?, student_name?, title, result_type:'link'|'text', link_url?, text_content? }
async function handleSubmission(req: any, res: any) {
  if (!checkWebhookSecret(req, res)) return;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    console.error('[api/ai-service:submission] Missing Supabase env variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { entry_code, student_id, student_name, title, result_type, link_url, text_content } = req.body || {};

  if (!entry_code || !title || !result_type) {
    return res.status(400).json({ error: 'entry_code, title, result_type은 필수입니다.' });
  }
  if (result_type !== 'link' && result_type !== 'text') {
    return res.status(400).json({ error: 'result_type must be "link" or "text"' });
  }
  if (result_type === 'link' && !link_url) {
    return res.status(400).json({ error: 'result_type=link일 때 link_url은 필수입니다.' });
  }
  if (result_type === 'text' && !text_content) {
    return res.status(400).json({ error: 'result_type=text일 때 text_content는 필수입니다.' });
  }
  if (!student_id && !student_name) {
    return res.status(400).json({ error: 'student_id 또는 student_name 중 하나는 필수입니다.' });
  }

  const { data: klass } = await supabaseAdmin
    .from('classes')
    .select('id, linked_class_id')
    .eq('entry_code', entry_code)
    .maybeSingle();

  if (!klass) {
    return res.status(404).json({ error: 'CLASS_NOT_FOUND' });
  }
  const targetClassId = klass.linked_class_id || klass.id;

  let resolvedStudentId: string | null = null;
  if (student_id) {
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('id', student_id)
      .eq('class_id', targetClassId)
      .maybeSingle();
    resolvedStudentId = student?.id ?? null;
  } else {
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('class_id', targetClassId)
      .eq('full_name', student_name)
      .maybeSingle();
    resolvedStudentId = student?.id ?? null;
  }

  if (!resolvedStudentId) {
    return res.status(404).json({ error: 'STUDENT_NOT_FOUND' });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('student_results')
    .insert({
      student_id: resolvedStudentId,
      class_id: targetClassId,
      title,
      result_type,
      link_url: link_url ?? null,
      text_content: text_content ?? null,
      status: 'submitted',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[api/ai-service:submission] failed to insert student_results:', insertError?.message);
    return res.status(500).json({ error: 'Could not save submission' });
  }

  return res.status(200).json({ ok: true, result_id: inserted.id });
}

async function handlePost(req: any, res: any) {
  const { resource } = req.query;
  if (resource === 'class-sync') return handleClassSync(req, res);
  if (resource === 'submission') return handleSubmission(req, res);
  return res.status(400).json({ error: 'resource must be "class-sync" or "submission"' });
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}
