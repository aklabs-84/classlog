/**
 * 같은 조(또는 같은 사람)가 같은 주차에 같은 제목의 결과를 여러 번 올렸을 때,
 * 링크·글·파일 등 종류와 상관없이
 * 가장 늦게 올린 것을 '최종', 나머지를 '이전'으로 표시하기 위한 계산.
 * 한 개뿐이면 표시하지 않는다(맵에 넣지 않음).
 */
export interface SubmissionKey {
  id: string;
  week: number | null;
  /** 결과 제목 — 같은 제목이면 같은 결과물의 재제출로 본다(비어 있으면 같은 주차끼리 묶음) */
  title?: string | null;
  created_at: string;
}

export const computeFinalMarks = (items: SubmissionKey[]): Map<string, 'final' | 'older'> => {
  const buckets = new Map<string, SubmissionKey[]>();
  items.forEach(it => {
    const k = `${it.week ?? 'x'}|${(it.title || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
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
