import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, ListChecks, Presentation, X } from 'lucide-react';
import StudentGuideModal from './StudentGuideModal';

// 클래스룸 첫 사용 안내 투어 (1단계: 반 확인 → 입장 방식 → 현장 입력 수락)
// - 보기 전용: 화면 요소를 대신 눌러 주지 않는다 (수락·삭제 같은 동작은 선생님이 직접)
// - 안내 창은 설명 대상 요소 위에 겹치지 않도록 위/아래 빈 공간에 배치하고, 좁은 화면에서는 화면 아래/위에 붙인다
// - "봤음" 기록은 이 브라우저(localStorage)에만 남는다

interface TourStep {
  target: string;
  title: string;
  lead: string;
  points?: string[];
  why: string;
  mistake: string;
  /** 대상 요소가 지금 화면에 없을 때 보여 주는 설명 */
  missing: string;
  /** 이 단계가 열려 있어야 하는 탭. 다른 탭이면 그 탭 버튼을 가리키며 "눌러 주세요"를 먼저 안내한다 */
  tab?: string;
  tabLabel?: string;
  /** 대상 옆에 함께 보여야 하는 자리(위·왼쪽·아래로 px: 펼쳐지는 메뉴, 바로 아래 필터 줄 등). 안내 창이 그 자리까지 피해서 놓인다 */
  reserve?: { up?: number; left?: number; down?: number };
}

const STEPS: TourStep[] = [
  {
    target: 'class-selector',
    title: '먼저, 내 반이 선택돼 있는지 확인해요',
    lead: '왼쪽 위 이 버튼에 배정받은 반 이름이 보이면 준비 완료예요. 보라색 "담당" 표시가 있으면 학교 프로젝트에서 배정받은 반이에요.',
    why: '여기서 고른 반을 기준으로 학생 명단·수업 자료·출석이 모두 열려요.',
    mistake: '다른 반이 선택된 줄 모르고 준비를 시작하는 경우예요. 버튼을 누르면 반 목록이 열려요.',
    missing: '화면 왼쪽 위의 반 선택 버튼을 찾지 못했어요. 잠시 뒤 다시 열어 주세요.',
  },
  {
    target: 'entry-mode-banner',
    title: '학생이 어떻게 들어올지 정해요',
    lead: '학생 명단이 비어 있으면 이 노란 칸이 나타나요. "입장 방식 바꾸기"를 누르면 4가지 방법이 나와요.',
    points: [
      '명단으로 입장: 미리 만든 명단에서 학생이 이름을 눌러요.',
      '현장에서 학생이 직접 입력 (처음이라면 추천): 번호·이름을 학생이 쓰고 선생님이 확인해요.',
      '이름만 받기: 코드를 넣고 이름만 쓰고 들어와요.',
      '익명: 코드만 넣으면 들어와요.',
    ],
    why: '명단이 없는 첫 수업도 입장 방식만 고르면 바로 시작할 수 있어요.',
    mistake: '"이름만"·"익명"은 PIN이 없어서 친구 이름을 쓸 수 있어요. 평가가 필요한 수업에는 맞지 않아요.',
    missing: '이 노란 칸은 "전체 명단" 탭에서 학생 명단이 비어 있을 때만 보여요. 지금은 보이지 않아요.',
  },
  {
    target: 'live-roster-panel',
    title: '학생이 입력하면 여기에 모여요',
    lead: '"현장에서 학생이 직접 입력"을 골랐을 때 나타나는 칸이에요. 숫자는 3초마다 저절로 올라가요.',
    points: [
      '오른쪽 아래 + 버튼 → "학생 입장 코드 확인"을 열어 학생들에게 보여 주세요.',
      '학생들이 번호·이름을 쓰면 숫자가 올라가요. "명단 보기"로 확인해요.',
      '잘못 쓴 이름은 ✕로 지우고, 전부 다시 받으려면 "전체 취소·다시 받기"를 눌러요.',
      '다 모이면 "수락하고 시작"을 눌러요. 그러면 학생 화면이 이름 고르기로 넘어가요.',
    ],
    why: '수락하기 전까지 학생은 기다림 화면이에요. 수락해야 학생이 PIN을 만들고 들어와요.',
    mistake: '수락을 누르지 않으면 학생들이 계속 기다려요. 반대로 너무 일찍 누르면 늦게 입력한 학생이 빠질 수 있어요.',
    missing: '이 칸은 입장 방식을 "현장에서 학생이 직접 입력"으로 정했고 아직 수락 전일 때만 나타나요.',
  },
];

// 수업 진행 안내: 출석 체크 → 수업 시작 → 수업 종료 → 우리반 보드 (탭 이동은 선생님이 직접 누른다)
const RUN_STEPS: TourStep[] = [
  {
    target: 'fab-plus',
    reserve: { up: 280, left: 260 },
    title: '오른쪽 아래 + 버튼에 자주 쓰는 메뉴가 모여 있어요',
    lead: '이 + 버튼을 누르면 수업 중에 자주 쓰는 메뉴가 펼쳐져요.',
    points: [
      '수업 자료실: 이 반의 수업 자료를 열어 보고, 내 버전으로 고칠 수 있어요.',
      '학생 화면 미리보기: 학생이 보는 화면을 선생님 화면에서 미리 봐요.',
      '학생 입장 코드 확인·학생 페이지 이동: 학생이 들어오는 입구를 보여 줘요.',
    ],
    why: '수업 중에 탭을 옮겨 다니지 않고도 자료와 학생 화면을 바로 열 수 있어요.',
    mistake: '원본 자료는 고칠 수 없어요. 고치려면 자료실에서 "내 버전 편집하기"를 눌러요.',
    missing: '오른쪽 아래 + 버튼을 찾지 못했어요. 반을 선택한 뒤 다시 열어 주세요.',
  },
  {
    target: 'fab-plus',
    reserve: { up: 280, left: 260 },
    title: '수업 자료를 내 수업에 맞게 고치는 방법이에요',
    lead: '원본 자료는 모두가 같이 쓰는 거라 바로 고칠 수 없어요. 내 수업용 복사본을 만들어서 고쳐요.',
    points: [
      '+ 버튼 → "수업 자료실"을 열어 고칠 자료를 눌러요.',
      '"내 수업용으로 수정"을 누르면 내 버전이 만들어져요. (처음 한 번만)',
      '"내 버전 편집하기"를 누르면 수업 자료 에디터가 열려요. 글·그림·슬라이드를 직접 고치고 저장해요.',
      '학생에게는 내가 고친 버전이 보여요. 원본이 바뀌면 알려 주고, 내 버전 유지·원본으로 되돌리기를 고를 수 있어요.',
    ],
    why: '원본은 그대로 두고 내 반에만 맞춰 고칠 수 있어서, 다른 선생님 수업에는 영향이 없어요.',
    mistake: '"내 수업용으로 수정"을 누르기 전에는 고칠 수 없어요. 원본 화면에서 편집이 안 되면 이 버튼부터 눌러요.',
    missing: '오른쪽 아래 + 버튼을 찾지 못했어요. 반을 선택한 뒤 다시 열어 주세요.',
  },
  {
    tab: 'attendance',
    tabLabel: '출석 체크',
    target: 'attendance-date',
    title: '학생이 들어오면 출석이 여기에 모여요',
    lead: '학생이 입장하면 이 화면에서 출석 상태를 확인하고 바꿀 수 있어요.',
    points: ['날짜를 바꾸면 지난 수업의 출석도 볼 수 있어요.', '오늘 날짜일 때만 아래 "수업 시작" 영역이 보여요.'],
    why: '출석은 수업 기록과 함께 쌓여서 나중에 결과를 정리할 때 쓰여요.',
    mistake: '날짜가 오늘이 아니면 수업 시작 버튼이 보이지 않아요. 날짜를 먼저 확인해요.',
    missing: '출석 화면을 찾지 못했어요. 잠시 뒤 다시 열어 주세요.',
  },
  {
    tab: 'attendance',
    tabLabel: '출석 체크',
    target: 'session-control',
    title: '수업을 시작할 때 "오늘 수업 시작"을 눌러요',
    lead: '진행할 주차를 먼저 고른 뒤 "오늘 수업 시작"을 눌러요. 지금 눌러야 할 버튼 하나만 보여요.',
    points: ['주차를 고르면 시작 버튼이 켜져요.', '시작하면 "수업 진행 중"으로 바뀌고 쉬는시간·종료 알람이 작동해요.'],
    why: '시작을 눌러야 알람과 학생 화면의 오늘 주차가 맞게 연결돼요.',
    mistake: '시작을 누르지 않으면 쉬는시간 알람이 울리지 않아요. 잘못 눌렀다면 "시작 취소"가 있어요.',
    missing: '이 영역은 "오늘" 날짜의 출석 화면에서만 보여요. 날짜를 오늘로 맞춰 주세요.',
  },
  {
    tab: 'attendance',
    tabLabel: '출석 체크',
    target: 'session-control',
    title: '수업이 끝나면 "오늘 수업 종료"를 눌러요',
    lead: '수업이 진행 중일 때는 같은 자리에 빨간 "오늘 수업 종료" 버튼이 나타나요.',
    points: ['종료하면 쉬는시간·수업종료 알람이 멈춰요.', '종료한 뒤에도 필요하면 다시 열 수 있어요.'],
    why: '종료를 눌러야 오늘 수업이 끝난 것으로 기록되고 알람이 정리돼요.',
    mistake: '종료를 누르지 않으면 알람이 계속 울릴 수 있어요. 수업 끝에 한 번 눌러 주세요.',
    missing: '이 영역은 "오늘" 날짜의 출석 화면에서만 보여요. 날짜를 오늘로 맞춰 주세요.',
  },
  {
    tab: 'board',
    tabLabel: '우리반 보드',
    target: 'board-header',
    reserve: { down: 96 },
    title: '학생이 낸 기록과 결과는 우리반 보드에서 봐요',
    lead: '학생이 활동 기록이나 결과를 제출하면 승인된 것이 이 보드에 모여요.',
    points: ['"활동 기록"과 "결과"로 나눠 볼 수 있어요.', '"전체화면"은 교실 화면에 학생 작품을 보여 줄 때 써요.', '"새로고침"을 누르면 방금 낸 제출물이 보여요.'],
    why: '수업 중에 학생 작품을 바로 확인하고 함께 볼 수 있어요.',
    mistake: '아직 승인되지 않은 제출물은 보드에 보이지 않아요. 안 보이면 승인 상태를 먼저 확인해요.',
    missing: '우리반 보드를 찾지 못했어요. 잠시 뒤 다시 열어 주세요.',
  },
];

const STORAGE_KEY = 'classroom_guide_a_seen_v1';
const readSeen = () => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } };
const writeSeen = () => { try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* 저장이 막힌 환경에서는 그냥 넘어감 */ } };

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

const MARGIN = 12;
const GAP = 16;
const SCROLL_TOP = 96;

// 대상을 가린 것이 "모달·팝업 같은 덮는 층"(fixed + z-index 100 이상)일 때만 안내를 숨긴다. 상단바·일반 요소가 스친 경우는 무시
function isOverlayLayer(top: Element): boolean {
  let el: HTMLElement | null = top as HTMLElement;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && Number(cs.zIndex) >= 100) return true;
    el = el.parentElement;
  }
  return false;
}

// 화면 맨 위에 고정된 상단바(fixed/sticky)가 있으면 그 아래로 대상이 오도록 스크롤 여백을 계산한다
function scrollTopOffset(): number {
  let el = document.elementFromPoint(Math.floor(window.innerWidth / 2), 4) as HTMLElement | null;
  while (el && el !== document.body) {
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky') return Math.max(SCROLL_TOP, Math.ceil(el.getBoundingClientRect().bottom) + 24);
    el = el.parentElement;
  }
  return SCROLL_TOP;
}

interface Placement { top: number; left: number; width: number }

// 대상 요소와 겹치지 않는 자리를 고른다: 아래 → 위 → 오른쪽 → 왼쪽 → (모두 안 되면) 대상에서 먼 쪽 화면 가장자리
function computePlacement(rect: DOMRect | null, cardH: number, vw: number, vh: number): Placement {
  const narrow = vw < 640;
  const width = narrow ? vw - MARGIN * 2 : Math.min(420, vw - MARGIN * 2);
  if (!rect) return { top: Math.max(MARGIN, vh - cardH - MARGIN), left: Math.max(MARGIN, (vw - width) / 2), width };

  const clampLeft = (x: number) => Math.min(Math.max(MARGIN, x), vw - width - MARGIN);
  const clampTop = (y: number) => Math.min(Math.max(MARGIN, y), Math.max(MARGIN, vh - cardH - MARGIN));
  const below = vh - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  if (below >= cardH) return { top: rect.bottom + GAP, left: clampLeft(rect.left), width };
  if (above >= cardH) return { top: rect.top - GAP - cardH, left: clampLeft(rect.left), width };
  if (!narrow) {
    if (vw - rect.right - GAP - MARGIN >= width) return { top: clampTop(rect.top), left: rect.right + GAP, width };
    if (rect.left - GAP - MARGIN >= width) return { top: clampTop(rect.top), left: rect.left - GAP - width, width };
  }
  const dockBottom = rect.top + rect.height / 2 < vh / 2;
  return { top: dockBottom ? Math.max(MARGIN, vh - cardH - MARGIN) : MARGIN, left: clampLeft((vw - width) / 2), width };
}

interface Props {
  classId: string;
  /** 배정받은 강사 등 안내 대상인지 (아니면 주소에 ?tour=1을 붙였을 때만 나타남) */
  eligible: boolean;
  /** "학생에게 보여 줄 안내"에 표시할 입장 코드·입장 방식 */
  entryCode?: string;
  entryMode?: string;
  /** 지금 반의 학생 수 — 이미 학생이 있는 반에는 "처음이세요?" 안내 칸을 띄우지 않는다 */
  studentCount: number;
  /** 지금 열려 있는 탭 — 수업 진행 안내가 탭 이동을 따라가기 위해 필요 */
  activeTab: string;
}

const ClassroomGuideTour = ({ classId, eligible, entryCode, entryMode, studentCount, activeTab }: Props) => {
  const [studentGuideOpen, setStudentGuideOpen] = useState(false);

  const [seen, setSeen] = useState(readSeen);
  const [stepIdx, setStepIdx] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [covered, setCovered] = useState(false);
  const [missing, setMissing] = useState(false);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [cardH, setCardH] = useState(380);
  const cardRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);

  // 안내를 시작하는 순간 화면에 실제로 있는 대상만 단계로 쓴다 (없는 칸을 설명하는 단계는 건너뜀)
  const [steps, setSteps] = useState<TourStep[]>(STEPS);
  const step = stepIdx === null ? null : steps[stepIdx] ?? null;
  // 이 단계의 탭이 아직 열려 있지 않으면 탭 버튼을 먼저 가리킨다
  const needTab = !!step?.tab && step.tab !== activeTab;
  const targetName = step ? (needTab ? `tab-${step.tab}` : step.target) : '';

  const close = useCallback(() => { setStepIdx(null); setSeen(true); writeSeen(); }, []);
  const start = () => {
    setSeen(true);
    writeSeen();
    const available = STEPS.filter(st => !!document.querySelector(`[data-tour="${st.target}"]`));
    setSteps(available.length > 0 ? available : STEPS.slice(0, 1));
    setStepIdx(0);
  };
  const startRun = () => { setSteps(RUN_STEPS); setStepIdx(0); };

  // 반이 바뀌면 진행 중인 투어는 닫는다
  useEffect(() => { setStepIdx(null); }, [classId]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 단계가 바뀌면 대상이 위쪽에 보이도록 한 번 스크롤 (안내 창이 아래 빈 공간에 들어가도록)
  useEffect(() => {
    if (!step) return;
    window.dispatchEvent(new Event('classroom-fab-close'));
    startedAtRef.current = Date.now();
    setRect(null);
    setMissing(false);
    setCovered(false);
    const el = document.querySelector<HTMLElement>(`[data-tour="${targetName}"]`);
    if (!el || el.closest('nav') || getComputedStyle(el).position === 'fixed') return;
    const r = el.getBoundingClientRect();
    const offset = scrollTopOffset();
    if (r.top < offset - 24 || r.top > offset + 24) {
      el.style.scrollMarginTop = `${offset}px`;
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [step, targetName]);

  // 대상 위치 추적 + 팝업/모달이 대상을 가리면 안내를 잠시 숨김
  useEffect(() => {
    if (!step) return;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${targetName}"]`);
      if (!el) {
        setRect(prev => (prev === null ? prev : null));
        if (Date.now() - startedAtRef.current > 1200) setMissing(true);
        return;
      }
      setMissing(false);
      const r = el.getBoundingClientRect();
      setRect(prev => (sameRect(prev, r) ? prev : r));
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
      const cy = Math.min(Math.max(r.top + Math.min(r.height / 2, 24), 1), window.innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      setCovered(!!top && !el.contains(top) && !cardRef.current?.contains(top) && isOverlayLayer(top));
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [step, targetName]);

  useLayoutEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      setCardH(prev => (Math.abs(prev - h) > 1 ? h : prev));
    }
  });

  const stepNo = stepIdx ?? 0;
  const isLast = stepNo === steps.length - 1;
  const targetVisible = !!rect && !missing;
  // 좁은 화면에서는 펼쳐진 메뉴를 가리지 않도록 설명을 짧게 줄인다
  const compact = !!step?.reserve?.up && vp.w < 640 && !needTab;
  const avoid = targetVisible && rect && step?.reserve && !needTab
    ? ({ top: rect.top - (step.reserve.up ?? 0), bottom: rect.bottom + (step.reserve.down ?? 0), left: rect.left - (step.reserve.left ?? 0), right: rect.right } as DOMRect)
    : rect;
  const place = computePlacement(targetVisible ? avoid : null, cardH, vp.w, vp.h);

  return (
    <>
      {activeTab === 'list' && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {eligible && !seen && studentCount === 0 ? (
          <div className="flex-1 min-w-[260px] flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-indigo-50 border border-indigo-200 rounded-2xl">
            <p className="text-sm font-bold text-indigo-900 leading-relaxed">
              처음이세요? 수업 전에 꼭 해야 할 "학생 입장 준비"를 안내해 드릴게요.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={start} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 transition-all">안내 시작</button>
              <button type="button" onClick={() => { setSeen(true); writeSeen(); }} className="px-3 py-2.5 rounded-xl text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-all">나중에</button>
            </div>
          </div>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <button type="button" onClick={start} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-all">
              <Compass size={14} /> 학생 입장 준비 안내 {seen ? '다시 보기' : '보기'}
            </button>
            <button type="button" onClick={() => setStudentGuideOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-all">
              <Presentation size={14} /> 학생에게 보여 줄 안내
            </button>
            <button type="button" onClick={startRun} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-all">
              <ListChecks size={14} /> 수업 진행 안내 보기
            </button>
          </div>
        )}
      </div>
      )}

      {studentGuideOpen && <StudentGuideModal entryCode={entryCode} entryMode={entryMode} onClose={() => setStudentGuideOpen(false)} />}

      {step && !covered && createPortal(
        <>
          {targetVisible && rect && (
            <div
              aria-hidden
              style={{
                position: 'fixed',
                top: rect.top - 4,
                left: rect.left - 4,
                width: rect.width + 8,
                height: rect.height + 8,
                borderRadius: 16,
                border: '3px solid #f59e0b',
                boxShadow: '0 0 0 4px rgba(245,158,11,0.25)',
                pointerEvents: 'none',
                zIndex: 9997,
              }}
            />
          )}
          <div
            ref={cardRef}
            role="dialog"
            aria-label="클래스룸 사용 안내"
            style={{ position: 'fixed', top: place.top, left: place.left, width: place.width, maxHeight: vp.h - MARGIN * 2, overflowY: 'auto', zIndex: 9999 }}
            className="bg-white text-gray-900 rounded-2xl border-2 border-indigo-500 shadow-2xl p-5"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-black text-indigo-600">{steps === RUN_STEPS ? '수업 진행' : '학생 입장 준비'} · {stepNo + 1}/{steps.length}</p>
              <button type="button" onClick={close} aria-label="안내 닫기" className="p-1.5 -m-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <h3 className="text-lg font-black leading-snug mb-2">{needTab ? `"${step.tabLabel}" 탭을 눌러 주세요` : step.title}</h3>
            <p className="text-[15px] font-medium leading-7 text-gray-800">
              {needTab ? '표시된 탭을 직접 눌러 이동해 주세요. 누르면 이 단계의 설명이 이어져요.' : missing ? step.missing : step.lead}
            </p>
            {!needTab && !missing && !compact && step.points && (
              <ol className="mt-3 space-y-2">
                {step.points.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-6 text-gray-800">
                    <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            )}
            {!needTab && !missing && !compact && (
              <div className="mt-3 space-y-2">
                <p className="text-sm leading-6 bg-sky-50 text-sky-900 rounded-xl px-3 py-2"><b className="font-black">왜 필요해요?</b> {step.why}</p>
                <p className="text-sm leading-6 bg-amber-50 text-amber-900 rounded-xl px-3 py-2"><b className="font-black">자주 하는 실수</b> {step.mistake}</p>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setStepIdx(Math.max(0, stepNo - 1))} disabled={stepNo === 0}
                className="px-4 py-2.5 rounded-xl text-sm font-black text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all">이전</button>
              <button type="button" onClick={() => (isLast ? close() : setStepIdx(stepNo + 1))}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all">{isLast ? '마치기' : '다음'}</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
};

export default ClassroomGuideTour;
