// 익명 학생이 자기 제출 파일만 삭제하도록 하는 Edge Function.
// Storage DELETE 정책을 교사 소유자 기준으로 좁히면서, 학생(익명)의 삭제는 이 함수가 대신 처리한다.
// 검증: student_id가 실제 학생이고, 모든 경로가 results|notes/{student_id}/ 아래일 때만 삭제한다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'student-attachments';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { student_id?: string; paths?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const studentId = body.student_id;
  const paths = body.paths;
  if (!studentId || !UUID.test(studentId)) return json({ error: 'invalid student_id' }, 400);
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 200 || !paths.every(p => typeof p === 'string')) {
    return json({ error: 'invalid paths' }, 400);
  }
  const allowed = [`results/${studentId}/`, `notes/${studentId}/`];
  if (!(paths as string[]).every(p => allowed.some(a => p.startsWith(a)) && !p.includes('..'))) {
    return json({ error: 'path not allowed' }, 403);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: student } = await admin.from('students').select('id').eq('id', studentId).maybeSingle();
  if (!student) return json({ error: 'student not found' }, 404);

  const { error } = await admin.storage.from(BUCKET).remove(paths as string[]);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, removed: paths.length });
});
