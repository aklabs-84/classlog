// 보호자/학생이 "얼굴(사진) 노출 동의서"에 서명하는 Edge Function (로그인 없음, 토큰 인증 → verify_jwt=false)
// - { token } → 링크가 유효한지, 반 이름만 알려준다 (학생 명단은 절대 내려주지 않는다)
// - { token, student_name, signer_name, relation, consent_record, consent_promo, signature } → 서명 저장
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN_RE = /^[0-9a-f]{64}$/;
const DAILY_LIMIT = 400;
const MAX_SIG_CHARS = 200_000;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const token = String(b.token ?? '');
  if (!TOKEN_RE.test(token)) return json({ error: 'invalid_link' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: key } = await admin
    .from('class_consent_keys').select('class_id, teacher_id, is_active').eq('token', token).maybeSingle();
  if (!key || !key.is_active) return json({ error: 'invalid_link' }, 403);

  const { data: cls } = await admin.from('classes').select('name').eq('id', key.class_id).maybeSingle();
  if (!cls) return json({ error: 'invalid_link' }, 403);

  if (b.student_name === undefined) return json({ ok: true, class_name: cls.name });

  const studentName = String(b.student_name ?? '').trim().slice(0, 30);
  const signerName = String(b.signer_name ?? '').trim().slice(0, 30);
  const relation = b.relation === 'self' ? 'self' : b.relation === 'guardian' ? 'guardian' : '';
  const signature = String(b.signature ?? '');
  if (!studentName || !signerName || !relation) return json({ error: 'missing_fields' }, 400);
  if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIG_CHARS) return json({ error: 'bad_signature' }, 400);
  const consentRecord = b.consent_record === true;
  const consentPromo = b.consent_promo === true;

  const dayStart = new Date(`${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString();
  const { count } = await admin.from('class_photo_consents').select('id', { count: 'exact', head: true })
    .eq('class_id', key.class_id).gte('signed_at', dayStart);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'daily_limit' }, 429);

  // 이름이 명단과 정확히 한 명만 일치할 때만 학생과 연결한다 (동명이인/불일치는 이름만 저장)
  const { data: matches } = await admin.from('students').select('id').eq('class_id', key.class_id).eq('full_name', studentName);
  const studentId = matches && matches.length === 1 ? matches[0].id : null;

  const { error } = await admin.from('class_photo_consents').insert({
    class_id: key.class_id,
    teacher_id: key.teacher_id,
    student_id: studentId,
    student_name: studentName,
    signer_name: signerName,
    signer_relation: relation,
    consent_record: consentRecord,
    consent_promo: consentPromo,
    signature,
  });
  if (error) return json({ error: 'save_failed' }, 500);
  return json({ ok: true });
});
