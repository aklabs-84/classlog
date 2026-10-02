// 학교 프로젝트용 반(사업 소속 또는 상위 반이 있는 반)은 프로젝트를 만든 담당자의 "내 반"이 아니다.
// 내가 담당 선생님으로 직접 배정된 경우에만 내 반으로 취급한다.

interface ProjectClassLike {
  school_project_id?: string | null;
  parent_class_id?: string | null;
  assigned_teacher_id?: string | null;
}

export function isMyTeachingClass(c: ProjectClassLike, userId: string | undefined | null): boolean {
  const isProjectClass = !!(c.school_project_id || c.parent_class_id);
  return !isProjectClass || (!!userId && c.assigned_teacher_id === userId);
}

/** teacher_id = 나 로 불러온 목록에서 프로젝트용 반을 걷어낸다. */
export function filterMyTeachingClasses<T extends ProjectClassLike>(
  classes: T[] | null | undefined,
  userId: string | undefined | null,
): T[] {
  return (classes || []).filter(c => isMyTeachingClass(c, userId));
}

/** supabase select 문자열에 판별에 필요한 컬럼을 덧붙인다. '*' 이면 그대로 둔다. */
export const PROJECT_FILTER_COLUMNS = 'school_project_id, parent_class_id, assigned_teacher_id';
