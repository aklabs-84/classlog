// 주차별 계획의 순서 규칙: 주차/차시 항목이 먼저, 공지·전달사항(kind:'notice')은 맨 뒤.
// week 번호는 배열 순서(index+1)로 매기므로, 기존에 week로 읽던 화면은 그대로 동작한다.
export interface PlanOrderItem { week: number; kind?: 'notice'; group?: string }

export const isNoticeItem = (p: { kind?: string } | null | undefined): boolean => p?.kind === 'notice';

export function normalizePlan<T extends { kind?: 'notice' }>(p: T[]): T[] {
  return [...p.filter(x => x.kind !== 'notice'), ...p.filter(x => x.kind === 'notice')];
}

/** 저장 직전: 순서 정리 + week 다시 매기기 + 빈 묶음 이름 제거 */
export function finalizePlan<T extends { week: number; kind?: 'notice'; group?: string }>(p: T[]): T[] {
  return normalizePlan(p).map((x, i) => ({ ...x, week: i + 1, group: x.group?.trim() || undefined }));
}
