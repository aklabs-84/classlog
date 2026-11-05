import { useState, type CSSProperties } from 'react';
import { Check, ChevronRight, Copy, Files, Maximize2, Minimize2 } from 'lucide-react';

// 우리 반 보드 카드/팝업에서 "같은 날·같은 주차에 여러 번 제출"을 눈에 띄게 알리는 공용 부품
// (학생 보드, 선생님 클래스룸 보드, 우리반 보드 화면 3곳이 함께 쓴다)

/** 제출이 2개 이상이면 카드 뒤에 종이가 겹친 것처럼 보이게 하는 스타일 */
export const stackedCardStyle = (multi: boolean): CSSProperties | undefined =>
  multi
    ? {
        boxShadow: '3px 3px 0 0 rgba(52,211,153,0.35), 6px 6px 0 0 rgba(52,211,153,0.15)',
        marginRight: 10,
        marginBottom: 12,
      }
    : undefined;

/** 카드 맨 아래 "제출 N개 · 눌러서 모두 보기" 줄 (카드 안쪽 여백 p-5를 상쇄) */
export const MultiSubmitStrip = ({ count }: { count: number }) => (
  <div className="-mx-5 -mb-5 mt-3 flex items-center justify-between gap-2 px-5 py-2.5 rounded-b-[inherit] bg-amber-100 border-t border-amber-300 text-amber-800 text-sm font-black dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/50">
    <span className="flex items-center gap-1.5"><Files size={15} /> 제출 {count}개 · 눌러서 모두 보기</span>
    <ChevronRight size={16} />
  </div>
);

/** 팝업 맨 위 "1번째 · 04:06" 칩 — 누르면 그 제출로 이동 */
export const SubmissionChips = ({ subs, className = '' }: { subs: { id: string; created_at: string }[]; className?: string }) => (
  <div className={`flex flex-wrap gap-1.5 ${className}`}>
    {subs.map((s, i) => (
      <button
        key={s.id}
        type="button"
        onClick={() => { const el = document.getElementById(`sub-${s.id}`); if (el) { el.style.scrollMarginTop = '88px'; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}
        className="text-sm font-black px-3 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
      >
        {i + 1}번째 · {new Date(s.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </button>
    ))}
  </div>
);

/** 팝업 헤더의 전체 화면 확대/축소 버튼 */
export const ExpandToggle = ({ full, onToggle }: { full: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    title={full ? '작게 보기 (Esc)' : '전체 화면으로 크게 보기'}
    aria-label={full ? '작게 보기' : '전체 화면으로 크게 보기'}
    className="shrink-0 w-9 h-9 rounded-xl border-2 border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-50 flex items-center justify-center transition-all"
  >
    {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
  </button>
);

// ── 복사 버튼 (선생님 화면 전용: 학생 화면에는 쓰지 않는다) ──
const writeText = async (text: string) => {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
};

/** 사진을 PNG로 바꿔 클립보드에 넣는다. 안 되면 사진 주소를 복사하고 false를 돌려준다 */
const copyImage = async (url: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
    const png = (async () => {
      const blob = await (await fetch(url, { mode: 'cors' })).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
    })();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    await writeText(url);
    return false;
  }
};

type CopyKind = { type: 'text'; value: string } | { type: 'image'; value: string };

/** 작은 "복사" 버튼. 누르면 잠깐 "복사됨 ✓"으로 바뀐다 */
export const CopyButton = ({ kind, label = '복사', className = '' }: { kind: CopyKind; label?: string; className?: string }) => {
  const [state, setState] = useState<'idle' | 'done' | 'url' | 'fail'>('idle');
  const run = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (kind.type === 'text') { await writeText(kind.value); setState('done'); }
      else setState((await copyImage(kind.value)) ? 'done' : 'url');
    } catch { setState('fail'); }
    setTimeout(() => setState('idle'), 1800);
  };
  const text = state === 'done' ? '복사됨' : state === 'url' ? '사진 주소 복사됨' : state === 'fail' ? '복사 실패' : label;
  return (
    <button
      type="button"
      onClick={run}
      title={kind.type === 'image' ? '사진을 복사해서 문서에 붙여넣을 수 있어요' : '클립보드에 복사'}
      className={`inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full border text-sm font-black transition-colors ${
        state === 'done' ? 'bg-emerald-600 border-emerald-600 text-white' : state === 'fail' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'
      } ${className}`}
    >
      {state === 'done' || state === 'url' ? <Check size={14} /> : <Copy size={14} />} {text}
    </button>
  );
};

/** 제출 사진 복사 줄: 1장이면 "사진 복사", 여러 장이면 "1번 사진 복사"… */
export const ImageCopyRow = ({ urls }: { urls: string[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {urls.map((u, i) => <CopyButton key={u + i} kind={{ type: 'image', value: u }} label={urls.length > 1 ? `${i + 1}번 사진 복사` : '사진 복사'} />)}
  </div>
);
