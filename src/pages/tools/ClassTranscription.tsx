import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { transcriptionAI } from '../../lib/gemini';
import {
  Mic, Square, Loader2, ChevronDown, ChevronUp,
  Check, Users, BarChart3, MessageSquare, AlertCircle,
  Plus, Sparkles, RefreshCw, Zap,
  History, Trash2, Clock, WifiOff, Save, X, KeyRound, Settings,
  GraduationCap, Target, Pause, Play,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type RecordingStatus = 'idle' | 'recording' | 'paused' | 'transcribed' | 'processing' | 'complete' | 'error';
type ResultTab = 'students' | 'evaluation' | 'selfeval';
type MainTab = 'record' | 'history';

interface StudentObservation {
  name: string;
  participation: '적극적' | '보통' | '소극적';
  mentions: string[];
  summary: string;
  needsAttention: boolean;
  saved?: boolean;
}

interface ClassEvaluation {
  structure: number;
  clarity: number;
  engagement: number;
  feedback: number;
  timeManagement: number;
  strengths: string;
  improvements: string;
  nextClassTip: string;
}

interface TeacherSelfEvalPatterns {
  speechDensity: '빠름' | '보통' | '느림';
  questionStyle: '닫힌 질문 위주' | '균형적' | '열린 질문 위주';
  repeatPhrases: string[];
}

interface TeacherSelfEval {
  goalAchievement: number;
  goalAchievementDetail: string;
  coreConceptCoverage: number;
  coreConceptDetail: string;
  questioningSkills: number;
  strengths: string[];
  improvements: string[];
  nextActionItem: string;
  patterns: TeacherSelfEvalPatterns;
}

interface AnalysisResult {
  studentObservations: StudentObservation[];
  notMentioned: string[];
  classEvaluation: ClassEvaluation;
  teacherSelfEval?: TeacherSelfEval;
  lessonGoal?: string;
  lessonKeywords?: string;
}

interface PastSessionRow {
  id: string;
  class_name: string | null;
  subject: string | null;
  transcript_text: string;
  analysis_result: AnalysisResult | null;
  duration_seconds: number;
  recorded_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVAL_ITEMS: { key: keyof ClassEvaluation; label: string }[] = [
  { key: 'structure',      label: '수업 구성' },
  { key: 'clarity',        label: '설명 명확성' },
  { key: 'engagement',     label: '학생 참여 유도' },
  { key: 'feedback',       label: '피드백 품질' },
  { key: 'timeManagement', label: '시간 관리' },
];

const PARTICIPATION_STYLE: Record<string, string> = {
  '적극적': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '보통':   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '소극적': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const SPEECH_DENSITY_STYLE: Record<string, string> = {
  '빠름': 'bg-orange-100 text-orange-700',
  '보통': 'bg-blue-100 text-blue-700',
  '느림': 'bg-teal-100 text-teal-700',
};

const QUESTION_STYLE_COLOR: Record<string, string> = {
  '닫힌 질문 위주': 'bg-amber-100 text-amber-700',
  '균형적':        'bg-green-100 text-green-700',
  '열린 질문 위주': 'bg-violet-100 text-violet-700',
};

const GROQ_CHUNK_MS   = 10000;
const GROQ_PROMPT_CTX = 224;
const GROQ_API_URL    = 'https://api.groq.com/openai/v1/audio/transcriptions';

// ── Radar Chart ───────────────────────────────────────────────────────────────

interface RadarItem { label: string; value: number; }

const RadarChart = ({ items, size = 260 }: { items: RadarItem[]; size?: number }) => {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.33;
  const lr = size * 0.46;
  const n  = items.length;

  const toXY = (i: number, scale: number) => {
    const a = (i * 2 * Math.PI / n) - Math.PI / 2;
    return { x: cx + r * scale * Math.cos(a), y: cy + r * scale * Math.sin(a) };
  };
  const labelXY = (i: number) => {
    const a = (i * 2 * Math.PI / n) - Math.PI / 2;
    return { x: cx + lr * Math.cos(a), y: cy + lr * Math.sin(a) };
  };
  const gridPts = (s: number) =>
    Array.from({ length: n }, (_, i) => toXY(i, s))
      .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dataPts = items
    .map((d, i) => toXY(i, Math.max(d.value, 0.15) / 5))
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dotColor = (v: number) => v >= 4 ? '#22c55e' : v >= 3 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {[0.2, 0.4, 0.6, 0.8, 1.0].map(s => (
        <polygon key={s} points={gridPts(s)} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {items.map((_, i) => {
        const e = toXY(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={e.x.toFixed(1)} y2={e.y.toFixed(1)} stroke="#e2e8f0" strokeWidth={1} />;
      })}
      <polygon points={dataPts} fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth={2} strokeLinejoin="round" />
      {items.map((d, i) => {
        const p = toXY(i, Math.max(d.value, 0.15) / 5);
        return <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={5} fill={dotColor(d.value)} stroke="white" strokeWidth={1.5} />;
      })}
      {items.map((d, i) => {
        const lp = labelXY(i);
        return (
          <g key={i}>
            <text x={lp.x.toFixed(1)} y={(lp.y - 5).toFixed(1)} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="bold" fill="#64748b">{d.label}</text>
            <text x={lp.x.toFixed(1)} y={(lp.y + 7).toFixed(1)} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight="bold" fill={dotColor(d.value)}>{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Score Bar ─────────────────────────────────────────────────────────────────

const ScoreBar = ({ label, score }: { label: string; score: number }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-on-surface-variant">{label}</span>
      <span className="text-xs font-black text-primary">{score} / 5</span>
    </div>
    <div className="h-2 bg-surface-container rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${(score / 5) * 100}%` }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
        className={`h-full rounded-full ${
          score >= 4 ? 'bg-primary' : score >= 3 ? 'bg-amber-400' : 'bg-red-400'
        }`}
      />
    </div>
  </div>
);

// ── SelfEval Tab ──────────────────────────────────────────────────────────────

const SelfEvalTab = ({
  selfEval,
  classEval,
  lessonGoal,
  lessonKeywords,
}: {
  selfEval: TeacherSelfEval;
  classEval: ClassEvaluation;
  lessonGoal?: string;
  lessonKeywords?: string;
}) => {
  const radarItems: RadarItem[] = [
    { label: '수업 구성',   value: classEval.structure },
    { label: '설명 명확성', value: classEval.clarity },
    { label: '참여 유도',   value: classEval.engagement },
    { label: '피드백',      value: classEval.feedback },
    { label: '시간 관리',   value: classEval.timeManagement },
    { label: '목표 달성',   value: selfEval.goalAchievement },
    { label: '개념 전달',   value: selfEval.coreConceptCoverage },
    { label: '질문 기술',   value: selfEval.questioningSkills },
  ];

  const overallSelf = ((selfEval.goalAchievement + selfEval.coreConceptCoverage + selfEval.questioningSkills) / 3).toFixed(1);
  const dotColor = (v: number) => v >= 4 ? 'text-green-600' : v >= 3 ? 'text-amber-500' : 'text-red-500';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

      {/* 수업 목표 달성도 */}
      <div className="surface-card p-6 shadow-ambient space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black flex items-center gap-2">
            <Target size={18} className="text-violet-500" />
            수업 목표 달성도
          </h3>
          <span className={`text-2xl font-black ${dotColor(selfEval.goalAchievement)}`}>
            {selfEval.goalAchievement} <span className="text-sm font-bold text-on-surface-variant">/ 5</span>
          </span>
        </div>

        {/* 진행 바 */}
        <div className="space-y-1.5">
          <div className="h-3 bg-surface-container rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(selfEval.goalAchievement / 5) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${selfEval.goalAchievement >= 4 ? 'bg-green-500' : selfEval.goalAchievement >= 3 ? 'bg-amber-400' : 'bg-red-400'}`}
            />
          </div>
        </div>

        {lessonGoal && (
          <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
            <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-1">설정한 수업 목표</p>
            <p className="text-sm text-violet-800 leading-relaxed">{lessonGoal}</p>
            {lessonKeywords && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {lessonKeywords.split(',').map(kw => kw.trim()).filter(Boolean).map(kw => (
                  <span key={kw} className="text-[11px] px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-bold">{kw}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-on-surface-variant leading-relaxed">{selfEval.goalAchievementDetail}</p>
      </div>

      {/* 레이더 차트 + 3개 핵심 지표 */}
      <div className="surface-card p-6 shadow-ambient">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black flex items-center gap-2">
            <GraduationCap size={18} className="text-violet-500" />
            8개 항목 종합 분석
          </h3>
          <div className="text-right">
            <p className="text-[10px] text-on-surface-variant uppercase font-bold">자기평가 평균</p>
            <p className="text-2xl font-black text-violet-600 leading-none">
              {overallSelf}
              <span className="text-sm font-bold text-on-surface-variant"> / 5.0</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="shrink-0">
            <RadarChart items={radarItems} size={240} />
          </div>
          <div className="flex-1 space-y-3 w-full">
            {/* 3개 자기평가 항목 점수 바 */}
            <ScoreBar label="목표 달성도" score={selfEval.goalAchievement} />
            <ScoreBar label="핵심 개념 전달도" score={selfEval.coreConceptCoverage} />
            <ScoreBar label="질문 기술" score={selfEval.questioningSkills} />
            <div className="pt-1">
              <p className="text-xs text-on-surface-variant leading-relaxed">{selfEval.coreConceptDetail}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 강점 / 개선점 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="surface-card p-5 shadow-ambient space-y-3">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">오늘의 강점 3가지</p>
          <ul className="space-y-2">
            {selfEval.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-600 text-[10px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                <p className="text-sm text-on-surface leading-relaxed">{s}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="surface-card p-5 shadow-ambient space-y-3">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">개선하면 좋을 점 3가지</p>
          <ul className="space-y-2">
            {selfEval.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                <p className="text-sm text-on-surface leading-relaxed">{s}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 다음 수업 실행 과제 */}
      <div className="p-5 bg-violet-50 rounded-2xl border border-violet-100">
        <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-2">다음 수업 실행 과제</p>
        <p className="text-sm text-violet-900 leading-relaxed font-medium">{selfEval.nextActionItem}</p>
      </div>

      {/* 교수 패턴 분석 */}
      <div className="surface-card p-5 shadow-ambient space-y-4">
        <h4 className="text-sm font-black text-on-surface">교수 패턴 분석</h4>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-on-surface-variant">발언 밀도</span>
            <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${SPEECH_DENSITY_STYLE[selfEval.patterns.speechDensity] ?? 'bg-surface-container text-on-surface-variant'}`}>
              {selfEval.patterns.speechDensity}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-on-surface-variant">질문 스타일</span>
            <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${QUESTION_STYLE_COLOR[selfEval.patterns.questionStyle] ?? 'bg-surface-container text-on-surface-variant'}`}>
              {selfEval.patterns.questionStyle}
            </span>
          </div>
        </div>
        {selfEval.patterns.repeatPhrases.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-on-surface-variant mb-2">자주 쓰는 표현</p>
            <div className="flex flex-wrap gap-2">
              {selfEval.patterns.repeatPhrases.map(phrase => (
                <span key={phrase} className="text-[11px] px-3 py-1 bg-surface-container rounded-lg text-on-surface-variant font-medium">"{phrase}"</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const ClassTranscription = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const openSessionHandledRef = useRef(false);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [classes, setClasses]                 = useState<any[]>([]);
  const [students, setStudents]               = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('record');

  // ── Recording state ────────────────────────────────────────────────────────
  const [status, setStatus]           = useState<RecordingStatus>('idle');
  const [transcript, setTranscript]   = useState('');
  const [interimText, setInterimText] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isChunkProcessing, setIsChunkProcessing] = useState(false);

  // ── 수업 목표 (선택) ────────────────────────────────────────────────────────
  const [lessonGoal, setLessonGoal]         = useState('');
  const [lessonKeywords, setLessonKeywords] = useState('');

  // ── Result state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]             = useState<ResultTab>('students');
  const [analysisResult, setAnalysisResult]   = useState<AnalysisResult | null>(null);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [errorMsg, setErrorMsg]               = useState('');
  const [sessionSaved, setSessionSaved]       = useState(false);
  const [backgroundInterrupted, setBackgroundInterrupted] = useState(false);

  // ── History state ─────────────────────────────────────────────────────────
  const [pastSessions, setPastSessions]         = useState<PastSessionRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [historyActiveTab, setHistoryActiveTab] = useState<ResultTab>('students');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const isRecordingRef   = useRef(false);
  const transcriptRef    = useRef('');
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const elapsedRef       = useRef(0);
  const wasRecordingRef  = useRef(false);
  const wakeLockRef      = useRef<any>(null);

  const recognitionRef    = useRef<any>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const chunkTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRequestedRef   = useRef(false);
  const pauseRequestedRef  = useRef(false);
  const chunkBlobsRef      = useRef<Blob[]>([]);
  const savedSessionIdRef  = useRef<string | null>(null);

  // ── Mode detection ─────────────────────────────────────────────────────────
  const groqKey = localStorage.getItem('groq_api_key') || '';

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: ownData } = await supabase.from('classes').select('*').eq('teacher_id', user?.id);
      let assignedData: any[] = [];
      try {
        const { data } = await supabase.from('classes').select('*').eq('assigned_teacher_id', user?.id);
        assignedData = data || [];
      } catch (_e) {}
      const seen = new Set<string>();
      const combined = [...(ownData || []), ...assignedData].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      if (combined.length > 0) {
        setClasses(combined);
        setSelectedClassId(combined[0].id);
        await fetchStudents(combined[0].id, combined[0]);
      }
    })();
    return () => {
      stopTimer();
      isRecordingRef.current = false;
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      releaseWakeLock();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  // ── Background detection (visibilitychange) ────────────────────────────────

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        wasRecordingRef.current = isRecordingRef.current;
      } else {
        if (wasRecordingRef.current && !isRecordingRef.current) {
          setBackgroundInterrupted(true);
          wasRecordingRef.current = false;
        }
        if (isRecordingRef.current) requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // ── Wake Lock ─────────────────────────────────────────────────────────────

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
    } catch {
      // silent fail
    }
  };

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  // ── History ───────────────────────────────────────────────────────────────

  const fetchPastSessions = useCallback(async () => {
    setIsLoadingHistory(true);
    const { data } = await supabase
      .from('class_transcriptions')
      .select('*')
      .eq('teacher_id', user?.id)
      .order('recorded_at', { ascending: false })
      .limit(30);
    setPastSessions(data || []);
    setIsLoadingHistory(false);
  }, [user?.id]);

  useEffect(() => {
    if (mainTab === 'history') fetchPastSessions();
  }, [mainTab, fetchPastSessions]);

  // AI 코파일럿에서 방금 분석한 전사록으로 바로 이동한 경우 — 기록 탭으로 전환 후 해당 세션을 자동으로 펼침
  useEffect(() => {
    const state = location.state as { openSessionId?: string } | null;
    if (!state?.openSessionId || openSessionHandledRef.current) return;
    setMainTab('history');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (openSessionHandledRef.current) return;
    const state = location.state as { openSessionId?: string } | null;
    const openId = state?.openSessionId;
    if (!openId || pastSessions.length === 0) return;
    if (!pastSessions.some(s => s.id === openId)) return;
    openSessionHandledRef.current = true;
    setExpandedSessionId(openId);
    setHistoryActiveTab('students');
    navigate(location.pathname, { replace: true, state: {} });
  }, [pastSessions, location, navigate]);

  const deleteSession = async (id: string) => {
    if (!window.confirm('이 전사 기록을 삭제하시겠습니까?')) return;
    const { error } = await supabase
      .from('class_transcriptions')
      .delete()
      .eq('id', id)
      .eq('teacher_id', user?.id);
    if (!error) setPastSessions(prev => prev.filter(s => s.id !== id));
  };

  // ── Students ──────────────────────────────────────────────────────────────

  const fetchStudents = async (classId: string, cls?: any) => {
    const targetId = cls?.linked_class_id || classId;
    const { data } = await supabase
      .from('students')
      .select('id, full_name, student_number')
      .eq('class_id', targetId)
      .order('student_number', { ascending: true });
    setStudents(data || []);
  };

  const handleClassChange = async (id: string) => {
    setSelectedClassId(id);
    const cls = classes.find(c => c.id === id);
    await fetchStudents(id, cls);
    resetAll();
  };

  // ── Timer ─────────────────────────────────────────────────────────────────

  const startTimer = (keepTime = false) => {
    if (!keepTime) {
      elapsedRef.current = 0;
      setElapsedSeconds(0);
    }
    timerRef.current = setInterval(() => {
      elapsedRef.current++;
      setElapsedSeconds(s => s + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Groq Whisper ──────────────────────────────────────────────────────────

  const transcribeChunk = async (blob: Blob): Promise<void> => {
    if (blob.size < 1000) return;
    setIsChunkProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'ko');
      formData.append('response_format', 'text');

      const prevContext = transcriptRef.current.slice(-GROQ_PROMPT_CTX).trim();
      if (prevContext) formData.append('prompt', prevContext);

      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (res.ok) {
        const text = (await res.text()).trim();
        if (text) {
          transcriptRef.current += text + ' ';
          setTranscript(transcriptRef.current);
        }
      } else if (res.status === 401) {
        isRecordingRef.current = false;
        stopTimer();
        releaseWakeLock();
        streamRef.current?.getTracks().forEach(t => t.stop());
        setStatus('error');
        setErrorMsg('Groq API Key가 올바르지 않습니다. 설정에서 키를 확인해주세요.');
      } else if (res.status === 429) {
        isRecordingRef.current = false;
        stopTimer();
        releaseWakeLock();
        streamRef.current?.getTracks().forEach(t => t.stop());
        setStatus('error');
        setErrorMsg('Groq API 크레딧이 소진되었거나 요청 한도에 도달했습니다. console.groq.com에서 사용량을 확인해주세요.');
      }
    } catch {
      // 네트워크 오류 — 해당 청크 건너뜀
    } finally {
      setIsChunkProcessing(false);
    }
  };

  const startNextChunk = (stream: MediaStream) => {
    if (!isRecordingRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg';

    chunkBlobsRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunkBlobsRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunkBlobsRef.current, { type: mimeType });
      await transcribeChunk(blob);

      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        await finalize();
      } else if (pauseRequestedRef.current) {
        pauseRequestedRef.current = false;
        streamRef.current?.getTracks().forEach(t => t.stop());
        setInterimText('');
      } else if (isRecordingRef.current) {
        startNextChunk(stream);
      }
    };

    recorder.start(500);
    mediaRecorderRef.current = recorder;

    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, GROQ_CHUNK_MS);
  };

  const startGroqRecording = async (keepTranscript = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current        = stream;
      isRecordingRef.current   = true;
      stopRequestedRef.current = false;
      if (!keepTranscript) {
        transcriptRef.current = '';
        setTranscript('');
      }
      setInterimText('');
      setStatus('recording');
      startTimer(keepTranscript);
      startNextChunk(stream);
    } catch {
      setStatus('error');
      setErrorMsg('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해주세요.');
    }
  };

  const stopGroqRecording = () => {
    isRecordingRef.current = false;
    if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null; }
    stopTimer();
    releaseWakeLock();
    setInterimText('마지막 구간 변환 중...');

    if (mediaRecorderRef.current?.state === 'recording') {
      stopRequestedRef.current = true;
      mediaRecorderRef.current.stop();
    } else {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setInterimText('');
      finalize();
    }
  };

  // ── 공통 종료 ─────────────────────────────────────────────────────────────

  const finalize = async () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setInterimText('');

    const finalText = transcriptRef.current.trim();
    if (!finalText || finalText.split(' ').length < 5) {
      setStatus('idle');
      return;
    }
    setStatus('transcribed');
    await saveTranscriptOnly(finalText);
  };

  const startAnalysis = async () => {
    const finalText = transcriptRef.current.trim();
    if (!finalText) return;
    setStatus('processing');
    await analyzeTranscript(finalText);
  };

  // ── 시작 / 중지 / 재개 ────────────────────────────────────────────────────

  const startRecording = () => {
    setBackgroundInterrupted(false);
    setSessionSaved(false);
    requestWakeLock();
    startGroqRecording();
  };

  const resumeRecording = () => {
    setBackgroundInterrupted(false);
    requestWakeLock();
    startGroqRecording(true);
  };

  const pauseRecording = () => {
    isRecordingRef.current = false;
    if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null; }
    stopTimer();
    releaseWakeLock();
    setStatus('paused');
    setInterimText('마지막 구간 변환 중...');

    if (mediaRecorderRef.current?.state === 'recording') {
      pauseRequestedRef.current = true;
      mediaRecorderRef.current.stop();
    } else {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setInterimText('');
    }
  };

  const resumeFromPause = () => {
    requestWakeLock();
    startGroqRecording(true);
  };

  const stopRecording = () => stopGroqRecording();

  const finalizeCurrent = async () => {
    setBackgroundInterrupted(false);
    const finalText = transcriptRef.current.trim();
    if (finalText && finalText.split(' ').length >= 5) {
      setStatus('transcribed');
      await saveTranscriptOnly(finalText);
    } else {
      setStatus('idle');
    }
  };

  // ── Gemini 분석 + 자동 저장 ─────────────────────────────────────────────

  const saveTranscriptOnly = async (transcriptText: string) => {
    if (savedSessionIdRef.current) return;
    const cls = classes.find(c => c.id === selectedClassId);
    const { data, error } = await supabase.from('class_transcriptions').insert({
      teacher_id:       user?.id,
      class_id:         selectedClassId || null,
      class_name:       cls?.name || null,
      subject:          cls?.subject || null,
      transcript_text:  transcriptText,
      analysis_result:  null,
      duration_seconds: elapsedRef.current,
    }).select('id').single();
    if (!error && data) {
      savedSessionIdRef.current = data.id;
      setSessionSaved(true);
    }
  };

  const saveSession = async (transcriptText: string, analysis: AnalysisResult) => {
    const id = savedSessionIdRef.current;
    if (id) {
      await supabase.from('class_transcriptions')
        .update({ analysis_result: analysis })
        .eq('id', id);
    } else {
      const cls = classes.find(c => c.id === selectedClassId);
      await supabase.from('class_transcriptions').insert({
        teacher_id:       user?.id,
        class_id:         selectedClassId || null,
        class_name:       cls?.name || null,
        subject:          cls?.subject || null,
        transcript_text:  transcriptText,
        analysis_result:  analysis,
        duration_seconds: elapsedRef.current,
      });
    }
    setSessionSaved(true);
  };

  const analyzeTranscript = async (transcriptText: string) => {
    try {
      const cls          = classes.find(c => c.id === selectedClassId);
      const studentNames = students.map(s => s.full_name).join(', ');

      const prompt = `
당신은 수업 분석 전문가입니다. 아래 수업 전사본을 분석하여 JSON 형식으로만 응답하세요.

[수업 정보]
학급: ${cls?.name ?? '미지정'} / 과목: ${cls?.subject ?? '미지정'}
학생 명단: ${studentNames || '(명단 없음)'}

[전사본]
${transcriptText}

━━━━━━━━━━━━━━━━━━━━━━

[Part 1 — 학생별 관찰]
학생 명단에 있는 각 학생에 대해 분석하세요:
- 이름이 언급된 횟수와 맥락 (칭찬 / 피드백 / 질문 / 지적 등)
- 참여 수준: 적극적(3회 이상 언급 또는 질문) / 보통(1~2회) / 소극적(언급 없음)
- 오늘 수업의 한 줄 관찰 요약 (구체적으로)
- 추가 지도 필요 여부 (오답·이해 부족·집중력 저하 등)
- 명단에 없거나 전혀 언급되지 않은 학생은 notMentioned 배열에 포함

[Part 2 — 수업 품질 평가]
전사본 내용만을 근거로 다음 5개 항목을 5점 만점으로 평가하세요:
1. structure(수업 구성): 도입→전개→마무리 흐름
2. clarity(설명 명확성): 핵심 개념을 이해하기 쉽게 전달했는가
3. engagement(학생 참여 유도): 질문·활동으로 반응을 이끌어냈는가
4. feedback(피드백 품질): 오답·발언에 구체적으로 반응했는가
5. timeManagement(시간 관리): 중요 내용에 적절한 시간을 배분했는가

다음도 포함하세요:
- strengths: 오늘 수업에서 가장 잘된 점 (2~3문장)
- improvements: 개선하면 더 좋을 점 (2~3문장)
- nextClassTip: 다음 수업에서 신경 쓸 것 한 가지 제안 (1문장)

[Part 3 — 선생님 자기평가 리포트]
수업 목표: ${lessonGoal || '(미입력 — 전사본에서 목표를 추론하세요)'}
핵심 개념: ${lessonKeywords || '(미입력 — 전사본에서 핵심 개념을 추론하세요)'}

위 수업 목표와 핵심 개념을 기반으로, 전사본 내용만을 근거로 다음을 평가하세요:
1. goalAchievement (목표 달성도, 1-5점): 수업 목표가 전사본에서 얼마나 충실히 다뤄졌는가
2. goalAchievementDetail: 목표 달성도에 대한 구체적 근거 (2~3문장, 전사본의 구체적 장면 언급)
3. coreConceptCoverage (핵심 개념 전달도, 1-5점): 핵심 개념들이 충분히 명확하게 전달됐는가
4. coreConceptDetail: 개념 전달 품질에 대한 구체적 설명 (2문장)
5. questioningSkills (질문 기술, 1-5점): 학생 사고를 유도하는 열린/탐구적 질문을 활용했는가
6. strengths: 오늘 수업의 구체적 강점 3가지 (배열, 각 항목 1~2문장)
7. improvements: 개선하면 더 효과적일 점 3가지 (배열, 각 항목 1~2문장)
8. nextActionItem: 다음 수업에서 바로 실행할 수 있는 구체적 과제 1가지 (1문장)
9. patterns.speechDensity: 전사본의 발언 밀도/속도 판단 ("빠름" | "보통" | "느림")
10. patterns.questionStyle: 질문 스타일 ("닫힌 질문 위주" | "균형적" | "열린 질문 위주")
11. patterns.repeatPhrases: 전사본에서 반복되는 표현 최대 3개 배열 (없으면 빈 배열)

━━━━━━━━━━━━━━━━━━━━━━

아래 JSON 형식으로만 응답하세요. 마크다운이나 다른 텍스트 없이 JSON만 출력하세요:

{
  "studentObservations": [
    {
      "name": "학생이름",
      "participation": "적극적|보통|소극적",
      "mentions": ["언급 내용 1", "언급 내용 2"],
      "summary": "한 줄 관찰 요약",
      "needsAttention": false
    }
  ],
  "notMentioned": ["언급되지 않은 학생 이름"],
  "classEvaluation": {
    "structure": 4,
    "clarity": 4,
    "engagement": 3,
    "feedback": 4,
    "timeManagement": 3,
    "strengths": "잘된 점 설명",
    "improvements": "개선할 점 설명",
    "nextClassTip": "다음 수업 제안"
  },
  "teacherSelfEval": {
    "goalAchievement": 4,
    "goalAchievementDetail": "목표 달성 근거 설명...",
    "coreConceptCoverage": 3,
    "coreConceptDetail": "개념 전달 설명...",
    "questioningSkills": 3,
    "strengths": ["강점1", "강점2", "강점3"],
    "improvements": ["개선점1", "개선점2", "개선점3"],
    "nextActionItem": "다음 수업 실행 과제",
    "patterns": {
      "speechDensity": "보통",
      "questionStyle": "닫힌 질문 위주",
      "repeatPhrases": ["반복 표현1", "반복 표현2"]
    }
  }
}`;

      const response = await transcriptionAI.generateContent(prompt);
      const raw      = response.response.text().trim();
      const jsonStr  = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/\s*```$/m, '')
        .trim();

      const parsed: AnalysisResult = JSON.parse(jsonStr);
      parsed.studentObservations = parsed.studentObservations.map(o => ({ ...o, saved: false }));
      if (lessonGoal)     parsed.lessonGoal     = lessonGoal;
      if (lessonKeywords) parsed.lessonKeywords  = lessonKeywords;

      setAnalysisResult(parsed);
      setStatus('complete');
      if (parsed.teacherSelfEval) setActiveTab('selfeval');
      await saveSession(transcriptText, parsed);
    } catch (err: any) {
      console.error('[ClassTranscription] analysis error:', err);
      setStatus('error');
      const msg: string = err?.message ?? '';
      if (msg === 'AI_LIMIT_EXCEEDED') {
        setErrorMsg('오늘 AI 사용 횟수(10회)를 초과했습니다. 자정 이후에 다시 시도해주세요.');
      } else if (
        msg.includes('429') ||
        msg.toLowerCase().includes('prepayment') ||
        msg.toLowerCase().includes('credits') ||
        msg.toLowerCase().includes('billing')
      ) {
        setErrorMsg('Gemini API 크레딧이 소진되었습니다. Google AI Studio(aistudio.google.com)에서 결제 정보를 확인해주세요.');
      } else if (msg.includes('401') || msg.includes('Invalid') || msg.includes('Unauthorized')) {
        setErrorMsg('인증 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
      } else {
        setErrorMsg('AI 분석 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  // ── 관찰기록 저장 ─────────────────────────────────────────────────────────

  const findStudent = (name: string) =>
    students.find(s =>
      s.full_name === name ||
      s.full_name.includes(name) ||
      name.includes(s.full_name)
    );

  const saveObservation = async (obs: StudentObservation) => {
    if (obs.saved) return;

    const student = findStudent(obs.name);
    if (!student) {
      alert(`'${obs.name}' 학생을 명단에서 찾을 수 없습니다.\nAI가 반환한 이름과 등록된 이름이 다를 수 있습니다.`);
      return;
    }

    const content = [
      obs.summary,
      obs.mentions.length > 0 ? `\n[수업 중 언급] ${obs.mentions.join(' / ')}` : '',
    ].filter(Boolean).join('');

    try {
      const { error } = await supabase.from('observations').insert({
        student_id:    student.id,
        teacher_id:    user?.id,
        activity_name: '수업 전사 기록',
        content,
        status: 'pending',
      });
      if (error) throw error;

      setAnalysisResult(prev => prev ? {
        ...prev,
        studentObservations: prev.studentObservations.map(o =>
          o.name === obs.name ? { ...o, saved: true } : o
        ),
      } : prev);
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const saveAllObservations = async () => {
    if (!analysisResult) return;
    for (const obs of analysisResult.studentObservations) {
      if (!obs.saved) await saveObservation(obs);
    }
  };

  const resetAll = () => {
    setTranscript('');
    setInterimText('');
    setAnalysisResult(null);
    setElapsedSeconds(0);
    setStatus('idle');
    setErrorMsg('');
    setSessionSaved(false);
    setBackgroundInterrupted(false);
    setActiveTab('students');
    transcriptRef.current     = '';
    elapsedRef.current        = 0;
    savedSessionIdRef.current = null;
    stopRequestedRef.current  = false;
    pauseRequestedRef.current = false;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const avgScore = (ev: ClassEvaluation) => {
    const sum = EVAL_ITEMS.reduce((acc, { key }) => acc + (ev[key] as number), 0);
    return (sum / EVAL_ITEMS.length).toFixed(1);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  const formatTimeOfDay = (iso: string) =>
    new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">

      {/* 메인 탭 */}
      <div className="flex p-1 bg-surface-container rounded-xl gap-1 w-fit">
        <button
          onClick={() => setMainTab('record')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black transition-all ${
            mainTab === 'record'
              ? 'bg-primary text-white shadow-md shadow-primary/20'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Mic size={15} />
          새 전사
        </button>
        <button
          onClick={() => setMainTab('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black transition-all ${
            mainTab === 'history'
              ? 'bg-primary text-white shadow-md shadow-primary/20'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <History size={15} />
          기록 보기
          {pastSessions.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
              mainTab === 'history' ? 'bg-white/25' : 'bg-primary/10 text-primary'
            }`}>
              {pastSessions.length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════ 새 전사 탭 ══════════════ */}
      {mainTab === 'record' && (
        <>
          {/* 백그라운드 중단 배너 */}
          <AnimatePresence>
            {backgroundInterrupted && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3"
              >
                <WifiOff size={18} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-black text-amber-800">다른 앱/브라우저로 이동해 녹음이 중단됐습니다</p>
                  <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                    Android·iPhone·iPad 모두 백그라운드에서는 마이크를 사용할 수 없습니다.<br />
                    지금까지 전사된 내용은 유지됩니다.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={resumeRecording}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black hover:bg-amber-600 transition-all active:scale-95"
                    >
                      <Mic size={13} />
                      이어서 녹음
                    </button>
                    <button
                      onClick={finalizeCurrent}
                      className="flex items-center gap-1.5 px-4 py-2 bg-surface-container text-on-surface-variant rounded-xl text-xs font-black hover:bg-surface-container-high transition-all active:scale-95"
                    >
                      <Square size={13} />
                      여기서 종료하기
                    </button>
                  </div>
                </div>
                <button onClick={() => setBackgroundInterrupted(false)} className="text-amber-400 hover:text-amber-600 shrink-0 mt-0.5">
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Groq API Key 미등록 시 안내 */}
          {!groqKey && (
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl flex items-start gap-3">
              <KeyRound size={18} className="text-violet-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-black text-violet-800">Groq API Key가 등록되지 않았습니다</p>
                <p className="text-xs text-violet-600 mt-1 leading-relaxed">
                  고품질 AI 전사를 사용하려면 설정에서 Groq API Key를 등록해주세요.<br />
                  console.groq.com 에서 무료로 발급받을 수 있습니다.
                </p>
                <button
                  onClick={() => navigate('/settings')}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-black hover:bg-violet-700 transition-all active:scale-95"
                >
                  <Settings size={13} />
                  설정에서 API Key 등록하기
                </button>
              </div>
            </div>
          )}

          {/* 활성 모드 표시 */}
          {!!groqKey && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-full text-xs font-black border border-violet-200">
                <Zap size={12} />
                Groq Whisper 활성 — 고품질 AI 전사
              </span>
              <span className="text-[11px] text-on-surface-variant/60">10초 단위로 변환됩니다</span>
            </div>
          )}

          {/* 수업 설정 */}
          {(status === 'idle' || status === 'error') && (
            <div className="surface-card p-6 shadow-ambient space-y-4">
              <h3 className="text-base font-black flex items-center gap-2">
                <Users size={18} className="text-primary" />
                수업 설정
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">학급 선택</label>
                  <select
                    value={selectedClassId}
                    onChange={e => handleClassChange(e.target.value)}
                    className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {classes.length === 0
                      ? <option>학급 없음</option>
                      : classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>
                      ))
                    }
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">등록 학생</label>
                  <div className="px-4 py-3 bg-surface-container rounded-xl text-sm font-black text-primary">
                    {students.length}명
                  </div>
                </div>
              </div>
              {students.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {students.map(s => (
                    <span key={s.id} className="px-2.5 py-1 bg-primary/8 text-primary text-[11px] font-bold rounded-lg border border-primary/15">
                      {s.full_name}
                    </span>
                  ))}
                </div>
              )}

              {/* 수업 목표 입력 */}
              <div className="border-t border-surface-container pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Target size={15} className="text-violet-500" />
                  <span className="text-sm font-black">오늘의 수업 목표</span>
                  <span className="text-[11px] font-medium text-on-surface-variant">선택 — 입력하면 자기평가가 더 정확해집니다</span>
                </div>
                <textarea
                  value={lessonGoal}
                  onChange={e => setLessonGoal(e.target.value)}
                  placeholder="예: 이차방정식의 근의 공식을 이해하고 실전 문제에 적용할 수 있다"
                  rows={2}
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm font-medium resize-none outline-none focus:ring-2 focus:ring-violet-400/30 placeholder:text-on-surface-variant/40"
                />
                <input
                  type="text"
                  value={lessonKeywords}
                  onChange={e => setLessonKeywords(e.target.value)}
                  placeholder="핵심 개념 (쉼표 구분) — 예: 판별식, 근의 공식, 두 근의 합"
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-violet-400/30 placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>
          )}

          {/* 녹음 패널 */}
          <div className="surface-card p-6 shadow-ambient">

            {status === 'idle' && (
              <div className="flex flex-col items-center gap-6 py-10">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mic size={40} className="text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-xl font-black">수업 전사 준비 완료</h3>
                  <p className="text-sm text-on-surface-variant">
                    Groq Whisper 모드 — 10초마다 자동으로 고품질 변환합니다
                  </p>
                </div>
                <button
                  onClick={startRecording}
                  disabled={!groqKey || !selectedClassId || students.length === 0}
                  className="btn-gradient px-10 py-4 rounded-2xl font-black text-base flex items-center gap-3 shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mic size={20} />
                  수업 시작 — 전사 시작
                </button>
                {students.length === 0 && (
                  <p className="text-xs text-on-surface-variant/60">학생이 등록된 학급을 선택해주세요.</p>
                )}
              </div>
            )}

            {status === 'recording' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                    <span className="text-sm font-black text-red-500">녹음 중</span>
                    <span className="font-mono text-sm font-black text-on-surface-variant tabular-nums">
                      {formatTime(elapsedSeconds)}
                    </span>
                    {isChunkProcessing && (
                      <span className="flex items-center gap-1 text-[11px] text-violet-600 font-bold">
                        <Loader2 size={11} className="animate-spin" />
                        AI 변환 중
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={pauseRecording}
                      className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-black text-sm active:scale-95 transition-all"
                    >
                      <Pause size={15} />
                      일시정지
                    </button>
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black text-sm shadow-md active:scale-95 transition-all"
                    >
                      <Square size={15} />
                      수업 종료
                    </button>
                  </div>
                </div>

                <div className="bg-surface-container-low rounded-2xl p-4 border border-surface-container min-h-52 max-h-80 overflow-y-auto text-sm leading-loose font-medium">
                  {transcript ? (
                    <span className="text-on-surface">{transcript}</span>
                  ) : (
                    <span className="text-on-surface-variant/40 italic">
                      말씀하시면 10초마다 여기에 변환됩니다...
                    </span>
                  )}
                  {interimText && (
                    <span className="text-on-surface-variant/50 italic"> {interimText}</span>
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                <p className="text-[11px] text-on-surface-variant/50 text-center">
                  수업이 끝나면 "수업 종료"를 눌러주세요. AI가 학생별 관찰 기록, 수업 평가, 자기평가 리포트를 자동 생성합니다.
                </p>
              </div>
            )}

            {status === 'paused' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
                    </span>
                    <span className="text-sm font-black text-amber-500">일시정지됨</span>
                    <span className="font-mono text-sm font-black text-on-surface-variant tabular-nums">
                      {formatTime(elapsedSeconds)}
                    </span>
                    {interimText && (
                      <span className="flex items-center gap-1 text-[11px] text-violet-600 font-bold">
                        <Loader2 size={11} className="animate-spin" />
                        AI 변환 중
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-surface-container-low rounded-2xl p-4 border border-amber-100 min-h-32 max-h-80 overflow-y-auto text-sm leading-loose font-medium">
                  {transcript ? (
                    <span className="text-on-surface">{transcript}</span>
                  ) : (
                    <span className="text-on-surface-variant/40 italic">아직 전사된 내용이 없습니다...</span>
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                <p className="text-[11px] text-on-surface-variant/50 text-center">
                  잠시 멈췄습니다. 수업을 이어가려면 "녹음 재개"를 눌러주세요.
                </p>

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={finalizeCurrent}
                    className="flex items-center gap-2 px-4 py-2.5 bg-surface-container hover:bg-surface-container-high rounded-xl text-sm font-bold text-on-surface-variant transition-all active:scale-95"
                  >
                    <Square size={14} />
                    여기서 종료하기
                  </button>
                  <button
                    onClick={resumeFromPause}
                    className="btn-gradient flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-base shadow-xl active:scale-95 transition-all"
                  >
                    <Play size={18} />
                    녹음 재개
                  </button>
                </div>
              </div>
            )}

            {status === 'transcribed' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                    </span>
                    <span className="text-sm font-black text-green-600">전사 완료</span>
                    <span className="font-mono text-sm font-black text-on-surface-variant tabular-nums">
                      {formatTime(elapsedSeconds)}
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant/60">
                    {transcript.trim().split(/\s+/).filter(Boolean).length.toLocaleString()}단어 · AI 분석 전
                  </span>
                </div>

                <div className="bg-surface-container-low rounded-2xl p-4 border border-surface-container max-h-64 overflow-y-auto text-sm leading-loose font-medium text-on-surface">
                  {transcript}
                </div>

                {sessionSaved && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-xl">
                    <Save size={13} className="text-green-600 shrink-0" />
                    <span className="text-xs font-black text-green-700">전사 내용이 "기록 보기"에 저장됐습니다</span>
                  </div>
                )}
                <p className="text-[11px] text-on-surface-variant/50 text-center">
                  AI 분석을 시작하면 학생별 관찰 기록, 수업 평가, 자기평가 리포트가 추가됩니다. AI 크레딧은 분석 시에만 사용됩니다.
                </p>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button
                    onClick={resetAll}
                    className="flex items-center gap-2 px-4 py-2.5 bg-surface-container hover:bg-surface-container-high rounded-xl text-sm font-bold text-on-surface-variant transition-all active:scale-95"
                  >
                    <RefreshCw size={14} />
                    다시 녹음
                  </button>
                  <button
                    onClick={startAnalysis}
                    className="btn-gradient flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-base shadow-xl active:scale-95 transition-all"
                  >
                    <Sparkles size={18} />
                    AI 분석 시작
                  </button>
                </div>
              </div>
            )}

            {status === 'processing' && (
              <div className="flex flex-col items-center gap-5 py-14">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles size={36} className="text-primary animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-black">AI가 수업 내용을 분석하는 중...</p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    학생별 관찰 기록, 수업 품질 평가, 자기평가 리포트를 생성하고 있습니다
                  </p>
                </div>
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <AlertCircle size={40} className="text-red-400" />
                <p className="font-black text-red-500">{errorMsg}</p>
                <button
                  onClick={resetAll}
                  className="flex items-center gap-2 px-5 py-2.5 bg-surface-container rounded-xl font-bold text-sm hover:bg-surface-container-high transition-all"
                >
                  <RefreshCw size={15} />
                  다시 시도
                </button>
              </div>
            )}
          </div>

          {/* 분석 결과 */}
          {status === 'complete' && analysisResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* 자동 저장 완료 표시 */}
              {sessionSaved && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-100 rounded-2xl">
                  <Save size={14} className="text-green-600" />
                  <span className="text-xs font-black text-green-700">
                    전사 세션이 자동 저장됐습니다. "기록 보기" 탭에서 언제든지 다시 확인할 수 있습니다.
                  </span>
                </div>
              )}

              {/* 결과 탭 바 */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex p-1 bg-surface-container rounded-xl gap-1 flex-wrap">
                  <button
                    onClick={() => setActiveTab('students')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-all ${
                      activeTab === 'students'
                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Users size={15} />
                    학생별 관찰
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                      activeTab === 'students' ? 'bg-white/25' : 'bg-primary/10 text-primary'
                    }`}>
                      {analysisResult.studentObservations.length}명
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('evaluation')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-all ${
                      activeTab === 'evaluation'
                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <BarChart3 size={15} />
                    수업 품질
                  </button>
                  <button
                    onClick={() => setActiveTab('selfeval')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-all ${
                      activeTab === 'selfeval'
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <GraduationCap size={15} />
                    자기평가
                    {analysisResult.teacherSelfEval && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                        activeTab === 'selfeval' ? 'bg-white/25' : 'bg-violet-100 text-violet-600'
                      }`}>NEW</span>
                    )}
                  </button>
                </div>

                {activeTab === 'students' && (
                  <button
                    onClick={saveAllObservations}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-black hover:bg-primary/20 transition-all"
                  >
                    <Plus size={13} />
                    전체 활동 기록으로 저장
                  </button>
                )}
              </div>

              {/* 학생별 관찰 */}
              {activeTab === 'students' && (
                <div className="space-y-3">
                  {analysisResult.studentObservations.map((obs, i) => (
                    <motion.div
                      key={obs.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="surface-card p-5 shadow-ambient"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-base">{obs.name}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PARTICIPATION_STYLE[obs.participation]}`}>
                              {obs.participation}
                            </span>
                            {obs.needsAttention && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                추가 지도 필요
                              </span>
                            )}
                            {!findStudent(obs.name) && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
                                명단 불일치
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-on-surface-variant leading-relaxed">{obs.summary}</p>
                          {obs.mentions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {obs.mentions.map((m, j) => (
                                <span key={j} className="text-[11px] px-2 py-1 bg-surface-container rounded-lg text-on-surface-variant">
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => saveObservation(obs)}
                          disabled={obs.saved}
                          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all ${
                            obs.saved
                              ? 'bg-green-100 text-green-700 cursor-default'
                              : 'bg-primary/10 text-primary hover:bg-primary hover:text-white active:scale-95'
                          }`}
                        >
                          {obs.saved ? <Check size={13} /> : <Plus size={13} />}
                          {obs.saved ? '저장됨' : '기록 추가'}
                        </button>
                      </div>
                    </motion.div>
                  ))}

                  {analysisResult.notMentioned.length > 0 && (
                    <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container">
                      <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2">
                        오늘 수업에서 언급되지 않은 학생
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.notMentioned.map(name => (
                          <span key={name} className="text-xs px-3 py-1 bg-surface-container rounded-lg text-on-surface-variant/60 font-bold">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 수업 품질 평가 */}
              {activeTab === 'evaluation' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="surface-card p-6 shadow-ambient space-y-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-black flex items-center gap-2">
                        <BarChart3 size={18} className="text-primary" />
                        항목별 평가
                      </h3>
                      <div className="text-right">
                        <p className="text-[10px] text-on-surface-variant uppercase font-bold">종합 점수</p>
                        <p className="text-2xl font-black text-primary leading-none">
                          {avgScore(analysisResult.classEvaluation)}
                          <span className="text-sm font-bold text-on-surface-variant"> / 5.0</span>
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 pt-1">
                      {EVAL_ITEMS.map(({ key, label }) => (
                        <ScoreBar key={key} label={label} score={analysisResult.classEvaluation[key] as number} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-surface-container">
                    <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                      <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1.5">잘된 점</p>
                      <p className="text-sm text-green-800 leading-relaxed">{analysisResult.classEvaluation.strengths}</p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1.5">개선할 점</p>
                      <p className="text-sm text-amber-800 leading-relaxed">{analysisResult.classEvaluation.improvements}</p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/15">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">다음 수업 제안</p>
                      <p className="text-sm text-on-surface leading-relaxed">{analysisResult.classEvaluation.nextClassTip}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* 자기평가 리포트 */}
              {activeTab === 'selfeval' && analysisResult.teacherSelfEval && (
                <SelfEvalTab
                  selfEval={analysisResult.teacherSelfEval}
                  classEval={analysisResult.classEvaluation}
                  lessonGoal={analysisResult.lessonGoal}
                  lessonKeywords={analysisResult.lessonKeywords}
                />
              )}

              {/* 전체 전사본 */}
              <div className="surface-card shadow-ambient overflow-hidden">
                <button
                  onClick={() => setShowFullTranscript(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-container-low transition-all"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-primary" />
                    <span className="text-sm font-black">전체 전사본 보기</span>
                    <span className="text-[10px] text-on-surface-variant/60 font-medium">
                      ({transcript.trim().split(/\s+/).length.toLocaleString()}단어)
                    </span>
                  </div>
                  {showFullTranscript ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <AnimatePresence>
                  {showFullTranscript && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5">
                        <div className="p-4 bg-surface-container-low rounded-xl text-sm leading-relaxed text-on-surface-variant font-medium whitespace-pre-wrap max-h-72 overflow-y-auto">
                          {transcript}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  onClick={resetAll}
                  className="flex items-center gap-2 px-6 py-3 bg-surface-container hover:bg-surface-container-high rounded-xl text-sm font-bold text-on-surface-variant transition-all active:scale-95"
                >
                  <RefreshCw size={15} />
                  새 수업 시작하기
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* ══════════════ 기록 보기 탭 ══════════════ */}
      {mainTab === 'history' && (
        <div className="space-y-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-bold">기록 불러오는 중...</span>
            </div>
          ) : pastSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center">
                <History size={32} className="text-on-surface-variant/40" />
              </div>
              <div>
                <p className="font-black text-on-surface-variant">저장된 전사 기록이 없습니다</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">수업 전사를 완료하면 자동으로 여기에 저장됩니다.</p>
              </div>
              <button
                onClick={() => setMainTab('record')}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-black hover:bg-primary/20 transition-all"
              >
                <Mic size={15} />
                전사 시작하기
              </button>
            </div>
          ) : (
            pastSessions.map((session, i) => {
              const isExpanded  = expandedSessionId === session.id;
              const analysis    = session.analysis_result;
              const avgScoreVal = analysis
                ? (EVAL_ITEMS.reduce((a, { key }) => a + (analysis.classEvaluation[key as keyof ClassEvaluation] as number), 0) / EVAL_ITEMS.length).toFixed(1)
                : null;
              const selfEval = analysis?.teacherSelfEval;

              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="surface-card shadow-ambient overflow-hidden"
                >
                  {/* 카드 헤더 */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-black">{session.class_name || '학급 미지정'}</span>
                          {session.subject && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {session.subject}
                            </span>
                          )}
                          {selfEval && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600">
                              자기평가 있음
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="text-xs text-on-surface-variant font-medium">
                            {formatDate(session.recorded_at)} {formatTimeOfDay(session.recorded_at)}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-on-surface-variant/60 font-medium">
                            <Clock size={11} />
                            {formatTime(session.duration_seconds)}
                          </span>
                          {analysis && (
                            <>
                              <span className="text-xs text-on-surface-variant/60 font-medium">
                                학생 {analysis.studentObservations.length}명
                              </span>
                              <span className="text-xs font-black text-primary">
                                ★ {avgScoreVal} / 5.0
                              </span>
                            </>
                          )}
                          {selfEval && (
                            <span className="text-xs font-black text-violet-600">
                              목표달성 {selfEval.goalAchievement}/5
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => deleteSession(session.id)}
                          className="p-2 text-on-surface-variant/40 hover:text-red-500 rounded-lg transition-all"
                          title="삭제"
                        >
                          <Trash2 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedSessionId(null);
                            } else {
                              setExpandedSessionId(session.id);
                              setHistoryActiveTab('students');
                            }
                          }}
                          className="p-2 text-on-surface-variant hover:bg-surface-container rounded-lg transition-all"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* 학생 참여 미리보기 (접힌 상태) */}
                    {analysis && !isExpanded && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {analysis.studentObservations.slice(0, 6).map(obs => (
                          <span key={obs.name} className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PARTICIPATION_STYLE[obs.participation]}`}>
                            {obs.name}
                          </span>
                        ))}
                        {analysis.studentObservations.length > 6 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant/60">
                            +{analysis.studentObservations.length - 6}명
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 확장 상세 */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden border-t border-surface-container"
                      >
                        {/* 탭 바 */}
                        {analysis && (
                          <div className="flex p-1.5 bg-surface-container-low gap-1 flex-wrap border-b border-surface-container">
                            <button
                              onClick={() => setHistoryActiveTab('students')}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black transition-all ${
                                historyActiveTab === 'students'
                                  ? 'bg-primary text-white shadow-sm shadow-primary/20'
                                  : 'text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              <Users size={12} />
                              학생별 관찰
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                                historyActiveTab === 'students' ? 'bg-white/25' : 'bg-primary/10 text-primary'
                              }`}>
                                {analysis.studentObservations.length}명
                              </span>
                            </button>
                            <button
                              onClick={() => setHistoryActiveTab('evaluation')}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black transition-all ${
                                historyActiveTab === 'evaluation'
                                  ? 'bg-primary text-white shadow-sm shadow-primary/20'
                                  : 'text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              <BarChart3 size={12} />
                              수업 품질
                            </button>
                            {selfEval && (
                              <button
                                onClick={() => setHistoryActiveTab('selfeval')}
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black transition-all ${
                                  historyActiveTab === 'selfeval'
                                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                                    : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                              >
                                <GraduationCap size={12} />
                                자기평가
                              </button>
                            )}
                          </div>
                        )}

                        <div className="p-5 space-y-4">
                          {!analysis ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-xl w-fit">
                              <MessageSquare size={13} className="text-on-surface-variant/50" />
                              <span className="text-[11px] text-on-surface-variant/60 font-bold">AI 분석 없음 — 전사 원문만 저장됨</span>
                            </div>
                          ) : historyActiveTab === 'students' ? (
                            <div className="space-y-3">
                              {analysis.studentObservations.map((obs, oi) => (
                                <motion.div
                                  key={obs.name}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: oi * 0.04 }}
                                  className="surface-card p-5 shadow-ambient"
                                >
                                  <div className="flex-1 space-y-2 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-black text-base">{obs.name}</span>
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PARTICIPATION_STYLE[obs.participation]}`}>
                                        {obs.participation}
                                      </span>
                                      {obs.needsAttention && (
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                          추가 지도 필요
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-on-surface-variant leading-relaxed">{obs.summary}</p>
                                    {obs.mentions.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {obs.mentions.map((m, j) => (
                                          <span key={j} className="text-[11px] px-2 py-1 bg-surface-container rounded-lg text-on-surface-variant">
                                            {m}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              ))}
                              {analysis.notMentioned.length > 0 && (
                                <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container">
                                  <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2">
                                    오늘 수업에서 언급되지 않은 학생
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {analysis.notMentioned.map(name => (
                                      <span key={name} className="text-xs px-3 py-1 bg-surface-container rounded-lg text-on-surface-variant/60 font-bold">
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : historyActiveTab === 'evaluation' ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="surface-card p-6 shadow-ambient space-y-6"
                            >
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-base font-black flex items-center gap-2">
                                    <BarChart3 size={18} className="text-primary" />
                                    항목별 평가
                                  </h3>
                                  <div className="text-right">
                                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">종합 점수</p>
                                    <p className="text-2xl font-black text-primary leading-none">
                                      {avgScoreVal}
                                      <span className="text-sm font-bold text-on-surface-variant"> / 5.0</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-3 pt-1">
                                  {EVAL_ITEMS.map(({ key, label }) => (
                                    <ScoreBar key={key} label={label} score={analysis.classEvaluation[key as keyof ClassEvaluation] as number} />
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-3 pt-2 border-t border-surface-container">
                                <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                                  <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1.5">잘된 점</p>
                                  <p className="text-sm text-green-800 leading-relaxed">{analysis.classEvaluation.strengths}</p>
                                </div>
                                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1.5">개선할 점</p>
                                  <p className="text-sm text-amber-800 leading-relaxed">{analysis.classEvaluation.improvements}</p>
                                </div>
                                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/15">
                                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">다음 수업 제안</p>
                                  <p className="text-sm text-on-surface leading-relaxed">{analysis.classEvaluation.nextClassTip}</p>
                                </div>
                              </div>
                            </motion.div>
                          ) : historyActiveTab === 'selfeval' && selfEval ? (
                            <SelfEvalTab
                              selfEval={selfEval}
                              classEval={analysis.classEvaluation}
                              lessonGoal={analysis.lessonGoal}
                              lessonKeywords={analysis.lessonKeywords}
                            />
                          ) : null}

                          {/* 전사 원문 */}
                          <div>
                            <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2">전사 원문</p>
                            <div className="p-3 bg-surface-container-low rounded-xl text-xs leading-relaxed text-on-surface-variant/80 whitespace-pre-wrap max-h-48 overflow-y-auto">
                              {session.transcript_text}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ClassTranscription;
