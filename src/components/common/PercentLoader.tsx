import { useEffect, useState } from 'react';

interface Props {
  /** 실제 진행률(0~100). 없으면 90%까지 서서히 차오르는 표시를 보여 줌 */
  percent?: number | null;
  label?: string;
  className?: string;
}

/** "63%"처럼 숫자가 올라가는 로딩 표시. percent를 안 주면 기다리는 동안 90%까지 차오른다. */
const PercentLoader = ({ percent, label = '불러오는 중', className = '' }: Props) => {
  const [fake, setFake] = useState(0);
  const real = typeof percent === 'number';

  useEffect(() => {
    if (real) return;
    setFake(0);
    const t = setInterval(() => setFake(v => (v >= 90 ? v : v + Math.max(0.4, (90 - v) * 0.06))), 120);
    return () => clearInterval(t);
  }, [real]);

  const value = Math.round(real ? (percent as number) : fake);
  return (
    <div className={`flex flex-col items-center justify-center gap-3 w-full max-w-xs mx-auto ${className}`} role="status" aria-live="polite">
      <p className="text-5xl font-black tabular-nums text-violet-600">
        {value}<span className="text-2xl ml-0.5">%</span>
      </p>
      <div className="w-full h-2.5 rounded-full bg-violet-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-[width] duration-200 ease-out relative overflow-hidden"
          style={{ width: `${value}%` }}
        >
          <span className="absolute inset-0 -translate-x-full animate-[percent-shine_1.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </div>
      </div>
      <p className="text-sm font-bold text-gray-500">{label}…</p>
      <style>{'@keyframes percent-shine{to{transform:translateX(100%)}}'}</style>
    </div>
  );
};

export default PercentLoader;
