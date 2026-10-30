-- 바이브코딩 스튜디오 진행 현황: 그 반의 담임/배정 교사가 클래스룸 화면에서 직접 읽을 수 있게 한다.
-- 읽기 전용(select)만 열고, 쓰기는 여전히 서버(service role)만 한다.
drop policy if exists studio_progress_teacher_read on public.studio_progress;
create policy studio_progress_teacher_read on public.studio_progress
  for select to authenticated
  using (exists (
    select 1 from public.classes x
    where (x.id = studio_progress.class_id or x.linked_class_id = studio_progress.class_id)
      and (x.teacher_id = auth.uid() or x.assigned_teacher_id = auth.uid())
  ));
