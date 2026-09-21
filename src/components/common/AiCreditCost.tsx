import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth, isFreeCreditPlan, getAiUsageStatus } from '../../lib/auth';
import { AI_CREDITS_EVENT, creditPriceOf, type AiCreditsInfo } from '../../lib/aiCredits';

// 이 가격 이상인 '큰 작업'에만 버튼 옆 표시를 보여준다. 작은 기능마다 붙이면 쓸 때마다 계산하게 돼 부담이 되므로,
// 잔액은 상단바에서 항상 보이게 하고 작은 기능은 잔액이 모자랄 때만 알려준다.
const SHOW_COST_FROM = 40;

// AI 버튼 옆에 "이 기능은 N크레딧 · 남은 M"을 보여준다. 무료(크레딧제) 플랜에서만 나타난다.
// 잔액은 서버가 AI 호출 때마다 알려주는 값(AI_CREDITS_EVENT)으로 바로 갱신된다.
export function useFreeCreditBalance(): { isFree: boolean; remaining: number } {
  const { profile } = useAuth();
  const [live, setLive] = useState<AiCreditsInfo | null>(null);
  useEffect(() => {
    const onCredits = (e: Event) => setLive((e as CustomEvent<AiCreditsInfo>).detail);
    window.addEventListener(AI_CREDITS_EVENT, onCredits);
    return () => window.removeEventListener(AI_CREDITS_EVENT, onCredits);
  }, []);

  let hasByok = false;
  try { hasByok = !!localStorage.getItem('gemini_api_key'); } catch { /* 저장소 접근 불가 */ }
  if (hasByok || !isFreeCreditPlan(profile)) return { isFree: false, remaining: 0 };

  const usage = getAiUsageStatus(profile);
  const base = usage?.kind === 'freeCredit' ? usage.remaining : 0;
  return { isFree: true, remaining: live ? live.remaining : base };
}

export default function AiCreditCost({ feature, className = '', note }: { feature: string; className?: string; note?: string }) {
  const { isFree, remaining } = useFreeCreditBalance();
  if (!isFree) return null;

  const price = creditPriceOf(feature);
  const short = remaining < price;
  if (!short && price < SHOW_COST_FROM) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black whitespace-nowrap ${
        short ? 'bg-error/10 text-error' : 'bg-amber-50 text-amber-700'
      } ${className}`}
      title={short ? '남은 크레딧이 부족해요. 다음 달 1일에 새로 채워져요.' : '이 기능을 한 번 쓸 때 차감되는 AI 크레딧'}
    >
      <Sparkles size={11} />
      {short ? `크레딧 부족 (필요 ${price} · 남은 ${remaining})` : `${price}크레딧 · 남은 ${remaining}`}{note ? ` ${note}` : ''}
    </span>
  );
}
