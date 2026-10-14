// 보조강사(계정 없음)가 "올리기 링크"의 비밀 토큰으로 갤러리에 사진을 올리는 Edge Function.
// 토큰 인증이므로 verify_jwt=false 로 배포한다. 업로드 전용: 조회·삭제 기능은 일부러 없다.
// - JSON { token } → 링크가 유효한지, 반 이름이 무엇인지만 알려준다
// - multipart { token, name, file, week_number? } → 검증 후 보관함 저장 + 목록표 기록(검토 대기)
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'class-gallery';
const DAILY_LIMIT = 100;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const TOKEN_RE = /^[0-9a-f]{64}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const isJson = (req.headers.get('content-type') ?? '').includes('application/json');

  let token = '';
  let form: FormData | null = null;
  if (isJson) {
    try { token = String((await req.json()).token ?? ''); } catch { return json({ error: 'invalid json' }, 400); }
  } else {
    try { form = await req.formData(); } catch { return json({ error: 'invalid form' }, 400); }
    token = String(form.get('token') ?? '');
  }
  if (!TOKEN_RE.test(token)) return json({ error: 'invalid_link' }, 403);

  const { data: key } = await admin
    .from('class_gallery_upload_keys')
    .select('class_id, teacher_id, is_active')
    .eq('token', token)
    .maybeSingle();
  if (!key || !key.is_active) return json({ error: 'invalid_link' }, 403);

  const { data: cls } = await admin.from('classes').select('name').eq('id', key.class_id).maybeSingle();
  if (!cls) return json({ error: 'invalid_link' }, 403);

  // 오늘(한국시간) 이 링크로 올라온 장수
  const kstDay = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dayStart = new Date(`${kstDay}T00:00:00+09:00`).toISOString();
  const { count } = await admin
    .from('class_gallery_items')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', key.class_id)
    .eq('upload_source', 'assistant_link')
    .gte('created_at', dayStart);
  const usedToday = count ?? 0;

  if (!form) return json({ ok: true, class_name: cls.name, used_today: usedToday, daily_limit: DAILY_LIMIT });

  if (usedToday >= DAILY_LIMIT) return json({ error: 'daily_limit' }, 429);

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'no_file' }, 400);
  const ext = ALLOWED[file.type];
  if (!ext) return json({ error: 'bad_type' }, 400);
  if (file.size > MAX_BYTES || file.size === 0) return json({ error: 'bad_size' }, 400);

  const name = String(form.get('name') ?? '').trim().slice(0, 30);
  if (!name) return json({ error: 'name_required' }, 400);
  const weekRaw = form.get('week_number');
  const week = weekRaw && /^\d{1,3}$/.test(String(weekRaw)) ? Number(weekRaw) : null;

  const path = `${key.teacher_id}/${key.class_id}/a-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (upErr) return json({ error: 'upload_failed' }, 500);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const { error: dbErr } = await admin.from('class_gallery_items').insert({
    teacher_id: key.teacher_id,
    class_id: key.class_id,
    week_number: week,
    file_url: pub.publicUrl,
    file_type: 'image',
    file_name: (file.name || `photo.${ext}`).slice(0, 120),
    file_size: file.size,
    uploader_name: name,
    review_status: 'pending',
    upload_source: 'assistant_link',
  });
  if (dbErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return json({ error: 'save_failed' }, 500);
  }
  return json({ ok: true, used_today: usedToday + 1, daily_limit: DAILY_LIMIT });
});
