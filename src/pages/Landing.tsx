import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap,
  BookOpen,
  Sparkles,
  FileDown,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Users,
  Heart,
  Send,
  KeyRound,
  PenLine,
  School,
  Play,
  PlayCircle,
  ChevronRight,
  Video,
  Mic,
  Shuffle,
  Timer,
  ClipboardCheck,
  LayoutPanelTop,
  BarChart2,
  Images,
  X,
  Lightbulb,
  MessageCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, isAnonymousUser } from '../lib/auth';
import { parseVideoUrl } from '../lib/gallery';
import {
  ChillingDoodle,
} from 'react-open-doodles';

const DOODLE_INK = '#27272b';
const DOODLE_ACCENT = '#a95ef8';

const ROLES = ['담임 선생님', '교과 선생님', '학원 강사', '개인 강사', '교육 행정직', '기타'];

const KAKAO_OPEN_CHAT_URL = 'https://open.kakao.com/o/p7ZWBlKi';

// 체험하기(/demo) 버튼 임시 비활성화 — 다시 노출하려면 true로 변경
const SHOW_DEMO_CTA = false;

// ── WRITER 스타일 공용 클래스 ──
const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-full bg-writer-obsidian text-white font-semibold hover:bg-black transition-colors disabled:opacity-60 whitespace-nowrap';
const btnAccent = 'inline-flex items-center justify-center gap-2 rounded-full bg-writer-iris text-white font-semibold hover:bg-writer-iris-dim transition-colors disabled:opacity-60 whitespace-nowrap';
const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-full border border-writer-iris text-writer-iris font-semibold hover:bg-writer-lavender transition-colors disabled:opacity-60 whitespace-nowrap';

const Eyebrow = ({ children, dark }: { children: ReactNode; dark?: boolean }) => (
  <span
    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] font-poppins font-medium tracking-[0.12em] mb-5 ${
      dark ? 'border-white/20 bg-white/5 text-white' : 'border-writer-mist bg-white text-writer-obsidian'
    }`}
  >
    {children}
  </span>
);

const features = [
  {
    icon: BookOpen,
    title: '학생 활동 기록 관리',
    desc: '참여 코드 하나로 학생이 직접 제출. 승인·반려·피드백·파일 첨부까지 한 화면에서.',
    image: '/illustrations/icon-notebook.webp',
  },
  {
    icon: Sparkles,
    title: 'AI 세특 자동 생성',
    desc: '쌓인 관찰기록을 Gemini AI가 분석해 학생별 세특 초안을 한 번에 완성합니다.',
    accent: true,
    image: '/illustrations/icon-ai-draft.webp',
  },
  {
    icon: FileDown,
    title: '나이스 바로 제출',
    desc: '500자 편집 후 나이스 엑셀로 내보내기. 행동특성·종합의견도 AI가 초안을 씁니다.',
    image: '/illustrations/icon-nice-submit.webp',
  },
  {
    icon: Lightbulb,
    title: '아이디어 기록',
    desc: '수업 아이디어를 메모하듯 기록하면 AI가 분석하고, 의미 기반 검색으로 관련 자료까지 함께 찾아줍니다.',
  },
  {
    icon: Users,
    title: '학급·학생 통합 관리',
    desc: '교과반·담임반 분리, 단원 관리, 출석, 갤러리, 폴더 정리 모두 한 곳에서.',
  },
  {
    icon: Mic,
    title: '수업 전사 + AI 분석',
    desc: '수업 음성을 텍스트로 전사하고, AI가 학생별 관찰 기록을 자동으로 정리합니다.',
  },
];

const teachingTools = [
  { icon: Shuffle, title: '랜덤 조 뽑기', desc: '애니메이션과 함께 랜덤 조 편성', badge: '무료', image: '/screenshots/tools/group-picker.png' },
  { icon: Timer, title: '수업 타이머', desc: '전체화면 발표 모드 · 플로팅 버튼', badge: '무료', image: '/screenshots/tools/timer.png' },
  { icon: ClipboardCheck, title: '실시간 퀴즈', desc: 'AI 문항 자동 생성 · PIN 참여', badge: '무료', image: '/screenshots/tools/quiz.png' },
  { icon: BookOpen, title: '수업 자료 에디터', desc: '마크다운 작성 · 슬라이드 발표', badge: '무료 2개', image: '/screenshots/tools/materials.png' },
  { icon: Mic, title: '수업 전사', desc: 'Groq Whisper 실시간 전사 · AI 분석', badge: '무료 월 20회', image: '/screenshots/tools/transcription.png' },
  { icon: LayoutPanelTop, title: '협업 화이트보드', desc: '실시간 조별 협업 · 6종 오브젝트', badge: '무료 1개', image: '/screenshots/tools/whiteboard.png' },
  { icon: BarChart2, title: '실시간 설문', desc: '6가지 문항 유형 · AI 응답 분석', badge: '무료 1개', image: '/screenshots/tools/survey.png' },
  { icon: Images, title: '수업 갤러리', desc: '사진·영상 주차별 보관 · 학급 공유', badge: '무료', image: '/screenshots/tools/gallery.png' },
];

const useCases = [
  { emoji: '🏫', title: '고등학교', desc: '세특·행동특성·종합의견 AI 초안 생성, 나이스 엑셀 일괄 제출', tag: '세특 자동화' },
  { emoji: '🏫', title: '중학교', desc: '학교생활기록부 기재용 활동 기록 수집·관리', tag: '생기부 기록' },
  { emoji: '🏢', title: '학원·교습소', desc: '수강생 관찰 기록 → AI 학부모 성장 보고서 자동 생성', tag: '학부모 보고서' },
  { emoji: '🎸', title: '음악·예체능 레슨', desc: '레슨별 성취도·관찰 기록, 수강생 포트폴리오 구축', tag: '레슨 기록' },
  { emoji: '💻', title: '코딩·방과후 교실', desc: '프로젝트별 활동 기록, 결과물 제출, AI 성취 분석', tag: '프로젝트 관리' },
  { emoji: '🌱', title: '대안학교·홈스쿨', desc: '정형화되지 않은 수업도 체계적으로 기록하고 관리', tag: '자유로운 기록' },
];

const steps = [
  { num: '01', title: '학급 생성', desc: '교과반·담임반 구분해서 학급을 만들면 학생들이 코드로 바로 참여합니다.' },
  { num: '02', title: '틈틈이 기록', desc: '학생이 직접 제출하거나, 선생님이 수업 중 메모를 남깁니다. 기록이 쌓일수록 세특이 정확해집니다.' },
  { num: '03', title: 'AI 세특 생성', desc: 'AI가 기록을 분석해 학생별 세특 초안을 자동 완성. 수정 후 저장합니다.' },
  { num: '04', title: '나이스 제출', desc: '500자 맞춤 편집 후 나이스 엑셀로 바로 내보냅니다.' },
];

const pricingPlans = [
  {
    name: '무료',
    badge: 'FREE',
    category: 'individual',
    desc: '처음 시작하는 선생님',
    price: null,
    features: [
      { text: '클래스 최대 1개', ok: true },
      { text: '학생 최대 20명/클래스', ok: true },
      { text: '학생 관찰 기록 · 교사 메모', ok: true },
      { text: 'AI 세특 월 20회 체험', ok: true },
      { text: '수업 자료 에디터 (2개까지)', ok: true },
      { text: '퀴즈 (최대 5문항)', ok: true },
      { text: '설문 (1개까지)', ok: true },
      { text: '화이트보드 (1개까지)', ok: true },
      { text: '수업 전사 (Groq 키 필요, AI 분석 월 20회)', ok: true },
      { text: '일괄 AI 생성', ok: false },
      { text: 'NAISS 내보내기', ok: false },
      { text: '학교 프로젝트', ok: false },
    ],
  },
  {
    name: 'Basic',
    badge: 'BASIC',
    category: 'individual',
    desc: '꾸준히 활용하는 선생님',
    price: '9,900',
    periodNote: '3개월 5%↓ · 6개월 10%↓ · 12개월 2개월 무료',
    waitlistPlan: 'basic',
    features: [
      { text: '클래스 최대 5개', ok: true },
      { text: '학생 최대 35명/클래스', ok: true },
      { text: '학생 관찰 기록 · 교사 메모', ok: true },
      { text: 'AI 사용 넉넉하게', ok: true },
      { text: '수업 자료 에디터', ok: true },
      { text: '퀴즈 · 설문 무제한', ok: true },
      { text: '화이트보드 (3개)', ok: true },
      { text: '수업 전사 (Groq API 필요)', ok: true },
      { text: '일괄 AI 생성', ok: false },
      { text: 'NAISS 내보내기', ok: false },
      { text: '학교 프로젝트 참여', ok: true },
    ],
  },
  {
    name: 'Pro',
    badge: 'PRO',
    category: 'individual',
    desc: '적극적으로 활용하는 선생님',
    price: '19,900',
    periodNote: '3개월 5%↓ · 6개월 10%↓ · 12개월 2개월 무료',
    highlight: true,
    waitlistPlan: 'pro',
    features: [
      { text: '클래스 최대 10개', ok: true },
      { text: '학생 최대 35명/클래스', ok: true },
      { text: '학생 관찰 기록 · 교사 메모', ok: true },
      { text: 'AI 사용 가장 넉넉하게', ok: true },
      { text: '수업 자료 에디터', ok: true },
      { text: '퀴즈 · 설문 · 화이트보드 무제한', ok: true },
      { text: '수업 전사 & AI 분석 (Groq 키 필요)', ok: true },
      { text: '일괄 AI 생성', ok: true },
      { text: 'NAISS 내보내기', ok: true },
      { text: '학교 프로젝트 생성 · 관리', ok: true },
    ],
  },
  {
    name: 'School',
    badge: 'SCHOOL',
    category: 'group',
    desc: '학교·학원 단위 기관 도입',
    price: '문의',
    schoolBadge: true,
    features: [
      { text: 'Pro 기능 전체 포함', ok: true },
      { text: '교사 계정 통합 관리', ok: true },
      { text: '학교 관리자(Admin) 제공', ok: true },
      { text: '교사 수에 따라 요금 조정', ok: true },
      { text: '단일 청구서 발행', ok: true },
      { text: 'S(5명) · M(15명) · L(35명) 티어', ok: true },
    ],
  },
];

const Landing = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isLoggedIn = !!user && !isAnonymousUser(user);

  // 웨이팅리스트 상단 배너
  const [showWaitlistBar, setShowWaitlistBar] = useState(
    () => localStorage.getItem('landing_waitlist_bar_dismissed') !== '1'
  );
  const dismissWaitlistBar = () => {
    localStorage.setItem('landing_waitlist_bar_dismissed', '1');
    setShowWaitlistBar(false);
  };

  // 얼리버드 신청 팝업 (오늘 하루 보지 않기 체크 시 당일만 숨김)
  const [showEarlybirdPopup, setShowEarlybirdPopup] = useState(false);
  const [hideEarlybirdToday, setHideEarlybirdToday] = useState(false);
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('landing_earlybird_popup_hide_date') === todayStr) return;
    const timer = setTimeout(() => setShowEarlybirdPopup(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  const closeEarlybirdPopup = () => {
    if (hideEarlybirdToday) {
      const todayStr = new Date().toISOString().slice(0, 10);
      localStorage.setItem('landing_earlybird_popup_hide_date', todayStr);
    }
    setShowEarlybirdPopup(false);
  };

  // 공개 통계
  const [pubStats, setPubStats] = useState({ total_observations: 0, total_classes: 0, total_students: 0 });
  useEffect(() => {
    supabase.rpc('get_public_stats').then(({ data }) => {
      if (data) setPubStats(data);
    });
  }, []);

  // 영상 가이드 (최대 3개 미리보기)
  const [videoGuides, setVideoGuides] = useState<any[]>([]);
  useEffect(() => {
    supabase
      .from('video_guides')
      .select('id, title, description, url, category')
      .eq('is_active', true)
      .order('order_num')
      .limit(3)
      .then(({ data }) => setVideoGuides(data ?? []));
  }, []);

  const fmt = (n: number) => n > 0 ? n.toLocaleString('ko-KR') : '—';

  // 구글 무료 가입
  const [googleLoading, setGoogleLoading] = useState(false);
  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    // 리다이렉트 후에는 URL의 ?ref= 값이 사라지므로, 로그인 완료 후 자동 적용될 수 있도록 미리 저장
    const refCode = searchParams.get('ref');
    if (refCode) localStorage.setItem('pending_referral_code', refCode.toUpperCase());
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setGoogleLoading(false);
  };

  // 신청 폼 상태
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 플랜 안내 탭 (개인 / 단체)
  const [planTab, setPlanTab] = useState<'individual' | 'group'>('individual');

  // 수업 도구 미리보기 탭
  const [activeTool, setActiveTool] = useState(0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    // 중복 신청 / 이미 가입된 계정 사전 확인
    try {
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (checkRes.ok) {
        const { status } = await checkRes.json();
        if (status === 'registered') {
          setSubmitError('이미 가입된 계정입니다. 로그인 화면에서 접속하거나 비밀번호 찾기를 이용해주세요.');
          setSubmitting(false);
          return;
        }
        if (status === 'pending') {
          setSubmitError('이미 신청이 접수되어 검토 중입니다. 승인 완료 후 이메일로 안내드립니다.');
          setSubmitting(false);
          return;
        }
        if (status === 'approved') {
          setSubmitError('이미 승인된 계정입니다. 받은 이메일을 확인하거나 비밀번호 찾기를 이용해주세요.');
          setSubmitting(false);
          return;
        }
        // status === 'available' 또는 'rejected' → 신청 진행
      }
    } catch {
      // 확인 API 실패해도 신청은 계속 진행
    }

    const { error } = await supabase.from('access_requests').insert({
      name,
      email,
      school_name: schoolName,
      role,
      message: message || null,
    });

    if (error) {
      setSubmitting(false);
      setSubmitError('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    // 슬랙 알림 (실패해도 신청은 이미 저장됐으므로 무시)
    try {
      const slackRes = await fetch('/api/slack?type=notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, school_name: schoolName, role, message: message || null }),
      });
      if (!slackRes.ok) {
        const err = await slackRes.json().catch(() => ({}));
        console.warn('[slack-notify] failed:', slackRes.status, err);
      }
    } catch (e) {
      console.warn('[slack-notify] network error:', e);
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-white text-writer-obsidian font-pretendard">
      {/* ── 얼리버드 신청 팝업 ── */}
      <AnimatePresence>
        {showEarlybirdPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
            onClick={closeEarlybirdPopup}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <button
                onClick={closeEarlybirdPopup}
                aria-label="닫기"
                className="absolute right-4 top-4 z-10 p-1.5 rounded-full bg-white/80 text-writer-obsidian/60 hover:text-writer-obsidian transition-colors"
              >
                <X size={16} />
              </button>

              <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 px-7 pt-9 pb-7 text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 rounded-full mb-4">
                  <Sparkles size={13} className="text-writer-obsidian" strokeWidth={2.5} />
                  <span className="text-xs font-black text-writer-obsidian">얼리버드 이벤트</span>
                </div>
                <h2 className="text-xl font-black text-writer-obsidian mb-2 leading-snug">
                  유료 플랜 오픈 전,
                  <br />
                  지금 신청하면 <span className="text-amber-600">첫 달 50% 할인</span>
                </h2>
                <p className="text-sm text-writer-obsidian/60 leading-relaxed">
                  이메일만 남겨두시면 오픈 즉시 가장 먼저 안내드려요.
                </p>
              </div>

              <div className="px-7 py-6 space-y-4">
                <Link
                  to="/waitlist"
                  onClick={closeEarlybirdPopup}
                  className="block w-full text-center py-3.5 rounded-2xl text-sm font-black text-white bg-amber-500 hover:bg-amber-600 transition-all active:scale-95"
                >
                  얼리버드 신청하기
                </Link>
                <label className="flex items-center justify-center gap-2 text-xs text-writer-obsidian/50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideEarlybirdToday}
                    onChange={(e) => setHideEarlybirdToday(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-amber-500"
                  />
                  오늘 하루만 보기
                </label>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 웨이팅리스트 상단 배너 ── */}
      {showWaitlistBar && (
        <div className="relative bg-writer-obsidian text-white">
          <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center justify-center gap-3 text-center">
            <span className="hidden sm:inline-flex shrink-0 items-center gap-1 bg-amber-400 text-writer-obsidian text-[10px] font-bold px-2 py-0.5 rounded-full">
              <Sparkles size={11} strokeWidth={2.5} />
              오픈 예정
            </span>
            <p className="text-xs sm:text-sm font-medium">
              유료 플랜 곧 오픈! 지금 얼리버드 신청하면{' '}
              <span className="text-amber-300 font-bold">첫 달 50% 할인</span>
            </p>
            <Link
              to="/waitlist"
              className="shrink-0 bg-amber-400 text-writer-obsidian text-xs font-black px-3 py-1 rounded-full hover:bg-amber-300 transition-colors whitespace-nowrap"
            >
              신청하기
            </Link>
            <button
              onClick={dismissWaitlistBar}
              aria-label="닫기"
              className="absolute right-3 sm:right-6 p-1 text-white/60 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-writer-mist">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-writer-obsidian rounded-[10px] flex items-center justify-center shrink-0">
              <GraduationCap size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="whitespace-nowrap text-sm sm:text-lg font-black tracking-tight">클래스로그 AI</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="/catalog.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex px-4 py-2 text-writer-obsidian/70 hover:text-writer-obsidian text-sm font-medium rounded-full transition-colors items-center gap-1.5 hover:bg-writer-mist/40"
            >
              제품 소개
            </a>
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex px-4 py-2 text-writer-obsidian/70 hover:text-writer-obsidian text-sm font-medium rounded-full transition-colors items-center gap-1.5 hover:bg-writer-mist/40"
            >
              사용 가이드
            </a>
            <button
              onClick={() => navigate('/video-guide')}
              className="hidden sm:flex px-4 py-2 text-writer-obsidian/70 hover:text-writer-obsidian text-sm font-medium rounded-full transition-colors items-center gap-1.5 hover:bg-writer-mist/40"
            >
              영상 가이드
            </button>
            <button
              onClick={() => navigate('/classroom-entry')}
              className={`${btnGhost} px-2.5 sm:px-4 py-2 text-xs sm:text-sm`}
            >
              <KeyRound size={14} strokeWidth={2.5} className="hidden sm:block" />
              수업 참여
            </button>
            <button
              onClick={() => navigate(isLoggedIn ? '/dashboard' : '/login')}
              className={`${btnPrimary} px-2.5 sm:px-4 py-2 text-xs sm:text-sm`}
            >
              {isLoggedIn ? '대시보드로 이동' : '선생님 로그인'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-20 grid md:grid-cols-2 md:gap-16 gap-10 md:items-center">
          {/* Hero visual */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="md:order-first relative w-full max-w-md mx-auto md:mx-0"
          >
            <motion.img
              src="/illustrations/teacher-hero.webp"
              alt="교실에서 학생을 지도하는 선생님"
              className="w-full"
              animate={{ y: [0, -10, 0], rotate: [0, 1.2, 0, -1.2, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute top-4 right-2 md:right-4 flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full shadow-lg border border-writer-mist text-xs font-bold text-writer-iris"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            >
              <CheckCircle2 size={14} /> 자동 기록 완료
            </motion.div>
            <motion.div
              className="absolute bottom-8 -left-2 md:-left-6 flex items-center gap-1.5 px-3 py-1.5 bg-writer-iris rounded-full shadow-lg text-xs font-bold text-white"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            >
              <Timer size={14} /> 시간 절약 중
            </motion.div>
          </motion.div>

          <div className="text-center md:text-left">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Eyebrow>
                <Heart size={12} fill="currentColor" /> 선생님 · 학원 강사를 위한 AI 도구
              </Eyebrow>
              <h1 className="whitespace-nowrap text-[clamp(1.5rem,7vw,3rem)] md:text-[clamp(1.75rem,4.5vw,3.75rem)] font-black leading-[1.05] tracking-tight mb-6">
                기록하고, 만들고,<br />
                <span className="text-writer-orchid">관리합니다</span>
              </h1>
              <p className="text-lg text-writer-slate max-w-xl mx-auto md:mx-0 mb-10 leading-relaxed">
                수업 중 남긴 기록을 AI가 수업 자료와 세특 초안으로 만들어 드립니다.<br />
                클래스로그 AI와 함께, 반복 업무는 줄고 수업에 쓸 시간은 늘어납니다.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                {SHOW_DEMO_CTA && (
                  <button
                    onClick={() => navigate('/demo')}
                    className={`${btnPrimary} px-8 py-4 text-base`}
                  >
                    <Play size={18} strokeWidth={3} />
                    지금 바로 체험하기
                  </button>
                )}
                {isLoggedIn ? (
                  <button
                    onClick={() => navigate('/dashboard')}
                    className={`${btnAccent} px-8 py-4 text-base`}
                  >
                    대시보드로 이동
                    <ArrowRight size={18} strokeWidth={3} />
                  </button>
                ) : (
                  <button
                    onClick={handleGoogleSignup}
                    disabled={googleLoading}
                    className={`${btnAccent} px-8 py-4 text-base`}
                  >
                    {googleLoading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 48 48">
                          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                        </svg>
                        Google로 무료 시작하기
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => navigate('/classroom-entry')}
                  className={`${btnGhost} px-8 py-4 text-base`}
                >
                  <KeyRound size={18} strokeWidth={2.5} />
                  수업 참여
                </button>
              </div>
              <p className="mt-3 text-xs text-writer-slate">
                학생이신가요? 선생님께 받은 수업 코드로 참여하려면 위 <strong className="text-writer-obsidian">"수업 참여"</strong>를 눌러주세요.
              </p>
              <a
                href="/catalog.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-5 text-sm text-writer-slate hover:text-writer-obsidian font-medium transition-colors underline underline-offset-4 decoration-writer-fog"
              >
                📋 제품 카탈로그 · 도입 안내서 보기
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mt-14 grid grid-cols-3 gap-6 max-w-lg mx-auto md:mx-0"
            >
              {[
                { icon: PenLine,   value: fmt(pubStats.total_observations), label: '학생 활동 기록' },
                { icon: School,    value: fmt(pubStats.total_classes),      label: '운영 중인 학급' },
                { icon: Users,     value: fmt(pubStats.total_students),     label: '참여 중인 학생' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="text-center md:text-left">
                  <Icon size={18} className="text-writer-ash mx-auto md:mx-0 mb-2" />
                  <div className="font-poppins text-2xl font-semibold">{value}</div>
                  <div className="text-xs text-writer-slate font-medium">{label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Student CTA ── */}
      <section className="bg-white pb-6">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onClick={() => navigate('/classroom-entry')}
            className="cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 bg-writer-lavender/50 border border-writer-mist rounded-[12px] px-7 py-5 hover:border-writer-iris/40 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-writer-iris rounded-[10px] flex items-center justify-center shrink-0">
                <KeyRound size={20} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="font-semibold text-writer-obsidian text-base">학생이신가요?</p>
                <p className="text-sm text-writer-slate">선생님께 받은 수업 코드로 바로 수업에 참여하세요</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-writer-obsidian group-hover:bg-black text-white font-semibold text-sm rounded-full transition-colors shrink-0">
              수업코드로 참여하기
              <ArrowRight size={16} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <Eyebrow>✨ 기록하고, 만들고, 관리하고</Eyebrow>
            <h2 className="text-3xl font-black mb-3">기록하면, AI가 <span className="text-writer-orchid">만들고 관리</span>합니다</h2>
            <p className="text-writer-slate text-base">활동 기록부터 나이스 제출까지 — 선생님의 모든 반복 업무를 대신합니다</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc, accent, image }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-white rounded-[12px] p-7 border border-writer-mist hover:border-writer-iris/30 transition-colors"
              >
                {image ? (
                  <img src={image} alt="" className="w-14 h-14 object-contain mb-5" />
                ) : (
                  <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center mb-5 ${accent ? 'bg-writer-iris text-white' : 'bg-writer-mist/60 text-writer-obsidian'}`}>
                    <Icon size={22} strokeWidth={2} />
                  </div>
                )}
                <h3 className="text-lg font-black mb-2">{title}</h3>
                <p className="text-sm text-writer-slate leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Teaching Tools ── */}
      <section className="py-20 bg-writer-lavender/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <Eyebrow>🛠 수업 도구</Eyebrow>
            <h2 className="text-3xl font-black mb-3">수업에 필요한 모든 도구, 하나로</h2>
            <p className="text-writer-slate text-base">별도 앱 없이 클래스로그 AI 하나로 수업 전반을 운영할 수 있습니다</p>
          </div>
          <div className="grid md:grid-cols-[minmax(0,300px)_1fr] gap-6 items-start mb-6">
            {/* 도구 탭 목록 — 모바일은 가로 스크롤, 데스크톱은 세로 목록 */}
            <div
              className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-6 px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              {teachingTools.map(({ icon: Icon, title, desc, badge }, i) => (
                <button
                  key={title}
                  onClick={() => setActiveTool(i)}
                  className={`shrink-0 md:shrink md:w-full text-left flex items-center gap-3 rounded-[12px] p-3.5 border transition-colors w-[210px] ${
                    activeTool === i
                      ? 'bg-white border-writer-iris shadow-sm'
                      : 'bg-white/60 border-transparent hover:border-writer-mist'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 transition-colors ${
                    activeTool === i ? 'bg-writer-iris text-white' : 'bg-writer-mist/60 text-writer-obsidian'
                  }`}>
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold truncate">{title}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        badge === '무료' ? 'bg-writer-mist text-writer-slate' :
                        badge === 'Pro' ? 'bg-writer-iris text-white' :
                        'bg-writer-lavender text-writer-iris'
                      }`}>{badge}</span>
                    </div>
                    <p className="text-xs text-writer-slate truncate">{desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* 선택된 도구의 실제 화면 미리보기 */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -inset-5 -z-10 rounded-[28px] bg-gradient-to-br from-writer-iris/25 via-writer-orchid/20 to-transparent blur-2xl"
              />
              <div className="rounded-[16px] border border-writer-mist bg-white overflow-hidden shadow-xl shadow-writer-iris/15 ring-1 ring-black/5">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-writer-mist bg-writer-lavender/20">
                  <span className="w-2.5 h-2.5 rounded-full bg-writer-mist" />
                  <span className="w-2.5 h-2.5 rounded-full bg-writer-mist" />
                  <span className="w-2.5 h-2.5 rounded-full bg-writer-mist" />
                </div>
                <motion.img
                  key={teachingTools[activeTool].image}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  src={teachingTools[activeTool].image}
                  alt={teachingTools[activeTool].title}
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </div>
          {SHOW_DEMO_CTA && (
            <div className="text-center">
              <button
                onClick={() => navigate('/demo')}
                className={`${btnGhost} px-6 py-3 text-sm`}
              >
                <Play size={14} strokeWidth={3} />
                수업 도구 직접 체험하기
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <Eyebrow>🌏 수업이 있는 모든 곳에서</Eyebrow>
            <h2 className="text-3xl font-black mb-3">어디서 가르치든, 클래스로그가 함께합니다</h2>
            <p className="text-writer-slate text-base">
              학생을 가르치고, 기록하고, 성장을 나눠야 하는 곳이라면 <br className="hidden sm:block" />
              학교든, 학원이든, 레슨이든 형태는 중요하지 않습니다
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-10">
            {useCases.map(({ emoji, title, desc, tag }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="rounded-[12px] p-6 border border-writer-mist hover:border-writer-iris/30 transition-colors"
              >
                <span className="text-3xl mb-3 block">{emoji}</span>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="font-black text-sm">{title}</h3>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-writer-mist/60 border border-writer-mist rounded-full text-writer-slate shrink-0">{tag}</span>
                </div>
                <p className="text-xs text-writer-slate leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
          {/* Floating Action Card */}
          <div className="relative overflow-hidden bg-writer-obsidian rounded-[16px] px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-black text-white text-base mb-1">지금 어떤 수업을 가르치고 계신가요?</p>
              <p className="text-sm text-white/60">어떤 과목·기관이든 클래스로그 AI는 선생님 편입니다. 무료로 먼저 체험해 보세요.</p>
            </div>
            <button
              onClick={isLoggedIn ? () => navigate('/dashboard') : handleGoogleSignup}
              disabled={googleLoading}
              className={`${btnAccent} shrink-0 px-6 py-3 text-sm`}
            >
              {isLoggedIn ? '대시보드로 이동' : 'Google로 무료 시작하기'} <ArrowRight size={16} strokeWidth={3} />
            </button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 bg-writer-lavender/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black mb-3">이렇게 사용해요</h2>
            <p className="text-writer-slate text-base">기록만 하면 AI가 나머지를 합니다</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {steps.map(({ num, title, desc }, i) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-14 h-14 border border-writer-obsidian rounded-full flex items-center justify-center font-poppins font-semibold text-lg mb-5">
                  {num}
                </div>
                <h3 className="text-lg font-black mb-2">{title}</h3>
                <p className="text-sm text-writer-slate leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Proof (Dark Resource Section) ── */}
      <section className="py-20 bg-writer-obsidian text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/15 rounded-full text-xs font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-writer-orchid animate-pulse" />
              지금 이 순간에도 선생님들이 클래스로그를 사용하고 있습니다
            </div>

            <h2 className="text-3xl md:text-4xl font-black leading-snug text-white">
              이미 많은 선생님들이<br />
              <span className="text-writer-orchid">시간을 되찾고 있습니다</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: PenLine, value: pubStats.total_observations, label: '학생 활동 기록', unit: '건', desc: '학생들이 직접 제출한 수업 활동' },
                { icon: School, value: pubStats.total_classes, label: '운영 중인 학급', unit: '개', desc: '전국 선생님들이 개설한 학급' },
                { icon: Users, value: pubStats.total_students, label: '참여 중인 학생', unit: '명', desc: '클래스로그로 수업에 참여하는 학생' },
              ].map(({ icon: Icon, value, label, unit, desc }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="bg-white/5 border border-white/10 rounded-[12px] p-8 text-left"
                >
                  <Icon size={22} className="text-writer-orchid mb-4" />
                  <div className="font-poppins text-5xl font-semibold tracking-tight mb-1">
                    {value > 0 ? value.toLocaleString('ko-KR') : '—'}
                    <span className="text-xl ml-1 font-medium text-white/40">{unit}</span>
                  </div>
                  <p className="text-sm font-bold text-white mb-1">{label}</p>
                  <p className="text-xs text-white/50 font-medium">{desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Academy Section ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-[16px] border border-writer-mist p-10 md:p-14"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-10">
              <div className="flex-1 flex items-center justify-center">
                <img src="/illustrations/academy-report-doodle.webp" alt="" className="w-full max-w-sm object-contain" />
              </div>
              <div className="flex-1">
                <Eyebrow>🏫 학원·교습소에서도 사용하세요</Eyebrow>
                <h2 className="text-2xl md:text-3xl font-black mb-4 leading-tight">
                  세특만이 아닙니다.<br />
                  <span className="text-writer-orchid">학부모 보고서</span>도 AI가 씁니다.
                </h2>
                <p className="text-writer-slate text-base leading-relaxed mb-6">
                  수강생의 수업 태도·성취 기록을 쌓아두면,<br />
                  AI가 학부모에게 보낼 성장 보고서 문구를 자동으로 작성해 드립니다.
                </p>
                <button
                  onClick={() => document.getElementById('request-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className={`${btnAccent} px-6 py-3 text-sm w-fit mb-8`}
                >
                  학원으로 신청하기 <ArrowRight size={16} strokeWidth={3} />
                </button>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { emoji: '📝', title: '수강생 관찰 기록', desc: '수업 중 메모를 학생 코드로 직접 받거나, 강사가 직접 기록' },
                    { emoji: '🤖', title: 'AI 학부모 보고서', desc: '관찰 기록 기반으로 따뜻하고 구체적인 보고서 초안 자동 생성' },
                    { emoji: '📤', title: '간편 공유', desc: '초안을 복사해 문자·앱·알림장에 바로 붙여넣기' },
                  ].map(({ emoji, title, desc }) => (
                    <div key={title} className="flex items-start gap-4 bg-white rounded-[12px] p-4 border border-writer-mist">
                      <span className="text-2xl shrink-0">{emoji}</span>
                      <div>
                        <p className="text-sm font-bold">{title}</p>
                        <p className="text-xs text-writer-slate mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing Section ── */}
      <section className="py-20 bg-writer-lavender/30">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <Eyebrow>💳 플랜 안내</Eyebrow>
            <h2 className="text-3xl font-black mb-3">역할에 맞는 플랜을 선택하세요</h2>
            <p className="text-writer-slate text-sm">무료 플랜은 Google 가입 즉시 시작, 유료 플랜은 오픈 예정입니다. 지금 얼리버드로 신청하면 첫 달 50% 할인!</p>
          </motion.div>

          {/* 공유 링크 안내 */}
          <div className="mb-8 bg-white border border-writer-mist rounded-[12px] px-6 py-4 flex items-start gap-3">
            <span className="text-xl mt-0.5">🔗</span>
            <div>
              <p className="text-sm font-bold mb-0.5">클래스 결과 공유 링크</p>
              <p className="text-xs text-writer-slate leading-relaxed">
                선생님은 별도 계정 없이도 <strong>공유 입장 링크</strong>를 통해 클래스별 학생 기록과 갤러리를 열람할 수 있습니다. 담임 선생님이 교과 교사에게 링크를 공유하면 해당 클래스의 결과를 바로 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 개인 / 단체 탭 */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-white border border-writer-mist rounded-full p-1 gap-1">
              {([
                { key: 'individual', label: '개인' },
                { key: 'group', label: '단체' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPlanTab(key)}
                  className={`px-6 py-2 text-sm font-bold rounded-full transition-colors ${
                    planTab === key
                      ? 'bg-writer-obsidian text-white'
                      : 'text-writer-slate hover:text-writer-obsidian'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={
              planTab === 'individual'
                ? 'grid grid-cols-1 md:grid-cols-3 gap-4'
                : 'grid grid-cols-1 gap-4 max-w-sm mx-auto'
            }
          >
            {pricingPlans.filter((plan) => plan.category === planTab).map((plan, i) => {
              const isDark = !!(plan as any).highlight;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`rounded-[12px] overflow-hidden relative ${
                    isDark ? 'bg-writer-obsidian text-white' : 'bg-white border border-writer-mist'
                  }`}
                >
                  {isDark && (
                    <div className="absolute top-4 right-4 bg-writer-orchid text-white text-[9px] font-bold px-2 py-0.5 rounded-full">추천</div>
                  )}
                  {(plan as any).schoolBadge && (
                    <div className="absolute top-4 right-4 bg-writer-iris text-white text-[9px] font-bold px-2 py-0.5 rounded-full">기관전용</div>
                  )}
                  {(plan as any).waitlistPlan && (
                    <div className={`absolute top-4 left-4 text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-white/15 text-white' : 'bg-amber-400 text-writer-obsidian'}`}>오픈 예정</div>
                  )}
                  <div className={`px-5 py-5 ${(plan as any).waitlistPlan ? 'pt-11' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-black">{plan.name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? 'bg-white/15 text-white' : 'bg-writer-mist text-writer-slate'}`}>{plan.badge}</span>
                    </div>
                    <p className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-writer-slate'}`}>{plan.desc}</p>
                    {plan.price === null ? (
                      <p className="text-sm font-bold text-writer-slate">무료</p>
                    ) : plan.price === '문의' ? (
                      <p className="text-sm font-bold text-writer-iris">요금 문의</p>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-0.5 font-poppins">
                          <span className="text-xl font-semibold">{plan.price}원</span>
                          <span className={`text-xs ${isDark ? 'text-white/40' : 'text-writer-slate'}`}>/월</span>
                        </div>
                        {(plan as any).periodNote && (
                          <p className={`text-[10px] font-medium mt-0.5 ${isDark ? 'text-white/40' : 'text-writer-slate'}`}>{(plan as any).periodNote}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`px-5 py-4 space-y-2.5 ${isDark ? '' : 'border-t border-writer-mist'}`}>
                    {plan.features.map((f) => (
                      <div key={f.text} className="flex items-center gap-2.5">
                        <span className={`text-xs font-bold shrink-0 ${f.ok ? (isDark ? 'text-writer-orchid' : 'text-writer-iris') : (isDark ? 'text-white/20' : 'text-writer-fog')}`}>
                          {f.ok ? '✓' : '✕'}
                        </span>
                        <span className={`text-xs ${f.ok ? (isDark ? 'text-white/90 font-medium' : 'text-writer-obsidian/80 font-medium') : (isDark ? 'text-white/20' : 'text-writer-fog')}`}>
                          {f.text}
                        </span>
                      </div>
                    ))}
                    {(plan as any).schoolBadge && (
                      <a
                        href="mailto:aklabs84@naver.com?subject=클래스로그 School 플랜 도입 문의"
                        className={`${btnGhost} mt-3 w-full py-2 text-xs`}
                      >
                        도입 문의하기
                      </a>
                    )}
                    {(plan as any).waitlistPlan && (
                      <Link
                        to={`/waitlist?plan=${(plan as any).waitlistPlan}`}
                        className={`mt-3 w-full py-2 text-xs rounded-full font-bold text-center block transition-colors ${
                          isDark
                            ? 'bg-writer-orchid hover:bg-writer-orchid/90 text-white'
                            : `${btnGhost}`
                        }`}
                      >
                        얼리버드 신청 (첫 달 50%↓)
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center text-xs text-writer-slate mt-2"
          >
            유료 플랜 결제는 준비 중이며, 얼리버드 신청자에게는 첫 달 50% 할인이 제공됩니다 · 플랜 문의: aklabs84@naver.com
          </motion.p>
        </div>
      </section>

      {/* ── Video Guide Section ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Eyebrow><PlayCircle size={12} /> 영상 가이드</Eyebrow>
            <h2 className="text-3xl font-black mb-3">눈으로 먼저 확인하세요</h2>
            <p className="text-writer-slate text-sm">기능별 짧은 영상으로 클래스로그 AI를 미리 경험해보세요</p>
          </motion.div>

          {videoGuides.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                {videoGuides.map((item, i) => {
                  const info = parseVideoUrl(item.url);
                  const isYoutube = info?.platform === 'youtube';
                  return (
                    <motion.a
                      key={item.id}
                      href="/video-guide"
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08 }}
                      className="group rounded-[12px] overflow-hidden bg-white border border-writer-mist hover:border-writer-iris/30 transition-colors cursor-pointer"
                      onClick={e => { e.preventDefault(); navigate('/video-guide'); }}
                    >
                      <div className="relative aspect-video bg-writer-mist/40 overflow-hidden">
                        {isYoutube && info?.thumbnailUrl ? (
                          <>
                            <img
                              src={info.thumbnailUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-14 h-14 rounded-full bg-writer-obsidian/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <PlayCircle size={28} className="text-white fill-white" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-writer-lavender/40">
                            <div className="w-14 h-14 rounded-full bg-writer-iris/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <PlayCircle size={28} className="text-writer-iris" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
                          {item.category}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-sm leading-snug line-clamp-2">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-writer-slate mt-1.5 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                      </div>
                    </motion.a>
                  );
                })}
              </div>
              <div className="text-center">
                <button
                  onClick={() => navigate('/video-guide')}
                  className={`${btnGhost} px-6 py-3 text-sm`}
                >
                  <Video size={16} />
                  전체 영상 가이드 보기
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </>
          ) : (
            /* 영상 없을 때: 준비 중 카드 + 바로가기 */
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto"
            >
              <div className="rounded-[12px] border border-writer-mist p-8 flex flex-col sm:flex-row items-center gap-8 mb-8">
                <div className="w-full max-w-[180px] aspect-[4/3] shrink-0 [&>svg]:w-full [&>svg]:h-full">
                  <ChillingDoodle ink={DOODLE_INK} accent={DOODLE_ACCENT} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                  {[
                    { title: '전체 사용 흐름', desc: '학급 생성부터 세특 완성까지 전 과정을 한 번에' },
                    { title: 'AI 세특 생성', desc: '클릭 한 번으로 세특 초안이 만들어지는 과정' },
                    { title: '나이스 내보내기', desc: '세특을 나이스 엑셀 형식으로 바로 내보내기' },
                  ].map((card, i) => (
                    <motion.div
                      key={card.title}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <span className="text-[10px] font-bold text-writer-iris px-2 py-0.5 bg-writer-lavender rounded-full">영상 준비 중</span>
                      <p className="font-bold text-sm mt-2">{card.title}</p>
                      <p className="text-xs text-writer-slate mt-1 leading-relaxed">{card.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <button
                  onClick={() => navigate('/video-guide')}
                  className={`${btnGhost} px-6 py-3 text-sm`}
                >
                  <PlayCircle size={16} />
                  영상 가이드 페이지 바로가기
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ── 사용법 교육 신청 + 카카오톡 커뮤니티 ── */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-2 gap-5">
          <div className="rounded-[16px] border border-writer-mist bg-writer-lavender/20 p-8 flex flex-col">
            <GraduationCap size={28} className="text-writer-iris mb-3" />
            <h3 className="text-lg font-black mb-2">사용법 교육이 필요하신가요?</h3>
            <p className="text-sm text-writer-slate leading-relaxed mb-5 flex-1">
              처음이라 막막하셨다면 신청해 주세요. 화상통화, 방문, 자료 안내 중 원하시는 방식으로 사용법을 직접 알려드립니다.
            </p>
            <Link to="/training-request?source=landing" className={`${btnAccent} px-6 py-3 text-sm`}>
              <GraduationCap size={16} />
              사용법 교육 신청하기
            </Link>
          </div>
          <div className="rounded-[16px] border border-writer-mist bg-[#fee500]/10 p-8 flex flex-col">
            <MessageCircle size={28} className="text-[#3c1e1e] mb-3" />
            <h3 className="text-lg font-black mb-2">카카오톡 커뮤니티</h3>
            <p className="text-sm text-writer-slate leading-relaxed mb-5 flex-1">
              다른 선생님들과 활용 팁을 나누고, 궁금한 점을 빠르게 물어볼 수 있는 오픈채팅방입니다.
            </p>
            <a
              href={KAKAO_OPEN_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fee500] text-[#3c1e1e] font-semibold hover:brightness-95 transition-colors px-6 py-3 text-sm whitespace-nowrap"
            >
              <MessageCircle size={16} />
              카카오톡 오픈채팅 참여하기
            </a>
          </div>
        </div>
      </section>

      {/* ── Access Request Form ── */}
      <section id="request-section" className="py-24 bg-writer-lavender/30">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-12">
            <Eyebrow><CheckCircle2 size={12} /> Pro · 학교/학원 도입 문의</Eyebrow>
            <h2 className="text-3xl font-black mb-3">Pro · 학교 도입 문의하기</h2>
            <p className="text-writer-slate text-sm leading-relaxed">
              개인은 위 "Google로 무료 시작하기"로 바로 가입해 사용하실 수 있습니다.<br />
              여러 선생님이 함께 쓰는 Pro·학교/학원 단위 도입은 아래로 문의해 주세요.
            </p>
          </div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[16px] border border-writer-mist overflow-hidden"
            >
              {/* 상단 헤더 */}
              <div className="bg-writer-obsidian px-8 py-8 text-center">
                <div className="w-16 h-16 bg-white/10 rounded-[12px] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={36} className="text-writer-orchid" />
                </div>
                <h3 className="text-2xl font-black text-white mb-1">문의가 접수되었습니다!</h3>
                <p className="text-white/60 text-sm font-medium">클래스로그 AI에 관심 가져주셔서 감사합니다</p>
              </div>

              {/* 안내 내용 */}
              <div className="px-8 py-8 space-y-4">
                <div className="flex items-start gap-4 p-4 bg-white rounded-[12px] border border-writer-mist">
                  <span className="text-2xl shrink-0">📬</span>
                  <div>
                    <p className="text-sm font-bold mb-1">담당자가 안내 메일을 보내드립니다</p>
                    <p className="text-xs text-writer-slate leading-relaxed">
                      검토 후 <strong>남겨주신 이메일</strong>로 Pro·학교/학원 도입 안내를 보내드립니다.<br />
                      받은 편지함(스팸 폴더 포함)을 확인해 주세요.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-white rounded-[12px] border border-writer-mist">
                  <span className="text-2xl shrink-0">⏱️</span>
                  <div>
                    <p className="text-sm font-bold mb-1">평일 기준 24시간 내 처리됩니다</p>
                    <p className="text-xs text-writer-slate leading-relaxed">
                      주말·공휴일에는 처리가 다소 늦어질 수 있습니다.<br />
                      바로 사용해보고 싶으시면 "Google로 무료 시작하기"로 먼저 시작하셔도 됩니다.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-white rounded-[12px] border border-writer-mist">
                  <span className="text-2xl shrink-0">💬</span>
                  <div>
                    <p className="text-sm font-bold mb-1">문의가 있으신가요?</p>
                    <p className="text-xs text-writer-slate leading-relaxed">
                      오래 기다리셨다면 아래 이메일로 문의해 주세요.
                    </p>
                    <a
                      href="mailto:aklabs84@naver.com?subject=클래스로그 AI 도입 문의"
                      className="inline-block mt-2 text-xs font-bold text-writer-iris hover:text-writer-iris-dim underline underline-offset-2 transition-colors"
                    >
                      aklabs84@naver.com →
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-[16px] p-8 border border-writer-mist space-y-5"
            >
              {submitError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-[12px] text-red-600 text-sm font-medium">
                  {submitError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-writer-slate ml-1">이름 *</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-5 py-3 bg-white border border-writer-ash rounded-full text-sm font-medium focus:outline-none focus:border-writer-iris focus:ring-2 focus:ring-writer-lavender transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-writer-slate ml-1">이메일 *</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher@school.edu"
                    className="w-full px-5 py-3 bg-white border border-writer-ash rounded-full text-sm font-medium focus:outline-none focus:border-writer-iris focus:ring-2 focus:ring-writer-lavender transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-writer-slate ml-1">학교 / 학원 이름 *</label>
                <input
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="아크고등학교 / 아크수학학원"
                  className="w-full px-5 py-3 bg-white border border-writer-ash rounded-full text-sm font-medium focus:outline-none focus:border-writer-iris focus:ring-2 focus:ring-writer-lavender transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-writer-slate ml-1">직책 *</label>
                <select
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-5 py-3 bg-white border border-writer-ash rounded-full text-sm font-medium focus:outline-none focus:border-writer-iris focus:ring-2 focus:ring-writer-lavender transition-all appearance-none"
                >
                  <option value="">선택해 주세요</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-writer-slate ml-1">하고 싶은 말 (선택)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="사용하고 싶은 이유나 기대하는 기능을 자유롭게 적어주세요."
                  rows={3}
                  className="w-full px-5 py-3 bg-white border border-writer-ash rounded-[12px] text-sm font-medium focus:outline-none focus:border-writer-iris focus:ring-2 focus:ring-writer-lavender transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`${btnAccent} w-full py-4 text-base`}
              >
                {submitting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Send size={18} strokeWidth={2.5} />
                    문의 남기기
                  </>
                )}
              </button>

              {!isLoggedIn && (
                <p className="text-center text-xs text-writer-slate">
                  이미 계정이 있으신가요?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-writer-iris font-bold hover:underline"
                  >
                    로그인하기
                  </button>
                </p>
              )}
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 bg-writer-obsidian text-white/60">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-[10px] flex items-center justify-center">
              <GraduationCap size={16} className="text-white" />
            </div>
            <span className="font-black text-white">클래스로그 AI</span>
          </div>
          <div className="flex items-center gap-6 text-xs font-poppins">
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors underline underline-offset-2"
            >
              사용 가이드
            </a>
            <a
              href="/privacy"
              className="hover:text-white transition-colors underline underline-offset-2"
            >
              개인정보 처리방침
            </a>
            <a
              href="/terms"
              className="hover:text-white transition-colors underline underline-offset-2"
            >
              이용약관
            </a>
            <span>© 2026 AK LABS. 선생님을 응원합니다.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
