// 무료 교사의 종료된 클래스에서 학생 제출 결과물(student_results + Storage 파일)을 삭제하는 일일 작업.
// pg_cron이 pg_net으로 호출하며, purge_config.token 헤더로 인증한다.
// purge_config.mode = 'dry_run' 이면 대상만 storage_purge_log에 기록하고 아무것도 지우지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'student-attachments';
const MAX_CLASSES_PER_RUN = 20;   // 하루 처리 상한
const ABORT_IF_CANDIDATES_OVER = 50; // 이례적으로 많으면 삭제 모드에서 중단

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await admin.from('purge_config').select('key, value');
  const conf = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (!conf.token || req.headers.get('x-purge-token') !== conf.token) return json({ error: 'unauthorized' }, 401);
  const mode: 'dry_run' | 'purge' = conf.mode === 'purge' ? 'purge' : 'dry_run';

  await admin.rpc('refresh_last_paid_at');
  const { data: notified } = await admin.rpc('notify_upcoming_purge');

  const { data: candidates, error: cErr } = await admin.rpc('purge_candidate_classes');
  if (cErr) return json({ error: cErr.message }, 500);
  const list = (candidates ?? []) as { class_id: string; teacher_id: string; ended_on: string; result_rows: number }[];

  if (mode === 'purge' && list.length > ABORT_IF_CANDIDATES_OVER) {
    return json({ aborted: 'too_many_candidates', count: list.length }, 200);
  }

  const summary: unknown[] = [];
  for (const c of list.slice(0, MAX_CLASSES_PER_RUN)) {
    const { data: rows } = await admin.from('student_results').select('id, storage_path, storage_paths').eq('class_id', c.class_id);
    const paths = Array.from(new Set((rows ?? []).flatMap((r: { storage_path: string | null; storage_paths: string[] | null }) =>
      [r.storage_path, ...(r.storage_paths ?? [])]).filter((p): p is string => !!p)));

    let status = 'planned';
    if (mode === 'purge') {
      status = 'done';
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
        if (error) { status = 'file_delete_failed'; break; }
      }
      if (status === 'done') {
        const { error } = await admin.from('student_results').delete().eq('class_id', c.class_id);
        if (error) status = 'row_delete_failed';
      }
    }
    await admin.from('storage_purge_log').insert({
      mode, class_id: c.class_id, teacher_id: c.teacher_id, ended_on: c.ended_on,
      result_rows: c.result_rows, file_count: paths.length, status,
    });
    summary.push({ class_id: c.class_id, rows: c.result_rows, files: paths.length, status });
  }
  return json({ mode, notified, candidates: list.length, processed: summary.length, summary });
});
