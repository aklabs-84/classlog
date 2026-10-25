import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MascotKey = 'robot' | 'sprout' | 'cat';
export type MateState = 'excited' | 'normal' | 'sleepy' | 'lonely' | 'party';

export const MASCOTS: { key: MascotKey; name: string }[] = [
  { key: 'robot', name: '둥근 로봇' },
  { key: 'sprout', name: '새싹 친구' },
  { key: 'cat', name: '아기 고양이' },
];

const ROWS: Record<MascotKey, string[]> = {
  robot: ['......G.......', '......D.......', '..DDDDDDDDDD..', '.DBBBBBBBBBBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBBBBBBBBBBD.', '..DDDDDDDDDD..', '...DBBBBBBD...', '...DBBBBBBD...', '...DD....DD...'],
  sprout: ['....DD..DD....', '...DGGD.DGGD..', '...DGGGDGGGD..', '..DDDDDDDDDD..', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBBBBBBBBBBD.', '..DDDDDDDDDD..', '..DPPPPPPPPD..', '..DPPPPPPPPD..', '...DDDDDDDD...'],
  cat: ['..D........D..', '.DBD......DBD.', '.DBBDDDDDDBBD.', '.DBBBBBBBBBBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBFFFFFFFFBD.', '.DBBBBBBBBBBD.', '..DDDDDDDDDD..', '...DBBBBBBD...', '...DBBBBBBD...', '...DD....DD...'],
};

const COLORS: Record<MascotKey, Record<string, string>> = {
  robot: { B: '#8b5cf6', F: '#ede9fe', D: '#3b2a78', G: '#fbbf24' },
  sprout: { B: '#4ade80', F: '#f0fdf4', D: '#14532d', G: '#22c55e', P: '#b45309' },
  cat: { B: '#fb923c', F: '#fff7ed', D: '#7c2d12', G: '#fb923c' },
};

const EYES = {
  open: [[4, 4], [4, 5], [9, 4], [9, 5]],
  happy: [[3, 5], [4, 4], [5, 5], [8, 5], [9, 4], [10, 5]],
  closed: [[3, 5], [4, 5], [5, 5], [8, 5], [9, 5], [10, 5]],
};
const MOUTH = {
  smile: [[5, 6], [8, 6], [6, 7], [7, 7]],
  open: [[6, 6], [7, 6], [6, 7], [7, 7]],
  flat: [[6, 7], [7, 7]],
  frown: [[6, 6], [7, 6], [5, 7], [8, 7]],
};
const INK = '#1e293b';

const px = (x: number, y: number, fill: string, k: string | number = `${x}-${y}`) => <rect key={k} x={x} y={y} width={1} height={1} fill={fill} />;
const dots = (pts: number[][], fill: string, pre: string) => pts.map(([x, y]) => px(x, y, fill, `${pre}${x}-${y}`));

export const MATE_TEXT: Record<MateState, { label: string; line: string }> = {
  excited: { label: '신남', line: '이번 주 열심히 하고 계시네요!' },
  normal: { label: '보통', line: '오늘도 차근차근 해 봐요' },
  sleepy: { label: '졸림', line: '요즘 조용하네요… 같이 시작해 볼까요?' },
  lonely: { label: '쓸쓸함', line: '오랜만이에요! 기다리고 있었어요' },
  party: { label: '축하', line: '시작 가이드를 모두 끝냈어요! 🎉' },
};

function Sprite({ mascot, state, size }: { mascot: MascotKey; state: MateState; size: number }) {
  const col = COLORS[mascot];
  const body: ReactNode[] = [];
  ROWS[mascot].forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) body.push(px(x, y, col[ch])); }));

  let face: ReactNode | ReactNode[] = [];
  let extra: ReactNode | ReactNode[] = [];
  if (state === 'excited') {
    face = [...dots(EYES.happy, INK, 'e'), ...dots(MOUTH.open, '#f472b6', 'm')];
    extra = dots([[-1, 2], [-2, 3], [-1, 3], [-1, 4], [14, 1], [13, 2], [14, 2], [14, 3]], '#fbbf24', 'x');
  } else if (state === 'normal') {
    face = [<g key="eo" className="pm-eo">{dots(EYES.open, INK, 'o')}</g>, <g key="eb" className="pm-eb">{dots(EYES.closed, INK, 'c')}</g>, ...dots(MOUTH.smile, INK, 'm')];
  } else if (state === 'sleepy') {
    face = [...dots(EYES.closed, INK, 'e'), ...dots(MOUTH.flat, INK, 'm')];
    extra = [
      <g key="z1" className="pm-z1">{dots([[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]].map(([x, y]) => [x + 12, y - 1]), 'currentColor', 'a')}</g>,
      <g key="z2" className="pm-z2">{dots([[0, 0], [1, 0], [1, 1], [0, 2], [1, 2]].map(([x, y]) => [x + 14, y - 3]), 'currentColor', 'b')}</g>,
    ];
  } else if (state === 'lonely') {
    face = [...dots(EYES.open, INK, 'e'), ...dots(MOUTH.frown, INK, 'm'), px(4, 6, '#38bdf8', 'tear')];
  } else {
    face = [...dots(EYES.happy, INK, 'e'), ...dots(MOUTH.open, '#f472b6', 'm')];
    extra = [[0, -1, '#fbbf24'], [3, -2, '#f472b6'], [12, -1, '#38bdf8'], [14, -2, '#fbbf24'], [-1, 1, '#38bdf8'], [15, 0, '#f472b6']]
      .map(([x, y, c], i) => <g key={i} className="pm-cf" style={{ animationDelay: `${i * 0.25}s` }}>{px(x as number, y as number, c as string, 'p')}</g>);
  }

  return (
    <svg viewBox="-3 -4 20 19" width={size} height={size} shapeRendering="crispEdges" style={{ overflow: 'visible', filter: state === 'lonely' ? 'saturate(.55)' : undefined }} aria-hidden>
      <g className={`pm-body pm-${state}`}>{body}{face}</g>
      {extra}
    </svg>
  );
}

const PM_CSS = `
        @keyframes pm-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes pm-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(.5px)}}
        @keyframes pm-nod{0%,100%{transform:rotate(0)}50%{transform:rotate(4deg)}}
        @keyframes pm-sway{0%,100%{transform:translateX(0)}50%{transform:translateX(-.5px)}}
        @keyframes pm-jump{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-3px)}}
        @keyframes pm-blink{0%,92%,100%{opacity:1}94%,98%{opacity:0}}
        @keyframes pm-blinkb{0%,92%,100%{opacity:0}94%,98%{opacity:1}}
        @keyframes pm-zz{0%{transform:translate(0,2px);opacity:0}30%{opacity:1}100%{transform:translate(1px,-3px);opacity:0}}
        @keyframes pm-fall{0%{transform:translateY(-3px);opacity:0}20%{opacity:1}100%{transform:translateY(12px);opacity:0}}
        .pm-body{transform-box:fill-box;transform-origin:50% 100%}
        .pm-excited{animation:pm-bounce .5s steps(2) infinite}
        .pm-normal{animation:pm-breathe 2s steps(2) infinite}
        .pm-sleepy{animation:pm-nod 2.4s steps(2) infinite}
        .pm-lonely{animation:pm-sway 3s steps(2) infinite}
        .pm-party{animation:pm-jump .8s steps(4) infinite}
        .pm-eo{animation:pm-blink 4s steps(1) infinite}
        .pm-eb{opacity:0;animation:pm-blinkb 4s steps(1) infinite}
        .pm-z1{animation:pm-zz 2.4s steps(6) infinite}
        .pm-z2{animation:pm-zz 2.4s steps(6) .8s infinite}
        .pm-cf{animation:pm-fall 1.6s steps(8) infinite}
        @media (prefers-reduced-motion:reduce){.pm *{animation:none!important}}
      `;

export function deriveMate(weekCount: number, awayDays: number, celebrate = false): { state: MateState; reason: string } {
  if (celebrate) return { state: 'party', reason: MATE_TEXT.party.line };
  if (awayDays >= 7) return { state: 'lonely', reason: `${awayDays}일 만이에요! 기다리고 있었어요` };
  if (weekCount >= 5) return { state: 'excited', reason: `이번 주에 ${weekCount}번이나 만들고 고치셨어요!` };
  if (weekCount >= 1) return { state: 'normal', reason: `이번 주에 ${weekCount}번 하셨어요. 오늘도 차근차근!` };
  return { state: 'sleepy', reason: MATE_TEXT.sleepy.line };
}

interface Props {
  mascot: MascotKey; state: MateState; reason: string; onPick: (m: MascotKey) => void;
  /** corner: 화면 왼쪽 아래 구석용(작게, 창은 위쪽으로 열림) */
  placement?: 'header' | 'corner';
  onDismiss?: () => void;
  /** header: 구석 캐릭터를 다시 보이게/숨기게 하는 스위치 */
  cornerSwitch?: { on: boolean; set: (v: boolean) => void };
}

export default function PixelMate({ mascot, state, reason, onPick, placement = 'header', onDismiss, cornerSwitch }: Props) {
  const corner = placement === 'corner';
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="pm relative shrink-0 text-on-surface-variant">
      <style>{PM_CSS}</style>

      <button type="button" onClick={() => setOpen(o => !o)} aria-label={`캐릭터 ${MATE_TEXT[state].label}: ${reason}. 눌러서 캐릭터 바꾸기`}
        className="peer block rounded-2xl p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className={corner ? 'block w-[64px] h-[64px]' : 'block w-[72px] h-[72px] md:w-[104px] md:h-[104px]'}>
          <Sprite mascot={mascot} state={state} size={104} />
        </span>
      </button>

      {corner && onDismiss && !open && (
        <button type="button" onClick={onDismiss} aria-label="이 캐릭터 숨기기" title="숨기기"
          className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full bg-on-surface text-surface grid place-items-center opacity-70 hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow">
          <X size={11} strokeWidth={3} />
        </button>
      )}

      {!open && (
        <div role="tooltip" className={`pointer-events-none absolute ${corner ? 'left-full bottom-2 ml-1.5' : 'right-full top-2 mr-1.5'} hidden md:block whitespace-nowrap rounded-xl bg-on-surface text-surface text-[14px] px-3 py-1.5 opacity-0 translate-x-1 transition-all peer-hover:opacity-100 peer-hover:translate-x-0 peer-focus-visible:opacity-100 peer-focus-visible:translate-x-0`}>
          {reason}
        </div>
      )}

      {open && (
        <div className={`absolute ${corner ? 'left-0 bottom-full mb-2' : 'right-0 top-full mt-2'} z-30 w-[260px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest p-3 shadow-xl`}>
          <p className="text-[14px] text-on-surface mb-0.5 font-bold">지금은 「{MATE_TEXT[state].label}」 상태예요</p>
          <p className="text-[14px] text-on-surface-variant mb-2.5">{reason}</p>
          <p className="text-[13px] text-on-surface-variant mb-1.5">함께할 친구를 골라 보세요</p>
          <div className="grid grid-cols-3 gap-1.5">
            {MASCOTS.map(m => (
              <button key={m.key} type="button" onClick={() => { onPick(m.key); setOpen(false); }}
                className={`rounded-xl border p-1.5 text-center transition-colors ${m.key === mascot ? 'border-primary bg-primary-container' : 'border-slate-200 dark:border-slate-700 hover:border-primary'}`}>
                <span className="block mx-auto w-[52px] h-[52px]"><Sprite mascot={m.key} state="normal" size={52} /></span>
                <span className="block text-[12px] text-on-surface mt-0.5">{m.name}</span>
              </button>
            ))}
          </div>
          {cornerSwitch && (
            <label className="mt-2.5 flex items-center gap-2 text-[13px] text-on-surface cursor-pointer">
              <input type="checkbox" checked={cornerSwitch.on} onChange={e => cornerSwitch.set(e.target.checked)} className="accent-[#8b5cf6]" />
              다른 화면 왼쪽 아래에도 보이기
            </label>
          )}
          {onDismiss && (
            <button type="button" onClick={() => { setOpen(false); onDismiss(); }} className="mt-2.5 w-full text-[13px] text-on-surface-variant hover:text-on-surface underline underline-offset-2">
              구석 친구 숨기기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 숫자 옆에 작게 붙이는 캐릭터(말풍선·선택창 없음) — 움직임 CSS를 함께 넣어 어디서든 단독으로 쓸 수 있다 */
export function MateBadge({ mascot, state, size = 64 }: { mascot: MascotKey; state: MateState; size?: number }) {
  return (
    <span className="pm inline-block shrink-0 text-on-surface-variant" style={{ width: size, height: size }} aria-hidden>
      <style>{PM_CSS}</style>
      <Sprite mascot={mascot} state={state} size={size} />
    </span>
  );
}
