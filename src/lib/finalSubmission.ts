/**
 * 같은 조(또는 같은 사람)가 같은 주차에 같은 종류의 결과를 여러 번 올렸을 때,
 * 가장 늦게 올린 것을 '최종', 나머지를 '이전'으로 표시하기 위한 계산.
 * 한 개뿐이면 표시하지 않는다(맵에 넣지 않음).
 */
export interface SubmissionKey {
  id: string;
  week: number | null;
  /** 결과 종류(text/link/file/image) — 여러 종류면 정렬해 이어 붙인 값 */
  kind: string;
  created_at: string;
}

export const computeFinalMarks = (items: SubmissionKey[]): Map<string, 'final' | 'older'> => {
  const buckets = new Map<string, SubmissionKey[]>();
  items.forEach(it => {
    const k = `${it.week ?? 'x'}|${it.kind}`;
    (buckets.get(k) || buckets.set(k, []).get(k)!).push(it);
  });
  const marks = new Map<string, 'final' | 'older'>();
  buckets.forEach(list => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    sorted.forEach((it, i) => marks.set(it.id, i === 0 ? 'final' : 'older'));
  });
  return marks;
};
