import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';

const DEMO_TEACHER_EMAIL = '__demo_teacher__@internal.saenggilog.app';
const DEMO_CLASS_TTL_MS = 2 * 60 * 60 * 1000; // 2시간
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // IP당 1분 1회
const ENTRY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O, 1/I 제외

function randomEntryCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ENTRY_CODE_CHARS[Math.floor(Math.random() * ENTRY_CODE_CHARS.length)];
  }
  return code;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[api/demo-provision] Missing Supabase env variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Step 0: IP 기준 레이트리밋 (1분 1회) ────────────────────────────────
  const ipRaw = (req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').toString();
  const ip = ipRaw.split(',')[0].trim();
  const ipHash = createHash('sha256').update(ip).digest('hex');

  const { data: existingLog } = await supabaseAdmin
    .from('demo_provision_log')
    .select('last_at')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (existingLog && Date.now() - new Date(existingLog.last_at).getTime() < RATE_LIMIT_WINDOW_MS) {
    return res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
  }

  await supabaseAdmin
    .from('demo_provision_log')
    .upsert({ ip_hash: ipHash, last_at: new Date().toISOString() });

  // ── Step 1: 만료된 데모 학급 정리 (opportunistic cleanup) ────────────────
  await supabaseAdmin
    .from('classes')
    .delete()
    .eq('is_demo', true)
    .lt('demo_expires_at', new Date().toISOString());

  // ── Step 2: 고정 데모 교사 계정 확보 (없으면 생성) ───────────────────────
  let teacherId: string | null = null;

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', DEMO_TEACHER_EMAIL)
    .maybeSingle();

  if (existingProfile?.id) {
    teacherId = existingProfile.id;
  } else {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: DEMO_TEACHER_EMAIL,
      password: randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: '클래스로그 데모 교사' },
    });

    if (createError || !created?.user) {
      console.error('[api/demo-provision] failed to create demo teacher:', createError?.message);
      return res.status(500).json({ error: 'Could not provision demo teacher' });
    }

    teacherId = created.user.id;

    await supabaseAdmin
      .from('profiles')
      .update({
        full_name: '클래스로그 데모 교사',
        role: 'teacher',
        email: DEMO_TEACHER_EMAIL,
        is_approved: true,
        plan: 'pro',
      })
      .eq('id', teacherId);
  }

  // ── Step 3: 데모 학급 생성 (entry_code 충돌 시 재시도) ───────────────────
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + DEMO_CLASS_TTL_MS).toISOString();

  let classId: string | null = null;
  let entryCode = '';
  for (let attempt = 0; attempt < 5 && !classId; attempt++) {
    entryCode = randomEntryCode();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('classes')
      .insert({
        teacher_id: teacherId,
        name: '3학년 생명과학 I',
        subject: '생명과학',
        entry_code: entryCode,
        class_type: 'subject',
        weekly_plan: [
          { week: 4, topic: '세포 분열과 DNA 복제' },
        ],
        active_week: 4,
        today_started_at: nowIso,
        share_enabled: true,
        min_obs_chars: 0,
        ai_review_enabled: true,
        is_demo: true,
        demo_expires_at: expiresAtIso,
      })
      .select('id')
      .single();

    if (!insertError && inserted) {
      classId = inserted.id;
    } else if (insertError?.code !== '23505') {
      // entry_code 유니크 충돌(23505)이 아닌 다른 오류는 즉시 중단
      console.error('[api/demo-provision] failed to create demo class:', insertError?.message);
      return res.status(500).json({ error: 'Could not provision demo class' });
    }
  }

  if (!classId) {
    return res.status(500).json({ error: 'Could not allocate entry code' });
  }

  // ── Step 4: 데모 학생 3명 생성 ────────────────────────────────────────────
  const studentNames = ['김민준', '이서연', '박지호'];
  const { data: students, error: studentsError } = await supabaseAdmin
    .from('students')
    .insert(
      studentNames.map((name, idx) => ({
        class_id: classId,
        full_name: name,
        student_number: String(idx + 1),
      }))
    )
    .select('id, full_name, student_number');

  if (studentsError) {
    console.error('[api/demo-provision] failed to create demo students:', studentsError.message);
    return res.status(500).json({ error: 'Could not provision demo students' });
  }

  return res.status(200).json({
    ok: true,
    entry_code: entryCode,
    class_id: classId,
    expires_at: expiresAtIso,
    students,
  });
}
