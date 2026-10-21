import type { SlideOutlineMode } from '../../lib/gemini';

// 자료로 슬라이드 구성안을 만들 때 "몇 장으로 나눌지" 고르는 두 칸짜리 선택
const OPTIONS: { key: SlideOutlineMode; title: string; desc: string }[] = [
  { key: 'fit', title: '자료에 맞춰 나누기', desc: '자료가 길면 장수도 늘어나요. 소제목마다 한 장 이상 만들어요.' },
  { key: 'summary', title: '핵심만 5~8장 요약', desc: '가장 중요한 흐름만 추려 짧게 만들어요.' },
];

export default function OutlineModePicker({ value, onChange }: { value: SlideOutlineMode; onChange: (m: SlideOutlineMode) => void }) {
  return (
    <div style={{ marginBottom: 14, maxWidth: 720 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>가져온 자료를 몇 장으로 나눌까요?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {OPTIONS.map(o => (
          <button key={o.key} onClick={() => onChange(o.key)}
            style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5,
              border: value === o.key ? '2px solid #3B82F6' : '1px solid #e5e7eb', background: value === o.key ? '#EFF6FF' : '#fff', color: '#111827' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{o.title}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{o.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
