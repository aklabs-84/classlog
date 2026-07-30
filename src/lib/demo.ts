// 데모 체험(/demo) 전용 고정 교사 계정. 방문자가 여러 명 동시에 체험해도
// 이 계정 하나를 공유하므로, 화면 단에서는 항상 "본인이 방금 만든 학급"만
// 보이도록 별도로 필터링해야 한다 (api/demo-provision.ts가 발급한 class_id 기준).
export const DEMO_TEACHER_EMAIL = '__demo_teacher__@internal.saenggilog.app';

export function isDemoTeacher(user: { email?: string | null } | null | undefined): boolean {
  return user?.email === DEMO_TEACHER_EMAIL;
}

// 상단 내비게이션 링크(대시보드/보고서 등)는 ?id= 없이 이동하므로, 방문자가 발급받은
// class_id를 저장해두고 URL에 id가 없을 때 fallback으로 사용한다.
// Classroom.tsx가 이미 일반 교사용으로 쓰던 'teacher_last_class_id' 키를 그대로 재사용한다.
const LAST_CLASS_ID_KEY = 'teacher_last_class_id';

export function setDemoClassId(classId: string): void {
  localStorage.setItem(LAST_CLASS_ID_KEY, classId);
}

export function getDemoClassId(): string | null {
  return localStorage.getItem(LAST_CLASS_ID_KEY);
}
