import { VIEWER_STYLES, normalizeViewerStyle, type ViewerStyle } from '../materialSkins';

// 수업 계획서 → 수업 자료 초안을 만들 때 고르는 "보기 모양".
// A·B·기본은 짧고 가볍게, C·D·E는 자세히 — 글의 양이 모양에 따라 달라진다 (gemini.ts studentGuideDensityNote).
const DENSITY: Record<ViewerStyle, string> = {
  default: '짧게',
  mission: '짧게',
  storybook: '짧게',
  note: '자세히',
  challenge: '자세히',
  manual: '자세히',
  workshop: '간단',
};

const ViewerStylePicker = ({ value, onChange }: { value: ViewerStyle; onChange: (v: ViewerStyle) => void }) => (
  <label
    className="flex items-center gap-1.5 shrink-0"
    title="고른 보기 모양에 맞춰 수업 자료의 글 양이 달라져요. A·B·기본은 짧고 가볍게, C·D·E는 설명을 자세히 만들어요. 만든 뒤에도 에디터에서 바꿀 수 있어요."
  >
    <span className="text-xs font-black text-on-surface-variant">자료 모양</span>
    <select
      value={value}
      onChange={e => onChange(normalizeViewerStyle(e.target.value))}
      className="px-2.5 py-2 bg-white rounded-xl border border-surface-container font-black text-xs focus:outline-none focus:border-primary/40"
    >
      {VIEWER_STYLES.map(v => (
        <option key={v.id} value={v.id}>{v.label} · {DENSITY[v.id]}</option>
      ))}
    </select>
  </label>
);

export default ViewerStylePicker;
