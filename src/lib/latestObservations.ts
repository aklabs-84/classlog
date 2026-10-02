// 같은 학생이 같은 활동(주차)에 반려→재제출을 반복하면 observations 행이 계속 쌓인다.
// 화면에서는 "마지막 제출 1건"만 대표로 보여주고, 이전 시도는 접어서 보여주기 위한 공용 헬퍼.
// 교사 메모(is_student_record가 true가 아닌 것)는 묶지 않고 그대로 둔다.

const norm = (s?: string | null) => (s || '').replace(/\s+/g, '').toLowerCase();

type ObsLike = { id: string; activity_name?: string | null; created_at: string; is_student_record?: boolean | null };

export function collapseObservationsByActivity<T extends ObsLike>(list: T[]): { latest: T[]; older: Record<string, T[]> } {
  const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const seen = new Map<string, T>();
  const latest: T[] = [];
  const older: Record<string, T[]> = {};
  for (const o of sorted) {
    const key = norm(o.activity_name);
    if (!o.is_student_record || !key) { latest.push(o); continue; }
    const rep = seen.get(key);
    if (!rep) { seen.set(key, o); latest.push(o); }
    else (older[rep.id] ||= []).push(o);
  }
  return { latest, older };
}

// 접힌 이전 제출을 알리는 배지 문구 — "총 4회 제출 · 반려 3회"
export function prevSubmissionLabel(olderCount: number, rejectedCount: number): string {
  return `총 ${olderCount + 1}회 제출${rejectedCount > 0 ? ` · 반려 ${rejectedCount}회` : ''}`;
}
