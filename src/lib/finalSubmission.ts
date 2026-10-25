/**
 * 같은 조(또는 같은 사람)가 올린 결과 중, 주차·제목·종류와 상관없이
 * 제출 날짜가 가장 늦은 것을 '최종', 나머지를 '이전'으로 표시하기 위한 계산.
 * 한 개뿐이면 표시하지 않는다(맵에 넣지 않음).
 */
export interface SubmissionKey {
  id: string;
  week: number | null;
  /** 참고용(판정에는 쓰지 않음) */
  title?: string | null;
  created_at: string;
}

export const computeFinalMarks = (items: SubmissionKey[]): Map<string, 'final' | 'older'> => {
  const marks = new Map<string, 'final' | 'older'>();
  if (items.length < 2) return marks;
  const sorted = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  sorted.forEach((it, i) => marks.set(it.id, i === 0 ? 'final' : 'older'));
  return marks;
};
