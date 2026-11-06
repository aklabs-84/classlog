-- 학교 프로젝트 관리자가 자기 프로젝트 반의 학생 결과를 승인/반려할 수 있게 함 (읽기 정책과 같은 범위)
create policy "Project admins can update managed results" on public.student_results
for update to authenticated
using (exists (select 1 from public.students s where s.id = student_results.student_id and s.class_id in (select get_managed_class_ids())))
with check (exists (select 1 from public.students s where s.id = student_results.student_id and s.class_id in (select get_managed_class_ids())));
