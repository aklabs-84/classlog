import { useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, PanelRightClose, PanelRightOpen, Compass, Presentation, ListChecks, Rocket,
  QrCode, BookOpen, ExternalLink, Share2, Download, Smartphone, Camera,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// 클래스룸 오른쪽 "도우미 칸": 시작하기 / 안내 보기 / 바로가기 (기존 떠 있던 + 메뉴를 대체)
// - 칸마다 접고 펼 수 있고, 전체를 얇은 띠로 접을 수도 있다. 접힘 상태는 선생님별로 이 브라우저에 기억한다
// - 시작 3단계를 모두 마치면 "안내 보기"·"바로가기"는 한 번 자동으로 접힌다
// - 안내 창(투어·학생 안내)은 ClassroomGuideTour가 'classroom-tour' 이벤트로 열어 준다

export type TourKind = 'entry' | 'run' | 'student';
export const openTour = (kind: TourKind) => window.dispatchEvent(new CustomEvent('classroom-tour', { detail: kind }));

interface Props {
  userId?: string;
  classId: string;
  entryCode?: string;
  studentCount: number;
  /** 시작 3단계 진행 */
  rosterAccepted: boolean;
  lessonStarted: boolean;
  onShowCode?: () => void;
  onGoRoster: () => void;
  onGoAttendance: () => void;
  onOpenStudentPreview?: () => void;
  onOpenResources?: () => void;
  onOpenStudentPage?: () => void;
  onOpenTeacherShareQR?: () => void;
  onOpenGallery?: () => void;
  galleryPending?: number;
  onExport?: () => void;
}

type PanelKey = 'start' | 'guide' | 'quick';
interface Pref { collapsed: boolean; shut: Record<PanelKey, boolean>; autoFolded: boolean }
const DEFAULT_PREF: Pref = { collapsed: false, shut: { start: false, guide: false, quick: false }, autoFolded: false };

const readPref = (key: string): Pref => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...DEFAULT_PREF, ...JSON.parse(raw), shut: { ...DEFAULT_PREF.shut, ...(JSON.parse(raw).shut || {}) } };
  } catch { /* 저장이 막힌 환경에서는 기본값 */ }
  return DEFAULT_PREF;
};

const ClassroomHelperRail = (p: Props) => {
  const prefKey = `classroom_rail_v1_${p.userId || 'anon'}`;
  const [pref, setPref] = useState<Pref>(() => readPref(prefKey));
  const save = (next: Pref) => {
    setPref(next);
    try { localStorage.setItem(prefKey, JSON.stringify(next)); } catch { /* 기억 못 해도 화면은 정상 */ }
  };

  const step1 = p.studentCount > 0;
  const step2 = step1 && p.rosterAccepted;
  const step3 = step2 && p.lessonStarted;
  const doneCount = [step1, step2, step3].filter(Boolean).length;
  const allDone = doneCount === 3;

  // 3단계를 모두 마치면 안내·바로가기 칸을 한 번만 자동으로 접는다
  useEffect(() => {
    if (allDone && !pref.autoFolded) {
      save({ ...pref, autoFolded: true, shut: { ...pref.shut, guide: true, quick: true } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  const toggle = (k: PanelKey) => save({ ...pref, shut: { ...pref.shut, [k]: !pref.shut[k] } });

  const steps = [
    { n: 1, title: '학생 모으기', desc: '입장 코드를 학생에게 보여 주세요', done: step1 },
    { n: 2, title: '명단 수락하기', desc: '들어온 학생을 확인하고 수락해요', done: step2 },
    { n: 3, title: '수업 시작하기', desc: '출석 체크에서 오늘 수업을 시작해요', done: step3 },
  ];
  const current = steps.find(s => !s.done);

  const cta = !current ? null
    : current.n === 1 && p.onShowCode ? { label: '입장 코드 크게 보기', run: p.onShowCode }
    : current.n === 1 || current.n === 2 ? { label: '전체 명단 보러 가기', run: p.onGoRoster }
    : { label: '출석 체크로 가기', run: p.onGoAttendance };

  const quick: { key: string; label: string; icon: LucideIcon; run: () => void; badge?: number }[] = [
    p.onOpenStudentPreview && { key: 'preview', label: '학생 화면 미리보기', icon: Smartphone, run: p.onOpenStudentPreview },
    p.onShowCode && { key: 'qr', label: '학생 입장 코드 확인', icon: QrCode, run: p.onShowCode },
    p.onOpenResources && { key: 'res', label: '수업 자료실', icon: BookOpen, run: p.onOpenResources },
    p.onOpenStudentPage && { key: 'page', label: '학생 페이지 이동', icon: ExternalLink, run: p.onOpenStudentPage },
    p.onOpenTeacherShareQR && { key: 'share', label: '교사용 결과 공유', icon: Share2, run: p.onOpenTeacherShareQR },
    p.onOpenGallery && { key: 'gallery', label: '수업 사진·동의', icon: Camera, run: p.onOpenGallery, badge: p.galleryPending },
    p.onExport && { key: 'export', label: '내보내기', icon: Download, run: p.onExport },
  ].filter(Boolean) as { key: string; label: string; icon: LucideIcon; run: () => void; badge?: number }[];

  if (pref.collapsed) {
    return (
      <aside className="w-full xl:w-[52px] xl:sticky xl:top-24 xl:self-start" data-tour="helper-rail">
        <button
          type="button"
          onClick={() => save({ ...pref, collapsed: false })}
          aria-label="도우미 칸 펼치기"
          title="도우미 칸 펼치기"
          className="w-full xl:w-[52px] flex xl:flex-col items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest hover:border-primary/40 transition-colors"
        >
          <PanelRightOpen size={20} className="text-primary" />
          <span className="xl:hidden text-sm font-bold text-on-surface-variant">도우미 칸 펼치기</span>
          <span className="min-w-[34px] px-1.5 py-0.5 rounded-full bg-primary-container text-primary text-[12px] font-black text-center">{doneCount}/3</span>
        </button>
      </aside>
    );
  }

  const Head = ({ k, title, sub }: { k: PanelKey; title: string; sub?: string }) => (
    <button
      type="button"
      onClick={() => toggle(k)}
      aria-expanded={!pref.shut[k]}
      className="w-full flex items-center gap-2 px-4 py-3.5 text-left"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-bold text-on-surface">{title}</span>
        {sub && <span className="block text-[14px] text-on-surface-variant">{sub}</span>}
      </span>
      {pref.shut[k] ? <ChevronRight size={18} className="text-on-surface-variant" /> : <ChevronDown size={18} className="text-on-surface-variant" />}
    </button>
  );
  const panel = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest';
  const guideBtn = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[15px] font-semibold text-on-surface hover:bg-primary-container/60 transition-colors text-left';

  return (
    <aside className="w-full xl:w-[320px] xl:sticky xl:top-24 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:overscroll-contain space-y-3" data-tour="helper-rail">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save({ ...pref, collapsed: true })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[14px] font-semibold text-on-surface-variant hover:text-primary hover:bg-primary-container/50 transition-colors"
        >
          <PanelRightClose size={16} /> 도우미 칸 접기
        </button>
      </div>

      {quick.length > 0 && (
        <section className={panel} data-tour="fab-plus">
          <Head k="quick" title="바로가기" sub="수업 중 자주 쓰는 메뉴" />
          {!pref.shut.quick && (
            <div className="px-2 pb-2.5">
              {quick.map(({ key, label, icon: Icon, run, badge }) => (
                <button key={key} type="button" onClick={run} className={guideBtn}>
                  <Icon size={17} className="text-primary shrink-0" />
                  <span className="flex-1">{label}</span>
                  {!!badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[12px] font-black inline-flex items-center justify-center">{badge}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={panel}>
        <Head k="start" title="시작하기" sub={allDone ? '준비가 모두 끝났어요' : `${doneCount}/3 완료`} />
        {!pref.shut.start && (
          <div className="px-4 pb-4 space-y-3">
            <div className="h-2 rounded-full bg-surface-container overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={doneCount}>
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(doneCount / 3) * 100}%` }} />
            </div>
            {doneCount === 0 && p.entryCode && (
              <div className="rounded-xl bg-primary-container/60 px-3 py-3 text-center">
                <p className="text-[13px] font-semibold text-on-surface-variant">학생 입장 코드</p>
                <p className="text-[28px] font-black tracking-[0.25em] text-primary">{p.entryCode}</p>
              </div>
            )}
            <ol className="space-y-2.5">
              {steps.map(s => (
                <li key={s.n} className="flex items-start gap-3">
                  <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[13px] font-black ${s.done ? 'bg-primary text-white' : s === current ? 'border-2 border-primary text-primary' : 'border border-slate-300 dark:border-slate-600 text-on-surface-variant'}`}>
                    {s.done ? <Check size={14} strokeWidth={3} /> : s.n}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[16px] font-bold ${s.done ? 'text-on-surface-variant line-through decoration-1' : 'text-on-surface'}`}>{s.title}</span>
                    {s === current && <span className="block text-[14px] text-on-surface-variant leading-snug">{s.desc}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {cta && (
              <button type="button" onClick={cta.run} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-[16px] font-bold hover:bg-primary/90 active:scale-[0.99] transition">
                <Rocket size={17} /> {cta.label}
              </button>
            )}
          </div>
        )}
      </section>

      <section className={panel}>
        <Head k="guide" title="안내 보기" sub="처음이라면 한 번 읽어 보세요" />
        {!pref.shut.guide && (
          <div className="px-2 pb-2.5">
            <button type="button" className={guideBtn} onClick={() => openTour('entry')}><Compass size={17} className="text-primary shrink-0" /> 학생 입장 준비 안내</button>
            <button type="button" className={guideBtn} onClick={() => openTour('student')}><Presentation size={17} className="text-primary shrink-0" /> 학생에게 보여 줄 안내</button>
            <button type="button" className={guideBtn} onClick={() => openTour('run')}><ListChecks size={17} className="text-primary shrink-0" /> 수업 진행 안내 보기</button>
          </div>
        )}
      </section>
    </aside>
  );
};

export default ClassroomHelperRail;
