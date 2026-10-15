// 화면 개편 후 안내(영상·PDF·투어)가 아직 예전 화면 기준일 때 보여 주는 안내문.
// 안내를 새 화면에 맞게 고친 뒤에는 SHOW_GUIDE_OUTDATED_NOTICE 를 false 로 바꾸면 모든 곳에서 한 번에 사라진다.
export const SHOW_GUIDE_OUTDATED_NOTICE = true;

interface Props {
  /** light: 흰 바탕 화면용, dark: 어두운 안내 카드용, compact: 작은 한 줄 배지 */
  variant?: 'light' | 'dark' | 'compact';
  className?: string;
}

export default function GuideOutdatedNotice({ variant = 'light', className = '' }: Props) {
  if (!SHOW_GUIDE_OUTDATED_NOTICE) return null;
  if (variant === 'compact') {
    return (
      <span className={`inline-flex items-center rounded-full bg-primary-container px-2.5 py-0.5 text-[13px] font-semibold text-primary ${className}`}>
        곧 업데이트
      </span>
    );
  }
  const tone = variant === 'dark'
    ? 'bg-white/10 border-white/20 text-white'
    : 'bg-primary-container/50 border-primary/20 text-on-surface';
  return (
    <div role="note" className={`rounded-xl border px-4 py-3 text-[15px] leading-relaxed ${tone} ${className}`}>
      🛠 이 안내는 <b>이전 화면 기준</b>이라 지금 화면과 조금 달라요. 새 화면에 맞춰 곧 고쳐서 다시 올릴게요.
    </div>
  );
}
