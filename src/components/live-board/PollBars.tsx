import { motion } from 'framer-motion';
import { tallyPoll } from './types';

interface Props {
  options: string[];
  responses: { choices: number[] | null }[];
  theme: 'light' | 'dark';
  // 학생 화면에서 내가 고른 보기를 표시
  mine?: number[] | null;
}

const COLORS = {
  light: { text: '#1f2937', sub: '#6B7280', track: '#F1F5F9', bar: '#0EA5E9', mineBar: '#6366F1' },
  dark: { text: '#E2E8F0', sub: '#94A3B8', track: '#0F172A', bar: '#3B82F6', mineBar: '#818CF8' },
} as const;

export default function PollBars({ options, responses, theme, mine }: Props) {
  const c = COLORS[theme];
  const { counts, voters } = tallyPoll(options, responses);
  const top = Math.max(...counts, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map((opt, i) => {
        const pct = voters > 0 ? Math.round((counts[i] / voters) * 100) : 0;
        const isMine = !!mine?.includes(i);
        const isTop = top > 0 && counts[i] === top;
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: isTop ? 700 : 500, color: c.text, wordBreak: 'break-word', minWidth: 0 }}>
                {opt}
                {isMine && <span style={{ marginLeft: 6, fontSize: 11, color: c.mineBar, fontWeight: 700 }}>내 선택</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text, flexShrink: 0 }}>
                {counts[i]}명 <span style={{ fontWeight: 500, color: c.sub, fontSize: 12 }}>({pct}%)</span>
              </span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: c.track, overflow: 'hidden' }}>
              <motion.div
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3 }}
                style={{ height: '100%', borderRadius: 6, background: isMine ? c.mineBar : c.bar, minWidth: counts[i] > 0 ? 4 : 0 }}
              />
            </div>
          </div>
        );
      })}
      <p style={{ margin: '2px 0 0', fontSize: 12, color: c.sub }}>투표한 사람 {voters}명</p>
    </div>
  );
}
