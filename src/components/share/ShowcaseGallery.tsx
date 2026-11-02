import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, LayoutDashboard, Eye, FileText, Globe, AlignLeft, HelpCircle, Info, Presentation, X } from 'lucide-react';
import type { QuickOpenTarget } from '../common/QuickOpenLink';
import { getViewerKind } from '../classroom/SubmissionViewerModal';
import { findBoardForGroup, openShowcaseBoard, useShowcaseBoardState } from './ShowcaseBoards';
import StudentScreenTour, { type StudentScreenStep } from '../student/StudentScreenTour';

/** 학급 발표회 — 조(또는 개인)별 최종 작품을 전시 벽 + 발표 모드로 보여 준다. 두 공유 화면이 함께 쓴다. */
export interface ShowcaseEntry {
  id: string;
  /** 모둠 이름 또는 학생 이름 */
  owner: string;
  /** 모둠일 때 조원 이름 */
  members?: string[];
  title: string;
  text?: string | null;
  imageUrl?: string | null;
  week?: number | null;
  submittedAt: string;
  submissionCount: number;
  /** 모둠일 때 조 순서(1부터) — 협업 보드와 짝짓기용 */
  groupOrder?: number;
  target: QuickOpenTarget | null;
}

const openTarget = (t: QuickOpenTarget) => {
  if (t.kind === 'link') window.open(t.url, '_blank', 'noopener,noreferrer');
  else window.open(`/result-view?url=${encodeURIComponent(t.url)}&name=${encodeURIComponent(t.name)}`, '_blank', 'noopener');
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/** 파일 경로·주소가 그대로 글로 올라온 경우는 설명 글로 쓰지 않는다 */
const cleanText = (t?: string | null) => {
  const x = (t || '').trim();
  if (!x) return null;
  if (/^\S+$/.test(x) && (/:\/\//.test(x) || /%[0-9A-Fa-f]{2}/.test(x))) return null;
  return x;
};

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** 화면에 보일 때 true (한 번 보이면 유지) */
const useSeen = (ref: React.RefObject<HTMLElement | null>) => {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
};

/** 작품 파일(웹페이지·PDF)을 틀 안에 실제로 띄운다. thumb=true면 줄여서 움직임 없이, 아니면 그대로 작동 */
const LiveFrame = ({ url, kind, thumb, title }: { url: string; kind: 'web-html' | 'pdf'; thumb: boolean; title: string }) => {
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  const [src, setSrc] = useState<string | null>(kind === 'pdf' ? `${url}#toolbar=0&navpanes=0&view=FitH` : null);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    if (kind !== 'web-html' || !seen) return;
    let obj: string | null = null;
    let dead = false;
    fetch(url).then(r => r.text()).then(t => {
      if (dead) return;
      obj = URL.createObjectURL(new Blob([t], { type: 'text/html;charset=utf-8' }));
      setSrc(obj);
    }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [url, kind, seen]);

  useEffect(() => {
    if (!thumb || !box.current) return;
    const el = box.current;
    const upd = () => setScale(el.clientWidth / 1280);
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [thumb]);

  return (
    <div ref={box} className="w-full h-full relative overflow-hidden bg-white">
      {failed && <div className="absolute inset-0 flex items-center justify-center text-[14px] font-bold text-gray-400">미리보기를 불러오지 못했어요</div>}
      {seen && src && !failed && (thumb ? (
        <iframe
          src={src}
          title={title}
          sandbox=""
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          className="absolute top-0 left-0 border-0 pointer-events-none origin-top-left"
          style={{ width: 1280, height: 800, transform: `scale(${scale})` }}
        />
      ) : (
        <iframe
          src={src}
          title={title}
          sandbox={kind === 'pdf' ? undefined : 'allow-scripts allow-forms allow-popups allow-modals'}
          className="absolute inset-0 w-full h-full border-0 bg-white"
        />
      ))}
    </div>
  );
};

/** 작품 미리보기: 사진 → 작품 화면(웹페이지·PDF) → 사이트 이름 → 글 일부 순서
 *  mode: wall(전시 벽 카드) · stage(발표 큰 화면) · mini(아래 작은 그림) */
const Preview = ({ e, accent, soft, mode }: { e: ShowcaseEntry; accent: string; soft: string; mode: 'wall' | 'stage' | 'mini' }) => {
  const [broken, setBroken] = useState(false);
  const big = mode === 'stage';
  if (e.imageUrl && !broken) {
    return (
      <img
        src={e.imageUrl}
        alt={`${e.owner} 작품: ${e.title}`}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`w-full h-full ${big ? 'object-contain' : 'object-cover'}`}
      />
    );
  }
  const t = e.target;
  const kind = t?.kind === 'file' ? getViewerKind(t.name) : null;
  if (t && t.kind === 'file' && mode !== 'mini' && (kind === 'web-html' || kind === 'pdf')) {
    return <LiveFrame url={t.url} kind={kind} thumb={mode === 'wall'} title={`${e.owner} 작품 화면`} />;
  }
  const Icon = t?.kind === 'link' ? Globe : t ? FileText : AlignLeft;
  const text = cleanText(e.text);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center overflow-hidden" style={{ background: soft, color: accent }}>
      <Icon size={big ? 44 : mode === 'mini' ? 20 : 30} aria-hidden />
      {mode !== 'mini' && t?.kind === 'link' && <p className={`${big ? 'text-2xl' : 'text-[16px]'} font-black break-all line-clamp-2`}>{hostOf(t.url)}</p>}
      {mode !== 'mini' && !(t?.kind === 'link') && text && <p className={`${big ? 'text-lg line-clamp-4' : 'text-[14px] line-clamp-2'} font-bold opacity-80 leading-snug`}>{text}</p>}
    </div>
  );
};

interface Props {
  entries: ShowcaseEntry[];
  /** 아직 최종 작품이 없는 모둠·학생 이름 */
  pendingNames?: string[];
  heading: string;
  /** 모둠 / 학생 */
  unitLabel: string;
  accent: string;
  accentSoft: string;
  /** 처음 열 때 한 번만 보이는 안내의 저장 이름 (페이지마다 다르게) */
  tourPrefix: string;
  /** 조별/개인별 전환 버튼이 화면에 있는지 (있을 때만 그 설명을 넣는다) */
  hasToggle?: boolean;
  /** 제목 아래에 띄우는 안내 문구 (예: 개인별 화면 주의) */
  note?: string;
}

const ShowcaseGallery = ({ entries, pendingNames = [], heading, unitLabel, accent, accentSoft, tourPrefix, hasToggle = false, note }: Props) => {
  const [stage, setStage] = useState<number | null>(null);
  const [helpSignal, setHelpSignal] = useState(0);
  const { boards, openId: boardOpen } = useShowcaseBoardState();

  useEffect(() => {
    if (stage === null || boardOpen) return;
    const total = entries.length;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setStage(null);
      else if (ev.key === 'ArrowRight') setStage(i => (i === null ? i : (i + 1) % total));
      else if (ev.key === 'ArrowLeft') setStage(i => (i === null ? i : (i - 1 + total) % total));
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [stage, entries.length, boardOpen]);

  const hasOpen = entries.some(e => e.target);
  const tourScreens = useMemo<Record<string, StudentScreenStep>>(() => {
  const steps: Omit<StudentScreenStep, 'more'>[] = [
    { target: 'showcase-card', title: '전시 벽이에요', lead: `${unitLabel}별 최종 작품이 한눈에 모여 있어요. 그림을 누르면 큰 화면으로 볼 수 있어요.` },
    ...(hasToggle ? [{ target: 'showcase-toggle', title: '보는 단위를 바꿔요', lead: '조별 작품과 개인별 작품을 여기서 오가며 볼 수 있어요.' }] : []),
    { target: 'showcase-start', title: '발표를 시작해요', lead: '누르면 작품이 화면 가득 나와요. 키보드 ← → 키(또는 아래 버튼)로 넘기고, Esc로 끝내요.' },
    ...(hasOpen ? [{ target: 'showcase-open', title: '작품을 직접 열어봐요', lead: '실제 작품 화면을 새 창에서 열어 눌러 보고 시연할 수 있어요.' }] : []),
  ];
  return { main: { ...steps[0], more: steps.slice(1) } };
  }, [unitLabel, hasToggle, hasOpen]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 space-y-2 text-center">
        <Presentation size={36} className="text-gray-300" aria-hidden />
        <p className="font-black text-gray-500 text-lg">아직 올라온 최종 작품이 없어요</p>
        <p className="text-[15px] font-bold text-gray-400">{unitLabel}이 결과를 제출하면 여기에 전시돼요.</p>
      </div>
    );
  }

  const firstOpenIdx = entries.findIndex(e => e.target);
  const cur = stage !== null ? entries[stage] : null;
  const curBoard = cur && cur.members ? findBoardForGroup(boards, cur.owner, cur.groupOrder) : null;
  const go = (d: number) => setStage(i => (i === null ? i : (i + d + entries.length) % entries.length));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            {heading}
            <button type="button" onClick={() => setHelpSignal(n => n + 1)} aria-label="이 화면 사용법 보기" className="w-9 h-9 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors">
              <HelpCircle size={20} aria-hidden />
            </button>
          </h2>
          <p className="text-[15px] font-bold text-gray-500">{unitLabel} {entries.length}개 작품{pendingNames.length > 0 ? ` · 제출 전 ${pendingNames.length}` : ''} · 작품을 누르면 크게 보여요</p>
        </div>
        <button
          type="button"
          onClick={() => setStage(0)}
          data-tour="showcase-start"
          className="flex items-center gap-2 px-5 min-h-[44px] rounded-xl text-white text-[15px] font-black hover:opacity-90 transition-opacity"
          style={{ background: accent }}
        >
          <Presentation size={18} aria-hidden /> 발표 시작
        </button>
      </div>

      {note && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[15px] font-bold leading-relaxed text-amber-900 print:hidden">
          <Info size={18} className="shrink-0 mt-0.5" aria-hidden /> {note}
        </p>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries.map((e, i) => (
          <li key={e.id} data-tour={i === 0 ? 'showcase-card' : undefined} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col hover:border-gray-400 transition-colors break-inside-avoid">
            <button type="button" onClick={() => setStage(i)} className="block w-full aspect-[16/10] bg-gray-50 overflow-hidden text-left" aria-label={`${e.owner} 작품 크게 보기`}>
              <Preview e={e} accent={accent} soft={accentSoft} mode="wall" />
            </button>
            <div className="p-4 flex flex-col gap-1 flex-1">
              <p className="text-[13px] font-black" style={{ color: accent }}>
                {e.owner}{e.week ? ` · ${e.week}주차` : ''}{e.submissionCount > 1 ? ' · 최종' : ''}
              </p>
              <p className="text-lg font-black text-gray-900 leading-snug line-clamp-2">{e.title}</p>
              {e.members && e.members.length > 0 && <p className="text-[14px] font-bold text-gray-500 truncate">{e.members.join(' · ')}</p>}
              <div className="mt-auto pt-3 flex items-center gap-2 print:hidden">
                {e.target && (
                  <button
                    type="button"
                    onClick={() => openTarget(e.target!)}
                    data-tour={i === firstOpenIdx ? 'showcase-open' : undefined}
                    className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border text-[14px] font-black hover:bg-gray-50 transition-colors"
                    style={{ borderColor: accent, color: accent }}
                  >
                    {e.target.kind === 'link' ? <ExternalLink size={14} aria-hidden /> : <Eye size={14} aria-hidden />} 열어보기
                  </button>
                )}
                <span className="text-[13px] font-bold text-gray-400 ml-auto">{dateLabel(e.submittedAt)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <StudentScreenTour screenKey="main" screens={tourScreens} storagePrefix={tourPrefix} hideButton openSignal={helpSignal} suspended={stage !== null} />

      {pendingNames.length > 0 && (
        <p className="text-[14px] font-bold text-gray-400 print:hidden">제출 전: {pendingNames.join(', ')}</p>
      )}

      {cur && stage !== null && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col print:hidden" role="dialog" aria-modal="true" aria-label={`${heading} 발표 모드`}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0">
            <p className="text-[15px] font-black text-white/80 truncate">{heading}</p>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[15px] font-black text-white/70">{stage + 1} / {entries.length}</span>
              <button type="button" onClick={() => setStage(null)} className="w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center" aria-label="발표 끝내기">
                <X size={22} aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-8 px-4 sm:px-6 pb-3">
            <div className="flex-1 min-h-0 min-w-0 flex items-center gap-2">
              <button type="button" onClick={() => go(-1)} className="hidden sm:flex shrink-0 w-12 h-12 rounded-xl hover:bg-white/10 items-center justify-center" aria-label="이전 작품">
                <ChevronLeft size={28} aria-hidden />
              </button>
              <div className="flex-1 h-full min-h-[200px] rounded-2xl overflow-hidden bg-white/5">
                <Preview key={cur.id} e={cur} accent="#ffffff" soft="transparent" mode="stage" />
              </div>
              <button type="button" onClick={() => go(1)} className="hidden sm:flex shrink-0 w-12 h-12 rounded-xl hover:bg-white/10 items-center justify-center" aria-label="다음 작품">
                <ChevronRight size={28} aria-hidden />
              </button>
            </div>

            <div className="lg:w-[340px] shrink-0 flex flex-col gap-2 lg:justify-center overflow-y-auto max-h-[38vh] lg:max-h-none">
              <p className="text-[15px] font-black" style={{ color: accentSoft }}>
                {cur.owner}{cur.week ? ` · ${cur.week}주차` : ''}{cur.submissionCount > 1 ? ' · 최종 작품' : ''}
              </p>
              <h3 className="text-2xl sm:text-3xl font-black leading-snug" style={{ color: '#fff' }}>{cur.title}</h3>
              {cur.members && cur.members.length > 0 && <p className="text-base font-bold text-white/70">{cur.members.join(' · ')}</p>}
              {cleanText(cur.text) && <p className="text-base leading-relaxed text-white/80 line-clamp-6">{cleanText(cur.text)}</p>}
              {curBoard && (
                <button
                  type="button"
                  onClick={() => openShowcaseBoard(curBoard.id)}
                  className="mt-2 self-start flex items-center gap-2 px-5 min-h-[48px] rounded-xl text-[16px] font-black text-white border border-white/40 hover:bg-white/10"
                >
                  <LayoutDashboard size={16} aria-hidden /> 협업 보드 보기 · {curBoard.group_name || curBoard.title}
                </button>
              )}
              {cur.target && (
                <button
                  type="button"
                  onClick={() => openTarget(cur.target!)}
                  className="mt-2 self-start flex items-center gap-2 px-5 min-h-[48px] rounded-xl text-[16px] font-black text-slate-900 bg-white hover:bg-white/90"
                >
                  {cur.target.kind === 'link' ? <ExternalLink size={16} aria-hidden /> : <Eye size={16} aria-hidden />} 작품 열어보기
                </button>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 px-4 sm:px-6 py-3 border-t border-white/10">
            <button type="button" onClick={() => go(-1)} className="sm:hidden shrink-0 w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center" aria-label="이전 작품">
              <ChevronLeft size={24} aria-hidden />
            </button>
            <div className="flex-1 flex gap-2 overflow-x-auto py-1">
              {entries.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setStage(i)}
                  aria-label={`${e.owner} 작품으로 이동`}
                  aria-current={i === stage}
                  className={`shrink-0 w-[72px] h-12 rounded-lg overflow-hidden border-2 transition-colors ${i === stage ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
                >
                  <Preview e={e} accent={accent} soft={accentSoft} mode="mini" />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => go(1)} className="sm:hidden shrink-0 w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center" aria-label="다음 작품">
              <ChevronRight size={24} aria-hidden />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ShowcaseGallery;
