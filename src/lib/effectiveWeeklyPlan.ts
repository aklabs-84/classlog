// 반이 실제로 따르는 주차별 계획을 고르는 단 하나의 기준.
// 학교 화면에서 "반 하나만 적용"하면 계획이 하위 반 자신에게만 저장되므로(weekly_plan_custom=true),
// 하위 반이라고 무조건 부모(학교 대표 반) 계획만 읽으면 비어 보인다. 계획을 읽는 곳은 모두 이 함수를 쓴다.
export interface EffectivePlan<T = any> {
  plan: T[];
  // true면 이 반 자신의 계획, false면 부모(학교 대표 반) 계획
  fromSelf: boolean;
}

export function resolveEffectivePlan<T = any>(
  cls: { parent_class_id?: string | null; weekly_plan?: T[] | null; weekly_plan_custom?: boolean | null } | null | undefined,
  parentPlan: T[],
): EffectivePlan<T> {
  const own = Array.isArray(cls?.weekly_plan) ? (cls!.weekly_plan as T[]) : [];
  if (!cls?.parent_class_id) return { plan: own, fromSelf: true };
  if (cls.weekly_plan_custom || own.length > 0) return { plan: own, fromSelf: true };
  return { plan: parentPlan, fromSelf: false };
}
