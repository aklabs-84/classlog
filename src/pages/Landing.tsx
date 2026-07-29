import { useState, useEffect, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  LayoutGrid,
  Archive,
  Images,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseVideoUrl } from '../lib/gallery';

const ROLES = ['담임 선생님', '교과 선생님', '학원 강사', '개인 강사', '교육 행정직', '기타'];

const features = [
  {
    icon: BookOpen,
    color: 'bg-amber-100 text-amber-600',
    title: '학생 활동 기록 관리',
    desc: '참여 코드 하나로 학생이 직접 제출. 승인·반려·피드백·파일 첨부까지 한 화면에서.',
  },
  {
    icon: Sparkles,
    color: 'bg-violet-100 text-violet-600',
    title: 'AI 세특 자동 생성',
    desc: '쌓인 관찰기록을 Gemini AI가 분석해 학생별 세특 초안을 한 번에 완성합니다.',
  },
  {
    icon: FileDown,
    color: 'bg-emerald-100 text-emerald-600',
    title: '나이스 바로 제출',
    desc: '500자 편집 후 나이스 엑셀로 내보내기. 행동특성·종합의견도 AI가 초안을 씁니다.',
  },
  {
    icon: LayoutGrid,
    color: 'bg-blue-100 text-blue-600',
    title: '7가지 수업 도구',
    desc: '퀴즈·설문·화이트보드·타이머·조 뽑기·수업 자료·음성 전사 — 수업에 필요한 모든 것.',
  },
  {
    icon: Users,
    color: 'bg-rose-100 text-rose-600',
    title: '학급·학생 통합 관리',
    desc: '교과반·담임반 분리, 단원 관리, 출석, 갤러리, 폴더 정리 모두 한 곳에서.',
  },
  {
    icon: Mic,
    color: 'bg-teal-100 text-teal-600',
    title: '수업 전사 + AI 분석',
    desc: '수업 음성을 텍스트로 전사하고, AI가 학생별 관찰 기록을 자동으로 정리합니다.',
  },
];

const steps = [
  { num: '01', title: '학급 생성', desc: '교과반·담임반 구분해서 학급을 만들면 학생들이 코드로 바로 참여합니다.' },
  { num: '02', title: '틈틈이 기록', desc: '학생이 직접 제출하거나, 선생님이 수업 중 메모를 남깁니다. 기록이 쌓일수록 세특이 정확해집니다.' },
  { num: '03', title: 'AI 세특 생성', desc: 'AI가 기록을 분석해 학생별 세특 초안을 자동 완성. 수정 후 저장합니다.' },
  { num: '04', title: '나이스 제출', desc: '500자 맞춤 편집 후 나이스 엑셀로 바로 내보냅니다.' },
];

const Landing = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
    <div className="min-h-screen bg-[#FFFBF5] text-[#2d2d2d] font-pretendard">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#FFFBF5]/90 backdrop-blur border-b border-amber-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-sm">
              <GraduationCap size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-black tracking-tight text-amber-800">생기로그 AI</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/catalog.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex px-4 py-2 text-amber-700 hover:text-amber-900 text-sm font-bold rounded-full transition-colors items-center gap-1.5 hover:bg-amber-50"
            >
              제품 소개
            </a>
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex px-4 py-2 text-amber-700 hover:text-amber-900 text-sm font-bold rounded-full transition-colors items-center gap-1.5 hover:bg-amber-50"
            >
              사용 가이드
            </a>
            <button
              onClick={() => navigate('/video-guide')}
              className="hidden sm:flex px-4 py-2 text-amber-700 hover:text-amber-900 text-sm font-bold rounded-full transition-colors items-center gap-1.5 hover:bg-amber-50"
            >
              영상 가이드
            </button>
            <button
              onClick={() => navigate('/classroom-entry')}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-full transition-colors shadow-sm flex items-center gap-1.5"
            >
              <KeyRound size={14} strokeWidth={2.5} />
              수업 참여
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-full transition-colors shadow-sm"
            >
              선생님 로그인
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-8%] right-[-5%] w-[500px] h-[500px] bg-amber-200/40 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-[-5%] w-[400px] h-[400px] bg-orange-100/60 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full mb-6">
              <Heart size={12} fill="currentColor" /> 선생님 · 학원 강사를 위한 AI 도구
            </span>
            <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight mb-6 text-amber-900">
              선생님의 소중한 시간을<br />
              <span className="text-amber-500">돌려드립니다</span>
            </h1>
            <p className="text-lg text-amber-800/70 max-w-xl mx-auto mb-10 leading-relaxed">
              활동 기록 수집부터 AI 세특 초안 생성, 나이스 제출까지.<br />
              생기로그 AI가 반복 업무를 대신합니다.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/demo')}
                className="px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl text-base transition-all shadow-lg hover:shadow-amber-200 hover:scale-105 flex items-center justify-center gap-2"
              >
                <Play size={18} strokeWidth={3} />
                지금 바로 체험하기
              </button>
              <button
                onClick={handleGoogleSignup}
                disabled={googleLoading}
                className="px-8 py-4 bg-white hover:bg-amber-50 disabled:opacity-60 text-amber-700 font-bold rounded-2xl text-base transition-all border border-amber-200 shadow-sm flex items-center justify-center gap-2"
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
            </div>
            <a
              href="/catalog.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-amber-600/80 hover:text-amber-700 font-semibold transition-colors underline underline-offset-4 decoration-amber-300"
            >
              📋 제품 카탈로그 · 도입 안내서 보기
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto"
          >
            {[
              { icon: PenLine,   value: fmt(pubStats.total_observations), label: '학생 활동 기록' },
              { icon: School,    value: fmt(pubStats.total_classes),      label: '운영 중인 학급' },
              { icon: Users,     value: fmt(pubStats.total_students),     label: '참여 중인 학생' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="text-center">
                <Icon size={20} className="text-amber-400 mx-auto mb-1" />
                <div className="text-2xl font-black text-amber-800">{value}</div>
                <div className="text-xs text-amber-600/70 font-medium">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Student CTA ── */}
      <section className="bg-white py-6">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onClick={() => navigate('/classroom-entry')}
            className="cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-7 py-5 hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <KeyRound size={20} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="font-black text-emerald-800 text-base">학생이신가요?</p>
                <p className="text-sm text-emerald-600/80">선생님께 받은 수업 코드로 바로 수업에 참여하세요</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 group-hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-colors shrink-0">
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
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full mb-4">
              ✨ 생기로그 AI가 하는 일
            </span>
            <h2 className="text-3xl font-black text-amber-900 mb-3">기록하면, AI가 세특을 씁니다</h2>
            <p className="text-amber-700/60 text-base">활동 기록부터 나이스 제출까지 — 선생님의 모든 반복 업무를 대신합니다</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, color, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-[#FFFBF5] rounded-3xl p-7 border border-amber-100 hover:border-amber-200 hover:shadow-lg transition-all"
              >
                <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center mb-5`}>
                  <Icon size={24} strokeWidth={2} />
                </div>
                <h3 className="text-lg font-black text-amber-900 mb-2">{title}</h3>
                <p className="text-sm text-amber-700/70 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Teaching Tools ── */}
      <section className="py-20 bg-[#FFFBF5]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full mb-4">
              🛠 수업 도구
            </span>
            <h2 className="text-3xl font-black text-amber-900 mb-3">수업에 필요한 모든 도구, 하나로</h2>
            <p className="text-amber-700/60 text-base">별도 앱 없이 생기로그 AI 하나로 수업 전반을 운영할 수 있습니다</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { icon: Shuffle,       color: 'bg-orange-100 text-orange-600', border: 'border-orange-100', title: '랜덤 조 뽑기',    desc: '애니메이션과 함께 랜덤 조 편성',       badge: '무료' },
              { icon: Timer,         color: 'bg-amber-100 text-amber-600',   border: 'border-amber-100',  title: '수업 타이머',    desc: '전체화면 발표 모드 · 플로팅 버튼',    badge: '무료' },
              { icon: ClipboardCheck,color: 'bg-red-100 text-red-600',       border: 'border-red-100',    title: '실시간 퀴즈',   desc: 'AI 문항 자동 생성 · PIN 참여',         badge: 'Pro' },
              { icon: BookOpen,      color: 'bg-indigo-100 text-indigo-600', border: 'border-indigo-100', title: '수업 자료 에디터', desc: '마크다운 작성 · 슬라이드 발표',    badge: 'Basic↑＊' },
              { icon: Mic,           color: 'bg-teal-100 text-teal-600',     border: 'border-teal-100',   title: '수업 전사',      desc: 'Web Speech / Groq Whisper · AI 분석', badge: 'Basic↑＊' },
              { icon: LayoutPanelTop,color: 'bg-violet-100 text-violet-600', border: 'border-violet-100', title: '협업 화이트보드', desc: '실시간 조별 협업 · 6종 오브젝트',   badge: 'Pro' },
              { icon: BarChart2,     color: 'bg-blue-100 text-blue-600',     border: 'border-blue-100',   title: '실시간 설문',    desc: '6가지 문항 유형 · AI 응답 분석',      badge: 'Basic↑＊' },
              { icon: Images,        color: 'bg-pink-100 text-pink-600',     border: 'border-pink-100',   title: '수업 갤러리',    desc: '사진·영상 주차별 보관 · 학급 공유',   badge: '무료' },
            ].map(({ icon: Icon, color, border, title, desc, badge }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className={`bg-white rounded-2xl p-5 border ${border} hover:shadow-md transition-all`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                    <Icon size={20} strokeWidth={2} />
                  </div>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                    badge === '무료' ? 'bg-gray-100 text-gray-500' :
                    badge === 'Pro' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{badge}</span>
                </div>
                <p className="text-sm font-black text-gray-800 mb-1">{title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-[11px] text-amber-700/50 mb-6">
            ＊ 본인 Gemini API 키(Google AI Studio에서 무료 발급) 등록 시 Free 플랜에서도 이용 가능
          </p>
          <div className="text-center">
            <button
              onClick={() => navigate('/demo')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-black rounded-2xl text-sm transition-all"
            >
              <Play size={14} strokeWidth={3} />
              수업 도구 직접 체험하기
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full mb-4">
              🌏 수업이 있는 모든 곳에서
            </span>
            <h2 className="text-3xl font-black text-amber-900 mb-3">생기부가 없어도 됩니다</h2>
            <p className="text-amber-700/60 text-base">
              학생을 가르치고, 기록하고, 성장을 나눠야 하는 곳이라면<br className="hidden sm:block" />
              어디서든 생기로그 AI가 함께합니다
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-10">
            {[
              { emoji: '🏫', title: '고등학교', desc: '세특·행동특성·종합의견 AI 초안 생성, 나이스 엑셀 일괄 제출', tag: '세특 자동화', color: 'bg-amber-50 border-amber-100' },
              { emoji: '🏫', title: '중학교', desc: '학교생활기록부 기재용 활동 기록 수집·관리', tag: '생기부 기록', color: 'bg-blue-50 border-blue-100' },
              { emoji: '🏢', title: '학원·교습소', desc: '수강생 관찰 기록 → AI 학부모 성장 보고서 자동 생성', tag: '학부모 보고서', color: 'bg-violet-50 border-violet-100' },
              { emoji: '🎸', title: '음악·예체능 레슨', desc: '레슨별 성취도·관찰 기록, 수강생 포트폴리오 구축', tag: '레슨 기록', color: 'bg-rose-50 border-rose-100' },
              { emoji: '💻', title: '코딩·방과후 교실', desc: '프로젝트별 활동 기록, 결과물 제출, AI 성취 분석', tag: '프로젝트 관리', color: 'bg-teal-50 border-teal-100' },
              { emoji: '🌱', title: '대안학교·홈스쿨', desc: '정형화되지 않은 수업도 체계적으로 기록하고 관리', tag: '자유로운 기록', color: 'bg-green-50 border-green-100' },
            ].map(({ emoji, title, desc, tag, color }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className={`rounded-2xl p-6 border ${color}`}
              >
                <span className="text-3xl mb-3 block">{emoji}</span>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="font-black text-gray-900 text-sm">{title}</h3>
                  <span className="text-[9px] font-black px-1.5 py-0.5 bg-white/80 border border-gray-200 rounded-full text-gray-400 shrink-0">{tag}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-black text-amber-900 text-base mb-1">지금 어떤 수업을 가르치고 계신가요?</p>
              <p className="text-sm text-amber-700/70">어떤 과목·기관이든 생기로그 AI는 선생님 편입니다. 무료로 먼저 체험해 보세요.</p>
            </div>
            <button
              onClick={handleGoogleSignup}
              disabled={googleLoading}
              className="shrink-0 px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black rounded-2xl text-sm transition-all shadow-md flex items-center gap-2"
            >
              Google로 무료 시작하기 <ArrowRight size={16} strokeWidth={3} />
            </button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 bg-amber-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-amber-900 mb-3">이렇게 사용해요</h2>
            <p className="text-amber-700/60 text-base">기록만 하면 AI가 나머지를 합니다</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative">
            {steps.map(({ num, title, desc }, i) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-14 h-14 bg-amber-500 text-white rounded-full flex items-center justify-center font-black text-lg mb-5 shadow-md shadow-amber-200">
                  {num}
                </div>
                <h3 className="text-lg font-black text-amber-900 mb-2">{title}</h3>
                <p className="text-sm text-amber-700/70 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-10"
          >
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-black text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              지금 이 순간에도 선생님들이 생기로그를 사용하고 있습니다
            </div>

            <h2 className="text-3xl md:text-4xl font-extrabold text-amber-900 font-manrope leading-snug">
              이미 많은 선생님들이<br />
              <span className="text-amber-500">시간을 되찾고 있습니다</span>
            </h2>

            {/* Big numbers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: PenLine,
                  value: pubStats.total_observations,
                  label: '학생 활동 기록',
                  unit: '건',
                  desc: '학생들이 직접 제출한 수업 활동',
                  color: 'from-amber-50 to-orange-50 border-amber-200',
                  iconColor: 'text-amber-500',
                },
                {
                  icon: School,
                  value: pubStats.total_classes,
                  label: '운영 중인 학급',
                  unit: '개',
                  desc: '전국 선생님들이 개설한 학급',
                  color: 'from-violet-50 to-purple-50 border-violet-200',
                  iconColor: 'text-violet-500',
                },
                {
                  icon: Users,
                  value: pubStats.total_students,
                  label: '참여 중인 학생',
                  unit: '명',
                  desc: '생기로그로 수업에 참여하는 학생',
                  color: 'from-emerald-50 to-teal-50 border-emerald-200',
                  iconColor: 'text-emerald-500',
                },
              ].map(({ icon: Icon, value, label, unit, desc, color, iconColor }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className={`bg-gradient-to-br ${color} border rounded-3xl p-8 text-left`}
                >
                  <Icon size={24} className={`${iconColor} mb-4`} />
                  <div className="text-5xl font-black text-gray-900 font-manrope tracking-tighter mb-1">
                    {value > 0 ? value.toLocaleString('ko-KR') : '—'}
                    <span className="text-xl ml-1 font-bold text-gray-400">{unit}</span>
                  </div>
                  <p className="text-sm font-black text-gray-700 mb-1">{label}</p>
                  <p className="text-xs text-gray-400 font-medium">{desc}</p>
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
            className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-3xl border border-violet-100 p-10 md:p-14"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-1">
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-full mb-4">
                  🏫 학원·교습소에서도 사용하세요
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-violet-900 mb-4 leading-tight">
                  세특만이 아닙니다.<br />
                  <span className="text-violet-500">학부모 보고서</span>도 AI가 씁니다.
                </h2>
                <p className="text-violet-800/70 text-sm leading-relaxed mb-6">
                  수강생의 수업 태도·성취 기록을 쌓아두면,<br />
                  AI가 학부모에게 보낼 성장 보고서 문구를 자동으로 작성해 드립니다.
                </p>
                <button
                  onClick={() => document.getElementById('request-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-6 py-3 bg-violet-500 hover:bg-violet-600 text-white font-black rounded-2xl text-sm transition-all shadow-md hover:shadow-violet-200 hover:scale-105 flex items-center gap-2 w-fit"
                >
                  학원으로 신청하기 <ArrowRight size={16} strokeWidth={3} />
                </button>
              </div>
              <div className="flex-1 grid grid-cols-1 gap-3">
                {[
                  { emoji: '📝', title: '수강생 관찰 기록', desc: '수업 중 메모를 학생 코드로 직접 받거나, 강사가 직접 기록' },
                  { emoji: '🤖', title: 'AI 학부모 보고서', desc: '관찰 기록 기반으로 따뜻하고 구체적인 보고서 초안 자동 생성' },
                  { emoji: '📤', title: '간편 공유', desc: '초안을 복사해 문자·앱·알림장에 바로 붙여넣기' },
                ].map(({ emoji, title, desc }) => (
                  <div key={title} className="flex items-start gap-4 bg-white rounded-2xl p-4 border border-violet-100 shadow-sm">
                    <span className="text-2xl shrink-0">{emoji}</span>
                    <div>
                      <p className="text-sm font-black text-violet-900">{title}</p>
                      <p className="text-xs text-violet-700/60 mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing Section ── */}
      <section className="py-20 bg-amber-50">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full mb-4">
              💳 플랜 안내
            </span>
            <h2 className="text-3xl font-black text-amber-900 mb-3">역할에 맞는 플랜을 선택하세요</h2>
            <p className="text-amber-700/70 text-sm">무료 플랜은 Google 가입 즉시 시작, 유료 플랜은 이메일 문의 후 활성화됩니다.</p>
          </motion.div>

          {/* 공유 링크 안내 */}
          <div className="mb-8 bg-violet-50 border border-violet-200 rounded-2xl px-6 py-4 flex items-start gap-3">
            <span className="text-xl mt-0.5">🔗</span>
            <div>
              <p className="text-sm font-bold text-violet-800 mb-0.5">클래스 결과 공유 링크</p>
              <p className="text-xs text-violet-600 leading-relaxed">
                선생님은 별도 계정 없이도 <strong>공유 입장 링크</strong>를 통해 클래스별 학생 기록과 갤러리를 열람할 수 있습니다. 담임 선생님이 교과 교사에게 링크를 공유하면 해당 클래스의 결과를 바로 확인할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                name: '무료',
                badge: 'FREE',
                badgeColor: 'bg-gray-200 text-gray-600',
                headerColor: 'bg-gray-50',
                borderColor: 'border-gray-200',
                emoji: '🌱',
                desc: '처음 시작하는 선생님',
                price: null,
                features: [
                  { text: '클래스 최대 1개', ok: true },
                  { text: '학생 최대 20명/클래스', ok: true },
                  { text: '학생 관찰 기록 · 교사 메모', ok: true },
                  { text: 'AI 세특 월 20회 체험', ok: true },
                  { text: '수업 자료 에디터 (무제한)', ok: true, byok: true },
                  { text: '퀴즈 (최대 5문항)', ok: true },
                  { text: '설문 (무제한)', ok: true, byok: true },
                  { text: '화이트보드', ok: false },
                  { text: '수업 전사 (무제한)', ok: true, byok: true },
                  { text: '일괄 AI 생성', ok: false },
                  { text: 'NAISS 내보내기', ok: false },
                  { text: '학교 프로젝트', ok: false },
                ],
              },
              {
                name: 'Basic',
                badge: 'BASIC',
                badgeColor: 'bg-blue-500 text-white',
                headerColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
                borderColor: 'border-blue-300',
                emoji: '🚀',
                desc: '꾸준히 활용하는 선생님',
                price: '9,900',
                periodNote: '3개월 5%↓ · 6개월 10%↓ · 12개월 2개월 무료',
                features: [
                  { text: '클래스 최대 5개', ok: true },
                  { text: '학생 최대 35명/클래스', ok: true },
                  { text: '학생 관찰 기록 · 교사 메모', ok: true },
                  { text: 'AI 세특 월 100회', ok: true },
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
                badgeColor: 'bg-amber-500 text-white',
                headerColor: 'bg-gradient-to-br from-amber-50 to-orange-50',
                borderColor: 'border-amber-300',
                emoji: '⚡',
                desc: '적극적으로 활용하는 선생님',
                price: '19,900',
                periodNote: '3개월 5%↓ · 6개월 10%↓ · 12개월 2개월 무료',
                highlight: true,
                features: [
                  { text: '클래스 최대 10개', ok: true },
                  { text: '학생 최대 35명/클래스', ok: true },
                  { text: '학생 관찰 기록 · 교사 메모', ok: true },
                  { text: 'AI 세특 월 500회', ok: true },
                  { text: '수업 자료 에디터', ok: true },
                  { text: '퀴즈 · 설문 · 화이트보드 무제한', ok: true },
                  { text: '수업 전사 & AI 분석', ok: true },
                  { text: '일괄 AI 생성', ok: true },
                  { text: 'NAISS 내보내기', ok: true },
                  { text: '학교 프로젝트 생성 · 관리', ok: true },
                ],
              },
              {
                name: 'School',
                badge: 'SCHOOL',
                badgeColor: 'bg-violet-500 text-white',
                headerColor: 'bg-gradient-to-br from-violet-50 to-purple-50',
                borderColor: 'border-violet-300',
                emoji: '🏫',
                desc: '학교 단위 기관 도입',
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
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-2xl border-2 ${plan.borderColor} overflow-hidden shadow-sm ${(plan as any).highlight ? 'shadow-amber-100 scale-[1.02]' : ''}`}
              >
                <div className={`${plan.headerColor} px-5 py-5 relative`}>
                  {(plan as any).highlight && (
                    <div className="absolute top-3 right-3 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">추천</div>
                  )}
                  {(plan as any).schoolBadge && (
                    <div className="absolute top-3 right-3 bg-violet-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">기관전용</div>
                  )}
                  <div className="text-2xl mb-2">{plan.emoji}</div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-black text-gray-900">{plan.name}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${plan.badgeColor}`}>{plan.badge}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{plan.desc}</p>
                  {plan.price === null ? (
                    <p className="text-sm font-black text-gray-400">무료</p>
                  ) : plan.price === '문의' ? (
                    <p className="text-sm font-black text-violet-600">요금 문의</p>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xl font-black text-gray-900">{plan.price}원</span>
                        <span className="text-xs text-gray-400">/월</span>
                      </div>
                      {(plan as any).periodNote && (
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">{(plan as any).periodNote}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="bg-white px-5 py-4 space-y-2.5">
                  {plan.features.map((f) => (
                    <div key={f.text} className="flex items-center gap-2.5">
                      <span className={`text-xs font-black shrink-0 ${f.ok ? 'text-emerald-500' : 'text-gray-300'}`}>
                        {f.ok ? '✓' : '✕'}
                      </span>
                      <span className={`text-xs ${f.ok ? 'text-gray-700 font-medium' : 'text-gray-300'}`}>
                        {f.text}{(f as any).byok && '＊'}
                      </span>
                    </div>
                  ))}
                  {(plan as any).schoolBadge && (
                    <a
                      href="mailto:aklabs84@naver.com?subject=생기로그 School 플랜 도입 문의"
                      className="mt-3 block w-full py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-black rounded-xl text-center transition-colors"
                    >
                      도입 문의하기
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center text-[11px] text-amber-600/50 mt-8"
          >
            ＊ 내 키: 본인 Gemini API 키(Google AI Studio에서 무료 발급)를 설정 페이지에 등록하면 Free 플랜에서도 이용할 수 있습니다.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center text-xs text-amber-600/60 mt-2"
          >
            플랜 변경 및 문의: aklabs84@naver.com · 3/6/12개월 선결제 시 할인, 결제 후 7일 이내 전액 환불 (이후 잔여 기간 일할 계산 환불)
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
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-full mb-4">
              <PlayCircle size={12} /> 영상 가이드
            </span>
            <h2 className="text-3xl font-black text-amber-900 mb-3">눈으로 먼저 확인하세요</h2>
            <p className="text-amber-700/70 text-sm">기능별 짧은 영상으로 생기로그 AI를 미리 경험해보세요</p>
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
                      className="group rounded-2xl overflow-hidden bg-white border border-amber-100 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer"
                      onClick={e => { e.preventDefault(); navigate('/video-guide'); }}
                    >
                      <div className="relative aspect-video bg-amber-50 overflow-hidden">
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
                              <div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                                <PlayCircle size={28} className="text-white fill-white" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-purple-100">
                            <div className="w-14 h-14 rounded-full bg-violet-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <PlayCircle size={28} className="text-violet-600" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
                          {item.category}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-sm text-amber-900 leading-snug line-clamp-2">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-amber-700/60 mt-1.5 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                      </div>
                    </motion.a>
                  );
                })}
              </div>
              <div className="text-center">
                <button
                  onClick={() => navigate('/video-guide')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-black rounded-2xl text-sm transition-all"
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {[
                  { emoji: '🎬', title: '전체 사용 흐름', desc: '학급 생성부터 세특 완성까지 전 과정을 한 번에' },
                  { emoji: '⚡', title: 'AI 세특 생성', desc: '클릭 한 번으로 세특 초안이 만들어지는 과정' },
                  { emoji: '📤', title: '나이스 내보내기', desc: '세특을 나이스 엑셀 형식으로 바로 내보내기' },
                ].map((card, i) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="rounded-2xl border border-amber-100 bg-amber-50/50 overflow-hidden"
                  >
                    <div className="aspect-video flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-amber-100/60 to-orange-100/60 relative">
                      <span className="text-4xl">{card.emoji}</span>
                      <span className="text-[10px] font-bold text-amber-600/70 px-2 py-0.5 bg-amber-100 rounded-full">
                        영상 준비 중
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="font-bold text-sm text-amber-900">{card.title}</p>
                      <p className="text-xs text-amber-700/60 mt-1 leading-relaxed">{card.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="text-center">
                <button
                  onClick={() => navigate('/video-guide')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 font-black rounded-2xl text-sm transition-all"
                >
                  <PlayCircle size={16} className="text-violet-500" />
                  영상 가이드 페이지 바로가기
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Access Request Form ── */}
      <section id="request-section" className="py-24 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full mb-4">
              <CheckCircle2 size={12} /> Pro · 학교/학원 도입 문의
            </span>
            <h2 className="text-3xl font-black text-amber-900 mb-3">Pro · 학교 도입 문의하기</h2>
            <p className="text-amber-700/70 text-sm leading-relaxed">
              개인은 위 "Google로 무료 시작하기"로 바로 가입해 사용하실 수 있습니다.<br />
              여러 선생님이 함께 쓰는 Pro·학교/학원 단위 도입은 아래로 문의해 주세요.
            </p>
          </div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-emerald-50 rounded-3xl border border-emerald-100 overflow-hidden"
            >
              {/* 상단 헤더 */}
              <div className="bg-emerald-500 px-8 py-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={36} className="text-white" />
                </div>
                <h3 className="text-2xl font-black text-white mb-1">문의가 접수되었습니다!</h3>
                <p className="text-emerald-100 text-sm font-medium">생기로그 AI에 관심 가져주셔서 감사합니다</p>
              </div>

              {/* 안내 내용 */}
              <div className="px-8 py-8 space-y-4">
                <div className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-emerald-100">
                  <span className="text-2xl shrink-0">📬</span>
                  <div>
                    <p className="text-sm font-black text-emerald-900 mb-1">담당자가 안내 메일을 보내드립니다</p>
                    <p className="text-xs text-emerald-700/70 leading-relaxed">
                      검토 후 <strong>남겨주신 이메일</strong>로 Pro·학교/학원 도입 안내를 보내드립니다.<br />
                      받은 편지함(스팸 폴더 포함)을 확인해 주세요.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-emerald-100">
                  <span className="text-2xl shrink-0">⏱️</span>
                  <div>
                    <p className="text-sm font-black text-emerald-900 mb-1">평일 기준 24시간 내 처리됩니다</p>
                    <p className="text-xs text-emerald-700/70 leading-relaxed">
                      주말·공휴일에는 처리가 다소 늦어질 수 있습니다.<br />
                      바로 사용해보고 싶으시면 "Google로 무료 시작하기"로 먼저 시작하셔도 됩니다.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-emerald-100">
                  <span className="text-2xl shrink-0">💬</span>
                  <div>
                    <p className="text-sm font-black text-emerald-900 mb-1">문의가 있으신가요?</p>
                    <p className="text-xs text-emerald-700/70 leading-relaxed">
                      오래 기다리셨다면 아래 이메일로 문의해 주세요.
                    </p>
                    <a
                      href="mailto:aklabs84@naver.com?subject=생기로그 AI 도입 문의"
                      className="inline-block mt-2 text-xs font-black text-emerald-600 hover:text-emerald-800 underline underline-offset-2 transition-colors"
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
              className="bg-[#FFFBF5] rounded-3xl p-8 border border-amber-100 shadow-sm space-y-5"
            >
              {submitError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium">
                  {submitError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-amber-700 ml-1">이름 *</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-amber-700 ml-1">이메일 *</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher@school.edu"
                    className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-amber-700 ml-1">학교 / 학원 이름 *</label>
                <input
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="아크고등학교 / 아크수학학원"
                  className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-amber-700 ml-1">직책 *</label>
                <select
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all appearance-none"
                >
                  <option value="">선택해 주세요</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-amber-700 ml-1">하고 싶은 말 (선택)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="사용하고 싶은 이유나 기대하는 기능을 자유롭게 적어주세요."
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black rounded-2xl text-base transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-amber-200"
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

              <p className="text-center text-xs text-amber-600/50">
                이미 계정이 있으신가요?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-amber-600 font-bold hover:underline"
                >
                  로그인하기
                </button>
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 bg-amber-900 text-amber-200">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
              <GraduationCap size={16} className="text-white" />
            </div>
            <span className="font-black text-amber-100">생기로그 AI</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-amber-400">
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-200 transition-colors underline underline-offset-2"
            >
              사용 가이드
            </a>
            <a
              href="/privacy"
              className="hover:text-amber-200 transition-colors underline underline-offset-2"
            >
              개인정보 처리방침
            </a>
            <a
              href="/terms"
              className="hover:text-amber-200 transition-colors underline underline-offset-2"
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
