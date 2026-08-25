import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck, ChevronDown, Play, Trophy, Users,
  Plus, Trash2, Edit3, Check, X, ChevronRight,
  RefreshCw, BarChart2, Clock, Zap, Crown, Copy, CheckCheck,
  ArrowRight, ListChecks, BookOpen, Wifi
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getServerTimeOffsetMs } from '../../lib/serverTime';
import { useAuth } from '../../lib/auth';
import { quizGeneratorAI } from '../../lib/gemini';
import ConfettiEffect from '../../components/quiz/ConfettiEffect';
import { playVictoryFanfare } from '../../lib/quizSound';

// ─── Types ────────────────────────────────────────────────────────────────────
type GameState = 'LOBBY' | 'QUIZ' | 'RESULT' | 'RANKING' | 'FINAL';

interface QuizSet {
  id: string;
  title: string;
  class_id: string | null;
  created_at: string;
}

interface Question {
  id: string;
  quiz_set_id: string;
  order_index: number;
  text: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  correct_answer: number; // 0~3
  time_limit: number;
  explanation?: string;
}

interface Session {
  id: string;
  pin_code: string;
  state: GameState;
  current_question_index: number;
  max_timer: number;
  question_started_at: string | null;
}

interface Participant {
  id: string;
  student_name: string;
  score: number;
  joined_at: string;
}

interface Answer {
  id: string;
  participant_id: string;
  question_id: string;
  selected_option: number;
  is_correct: boolean;
  score: number;
  response_time: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;
const OPTION_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-yellow-500',
  'bg-green-500',
] as const;
const OPTION_LIGHT_COLORS = [
  'bg-red-50 border-red-200 text-red-700',
  'bg-blue-50 border-blue-200 text-blue-700',
  'bg-yellow-50 border-yellow-200 text-yellow-700',
  'bg-green-50 border-green-200 text-green-700',
] as const;

// PIN 코드 생성 (6자리 숫자)
const generatePin = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ─── Component ────────────────────────────────────────────────────────────────
const QuizGame = () => {
  const { user } = useAuth();
  const location = useLocation();
  const openSetHandledRef = useRef(false);

  // 클래스/퀴즈 세트
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [quizSets, setQuizSets] = useState<QuizSet[]>([]);
  const [selectedQuizSet, setSelectedQuizSet] = useState<QuizSet | null>(null);
  const [_quizSetDropdownOpen, _setQuizSetDropdownOpen] = useState(false);
  const [showAllClasses, setShowAllClasses] = useState(false);

  // 문제 관리
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // 게임 세션
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [timer, setTimer] = useState(20);
  const [copied, setCopied] = useState(false);

  // UI 뷰
  type View = 'setup' | 'questions' | 'game';
  const [view, setView] = useState<View>('setup');
  const [loading, setLoading] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetTitle, setNewSetTitle] = useState('');

  const [showConfetti, setShowConfetti] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const savedHistoryRef = useRef(false);
  // 기기 시계 - 서버 시계 오프셋(ms). 학생 화면과 동일한 방식으로 서버 기준 시각을 구해
  // question_started_at을 저장하고 타이머를 계산해, 교사/학생 기기 시계가 달라도 어긋나지 않는다.
  const offsetMsRef = useRef(0);
  const serverNow = () => Date.now() + offsetMsRef.current;

  // ── 수업 자료 AI 생성 ──────────────────────────────────────────────────────
  const [classMaterials, setClassMaterials] = useState<any[]>([]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  // ── 초기 로딩 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) fetchClasses();
  }, [user?.id]);

  // 연동 학급(교과/협력 교사)의 class row는 linked_class_id로 원본 담임 학급을 가리킴 —
  // 학생은 담임반 입장코드로 로그인하므로, 퀴즈 세션/기록도 항상 담임반 id 기준으로 저장해야 학생 화면에 보임
  const resolveClassId = (cls: any) => cls?.linked_class_id || cls?.id || null;

  const fetchClasses = async () => {
    const { data: ownData } = await supabase
      .from('classes').select('id, name, class_type, linked_class_id')
      .eq('teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
    let assignedData: any[] = [];
    try {
      const { data } = await supabase.from('classes').select('id, name, class_type, linked_class_id')
        .eq('assigned_teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
      assignedData = data || [];
    } catch (_e) {}
    const seen = new Set<string>();
    const combined = [...(ownData || []), ...assignedData].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (combined.length > 0) setClasses(combined);
  };

  const fetchQuizSets = async (classId?: string) => {
    let query = supabase
      .from('quiz_sets')
      .select('*')
      .eq('teacher_id', user!.id)
      .order('created_at', { ascending: false });
    if (classId) query = query.eq('class_id', classId);
    const { data } = await query;
    if (data) setQuizSets(data);
  };

  const fetchQuestions = async (quizSetId: string) => {
    const { data } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_set_id', quizSetId)
      .order('order_index', { ascending: true });
    if (data) setQuestions(data);
  };

  // AI 코파일럿에서 방금 만든 퀴즈 세트로 바로 이동한 경우
  useEffect(() => {
    if (openSetHandledRef.current) return;
    const state = location.state as { openQuizSetId?: string } | null;
    const openId = state?.openQuizSetId;
    if (!openId) return;
    openSetHandledRef.current = true;
    (async () => {
      const { data: qs } = await supabase.from('quiz_sets').select('*').eq('id', openId).single();
      if (!qs) return;
      if (qs.class_id) {
        const { data: cls } = await supabase
          .from('classes').select('id, name, class_type, linked_class_id')
          .eq('id', qs.class_id).single();
        if (cls) setSelectedClass(cls);
      }
      await fetchQuizSets(qs.class_id || undefined);
      setSelectedQuizSet(qs);
      await fetchQuestions(qs.id);
      setView('questions');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleAllClasses = async (val: boolean) => {
    setShowAllClasses(val);
    if (selectedClass) {
      await fetchQuizSets(val ? undefined : selectedClass.id);
    }
  };

  // 클래스 선택
  const handleSelectClass = async (cls: any) => {
    setSelectedClass(cls);
    setClassDropdownOpen(false);
    setSelectedQuizSet(null);
    setQuestions([]);
    setShowAllClasses(false);
    await fetchQuizSets(cls.id);
    // 수업 자료 로드
    const { data } = await supabase
      .from('class_materials')
      .select('id, week_number, title, content, url')
      .eq('class_id', cls.id)
      .eq('is_published', true)
      .order('week_number', { ascending: true });
    setClassMaterials(data || []);
  };

  // 수업 자료 기반 AI 문제 생성
  const handleAiGenerate = async () => {
    if (!selectedMaterial || !selectedQuizSet) return;
    if (!selectedMaterial.content && !selectedMaterial.url) {
      setAiError('선택한 자료에 내용이 없습니다. 마크다운 내용이 있는 자료를 선택해 주세요.'); return;
    }
    setAiGenerating(true); setAiError('');
    try {
      const diffLabel = aiDifficulty === 'easy' ? '쉬운' : aiDifficulty === 'medium' ? '보통' : '어려운';
      const prompt = `다음 수업 자료를 바탕으로 4지선다형 퀴즈 문제를 ${aiCount}개 만들어주세요.
난이도: ${diffLabel}
수업 자료:
${selectedMaterial.content || '(내용 없음 — 주제: ' + selectedMaterial.title + ')'}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{
  "questions": [
    {
      "text": "문제 내용",
      "option_1": "선택지1",
      "option_2": "선택지2",
      "option_3": "선택지3",
      "option_4": "선택지4",
      "correct_answer": 0
    }
  ]
}
correct_answer는 0~3 중 하나입니다 (0=option_1이 정답).`;

      const result = await quizGeneratorAI.generateContent(prompt);
      const raw = result.response.text();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.questions || !Array.isArray(parsed.questions)) throw new Error('형식 오류');

      // DB에 문제 삽입
      const rows = parsed.questions.map((q: any, i: number) => ({
        quiz_set_id: selectedQuizSet.id,
        order_index: questions.length + i,
        text: q.text || '',
        option_1: q.option_1 || '',
        option_2: q.option_2 || '',
        option_3: q.option_3 || '',
        option_4: q.option_4 || '',
        correct_answer: q.correct_answer ?? 0,
        time_limit: 20,
      }));
      const { error } = await supabase.from('quiz_questions').insert(rows);
      if (error) throw error;

      await fetchQuestions(selectedQuizSet.id);
      setAiModalOpen(false);
      setSelectedMaterial(null);
    } catch (err: any) {
      setAiError(err.message || 'AI 문제 생성 중 오류가 발생했습니다.');
    } finally {
      setAiGenerating(false);
    }
  };

  // 퀴즈 세트 선택
  const handleSelectQuizSet = async (qs: QuizSet) => {
    setSelectedQuizSet(qs);
    _setQuizSetDropdownOpen(false);
    await fetchQuestions(qs.id);
    setView('questions');
  };

  // 퀴즈 세트 생성
  const handleCreateQuizSet = async () => {
    if (!newSetTitle.trim() || !selectedClass) return;
    setCreatingSet(true);
    const { data, error } = await supabase.from('quiz_sets').insert({
      teacher_id: user!.id,
      class_id: selectedClass.id,
      title: newSetTitle.trim(),
    }).select().single();
    if (!error && data) {
      setQuizSets(prev => [data, ...prev]);
      setSelectedQuizSet(data);
      setQuestions([]);
      setNewSetTitle('');
      setView('questions');
    }
    setCreatingSet(false);
  };

  // 퀴즈 세트 삭제
  const handleDeleteQuizSet = async (id: string, title: string) => {
    if (!window.confirm(`"${title}" 퀴즈 세트를 삭제할까요?\n포함된 모든 문제도 함께 삭제됩니다.`)) return;
    await supabase.from('quiz_questions').delete().eq('quiz_set_id', id);
    await supabase.from('quiz_sets').delete().eq('id', id);
    setQuizSets(prev => prev.filter(qs => qs.id !== id));
    if (selectedQuizSet?.id === id) {
      setSelectedQuizSet(null);
      setQuestions([]);
    }
  };

  // ── 문제 저장 ──────────────────────────────────────────────────────────────
  const handleSaveQuestion = async () => {
    if (!editingQuestion || !selectedQuizSet) return;
    const { text, option_1, option_2, option_3, option_4 } = editingQuestion;
    if (!text?.trim() || !option_1?.trim() || !option_2?.trim() ||
        !option_3?.trim() || !option_4?.trim()) return;

    setSavingQuestion(true);
    if (editingQuestion.id) {
      // 수정
      const { error } = await supabase
        .from('quiz_questions')
        .update({
          text: editingQuestion.text,
          option_1: editingQuestion.option_1,
          option_2: editingQuestion.option_2,
          option_3: editingQuestion.option_3,
          option_4: editingQuestion.option_4,
          correct_answer: editingQuestion.correct_answer ?? 0,
          time_limit: editingQuestion.time_limit ?? 20,
          explanation: editingQuestion.explanation?.trim() || null,
        })
        .eq('id', editingQuestion.id);
      if (!error) await fetchQuestions(selectedQuizSet.id);
    } else {
      // 추가
      const { error } = await supabase.from('quiz_questions').insert({
        quiz_set_id: selectedQuizSet.id,
        order_index: questions.length,
        text: editingQuestion.text,
        option_1: editingQuestion.option_1,
        option_2: editingQuestion.option_2,
        option_3: editingQuestion.option_3,
        option_4: editingQuestion.option_4,
        correct_answer: editingQuestion.correct_answer ?? 0,
        time_limit: editingQuestion.time_limit ?? 20,
        explanation: editingQuestion.explanation?.trim() || null,
      });
      if (!error) await fetchQuestions(selectedQuizSet.id);
    }
    setSavingQuestion(false);
    setEditingQuestion(null);
    setShowQuestionForm(false);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!selectedQuizSet) return;
    await supabase.from('quiz_questions').delete().eq('id', id);
    await fetchQuestions(selectedQuizSet.id);
  };

  // ── 게임 시작 ──────────────────────────────────────────────────────────────
  const handleStartGame = async () => {
    if (!selectedQuizSet || questions.length === 0) return;
    setLoading(true);

    // 서버-기기 시간 오프셋 조회 (실패해도 0으로 폴백되어 진행에 영향 없음)
    offsetMsRef.current = await getServerTimeOffsetMs();

    // 기존 활성 세션 종료
    await supabase
      .from('quiz_sessions')
      .update({ state: 'FINAL' })
      .eq('quiz_set_id', selectedQuizSet.id)
      .neq('state', 'FINAL');

    const pin = generatePin();
    const { data, error } = await supabase
      .from('quiz_sessions')
      .insert({
        quiz_set_id: selectedQuizSet.id,
        teacher_id: user!.id,
        class_id: resolveClassId(selectedClass),
        pin_code: pin,
        state: 'LOBBY',
        current_question_index: 0,
        max_timer: questions[0]?.time_limit ?? 20,
      })
      .select()
      .single();

    if (!error && data) {
      setSession(data);
      setParticipants([]);
      setAnswers([]);
      setView('game');
      subscribeToSession(data.id);
    }
    setLoading(false);
  };

  // ── Realtime 구독 ──────────────────────────────────────────────────────────
  const subscribeToSession = useCallback((sessionId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`quiz-teacher-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quiz_participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setParticipants(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev;
            return [...prev, payload.new as Participant];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setParticipants(prev =>
            prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p)
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quiz_answers', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setAnswers(prev => {
            if (prev.find(a => a.id === payload.new.id)) return prev;
            return [...prev, payload.new as Answer];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;
  }, []);

  // 참가자 목록을 DB에서 직접 재조회 (Realtime 유실 대비 폴백/최종 기록용)
  const fetchParticipantsFresh = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('quiz_participants')
      .select('id, student_name, score, joined_at')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true });
    if (data) setParticipants(data as Participant[]);
    return (data as Participant[] | null) ?? null;
  }, []);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Realtime 유실 대비 폴백 폴링 — postgres_changes는 웹소켓이 잠깐 끊기면
  // 유실된 이벤트를 재전송하지 않으므로, 주기적으로 참가자 목록을 직접 재동기화한다.
  useEffect(() => {
    if (view !== 'game' || !session?.id) return;
    const sessionId = session.id;
    const t = setInterval(() => { fetchParticipantsFresh(sessionId); }, 4000);
    return () => clearInterval(t);
  }, [view, session?.id, fetchParticipantsFresh]);

  // 교사 화면 타이머 — 서버시간 기준 경과 시간을 매번 재계산(학생 화면과 동일 방식).
  // 기존에는 1초마다 단순히 숫자를 깎는 방식이라 교사 기기 시계가 다르거나 브라우저
  // 탭이 백그라운드로 밀려 setInterval이 지연되면 실제 경과 시간과 어긋날 수 있었음.
  useEffect(() => {
    if (!session || session.state !== 'QUIZ' || !session.question_started_at) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const sync = () => {
      const started = new Date(session.question_started_at!).getTime();
      const elapsed = Math.floor((serverNow() - started) / 1000);
      setTimer(Math.max(0, session.max_timer - elapsed));
    };

    sync();
    timerRef.current = setInterval(sync, 250);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [session?.state, session?.question_started_at, session?.max_timer]);

  // 최종 결과 도달 시 폭죽 + 효과음 + 누적 점수 저장
  useEffect(() => {
    if (session?.state !== 'FINAL' || participants.length === 0) return;

    setShowConfetti(true);
    playVictoryFanfare();
    const t = setTimeout(() => setShowConfetti(false), 5000);

    // 누적 점수 히스토리 저장 (중복 저장 방지)
    if (!savedHistoryRef.current) {
      savedHistoryRef.current = true;
      const sessionId = session.id;
      // 로컬 state는 Realtime 이벤트 유실로 일부 학생 점수가 어긋나 있을 수 있으므로
      // 기록 직전 DB에서 최신 점수를 다시 조회한 뒤 저장한다.
      (async () => {
        const fresh = (await fetchParticipantsFresh(sessionId)) ?? participants;
        const ranked = [...fresh].sort((a, b) => b.score - a.score);
        const rows = ranked.map((p, i) => ({
          class_id: resolveClassId(selectedClass),
          session_id: sessionId,
          quiz_set_title: selectedQuizSet?.title ?? '',
          student_name: p.student_name,
          rank: i + 1,
          score: p.score,
        }));
        const { error } = await supabase.from('quiz_score_history').insert(rows);
        if (error) console.warn('[QuizHistory] 저장 실패 (테이블 없음?):', error.message);
      })();
    }

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.state]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aiModalOpen) setAiModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aiModalOpen]);

  // ── 게임 제어 ──────────────────────────────────────────────────────────────
  const updateSessionState = async (
    state: GameState,
    questionIndex?: number,
    extraFields: Record<string, any> = {}
  ) => {
    if (!session) return;
    const update: any = {
      state,
      updated_at: new Date().toISOString(),
      ...extraFields,
    };
    if (questionIndex !== undefined) update.current_question_index = questionIndex;

    const { data } = await supabase
      .from('quiz_sessions')
      .update(update)
      .eq('id', session.id)
      .select()
      .single();

    if (data) setSession(data);
  };

  const handleQuizStart = async () => {
    const now = new Date(serverNow()).toISOString();
    const q = questions[session!.current_question_index];
    const timeLimit = q?.time_limit ?? 20;
    setAnswers([]);
    await updateSessionState('QUIZ', undefined, {
      max_timer: timeLimit,
      question_started_at: now,
    });
  };

  const handleShowResult = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await updateSessionState('RESULT');
  };

  const handleShowRanking = async () => {
    await updateSessionState('RANKING');
  };

  const handleNextQuestion = async () => {
    if (!session) return;
    const nextIdx = session.current_question_index + 1;
    if (nextIdx >= questions.length) {
      await updateSessionState('FINAL');
    } else {
      const now = new Date(serverNow()).toISOString();
      const q = questions[nextIdx];
      const timeLimit = q?.time_limit ?? 20;
      setAnswers([]);
      await updateSessionState('QUIZ', nextIdx, {
        max_timer: timeLimit,
        question_started_at: now,
      });
    }
  };

  const handleEndGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    // DB를 FINAL로 업데이트 → 학생들도 Realtime으로 종료 화면 전환
    if (session) {
      await supabase
        .from('quiz_sessions')
        .update({ state: 'FINAL', updated_at: new Date().toISOString() })
        .eq('id', session.id);
    }

    if (channelRef.current) supabase.removeChannel(channelRef.current);
    setSession(null);
    setParticipants([]);
    setAnswers([]);
    setView('questions');
  };

  // ── 유틸 ──────────────────────────────────────────────────────────────────
  const copyPin = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.pin_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const currentQuestion = session ? questions[session.current_question_index] : null;

  // 선택지별 통계
  const optionStats = currentQuestion
    ? [0, 1, 2, 3].map(idx => {
        const filtered = answers.filter(
          a => a.question_id === currentQuestion.id && a.selected_option === idx
        );
        return { count: filtered.length, isCorrect: idx === currentQuestion.correct_answer };
      })
    : [];

  // 순위 계산
  const rankedParticipants = [...participants].sort((a, b) => b.score - a.score);

  // ── 현재 문제 답변 필터
  const currentAnswers = answers.filter(a => a.question_id === currentQuestion?.id);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: SETUP VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'setup') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="glass rounded-2xl p-6 border border-white/40 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ClipboardCheck size={24} className="text-primary" />
            </div>
            <div>
              <h3 className="font-black text-on-surface text-lg">퀴즈 설정</h3>
              <p className="text-xs text-on-surface-variant">클래스를 선택하고 퀴즈를 시작하세요</p>
            </div>
          </div>

          {/* 클래스 드롭다운 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-on-surface-variant">클래스 선택</p>
            <div className="relative">
              <button
                onClick={() => setClassDropdownOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/40 bg-surface-container-low/50 text-sm font-bold hover:border-primary/30 transition-all"
              >
                {selectedClass ? (
                  <span className="flex items-center gap-2 text-on-surface">
                    <Users size={15} className="text-primary" />
                    {selectedClass.name}
                    <span className="text-[10px] font-normal text-on-surface-variant">
                      ({selectedClass.class_type === 'homeroom' ? '담임' : '과목'})
                    </span>
                  </span>
                ) : (
                  <span className="text-on-surface-variant">클래스를 선택하세요</span>
                )}
                <ChevronDown size={16} className={`transition-transform ${classDropdownOpen ? 'rotate-180' : ''} text-on-surface-variant`} />
              </button>
              <AnimatePresence>
                {classDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-white/40 z-50 overflow-hidden"
                  >
                    {classes.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-on-surface-variant">클래스가 없습니다</div>
                    ) : (
                      classes.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectClass(c)}
                          className="w-full text-left px-4 py-2.5 text-sm font-bold hover:bg-primary/5 transition-colors flex items-center gap-2"
                        >
                          <Users size={14} className="text-primary/60" />
                          {c.name}
                          <span className="ml-auto text-[10px] text-on-surface-variant/60 font-normal">
                            {c.class_type === 'homeroom' ? '담임' : '과목'}
                          </span>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 퀴즈 세트 선택 + 생성 */}
          <AnimatePresence>
            {selectedClass && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-on-surface-variant">퀴즈 세트 선택</p>
                  <button
                    onClick={() => handleToggleAllClasses(!showAllClasses)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all font-bold ${showAllClasses ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/30 bg-surface-container-low/40 text-on-surface-variant hover:border-primary/30'}`}
                  >
                    {showAllClasses ? '전체 클래스 보는 중' : '다른 클래스 퀴즈 보기'}
                  </button>
                </div>

                {/* 기존 세트 목록 */}
                {quizSets.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {quizSets.map(qs => {
                      const isOtherClass = showAllClasses && qs.class_id !== selectedClass?.id;
                      const otherClassName = isOtherClass ? classes.find(c => c.id === qs.class_id)?.name : null;
                      return (
                        <div
                          key={qs.id}
                          className="flex items-center rounded-xl border border-white/40 bg-surface-container-low/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                        >
                          <button
                            onClick={() => handleSelectQuizSet(qs)}
                            className="flex-1 flex items-center justify-between px-4 py-3 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <BookOpen size={15} className="text-primary/60 group-hover:text-primary transition-colors shrink-0" />
                              <span className="text-sm font-bold text-on-surface truncate">{qs.title}</span>
                              {otherClassName && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-bold shrink-0">{otherClassName}</span>
                              )}
                            </div>
                            <ChevronRight size={15} className="text-on-surface-variant/50 group-hover:text-primary transition-colors shrink-0" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteQuizSet(qs.id, qs.title); }}
                            className="p-2.5 mr-1 text-on-surface-variant/30 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                            title="퀴즈 세트 삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 새 세트 만들기 */}
                <div className="flex gap-2">
                  <input
                    value={newSetTitle}
                    onChange={e => setNewSetTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateQuizSet(); }}
                    placeholder="새 퀴즈 세트 이름..."
                    className="flex-1 px-3 py-2.5 rounded-xl border border-white/40 bg-surface-container-low/50 text-sm font-bold focus:outline-none focus:border-primary/40 transition-all"
                  />
                  <button
                    onClick={handleCreateQuizSet}
                    disabled={!newSetTitle.trim() || creatingSet}
                    className="px-4 py-2.5 btn-vibrant rounded-xl text-sm font-black flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={15} strokeWidth={3} />
                    생성
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: QUESTIONS VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'questions') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-on-surface text-xl gradient-text">{selectedQuizSet?.title}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {selectedClass?.name} · 문제 {questions.length}개
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('setup')}
              className="px-3 py-2 rounded-xl border border-white/40 text-xs font-bold hover:border-primary/30 transition-all"
            >
              세트 변경
            </button>
            {/* AI 문제 생성 버튼 */}
            {classMaterials.length > 0 ? (
              <button
                onClick={() => { setAiModalOpen(true); setAiError(''); setSelectedMaterial(null); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-xs font-black transition-all"
              >
                ✨ AI 문제 생성
              </button>
            ) : (
              <div className="group relative">
                <button
                  disabled
                  className="flex items-center gap-1.5 px-3 py-2 bg-surface-container text-on-surface-variant/40 rounded-xl text-xs font-black cursor-not-allowed"
                >
                  ✨ AI 문제 생성
                </button>
                <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl p-3 shadow-xl z-50 hidden group-hover:block">
                  <p className="font-black mb-1">📚 수업 자료가 필요합니다</p>
                  <p className="text-white/70">수업 자료 에디터에서 이 클래스의 자료를 작성하고 <span className="text-violet-300 font-bold">공개</span>로 설정하면 AI 문제 생성이 활성화됩니다.</p>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setShowQuestionForm(true);
                setEditingQuestion({
                  text: '', option_1: '', option_2: '', option_3: '', option_4: '',
                  correct_answer: 0, time_limit: 20, explanation: '',
                });
              }}
              className="flex items-center gap-1.5 px-3 py-2 btn-vibrant rounded-xl text-xs font-black"
            >
              <Plus size={14} strokeWidth={3} />
              문제 추가
            </button>
          </div>
        </div>

        {/* AI 문제 생성 모달 */}
        {aiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAiModalOpen(false)}>
            <div className="bg-white rounded-3xl p-6 shadow-2xl w-96 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-base">✨ 수업 자료로 AI 문제 생성</h3>
                <button onClick={() => setAiModalOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* 자료 선택 */}
              <div className="space-y-2">
                <p className="text-xs font-black text-on-surface-variant">수업 자료 선택</p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {classMaterials.map(mat => (
                    <button
                      key={mat.id}
                      onClick={() => setSelectedMaterial(mat)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedMaterial?.id === mat.id
                          ? 'border-violet-400 bg-violet-50'
                          : 'border-surface-container hover:border-violet-200'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        selectedMaterial?.id === mat.id ? 'bg-violet-500 text-white' : 'bg-surface-container text-on-surface-variant'
                      }`}>
                        {mat.week_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{mat.title}</p>
                        {!mat.content && <p className="text-[10px] text-amber-500 font-bold">내용 없음 (링크만)</p>}
                      </div>
                      {selectedMaterial?.id === mat.id && <Check size={14} className="text-violet-500 shrink-0" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 문제 수 + 난이도 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-on-surface-variant">문제 수</p>
                  <select
                    value={aiCount}
                    onChange={e => setAiCount(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-container rounded-xl text-sm font-bold focus:outline-none"
                  >
                    {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n}문제</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-on-surface-variant">난이도</p>
                  <div className="flex gap-1">
                    {(['easy', 'medium', 'hard'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setAiDifficulty(d)}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                          aiDifficulty === d
                            ? d === 'easy' ? 'bg-emerald-500 text-white' : d === 'medium' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-low'
                        }`}
                      >
                        {d === 'easy' ? '쉬움' : d === 'medium' ? '보통' : '어려움'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {aiError && (
                <p className="text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-xl">{aiError}</p>
              )}

              <button
                onClick={handleAiGenerate}
                disabled={!selectedMaterial || aiGenerating}
                className="w-full py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {aiGenerating ? (
                  <><RefreshCw size={15} className="animate-spin" /> 문제 생성 중...</>
                ) : (
                  <>✨ {aiCount}문제 생성하기</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 문제 목록 */}
        <div className="space-y-3">
          <AnimatePresence>
            {questions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-2xl p-4 border border-white/40 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-sm font-bold text-on-surface leading-relaxed">{q.text}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="flex items-center gap-1 text-[10px] text-on-surface-variant bg-surface-container-low/50 px-2 py-1 rounded-lg">
                      <Clock size={10} />
                      {q.time_limit}초
                    </span>
                    <button
                      onClick={() => { setEditingQuestion({ ...q }); setShowQuestionForm(true); }}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[q.option_1, q.option_2, q.option_3, q.option_4].map((opt, idx) => {
                    const isCorrect = idx === q.correct_answer;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border-2 ${
                          isCorrect
                            ? 'bg-green-500 border-green-600 text-white shadow-md shadow-green-200'
                            : `${OPTION_LIGHT_COLORS[idx]} opacity-60`
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 ${
                          isCorrect ? 'bg-white/30 text-white' : `text-white ${OPTION_COLORS[idx]}`
                        }`}>
                          {isCorrect ? <Check size={11} strokeWidth={3} /> : OPTION_LABELS[idx]}
                        </span>
                        <span className="flex-1 break-words leading-snug">{opt}</span>
                        {isCorrect && (
                          <span className="shrink-0 text-[10px] font-black bg-white/25 text-white px-1.5 py-0.5 rounded-md mt-0.5">
                            정답
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {questions.length === 0 && (
            <div className="glass rounded-2xl p-10 border border-white/40 text-center">
              <ListChecks size={40} className="text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-on-surface-variant">문제를 추가해주세요</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">위의 "문제 추가" 버튼을 클릭하세요</p>
            </div>
          )}
        </div>

        {/* 게임 시작 버튼 */}
        <button
          onClick={handleStartGame}
          disabled={questions.length === 0 || loading}
          className="w-full py-4 rounded-2xl font-black text-base btn-gradient flex items-center justify-center gap-3"
        >
          {loading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}>
              <RefreshCw size={20} />
            </motion.div>
          ) : (
            <Play size={22} fill="white" />
          )}
          퀴즈 시작!
        </button>

        {/* 문제 편집 모달 */}
        <AnimatePresence>
          {showQuestionForm && editingQuestion && (
            <QuestionFormModal
              question={editingQuestion}
              onChange={setEditingQuestion}
              onSave={handleSaveQuestion}
              onClose={() => { setShowQuestionForm(false); setEditingQuestion(null); }}
              saving={savingQuestion}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: GAME VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'game' && session) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        {/* 게임 헤더 */}
        <div className="glass rounded-2xl p-4 border border-white/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardCheck size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">퀴즈 진행 중</p>
              <h3 className="font-black text-on-surface">{selectedQuizSet?.title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 연결 상태 */}
            <span className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-bold">
              <Wifi size={12} />
              실시간 연결
            </span>
            {/* 참가자 수 */}
            <span className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
              <Users size={12} />
              {participants.length}명 참여 중
            </span>
            <button
              onClick={handleEndGame}
              className="px-3 py-1.5 rounded-xl border border-white/40 text-xs font-bold hover:border-error/40 hover:text-error transition-all"
            >
              게임 종료
            </button>
          </div>
        </div>

        {/* ── LOBBY ── */}
        {session.state === 'LOBBY' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* PIN 코드 */}
            <div className="glass rounded-3xl p-8 border border-white/40 text-center space-y-4">
              <p className="text-sm font-bold text-on-surface-variant">학생들에게 이 PIN을 알려주세요</p>
              <div className="flex items-center justify-center gap-4">
                <div className="text-6xl font-black tracking-widest gradient-text">
                  {session.pin_code}
                </div>
                <button onClick={copyPin} className="p-2 rounded-xl hover:bg-primary/10 transition-all text-primary">
                  {copied ? <CheckCheck size={20} className="text-green-500" /> : <Copy size={20} />}
                </button>
              </div>
              <p className="text-xs text-on-surface-variant">
                접속 주소: <strong className="text-primary">{window.location.origin}/quiz/{session.pin_code}</strong>
              </p>
            </div>

            {/* 대기 중인 학생 */}
            <div className="glass rounded-2xl p-5 border border-white/40 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-primary" />
                <h4 className="font-black text-on-surface">참여 학생</h4>
                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {participants.length}명
                </span>
              </div>
              {participants.length === 0 ? (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-3xl mb-2"
                  >
                    👋
                  </motion.div>
                  <p className="text-sm text-on-surface-variant">학생들이 PIN으로 접속하면 여기에 표시됩니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-40 overflow-y-auto">
                  <AnimatePresence>
                    {participants.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center justify-center px-2 py-1.5 bg-primary/5 border border-primary/20 rounded-xl text-xs font-bold text-primary truncate"
                      >
                        {p.student_name}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* 시작 버튼 */}
            <button
              onClick={handleQuizStart}
              disabled={participants.length === 0}
              className="w-full py-5 rounded-2xl font-black text-lg btn-gradient flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={26} fill="white" />
              퀴즈 시작! ({questions.length}문제)
            </button>
          </motion.div>
        )}

        {/* ── QUIZ ── */}
        {session.state === 'QUIZ' && currentQuestion && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* 진행 상태 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface-variant">
                  {session.current_question_index + 1} / {questions.length}번 문제
                </span>
                <div className="h-1.5 w-32 bg-surface-container-high rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${((session.current_question_index + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-on-surface-variant">응답</span>
                <span className="font-black text-primary">{currentAnswers.length}</span>
                <span className="text-on-surface-variant">/ {participants.length}명</span>
              </div>
            </div>

            {/* 타이머 + 문제 */}
            <div className="glass rounded-3xl p-6 border border-white/40 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-on-surface text-lg leading-tight flex-1 pr-4">
                  {currentQuestion.text}
                </h4>
                <div className="shrink-0 w-16 h-16 rounded-2xl bg-primary/10 flex flex-col items-center justify-center border border-primary/20">
                  <span className={`text-2xl font-black ${timer <= 5 ? 'text-red-500' : 'text-primary'}`}>
                    {timer}
                  </span>
                  <span className="text-[9px] text-on-surface-variant">초</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[currentQuestion.option_1, currentQuestion.option_2, currentQuestion.option_3, currentQuestion.option_4].map((opt, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 px-3 py-3 rounded-xl border border-white/40 bg-surface-container-low/50"
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0 mt-0.5 ${OPTION_COLORS[idx]}`}>
                      {OPTION_LABELS[idx]}
                    </span>
                    <span className="text-sm font-bold text-on-surface flex-1 break-words leading-snug">{opt}</span>
                    {/* 실시간 답변 수 */}
                    <span className="text-xs text-on-surface-variant font-bold shrink-0 mt-0.5">
                      {currentAnswers.filter(a => a.selected_option === idx).length}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleShowResult}
              className="w-full py-4 rounded-2xl font-black text-base btn-vibrant flex items-center justify-center gap-3"
            >
              <BarChart2 size={20} />
              결과 확인
            </button>
          </motion.div>
        )}

        {/* ── RESULT ── */}
        {session.state === 'RESULT' && currentQuestion && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="glass rounded-3xl p-6 border border-white/40 space-y-4">
              <h4 className="font-black text-on-surface text-lg">{currentQuestion.text}</h4>

              <div className="space-y-3">
                {[currentQuestion.option_1, currentQuestion.option_2, currentQuestion.option_3, currentQuestion.option_4].map((opt, idx) => {
                  const count = optionStats[idx]?.count ?? 0;
                  const total = Math.max(participants.length, 1);
                  const pct = Math.round((count / total) * 100);
                  const isCorrect = idx === currentQuestion.correct_answer;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0, scale: isCorrect ? 1.02 : 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`relative overflow-hidden rounded-xl border-2 p-3 transition-all ${
                        isCorrect
                          ? 'bg-green-500 border-green-600 shadow-lg shadow-green-200'
                          : `${OPTION_LIGHT_COLORS[idx]} opacity-50`
                      }`}
                    >
                      {/* 바 */}
                      {!isCorrect && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: idx * 0.1 + 0.2, ease: 'easeOut' }}
                          className={`absolute inset-y-0 left-0 opacity-20 ${OPTION_COLORS[idx]}`}
                        />
                      )}
                      <div className="relative flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                          isCorrect ? 'bg-white/30 text-white' : `text-white ${OPTION_COLORS[idx]}`
                        }`}>
                          {OPTION_LABELS[idx]}
                        </span>
                        <span className={`text-sm font-black flex-1 break-words leading-snug ${isCorrect ? 'text-white' : ''}`}>{opt}</span>
                        {isCorrect ? (
                          <span className="flex items-center gap-1 bg-white/25 text-white text-xs font-black px-2.5 py-1 rounded-full shrink-0">
                            <Check size={13} strokeWidth={3} />
                            정답
                          </span>
                        ) : (
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black">{count}명</span>
                            <span className="text-xs ml-1 opacity-70">({pct}%)</span>
                          </div>
                        )}
                      </div>
                      {/* 정답 선택 인원 수 — 정답 행에서도 표시 */}
                      {isCorrect && (
                        <div className="relative mt-1.5 text-right text-white/70 text-xs font-bold">
                          {count}명 정답 ({pct}%)
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* 해설 */}
              {currentQuestion.explanation && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4"
                >
                  <span className="text-amber-500 text-lg shrink-0">💡</span>
                  <p className="text-sm font-bold text-amber-800 leading-relaxed">{currentQuestion.explanation}</p>
                </motion.div>
              )}
            </div>

            <button
              onClick={handleShowRanking}
              className="w-full py-4 rounded-2xl font-black text-base btn-vibrant flex items-center justify-center gap-3"
            >
              <Crown size={20} />
              순위 보기
            </button>
          </motion.div>
        )}

        {/* ── RANKING ── */}
        {session.state === 'RANKING' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="glass rounded-3xl p-6 border border-white/40 space-y-3">
              <h4 className="font-black text-on-surface text-lg flex items-center gap-2">
                <Trophy size={20} className="text-amber-500" />
                {session.current_question_index + 1 >= questions.length ? '최종 순위' : '현재 순위'}
              </h4>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {rankedParticipants.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                      i === 0 ? 'bg-amber-50 border-amber-200' :
                      i === 1 ? 'bg-slate-50 border-slate-200' :
                      i === 2 ? 'bg-orange-50 border-orange-200' :
                      'bg-surface-container-low/50 border-white/40'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black ${
                      i === 0 ? 'bg-amber-400 text-white' :
                      i === 1 ? 'bg-slate-400 text-white' :
                      i === 2 ? 'bg-orange-400 text-white' :
                      'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="font-black text-on-surface flex-1">{p.student_name}</span>
                    <div className="flex items-center gap-1 text-primary font-black">
                      <Zap size={14} />
                      <span>{p.score.toLocaleString()}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <button
              onClick={handleNextQuestion}
              className="w-full py-4 rounded-2xl font-black text-base btn-gradient flex items-center justify-center gap-3"
            >
              {session.current_question_index + 1 >= questions.length ? (
                <><Trophy size={20} />최종 결과 보기</>
              ) : (
                <><ArrowRight size={20} />다음 문제로</>
              )}
            </button>
          </motion.div>
        )}

        {/* ── FINAL ── */}
        {session.state === 'FINAL' && (
          <>
            {showConfetti && <ConfettiEffect intensity="heavy" duration={5000} />}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="glass rounded-3xl p-6 border border-white/40 text-center space-y-5">
                <motion.div
                  animate={{ rotate: [0, -15, 15, -10, 10, 0], scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="text-7xl"
                >
                  🏆
                </motion.div>
                <h3 className="text-2xl font-black gradient-text">퀴즈 완료!</h3>
                <p className="text-sm text-on-surface-variant">총 {participants.length}명 참여</p>

                {/* 포디엄 TOP 3 */}
                {rankedParticipants.length >= 1 && (
                  <div className="flex items-end justify-center gap-3 pt-2">
                    {/* 2위 */}
                    {rankedParticipants[1] && (
                      <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="flex flex-col items-center gap-1 flex-1"
                      >
                        <div className="text-3xl">🥈</div>
                        <div className="w-full bg-slate-100 border-2 border-slate-300 rounded-t-2xl pt-3 pb-2 px-2 min-h-16 flex flex-col items-center justify-end">
                          <p className="font-black text-on-surface text-sm text-center truncate w-full">{rankedParticipants[1].student_name}</p>
                          <p className="text-xs text-slate-500 font-bold mt-0.5">{rankedParticipants[1].score.toLocaleString()}점</p>
                        </div>
                      </motion.div>
                    )}
                    {/* 1위 */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-col items-center gap-1 flex-1"
                    >
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="text-4xl"
                      >
                        👑
                      </motion.div>
                      <div className="w-full bg-gradient-to-b from-amber-50 to-yellow-100 border-2 border-amber-400 rounded-t-2xl pt-4 pb-2 px-2 min-h-24 flex flex-col items-center justify-end shadow-lg shadow-amber-200">
                        <p className="font-black text-on-surface text-base text-center truncate w-full">{rankedParticipants[0].student_name}</p>
                        <p className="text-sm font-black text-amber-600 mt-0.5">{rankedParticipants[0].score.toLocaleString()}점</p>
                      </div>
                    </motion.div>
                    {/* 3위 */}
                    {rankedParticipants[2] && (
                      <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.0 }}
                        className="flex flex-col items-center gap-1 flex-1"
                      >
                        <div className="text-3xl">🥉</div>
                        <div className="w-full bg-orange-50 border-2 border-orange-300 rounded-t-2xl pt-3 pb-2 px-2 min-h-12 flex flex-col items-center justify-end">
                          <p className="font-black text-on-surface text-sm text-center truncate w-full">{rankedParticipants[2].student_name}</p>
                          <p className="text-xs text-orange-500 font-bold mt-0.5">{rankedParticipants[2].score.toLocaleString()}점</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* 4위 이하 */}
                {rankedParticipants.length > 3 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto text-left mt-2">
                    {rankedParticipants.slice(3).map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-xl bg-surface-container-low/50 border border-white/30">
                        <span className="text-xs font-black text-on-surface-variant w-5 text-center">{i + 4}</span>
                        <span className="font-bold text-on-surface flex-1 text-sm">{p.student_name}</span>
                        <span className="text-xs font-black text-on-surface-variant">{p.score.toLocaleString()}점</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleEndGame}
                className="w-full py-4 rounded-2xl font-black text-base btn-vibrant flex items-center justify-center gap-3"
              >
                <RefreshCw size={18} />
                문제 관리로 돌아가기
              </button>
            </motion.div>
          </>
        )}
      </div>
    );
  }

  return null;
};

// ─── Question Form Modal ───────────────────────────────────────────────────────
interface QFMProps {
  question: Partial<Question>;
  onChange: (q: Partial<Question>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

const QuestionFormModal = ({ question, onChange, onSave, onClose, saving }: QFMProps) => {
  const TIMER_OPTIONS = [10, 15, 20, 30];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-white/60 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-high">
          <h3 className="font-black text-on-surface">
            {question.id ? '문제 수정' : '문제 추가'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container transition-all text-on-surface-variant">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 문제 내용 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-on-surface-variant">문제 내용</label>
            <textarea
              value={question.text ?? ''}
              onChange={e => onChange({ ...question, text: e.target.value })}
              placeholder="문제를 입력하세요..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-container-high bg-surface-container-low/30 text-sm font-bold focus:outline-none focus:border-primary/40 transition-all resize-none"
            />
          </div>

          {/* 선택지 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant">선택지 (정답 클릭으로 지정)</label>
            {(['option_1', 'option_2', 'option_3', 'option_4'] as const).map((key, idx) => {
              const isCorrect = question.correct_answer === idx;
              return (
                <div
                  key={idx}
                  onClick={() => onChange({ ...question, correct_answer: idx })}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isCorrect ? 'border-green-400 bg-green-50' : 'border-surface-container-high bg-surface-container-low/30 hover:border-primary/30'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0 ${OPTION_COLORS[idx]}`}>
                    {OPTION_LABELS[idx]}
                  </span>
                  <input
                    value={(question as any)[key] ?? ''}
                    onChange={e => {
                      e.stopPropagation();
                      onChange({ ...question, [key]: e.target.value });
                    }}
                    onClick={e => e.stopPropagation()}
                    placeholder={`선택지 ${OPTION_LABELS[idx]}`}
                    className="flex-1 bg-transparent text-sm font-bold focus:outline-none"
                  />
                  {isCorrect && (
                    <Check size={16} strokeWidth={3} className="text-green-600 shrink-0" />
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-on-surface-variant">선택지 행을 클릭하면 정답으로 지정됩니다</p>
          </div>

          {/* 타이머 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant">제한 시간</label>
            <div className="flex gap-2">
              {TIMER_OPTIONS.map(t => (
                <button
                  key={t}
                  onClick={() => onChange({ ...question, time_limit: t })}
                  className={`flex-1 py-2 rounded-xl text-sm font-black border transition-all ${
                    question.time_limit === t
                      ? 'bg-primary text-white border-primary'
                      : 'border-surface-container-high text-on-surface-variant hover:border-primary/30'
                  }`}
                >
                  {t}초
                </button>
              ))}
            </div>
          </div>

          {/* 해설 (선택) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-on-surface-variant">
              해설 <span className="font-normal text-on-surface-variant/60">(선택 — 결과 화면에 자동 표시)</span>
            </label>
            <textarea
              value={question.explanation ?? ''}
              onChange={e => onChange({ ...question, explanation: e.target.value })}
              placeholder="이 문제의 정답 이유나 핵심 내용을 입력하세요..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-container-high bg-amber-50/50 text-sm font-bold focus:outline-none focus:border-amber-400/60 transition-all resize-none placeholder:font-normal placeholder:text-on-surface-variant/50"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-surface-container-high">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-surface-container-high text-sm font-black text-on-surface-variant hover:border-on-surface-variant/40 transition-all"
          >
            취소
          </button>
          <button
            onClick={onSave}
            disabled={saving || !question.text?.trim()}
            className="flex-1 py-2.5 rounded-xl btn-vibrant text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {saving ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}>
                <RefreshCw size={15} />
              </motion.div>
            ) : (
              <Check size={15} strokeWidth={3} />
            )}
            저장
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

export default QuizGame;
