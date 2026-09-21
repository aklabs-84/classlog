import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, Trophy, Zap, Users,
  Clock, Wifi, WifiOff, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getServerTimeOffsetMs } from '../lib/serverTime';
import ConfettiEffect from '../components/quiz/ConfettiEffect';
import { playVictoryFanfare, playRankFanfare, playCompleteSound } from '../lib/quizSound';

// ─── Types ────────────────────────────────────────────────────────────────────
type GameState = 'LOBBY' | 'QUIZ' | 'RESULT' | 'RANKING' | 'FINAL';

interface Session {
  id: string;
  pin_code: string;
  state: GameState;
  current_question_index: number;
  max_timer: number;
  question_started_at: string | null;
  quiz_set_id: string;
}

interface Question {
  id: string;
  order_index: number;
  text: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  correct_answer?: number;
  time_limit: number;
  explanation?: string;
  question_type: 'multiple_choice' | 'short_answer';
  image_url?: string | null;
  correct_answers?: string[] | null;
}

interface Participant {
  id: string;
  student_name: string;
  score: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;
const OPTION_BG = [
  'from-red-500 to-rose-600',
  'from-blue-500 to-indigo-600',
  'from-yellow-400 to-amber-500',
  'from-green-500 to-emerald-600',
] as const;
const OPTION_SHADOW = [
  'shadow-red-500/30',
  'shadow-blue-500/30',
  'shadow-yellow-500/30',
  'shadow-green-500/30',
] as const;

// ─── Component ────────────────────────────────────────────────────────────────
const QuizStudentView = () => {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // StudentLog에서 자동 입장 시 state로 이름 전달
  const autoJoinName = (location.state as any)?.autoJoinName ?? '';

  // 단계: pin입력 → name입력 → 게임
  type Step = 'enter-pin' | 'enter-name' | 'game';
  const [step, setStep] = useState<Step>(pin ? 'enter-name' : 'enter-pin');
  const [pinInput, setPinInput] = useState(pin ?? '');
  const [nameInput, setNameInput] = useState(autoJoinName);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // 게임 데이터
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);

  // 퀴즈 진행
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{
    questionType: 'multiple_choice' | 'short_answer';
    isCorrect: boolean;
    score: number;
    correctAnswer: number;
    answerText?: string;
    pending?: boolean;
  } | null>(null);
  const [shortAnswerText, setShortAnswerText] = useState('');
  const [timer, setTimer] = useState(20);
  const [isConnected, setIsConnected] = useState(false);
  // 주관식 제출 후 교사 채점 대기 중인 답변의 id — 채점 완료 realtime UPDATE를 이 id로만 매칭
  const pendingAnswerIdRef = useRef<string | null>(null);

  const [showConfetti, setShowConfetti] = useState(false);
  const prevQuestionIndex = useRef<number>(-1);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 기기 시계 - 서버 시계 오프셋(ms). 기기 시스템 시간이 틀려도 이 값을 Date.now()에
  // 더하면 서버 기준 시각을 구할 수 있어, 타이머/응답시간이 교사 화면과 어긋나지 않는다.
  const offsetMsRef = useRef(0);
  const serverNow = () => Date.now() + offsetMsRef.current;

  // ── PIN 확인 & 입장 ──────────────────────────────────────────────────────
  const handleVerifyPin = async () => {
    const p = pinInput.trim();
    if (p.length !== 6) { setErrorMsg('6자리 PIN을 입력하세요'); return; }
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await supabase.rpc('quiz_session_by_pin', { p_pin: p });
    if (error || !data) {
      setErrorMsg('유효하지 않은 PIN이거나 종료된 퀴즈입니다');
      setLoading(false);
      return;
    }
    setSession(data);
    navigate(`/quiz/${p}`, { replace: true });
    setStep('enter-name');
    setLoading(false);
  };

  // 자동 입장: autoJoinName이 있으면 enter-name 단계에서 자동으로 참가 처리
  useEffect(() => {
    if (step === 'enter-name' && autoJoinName) {
      handleJoin(autoJoinName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleJoin = async (forceName?: string) => {
    const name = (forceName ?? nameInput).trim();
    if (!name) { setErrorMsg('이름을 입력하세요'); return; }
    setLoading(true);
    setErrorMsg('');

    // 서버-기기 시간 오프셋 조회 (백그라운드, 실패해도 0으로 폴백되어 진행에 영향 없음)
    getServerTimeOffsetMs().then(ms => { offsetMsRef.current = ms; });

    // 서버 창구로 입장 (세션 확인 + 참가자 등록 + 문제 목록[정답 제외])
    const { data: joined, error: joinErr } = await supabase.rpc('quiz_join', {
      p_pin: (session?.pin_code ?? pinInput).trim(),
      p_name: name,
    });
    if (joinErr || !joined) { setErrorMsg('참가 등록에 실패했습니다'); setLoading(false); return; }
    setSession(joined.session);
    setParticipant(joined.participant);
    setQuestions(joined.questions ?? []);
    setStep('game');
    setLoading(false);
  };

  // 세션 업데이트 적용 (Realtime 이벤트 / 폴백 폴링 공용)
  const applySessionUpdate = useCallback((updated: Session) => {
    setSession(prev => {
      // 문제가 바뀌면 내 답변 초기화
      if (prev && updated.current_question_index !== prev.current_question_index) {
        setMyAnswer(null);
        setLastResult(null);
        setShortAnswerText('');
        pendingAnswerIdRef.current = null;
      }
      return updated;
    });
  }, []);

  // ── 폴링 동기화 (공개 조회를 막아 Realtime 대신 2초마다 서버 창구 확인) ──
  const applyPoll = useCallback((d: any) => {
    if (!d) return;
    setIsConnected(true);
    applySessionUpdate(d.session as Session);
    setParticipant(prev => (prev ? { ...prev, ...d.participant } : (d.participant as Participant)));
    if (d.participants) setAllParticipants(d.participants);
    if (d.reveal) {
      setQuestions(prev => prev.map(q => q.id === d.reveal.question_id
        ? { ...q, correct_answer: d.reveal.correct_answer, correct_answers: d.reveal.correct_answers, explanation: d.reveal.explanation }
        : q));
    }
    const ans = d.answer;
    if (ans && !ans.needs_review && pendingAnswerIdRef.current === ans.id) {
      setLastResult(prev => prev ? { ...prev, isCorrect: ans.is_correct, score: ans.score, pending: false } : prev);
      pendingAnswerIdRef.current = null;
    }
  }, [applySessionUpdate]);

  const fetchParticipants = async (_sessionId?: string) => {
    if (!participant?.id) return;
    const { data } = await supabase.rpc('quiz_poll', { p_participant_id: participant.id, p_answer_id: pendingAnswerIdRef.current });
    applyPoll(data);
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // 문제 목록 다시 받기 — 입장 후 교사가 문제를 고치거나 추가해도 학생 화면이 어긋나지 않게 한다.
  // quiz_join은 같은 이름이면 기존 참가자를 그대로 돌려주므로 여러 번 불러도 안전하다.
  const lastQuestionsRefreshRef = useRef(0);
  const refreshQuestions = useCallback(async (force = false) => {
    const pin = session?.pin_code;
    const name = participant?.student_name;
    if (!pin || !name) return;
    const now = Date.now();
    if (!force && now - lastQuestionsRefreshRef.current < 3000) return;
    lastQuestionsRefreshRef.current = now;
    const { data } = await supabase.rpc('quiz_join', { p_pin: pin, p_name: name });
    if (data?.questions) setQuestions(prev => (prev.length === 0 && data.questions.length === 0 ? prev : data.questions));
  }, [session?.pin_code, participant?.student_name]);

  const lastPollOkRef = useRef(0);
  useEffect(() => {
    if (step !== 'game' || !participant?.id) return;
    const participantId = participant.id;
    let alive = true;
    const poll = async () => {
      const { data, error } = await supabase.rpc('quiz_poll', { p_participant_id: participantId, p_answer_id: pendingAnswerIdRef.current });
      if (!alive) return;
      if (error) { setIsConnected(false); return; }
      lastPollOkRef.current = Date.now();
      applyPoll(data);
    };
    lastPollOkRef.current = Date.now();
    poll();
    const t = setInterval(() => {
      poll();
      // 6초 넘게 응답이 없으면(기기가 잠겼다 깨어난 경우 등) 연결 끊김으로 표시
      if (Date.now() - lastPollOkRef.current > 6000) setIsConnected(false);
    }, 2000);
    // 휴대폰 화면이 꺼졌다 켜지거나 네트워크가 돌아오면 2초를 기다리지 않고 즉시 확인
    const wake = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    return () => {
      alive = false; clearInterval(t);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [step, participant?.id, applyPoll]);

  // 타이머 동기화 (서버 시간 기준)
  useEffect(() => {
    if (!session || session.state !== 'QUIZ' || !session.question_started_at) return;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const sync = () => {
      const started = new Date(session.question_started_at!).getTime();
      const elapsed = Math.floor((serverNow() - started) / 1000);
      const remaining = Math.max(0, session.max_timer - elapsed);
      setTimer(remaining);
    };

    sync();
    timerIntervalRef.current = setInterval(sync, 250);

    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [session?.state, session?.question_started_at, session?.max_timer]);

  // 문제 인덱스 변경 감지 → 순위 최신화
  useEffect(() => {
    if (!session || !participant) return;
    if (session.current_question_index !== prevQuestionIndex.current) {
      prevQuestionIndex.current = session.current_question_index;
      fetchParticipants(session.id);
      refreshQuestions(true);
    }
  }, [session?.current_question_index]);

  // 현재 문제가 목록에 없으면(교사가 문제를 추가한 경우 등) 목록을 다시 받는다
  useEffect(() => {
    if (step !== 'game' || !session || session.state !== 'QUIZ') return;
    if (!questions[session.current_question_index]) refreshQuestions();
  }, [step, session?.state, session?.current_question_index, questions.length, refreshQuestions]);

  // 랭킹/파이널 → 참가자 최신화
  useEffect(() => {
    if (!session || !participant) return;
    if (session.state === 'RANKING' || session.state === 'FINAL') {
      fetchParticipants(session.id);
    }
  }, [session?.state]);

  // FINAL 진입 시 순위 기반 효과음 + 폭죽
  useEffect(() => {
    if (session?.state !== 'FINAL' || myRank === 0) return;
    if (myRank === 1) {
      setShowConfetti(true);
      playVictoryFanfare();
      const t = setTimeout(() => setShowConfetti(false), 6000);
      return () => clearTimeout(t);
    } else if (myRank === 2 || myRank === 3) {
      setShowConfetti(true);
      playRankFanfare(myRank as 2 | 3);
      const t = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(t);
    } else {
      playCompleteSound();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.state]);

  // FINAL 종료 처리 — 채널 해제 후 완전히 다른 경로로 이동(컴포넌트 재마운트 보장)
  const handleFinalExit = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    // StudentLog에서 자동입장 → 학생 페이지로 복귀
    // 직접 PIN 입력 → /quiz로 이동 (window.location으로 강제 재마운트)
    if (autoJoinName) {
      navigate('/student-log', { replace: true });
    } else {
      window.location.replace('/quiz');
    }
  }, [autoJoinName, navigate]);

  // 선생님이 강제 종료(FINAL)하면 AutoRedirectButton 카운트다운과 별개로 보험용 타이머
  useEffect(() => {
    if (!session || session.state !== 'FINAL') return;
    const timer = setTimeout(handleFinalExit, 7000); // AutoRedirectButton(6초)보다 1초 뒤
    return () => clearTimeout(timer);
  }, [session?.state, handleFinalExit]);

  // ── 답변 제출 ──────────────────────────────────────────────────────────────
  const handleAnswer = async (optionIdx: number) => {
    if (!session || !participant || myAnswer !== null) return;
    if (session.state !== 'QUIZ') return;
    // 서버시간 기준으로 동기화된 타이머가 이미 0이면(모든 학생이 동시에 마감) 더 이상 답변 불가
    if (timer <= 0) return;

    setMyAnswer(optionIdx);

    const currentQuestion = questions[session.current_question_index];
    if (!currentQuestion) return;

    const { data: res, error: ansErr } = await supabase.rpc('quiz_submit_answer', {
      p_participant_id: participant.id,
      p_question_id: currentQuestion.id,
      p_option: optionIdx,
    });
    if (ansErr || !res || res.error) {
      // 시간 초과·이미 제출 등 — 화면을 원래 상태로 되돌림
      if (res?.error !== 'ALREADY_ANSWERED') setMyAnswer(null);
      return;
    }
    setLastResult({ questionType: 'multiple_choice', isCorrect: res.is_correct, score: res.score, correctAnswer: res.correct_answer, pending: false });
    if (res.score > 0) setParticipant(prev => prev ? { ...prev, score: prev.score + res.score } : prev);
  };

  // ── 주관식 답변 제출 ──────────────────────────────────────────────────────────
  // 즉시 정답/오답을 판정하지 않고, 선생님이 시간 종료 후 직접 채점할 때까지 대기한다.
  const handleShortAnswerSubmit = async () => {
    if (!session || !participant || myAnswer !== null) return;
    if (session.state !== 'QUIZ') return;
    if (timer <= 0) return;
    const text = shortAnswerText.trim();
    if (!text) return;

    setMyAnswer(-1); // 주관식은 선택지 인덱스가 없으므로 "제출 완료" sentinel

    const currentQuestion = questions[session.current_question_index];
    if (!currentQuestion) return;

    setLastResult({ questionType: 'short_answer', isCorrect: false, score: 0, correctAnswer: -1, answerText: text, pending: true });

    const { data: res, error: shortErr } = await supabase.rpc('quiz_submit_short', {
      p_participant_id: participant.id,
      p_question_id: currentQuestion.id,
      p_text: text,
    });
    if (shortErr || !res || res.error) { setMyAnswer(null); setLastResult(null); return; }
    pendingAnswerIdRef.current = res.answer_id;
  };

  // ── 현재 정보 ──────────────────────────────────────────────────────────────
  const currentQuestion = session ? questions[session.current_question_index] : null;
  const myRank = allParticipants.findIndex(p => p.id === participant?.id) + 1;
  const myCurrentScore = participant?.score ?? 0;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      {/* 배경 glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-400/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-400/20 rounded-full blur-[100px]" />
      </div>

      <div className={`w-full relative z-10 ${session?.state === 'QUIZ' ? 'max-w-md md:max-w-3xl lg:max-w-4xl' : 'max-w-md'}`}>
        <AnimatePresence mode="wait">

          {/* ── STEP: PIN 입력 ── */}
          {step === 'enter-pin' && (
            <motion.div
              key="pin"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="text-6xl">🎮</div>
                <h1 className="text-3xl font-black text-white">퀴즈 참여</h1>
                <p className="text-white/70 text-sm">선생님이 알려준 PIN 코드를 입력하세요</p>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-3xl p-6 border border-white/20 space-y-4">
                <input
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter') handleVerifyPin(); }}
                  placeholder="PIN 6자리"
                  maxLength={6}
                  className="w-full px-4 py-4 rounded-2xl bg-white/20 text-white placeholder-white/40 text-center text-3xl font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-white/40 border border-white/20"
                />
                {errorMsg && (
                  <p className="text-red-300 text-xs font-bold text-center">{errorMsg}</p>
                )}
                <button
                  onClick={handleVerifyPin}
                  disabled={pinInput.length !== 6 || loading}
                  className="w-full py-4 rounded-2xl bg-white text-violet-600 font-black text-lg hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? '확인 중...' : '입장하기'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP: 이름 입력 ── */}
          {step === 'enter-name' && (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="text-6xl">👋</div>
                <h1 className="text-3xl font-black text-white">이름 입력</h1>
                <p className="text-white/70 text-sm">퀴즈에서 사용할 이름을 입력하세요</p>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-3xl p-6 border border-white/20 space-y-4">
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleJoin(); }}
                  placeholder="이름을 입력하세요"
                  maxLength={20}
                  autoFocus
                  className="w-full px-4 py-4 rounded-2xl bg-white/20 text-white placeholder-white/40 text-center text-xl font-black focus:outline-none focus:ring-2 focus:ring-white/40 border border-white/20"
                />
                {errorMsg && (
                  <p className="text-red-300 text-xs font-bold text-center">{errorMsg}</p>
                )}
                <button
                  onClick={() => handleJoin()}
                  disabled={!nameInput.trim() || loading}
                  className="w-full py-4 rounded-2xl bg-white text-violet-600 font-black text-lg hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? '참여 중...' : '퀴즈 참여하기!'}
                </button>
                <button
                  onClick={() => { setStep('enter-pin'); setErrorMsg(''); }}
                  className="w-full py-2 text-white/60 text-sm font-bold hover:text-white transition-all flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={14} />
                  PIN 다시 입력
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP: GAME ── */}
          {step === 'game' && session && participant && (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* 상단 정보 바 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur px-3 py-1.5 rounded-full border border-white/20">
                  <span className="text-white font-black text-sm">{participant.student_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-full border border-white/20">
                    {isConnected
                      ? <Wifi size={12} className="text-green-300" />
                      : <WifiOff size={12} className="text-red-300" />
                    }
                    <span className="text-white/80 text-xs font-bold">
                      {isConnected ? '연결됨' : '재연결 중'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-full border border-white/20">
                    <Zap size={12} className="text-yellow-300" />
                    <span className="text-white font-black text-sm">{myCurrentScore.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <AnimatePresence mode="wait">

                {/* ── LOBBY ── */}
                {session.state === 'LOBBY' && (
                  <motion.div
                    key="lobby"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="text-center space-y-6"
                  >
                    <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 border border-white/20 space-y-4">
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center mx-auto shadow-xl"
                      >
                        <span className="text-3xl">✅</span>
                      </motion.div>
                      <h2 className="text-2xl font-black text-white">{participant.student_name}님, 환영해요!</h2>
                      <p className="text-white/70 text-sm">선생님이 퀴즈를 시작하면 자동으로 시작됩니다</p>
                      <motion.div
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="flex items-center justify-center gap-2 text-white/60 text-sm"
                      >
                        <Clock size={14} />
                        대기 중...
                      </motion.div>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/15">
                      <div className="flex items-center gap-2 mb-3">
                        <Users size={14} className="text-white/60" />
                        <span className="text-white/70 text-xs font-bold">참여 중인 학생</span>
                        <span className="text-white text-xs font-black">{allParticipants.length}명</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allParticipants.slice(0, 12).map(p => (
                          <span
                            key={p.id}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              p.id === participant.id
                                ? 'bg-white text-violet-600'
                                : 'bg-white/20 text-white'
                            }`}
                          >
                            {p.student_name}
                          </span>
                        ))}
                        {allParticipants.length > 12 && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 text-white/60">
                            +{allParticipants.length - 12}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── QUIZ ── */}
                {session.state === 'QUIZ' && currentQuestion && (
                  <motion.div
                    key={`quiz-${session.current_question_index}`}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    className="space-y-4"
                  >
                    {/* 타이머 */}
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-xs font-bold">
                        {session.current_question_index + 1} / {questions.length}번 문제
                      </span>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-sm ${
                        timer <= 5 ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white'
                      }`}>
                        <Clock size={13} />
                        {timer}초
                      </div>
                    </div>

                    {/* 타이머 바 */}
                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${(timer / session.max_timer) * 100}%` }}
                        transition={{ duration: 0.25 }}
                      />
                    </div>

                    {/* 문제 */}
                    <div className="bg-white/15 backdrop-blur-md rounded-2xl p-6 md:p-8 lg:p-10 border border-white/20 space-y-4">
                      <p className="text-white font-black text-center text-2xl md:text-3xl lg:text-4xl leading-relaxed break-words">
                        {currentQuestion.text}
                      </p>
                      {currentQuestion.image_url && (
                        <img
                          src={currentQuestion.image_url}
                          alt=""
                          className="max-h-64 md:max-h-80 mx-auto rounded-xl object-contain"
                        />
                      )}
                    </div>

                    {/* 선택지 또는 완료 표시 */}
                    {myAnswer === null ? (
                      timer > 0 ? (
                        currentQuestion.question_type === 'short_answer' ? (
                          <div className="flex flex-col gap-3">
                            <input
                              type="text"
                              value={shortAnswerText}
                              onChange={(e) => setShortAnswerText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleShortAnswerSubmit(); }}
                              placeholder="답을 입력하세요"
                              autoFocus
                              className="w-full rounded-2xl bg-white/15 border border-white/30 px-5 py-4 text-white font-bold text-lg placeholder-white/40 focus:outline-none focus:border-white/60"
                            />
                            <motion.button
                              whileTap={{ scale: 0.96 }}
                              onClick={handleShortAnswerSubmit}
                              disabled={!shortAnswerText.trim()}
                              className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed py-4 text-white font-black text-lg shadow-xl transition-all active:brightness-90"
                            >
                              제출하기
                            </motion.button>
                          </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-5">
                          {[currentQuestion.option_1, currentQuestion.option_2, currentQuestion.option_3, currentQuestion.option_4].map((opt, idx) => (
                            <motion.button
                              key={idx}
                              whileTap={{ scale: 0.94 }}
                              onClick={() => handleAnswer(idx)}
                              className={`min-h-32 md:min-h-40 lg:min-h-48 rounded-2xl bg-gradient-to-br ${OPTION_BG[idx]} shadow-xl ${OPTION_SHADOW[idx]} flex flex-col items-center justify-center gap-2 md:gap-3 transition-all active:brightness-90 p-4 md:p-6 lg:p-8`}
                            >
                              <span className="w-11 h-11 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-xl md:text-2xl lg:text-3xl shrink-0">
                                {OPTION_LABELS[idx]}
                              </span>
                              <span className="text-white font-bold text-base md:text-lg lg:text-xl text-center leading-snug break-words w-full">{opt}</span>
                            </motion.button>
                          ))}
                        </div>
                        )
                      ) : (
                        <motion.div
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="bg-white/15 backdrop-blur-md rounded-2xl p-8 border border-white/20 text-center space-y-3"
                        >
                          <div className="text-5xl">⏱️</div>
                          <p className="text-white font-black text-xl">시간이 종료되었습니다</p>
                          <p className="text-white/60 text-sm">선생님이 결과를 확인하면 표시됩니다</p>
                        </motion.div>
                      )
                    ) : (
                      <motion.div
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white/15 backdrop-blur-md rounded-2xl p-8 border border-white/20 text-center space-y-3"
                      >
                        <motion.div
                          animate={{ rotate: [0, -5, 5, -5, 5, 0] }}
                          transition={{ delay: 0.3, duration: 0.5 }}
                          className="text-5xl"
                        >
                          ✅
                        </motion.div>
                        <p className="text-white font-black text-xl">답변 완료!</p>
                        <p className="text-white/60 text-sm">선생님이 결과를 확인하면 표시됩니다</p>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* ── RESULT ── */}
                {session.state === 'RESULT' && currentQuestion && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className="space-y-4"
                  >
                    {lastResult && lastResult.pending ? (
                      /* 주관식 채점 대기 중 */
                      <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 border border-white/20 text-center space-y-4">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="text-5xl w-fit mx-auto"
                        >
                          ⏳
                        </motion.div>
                        <h2 className="text-2xl font-black text-white">채점 대기 중...</h2>
                        <p className="text-white/60 text-sm">선생님이 답안을 확인하고 있어요</p>
                        <div className="bg-white/10 rounded-2xl px-5 py-4 text-left">
                          <p className="text-white/50 text-xs font-black mb-1.5">내가 제출한 답</p>
                          <p className="text-white font-black text-lg leading-snug break-words">{lastResult.answerText}</p>
                        </div>
                      </div>
                    ) : lastResult ? (
                      <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 border border-white/20 text-center space-y-4">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 200 }}
                        >
                          {lastResult.isCorrect
                            ? <CheckCircle size={80} className="text-green-400 mx-auto" />
                            : <XCircle size={80} className="text-red-400 mx-auto" />
                          }
                        </motion.div>
                        <h2 className={`text-3xl font-black ${lastResult.isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                          {lastResult.isCorrect ? '정답!' : '오답...'}
                        </h2>
                        {/* 이번 문제 획득 점수 — 정답/오답 모두 명시 표시 */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-center justify-center gap-2 rounded-2xl px-6 py-3 ${
                            lastResult.isCorrect ? 'bg-white/20' : 'bg-white/10'
                          }`}
                        >
                          <Zap size={18} className={lastResult.isCorrect ? 'text-yellow-300' : 'text-white/30'} />
                          <span className={`font-black text-xl ${lastResult.isCorrect ? 'text-white' : 'text-white/50'}`}>
                            이번 획득: +{lastResult.score.toLocaleString()}점
                          </span>
                        </motion.div>
                        {/* 정답 확인 박스 — 항상 표시 */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="bg-green-400/30 border-2 border-green-400/70 rounded-2xl px-5 py-4 text-left"
                        >
                          <p className="text-green-300 text-xs font-black mb-1.5 flex items-center gap-1">
                            <CheckCircle size={13} strokeWidth={3} />
                            {lastResult.questionType === 'short_answer' ? '내가 제출한 답' : '정답'}
                          </p>
                          <p className="text-white font-black text-lg leading-snug break-words">
                            {lastResult.questionType === 'short_answer'
                              ? lastResult.answerText
                              : [currentQuestion.option_1, currentQuestion.option_2, currentQuestion.option_3, currentQuestion.option_4][lastResult.correctAnswer]}
                          </p>
                        </motion.div>
                      </div>
                    ) : (
                      <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 border border-white/20 text-center space-y-3">
                        <div className="text-5xl">⏰</div>
                        <p className="text-white font-bold">시간 초과!</p>
                        <div className="flex items-center justify-center gap-2 bg-white/10 rounded-2xl px-6 py-3">
                          <Zap size={18} className="text-white/30" />
                          <span className="text-white/50 font-black text-xl">이번 획득: +0점</span>
                        </div>
                        {/* 정답 확인 박스 */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="bg-green-400/30 border-2 border-green-400/70 rounded-2xl px-5 py-4 text-left"
                        >
                          <p className="text-green-300 text-xs font-black mb-1.5 flex items-center gap-1">
                            <CheckCircle size={13} strokeWidth={3} />
                            정답
                          </p>
                          <p className="text-white font-black text-lg leading-snug break-words">
                            {currentQuestion.question_type === 'short_answer'
                              ? (currentQuestion.correct_answers?.join(', ') || '(정답 미등록)')
                              : [currentQuestion.option_1, currentQuestion.option_2, currentQuestion.option_3, currentQuestion.option_4][currentQuestion.correct_answer ?? 0]}
                          </p>
                        </motion.div>
                      </div>
                    )}
                    {/* 해설 */}
                    {currentQuestion.explanation && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-amber-400/20 border border-amber-300/40 rounded-2xl p-4 flex gap-3"
                      >
                        <span className="text-amber-300 text-lg shrink-0">💡</span>
                        <p className="text-amber-100 text-sm font-bold leading-relaxed">{currentQuestion.explanation}</p>
                      </motion.div>
                    )}
                    {/* 누적 점수는 항상 표시 — 이번 획득과 분리되어 혼동 없음 */}
                    <div className="bg-white/10 rounded-2xl p-4 border border-white/15 flex items-center justify-between">
                      <span className="text-white/70 text-sm font-bold">누적 점수</span>
                      <span className="text-white font-black text-xl">{myCurrentScore.toLocaleString()}점</span>
                    </div>
                  </motion.div>
                )}

                {/* ── RANKING ── */}
                {session.state === 'RANKING' && (
                  <motion.div
                    key="ranking"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-4"
                  >
                    {myRank > 0 && (
                      <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20 text-center">
                        <p className="text-white/70 text-sm font-bold mb-1">나의 현재 순위</p>
                        <p className="text-5xl font-black text-white">{myRank}등</p>
                        <p className="text-white/60 text-sm mt-1">{myCurrentScore.toLocaleString()}점</p>
                      </div>
                    )}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/15 space-y-2 max-h-64 overflow-y-auto">
                      {allParticipants.slice(0, 10).map((p, i) => (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                            p.id === participant?.id
                              ? 'bg-white/25 border border-white/40'
                              : 'bg-white/10'
                          }`}
                        >
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                            i === 0 ? 'bg-amber-400 text-white' :
                            i === 1 ? 'bg-slate-300 text-white' :
                            i === 2 ? 'bg-orange-400 text-white' :
                            'bg-white/20 text-white/70'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="font-bold text-white flex-1 text-sm">{p.student_name}</span>
                          <span className="text-white/80 font-black text-sm">{p.score.toLocaleString()}</span>
                        </motion.div>
                      ))}
                    </div>
                    <div className="bg-white/10 rounded-2xl p-4 border border-white/15 text-center">
                      <motion.p
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="text-white/60 text-sm"
                      >
                        선생님이 다음 문제로 넘어갑니다...
                      </motion.p>
                    </div>
                  </motion.div>
                )}

                {/* ── FINAL ── */}
                {session.state === 'FINAL' && (
                  <motion.div
                    key="final"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-4"
                  >
                    {showConfetti && (
                      <ConfettiEffect
                        intensity={myRank === 1 ? 'heavy' : 'normal'}
                        duration={myRank === 1 ? 6000 : 4000}
                      />
                    )}

                    {/* 순위별 메인 카드 */}
                    <div className={`backdrop-blur-md rounded-3xl p-8 border text-center space-y-4 ${
                      myRank === 1
                        ? 'bg-gradient-to-b from-amber-500/30 to-yellow-600/20 border-amber-400/60 shadow-xl shadow-amber-500/20'
                        : myRank === 2
                        ? 'bg-gradient-to-b from-slate-400/20 to-slate-500/10 border-slate-300/50'
                        : myRank === 3
                        ? 'bg-gradient-to-b from-orange-400/20 to-orange-500/10 border-orange-300/50'
                        : 'bg-white/15 border-white/20'
                    }`}>
                      {/* 1위 — 왕관 애니메이션 */}
                      {myRank === 1 ? (
                        <motion.div
                          animate={{ y: [0, -10, 0], rotate: [0, -5, 5, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          className="text-7xl"
                        >
                          👑
                        </motion.div>
                      ) : myRank === 2 ? (
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="text-7xl"
                        >
                          🥈
                        </motion.div>
                      ) : myRank === 3 ? (
                        <motion.div
                          animate={{ scale: [1, 1.08, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="text-7xl"
                        >
                          🥉
                        </motion.div>
                      ) : (
                        <motion.div
                          animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.2, 1] }}
                          transition={{ duration: 0.8, delay: 0.3 }}
                          className="text-7xl"
                        >
                          🏆
                        </motion.div>
                      )}

                      <div>
                        {myRank === 1 ? (
                          <>
                            <h2 className="text-3xl font-black text-white">1등이에요!</h2>
                            <p className="text-amber-300 font-bold text-sm mt-1">🎉 최고 점수 달성!</p>
                          </>
                        ) : myRank === 2 ? (
                          <>
                            <h2 className="text-3xl font-black text-white">2등이에요!</h2>
                            <p className="text-slate-300 font-bold text-sm mt-1">대단해요! 다음엔 1등!</p>
                          </>
                        ) : myRank === 3 ? (
                          <>
                            <h2 className="text-3xl font-black text-white">3등이에요!</h2>
                            <p className="text-orange-300 font-bold text-sm mt-1">훌륭해요! TOP 3 달성!</p>
                          </>
                        ) : (
                          <>
                            <h2 className="text-3xl font-black text-white">수고했어요!</h2>
                            <p className="text-white/70 text-sm mt-1">{participant.student_name}님의 최종 결과</p>
                          </>
                        )}
                      </div>

                      <div className="bg-white/20 rounded-2xl p-5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-white/70 text-sm">최종 점수</span>
                          <span className="text-white font-black text-2xl">{myCurrentScore.toLocaleString()}점</span>
                        </div>
                        {myRank > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-white/70 text-sm">최종 순위</span>
                            <span className={`font-black text-2xl ${
                              myRank === 1 ? 'text-amber-300' :
                              myRank === 2 ? 'text-slate-300' :
                              myRank === 3 ? 'text-orange-300' : 'text-white'
                            }`}>
                              {myRank === 1 ? '👑 1등!' : myRank === 2 ? '🥈 2등' : myRank === 3 ? '🥉 3등' : `${myRank}등`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 최종 순위 TOP 5 */}
                    <div className="bg-white/10 rounded-2xl p-4 border border-white/15 space-y-2">
                      <h4 className="text-white/70 text-xs font-bold flex items-center gap-1.5">
                        <Trophy size={12} /> 최종 순위
                      </h4>
                      {allParticipants.slice(0, 5).map((p, i) => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                            p.id === participant?.id
                              ? i === 0 ? 'bg-amber-400/30 border border-amber-400/50' :
                                i === 1 ? 'bg-slate-400/30 border border-slate-300/50' :
                                i === 2 ? 'bg-orange-400/30 border border-orange-300/50' :
                                'bg-white/25 border border-white/40'
                              : 'bg-white/10'
                          }`}
                        >
                          <span className="text-lg">{['👑', '🥈', '🥉', '4️⃣', '5️⃣'][i]}</span>
                          <span className="font-bold text-white flex-1 text-sm">{p.student_name}</span>
                          {p.id === participant?.id && (
                            <span className="text-[10px] bg-white/30 text-white px-1.5 py-0.5 rounded font-bold">나</span>
                          )}
                          <span className="text-white/80 font-black text-sm">{p.score.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    {/* 6초 후 자동으로 처음 화면으로 이동 */}
                    <AutoRedirectButton onNavigate={handleFinalExit} />
                  </motion.div>
                )}

              </AnimatePresence>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

// ─── 자동 이동 버튼 (카운트다운 표시) ─────────────────────────────────────────
// onNavigate를 ref로 관리해서 부모 리렌더 시 deps 변경으로 카운트다운이 초기화되는 버그 방지
const AutoRedirectButton = ({ onNavigate }: { onNavigate: () => void }) => {
  const [count, setCount] = useState(6);
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; });

  useEffect(() => {
    if (count <= 0) { onNavigateRef.current(); return; }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]); // onNavigate를 deps에서 제거 — ref로 최신값 참조

  return (
    <button
      onClick={() => onNavigateRef.current()}
      className="w-full py-4 rounded-2xl bg-white text-violet-600 font-black text-lg hover:bg-white/90 transition-all flex items-center justify-center gap-2"
    >
      처음으로 돌아가기
      <span className="text-sm font-normal opacity-60">({count}초)</span>
    </button>
  );
};

export default QuizStudentView;
