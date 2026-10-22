import { createPortal } from 'react-dom';

export interface ExportProgress {
  kind: 'pptx' | 'pdf';
  done: number;
  total: number;
  // 'saving': 장 만들기가 끝나고 파일로 묶어 저장하는 중, 'done': 완료
  phase: 'rendering' | 'saving' | 'done';
}

const R = 54;
const CIRC = 2 * Math.PI * R;

// 다운로드(PPT/PDF) 진행 상황을 화면 가운데에 크게 보여주는 안내 창.
// 전체화면 모달은 좌측 메뉴까지 덮어야 하므로 body에 직접 붙인다.
export default function ExportProgressModal({ progress }: { progress: ExportProgress }) {
  const { kind, done, total, phase } = progress;
  // 장 만들기가 90%, 파일로 묶어 저장하는 단계가 나머지 10%
  const percent = phase === 'done' ? 100
    : phase === 'saving' ? 95
    : Math.min(90, Math.round((done / Math.max(total, 1)) * 90));
  const label = kind === 'pptx' ? 'PPT' : 'PDF';
  const message = phase === 'done' ? '다운로드가 시작되었어요!'
    : phase === 'saving' ? '파일로 묶어서 저장하는 중이에요…'
    : `슬라이드 ${Math.min(done + 1, total)} / ${total}장 만드는 중…`;

  return createPortal(
    <div
      role="alertdialog"
      aria-live="polite"
      aria-label={`${label} 다운로드 진행 중`}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(17,24,39,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <style>{`
        @keyframes exp-spin { to { transform: rotate(360deg); } }
        @keyframes exp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes exp-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, padding: '32px 28px 28px', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 20px' }}>
          <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="#ede9fe" strokeWidth="10" />
            <circle
              cx="70" cy="70" r={R} fill="none" stroke="#7c3aed" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - percent / 100)}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          </svg>
          {phase !== 'done' && (
            <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: 'absolute', inset: 0, animation: 'exp-spin 1.6s linear infinite' }}>
              <circle cx="70" cy="70" r="66" fill="none" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 390" />
            </svg>
          )}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, color: '#111827' }}>
            {phase === 'done' ? '✓' : `${percent}%`}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
          {label} 파일을 만들고 있어요
        </div>
        <div style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.6, marginBottom: 18, animation: phase === 'done' ? undefined : 'exp-pulse 1.8s ease-in-out infinite' }}>
          {message}
        </div>
        <div style={{ height: 10, borderRadius: 999, background: '#ede9fe', overflow: 'hidden' }}>
          <div
            style={{
              width: `${percent}%`, height: '100%', borderRadius: 999, transition: 'width 0.4s ease',
              background: 'linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed)', backgroundSize: '200% 100%',
              animation: phase === 'done' ? undefined : 'exp-shine 2.2s linear infinite',
            }}
          />
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 14, lineHeight: 1.5 }}>
          창을 닫지 말고 잠시만 기다려 주세요.
        </div>
      </div>
    </div>,
    document.body
  );
}
