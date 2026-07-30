import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, PenLine,
  CheckCircle2, ArrowRight, Sparkles, Copy, KeyRound,
  Check, X, Loader2, Play, Trophy, Eye, Share2, BookOpen,
  ChevronRight, Users, Heart,
  School, PlayCircle, ExternalLink,
} from 'lucide-react';
import { setDemoTourState } from '../components/DemoTourOverlay';

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const MOCK_CLASS = {
  name: '3학년 생명과학 I',
  code: 'DEMO25',
  subject: '생명과학',
  grade: '3학년',
  currentWeek: 4,
  weekTopic: '세포 분열과 DNA 복제',
  weekDesc:
    '세포 주기의 각 단계와 DNA 복제 메커니즘을 이해하고, 유사 분열과 감수 분열의 차이점을 비교 분석합니다.',
};

const MOCK_OBS_TEXT =
  '오늘 세포 분열 수업에서 G1, S, G2, M기의 각 특징을 꼼꼼히 정리했다. 특히 DNA 복제가 S기에 일어난다는 점을 실험 영상을 통해 확인하고, 동급생들에게 설명해주는 과정에서 심화 이해를 보여주었다. 교사가 제시한 유사분열 단계 순서 맞추기 활동에서 1등으로 완성하고, 감수분열과의 차이점을 자발적으로 표로 정리하여 제출하였다.';

const MOCK_SESPEC =
  '세포 분열과 DNA 복제 단원에서 세포 주기의 각 단계(G1기, S기, G2기, M기)를 체계적으로 이해하고, 특히 S기에 일어나는 DNA 복제 과정을 실험 영상 분석을 통해 심층적으로 파악함. 유사 분열의 전기·중기·후기·말기를 정확히 구분하여 단계별 특징을 도식화하고, 감수 분열과의 차이점을 비교표로 작성하여 제출하는 적극적인 학습 태도를 보임. 수업 중 동급생에게 핵심 개념을 자발적으로 설명하며 협력 학습을 주도하였으며, 세포 분열 단계 배열 활동에서 정확성과 신속성을 동시에 발휘함.';

type StudentStatus = 'pending' | 'writing' | 'completed';
interface Student {
  id: string;
  number: number;
  name: string;
  status: StudentStatus;
  obsStatus: 'none' | 'pending' | 'approved';
}

const INIT_STUDENTS: Student[] = [
  { id: 's1', number: 1, name: '김민준', status: 'completed', obsStatus: 'pending' },
  { id: 's2', number: 2, name: '이서연', status: 'writing', obsStatus: 'none' },
  { id: 's3', number: 3, name: '박지호', status: 'pending', obsStatus: 'none' },
];

// ─── STAGE METADATA ───────────────────────────────────────────────────────────

const STAGES = [
  { role: null,      label: null,             title: '클래스로그 AI 체험하기',               desc: '선생님과 학생의 전체 흐름을 직접 체험해보세요' },
  { role: 'teacher', label: '👩‍🏫 선생님 시점', title: '1단계 · 학급 생성 완료',             desc: '선생님이 학급을 만들고 학생에게 입장코드를 공유합니다' },
  { role: 'student', label: '🧑‍🎓 학생 시점',   title: '2단계 · 학생 입장',                 desc: '학생이 입장코드와 이름, PIN으로 수업에 참여합니다' },
  { role: 'student', label: '🧑‍🎓 학생 시점',   title: '3단계 · 수업 자료 확인 & 활동기록 제출', desc: '학생이 수업 자료를 보고 활동기록을 작성해 제출합니다' },
  { role: 'student', label: '🧑‍🎓 학생 시점',   title: '4단계 · 퀴즈 참여',                 desc: '선생님이 출제한 퀴즈를 풀어봅니다' },
  { role: 'teacher', label: '👩‍🏫 선생님 시점', title: '5단계 · 실시간 현황 확인',            desc: '누가 제출했고 누가 작성 중인지 실시간으로 확인합니다' },
  { role: 'teacher', label: '👩‍🏫 선생님 시점', title: '6단계 · 반려 & 승인',               desc: '학생 제출물을 검토하고 승인 또는 반려합니다' },
  { role: 'teacher', label: '👩‍🏫 선생님 시점', title: '7단계 · AI 세특 자동 생성',          desc: '활동기록을 바탕으로 AI가 세특 초안을 자동으로 작성합니다' },
  { role: 'teacher', label: '👩‍🏫 선생님 시점', title: '8단계 · 공유 URL로 전달',            desc: '담당 선생님께 URL 하나로 학생 기록을 공유합니다' },
];

// ─── 데모 학급 실데이터 (api/demo-provision 응답) ──────────────────────────────

interface DemoSessionData {
  classId: string;
  entryCode: string;
  resumeStage?: number;
}

const SESSION_DATA_KEY = 'demo_session_data';

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const Demo = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState(0);
  const [students, setStudents] = useState<Student[]>(INIT_STUDENTS);
  const [demoData, setDemoData] = useState<Omit<DemoSessionData, 'resumeStage'> | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState('');

  // 학생 실제 화면(ClassroomEntry/StudentLog)에서 "선생님 화면으로 이어보기"를 누르고 돌아온 경우
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_DATA_KEY);
      if (!raw) return;
      const parsed: DemoSessionData = JSON.parse(raw);
      if (parsed?.classId && parsed?.entryCode) {
        setDemoData({ classId: parsed.classId, entryCode: parsed.entryCode });
        if (parsed.resumeStage) setStage(parsed.resumeStage);
      }
    } catch {
      // 손상된 세션 데이터는 무시
    }
  }, []);

  const next = () => setStage(s => Math.min(s + 1, STAGES.length - 1));

  const handleStart = async () => {
    setProvisioning(true);
    setProvisionError('');
    try {
      const res = await fetch('/api/demo-provision', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '데모 학급 생성에 실패했습니다.');
      const nextData = { classId: data.class_id as string, entryCode: data.entry_code as string };
      setDemoData(nextData);
      sessionStorage.setItem(SESSION_DATA_KEY, JSON.stringify(nextData));
      next();
    } catch (err: any) {
      setProvisionError(err.message || '잠시 후 다시 시도해주세요.');
    } finally {
      setProvisioning(false);
    }
  };

  // 2~4단계(학생 입장 → 활동기록 제출 → 퀴즈 참여)는 실제 화면을 그대로 사용
  const goToStudentFlow = () => {
    if (!demoData) return;
    setDemoTourState({
      roleLabel: '🧑‍🎓 학생 시점',
      stageTitle: '2~4단계 · 학생 입장 → 활동기록 제출 → 퀴즈 참여',
      classId: demoData.classId,
      entryCode: demoData.entryCode,
    });
    sessionStorage.setItem(SESSION_DATA_KEY, JSON.stringify({ ...demoData, resumeStage: 5 }));
    navigate(`/classroom-entry?code=${demoData.entryCode}`);
  };

  const stage0 = STAGES[stage];

  return (
    <div className="min-h-screen bg-surface font-pretendard">
      {/* ── 데모 가이드 배너 ── */}
      {stage > 0 && (
        <div
          className={`sticky top-0 z-50 border-b ${
            stage0.role === 'teacher'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-violet-50 border-violet-200'
          }`}
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            {/* 역할 배지 */}
            <span
              className={`shrink-0 text-xs font-black px-2.5 py-1 rounded-full ${
                stage0.role === 'teacher'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-violet-100 text-violet-700'
              }`}
            >
              {stage0.label}
            </span>

            {/* 진행 바 */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-black truncate ${stage0.role === 'teacher' ? 'text-amber-800' : 'text-violet-800'}`}>
                {stage0.title}
              </p>
              <p className={`text-[10px] mt-0.5 truncate ${stage0.role === 'teacher' ? 'text-amber-600/70' : 'text-violet-600/70'}`}>
                {stage0.desc}
              </p>
            </div>

            {/* 단계 표시 */}
            <span className={`shrink-0 text-[10px] font-bold ${stage0.role === 'teacher' ? 'text-amber-500' : 'text-violet-500'}`}>
              {stage}/{STAGES.length - 1}
            </span>
          </div>

          {/* 진행도 선 */}
          <div className="h-0.5 bg-surface-container-high">
            <motion.div
              className={`h-full ${stage0.role === 'teacher' ? 'bg-amber-400' : 'bg-violet-400'}`}
              animate={{ width: `${(stage / (STAGES.length - 1)) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* ── 스테이지 렌더 ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.3 }}
        >
          {stage === 0 && <Stage0 onNext={handleStart} loading={provisioning} error={provisionError} />}
          {stage === 1 && <Stage1 entryCode={demoData?.entryCode ?? ''} onNext={goToStudentFlow} />}
          {stage === 5 && <Stage5 students={students} onNext={next} />}
          {stage === 6 && (
            <Stage6
              students={students}
              setStudents={setStudents}
              onNext={next}
            />
          )}
          {stage === 7 && <Stage7 onNext={next} />}
          {stage === 8 && <Stage8 navigate={navigate} classId={demoData?.classId ?? ''} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ─── STAGE 0: 인트로 ──────────────────────────────────────────────────────────

const Stage0 = ({
  onNext, loading, error,
}: {
  onNext: () => void;
  loading: boolean;
  error: string;
}) => (
  <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-violet-200 rotate-3">
        <GraduationCap size={40} className="text-white" />
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 text-xs font-black rounded-full mb-5">
        <Heart size={11} fill="currentColor" /> 클래스로그 AI 인터랙티브 데모
      </span>
      <h1 className="text-3xl md:text-4xl font-black text-on-surface mb-4 tracking-tight leading-tight">
        클릭 한 번으로<br />
        <span className="text-primary">전체 흐름을 체험하세요</span>
      </h1>
      <p className="text-on-surface-variant text-sm leading-relaxed max-w-sm mx-auto mb-10">
        학급 생성 → 학생 입장 → 활동기록 제출 → 퀴즈 → 선생님 승인 → AI 세특 생성 → 공유 URL까지<br />
        <strong>8단계</strong>를 실제 화면으로 직접 조작해보세요.
      </p>

      {/* 단계 미리보기 */}
      <div className="flex flex-wrap justify-center gap-2 mb-10 max-w-md mx-auto">
        {[
          '학급 생성', '학생 입장', '활동기록 제출', '퀴즈 참여',
          '실시간 현황', '승인 처리', 'AI 세특 생성', '공유 URL'
        ].map((s, i) => (
          <span key={s} className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full text-[11px] font-bold text-on-surface-variant">
            <span className="text-primary font-black">{i + 1}</span> {s}
          </span>
        ))}
      </div>

      <button
        onClick={onNext}
        disabled={loading}
        className="px-8 py-4 bg-primary hover:bg-primary-dim disabled:opacity-60 text-white font-black rounded-2xl text-base transition-all shadow-lg shadow-primary/20 hover:scale-105 flex items-center gap-2 mx-auto"
      >
        {loading
          ? <><Loader2 size={18} className="animate-spin" /> 데모 학급 준비 중...</>
          : <><Play size={18} strokeWidth={3} /> 체험 시작하기</>
        }
      </button>
      {error && <p className="mt-3 text-xs text-red-500 font-bold">{error}</p>}
      <p className="mt-4 text-xs text-on-surface-variant/60">로그인·회원가입 없이 바로 체험 가능합니다</p>
    </motion.div>
  </div>
);

// ─── STAGE 1: 선생님 — 학급 뷰 ────────────────────────────────────────────────

const Stage1 = ({ entryCode, onNext }: { entryCode: string; onNext: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const entryUrl = `${window.location.origin}/classroom-entry?code=${entryCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(entryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(entryUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-20 pt-4">
      {/* 학급 헤더 카드 */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-3xl p-6 mb-4 text-white shadow-lg shadow-amber-200">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">교과 학급</span>
            <h2 className="text-2xl font-black mt-2 tracking-tight">{MOCK_CLASS.name}</h2>
            <p className="text-amber-100 text-sm mt-1">{MOCK_CLASS.subject} · {MOCK_CLASS.grade}</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <School size={24} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <KeyRound size={14} />
            <span className="font-black tracking-widest text-sm">{entryCode}</span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? '복사됨!' : '코드 복사'}
          </button>
        </div>
      </div>

      {/* 주차 정보 */}
      <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black bg-primary text-white px-2 py-0.5 rounded-full">
            {MOCK_CLASS.currentWeek}주차 진행 중
          </span>
        </div>
        <p className="font-black text-on-surface text-sm">{MOCK_CLASS.weekTopic}</p>
        <p className="text-on-surface-variant text-xs mt-1 leading-relaxed">{MOCK_CLASS.weekDesc}</p>
      </div>

      {/* 학생 목록 */}
      <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-surface-container-high flex items-center justify-between">
          <span className="text-sm font-black">학생 명단</span>
          <span className="text-xs text-on-surface-variant font-bold">{MOCK_CLASS.grade} · 3명</span>
        </div>
        {INIT_STUDENTS.map(s => (
          <div key={s.id} className="px-4 py-3 flex items-center gap-3 border-b border-surface-container last:border-0">
            <div className="w-8 h-8 rounded-xl bg-primary-container text-primary flex items-center justify-center text-xs font-black">
              {s.number}
            </div>
            <span className="font-bold text-sm flex-1">{s.name}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
              s.status === 'completed'
                ? 'bg-emerald-100 text-emerald-700'
                : s.status === 'writing'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-surface-container text-on-surface-variant'
            }`}>
              {s.status === 'completed' ? '완료' : s.status === 'writing' ? '작성 중' : '대기'}
            </span>
          </div>
        ))}
      </div>

      {/* 공유 버튼 */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6">
        <p className="text-sm font-black text-emerald-800 mb-1">📤 학생에게 입장 링크 공유</p>
        <p className="text-xs text-emerald-600/80 mb-3">아래 링크를 학생들에게 전달하면 입장코드 없이 바로 참여할 수 있어요.</p>
        <div className="flex gap-2">
          <div className="flex-1 bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-mono text-on-surface-variant truncate">
            {entryUrl}
          </div>
          <button
            onClick={handleCopyLink}
            className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold"
          >
            {linkCopied ? '복사됨!' : '복사'}
          </button>
        </div>
      </div>

      <DemoNextButton onClick={onNext} label="다음 → 학생 입장 체험 (실제 화면으로 이동)" color="amber" />
    </div>
  );
};

// ─── STAGE 5: 선생님 — 실시간 현황 ───────────────────────────────────────────

const Stage5 = ({ students, onNext }: { students: Student[]; onNext: () => void }) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 1000);
    return () => clearInterval(t);
  }, []);

  const statusConfig = {
    completed: { label: '제출 완료', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    writing:   { label: '작성 중',   color: 'bg-amber-100 text-amber-700 border-amber-200',     dot: 'bg-amber-400' },
    pending:   { label: '미제출',    color: 'bg-surface-container text-on-surface-variant border-surface-container-high', dot: 'bg-surface-container-highest' },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10 pt-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-black text-lg text-on-surface">{MOCK_CLASS.name}</h2>
          <p className="text-xs text-on-surface-variant">{MOCK_CLASS.currentWeek}주차 실시간 현황</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
          <span className={`w-2 h-2 rounded-full bg-emerald-500 ${pulse ? 'opacity-100' : 'opacity-40'} transition-opacity`} />
          <span className="text-xs font-black text-emerald-700">실시간</span>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: '제출 완료', count: students.filter(s => s.status === 'completed').length, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
          { label: '작성 중',   count: students.filter(s => s.status === 'writing').length,   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
          { label: '미제출',    count: students.filter(s => s.status === 'pending').length,   color: 'text-on-surface-variant', bg: 'bg-surface-container border-surface-container-high' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`rounded-2xl border ${bg} px-4 py-3 text-center`}>
            <p className={`text-2xl font-black ${color}`}>{count}</p>
            <p className="text-[10px] font-bold text-on-surface-variant mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 학생 목록 */}
      <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high overflow-hidden mb-5">
        {students.map((s, idx) => {
          const cfg = statusConfig[s.status];
          return (
            <div key={s.id} className={`px-4 py-4 flex items-center gap-3 ${idx !== students.length - 1 ? 'border-b border-surface-container' : ''}`}>
              <div className="w-9 h-9 rounded-xl bg-primary-container text-primary flex items-center justify-center text-sm font-black">
                {s.number}
              </div>
              <div className="flex-1">
                <p className="font-black text-sm text-on-surface">{s.name}</p>
                {s.status === 'completed' && (
                  <p className="text-[10px] text-on-surface-variant mt-0.5">방금 제출 · 승인 대기</p>
                )}
                {s.status === 'writing' && (
                  <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full bg-amber-400 ${pulse ? 'opacity-100' : 'opacity-40'} transition-opacity`} />
                    지금 작성하고 있어요
                  </p>
                )}
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      <DemoNextButton onClick={onNext} label="다음 → 승인 처리하기" color="amber" />
    </div>
  );
};

// ─── STAGE 6: 선생님 — 승인 처리 ─────────────────────────────────────────────

const Stage6 = ({
  students, setStudents, onNext
}: {
  students: Student[];
  setStudents: (s: Student[]) => void;
  onNext: () => void;
}) => {
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const handleApprove = () => {
    setApproved(true);
    setStudents(students.map(s => s.id === 's1' ? { ...s, obsStatus: 'approved' } : s));
    setTimeout(onNext, 1800);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10 pt-4">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="font-black text-lg text-on-surface">제출 검토</h2>
        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">승인 대기 1건</span>
      </div>

      {/* 제출 카드 */}
      <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-surface-container flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-container text-primary flex items-center justify-center text-xs font-black">1</div>
          <div className="flex-1">
            <p className="font-black text-sm text-on-surface">김민준</p>
            <p className="text-[10px] text-on-surface-variant">{MOCK_CLASS.currentWeek}주차 · 활동기록</p>
          </div>
          <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">검토 대기</span>
        </div>

        <div className="px-4 py-4">
          <p className={`text-sm text-on-surface leading-relaxed ${!showDetail ? 'line-clamp-4' : ''}`}>
            {MOCK_OBS_TEXT}
          </p>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="text-xs text-primary font-bold mt-2 flex items-center gap-1"
          >
            <Eye size={12} /> {showDetail ? '접기' : '전체 보기'}
          </button>
        </div>

        <div className="px-4 py-3 border-t border-surface-container flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] text-on-surface-variant">
            <span className="w-4 h-4 rounded bg-emerald-100 flex items-center justify-center">✓</span>
            AI 검토 통과
          </div>
          <span className="text-[10px] text-on-surface-variant/40">·</span>
          <span className="text-[10px] text-on-surface-variant">{MOCK_OBS_TEXT.length}자</span>
        </div>
      </div>

      {/* 버튼 */}
      {approved ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-4"
        >
          <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
          <p className="font-black text-emerald-800 text-sm">김민준 활동기록 승인 완료!</p>
        </motion.div>
      ) : rejected ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-4"
        >
          <X size={22} className="text-red-500 shrink-0" />
          <p className="font-black text-red-800 text-sm">반려 처리됨. 학생에게 알림 전송.</p>
        </motion.div>
      ) : (
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setRejected(true)}
            className="flex-1 py-3.5 border-2 border-red-200 text-red-600 hover:bg-red-50 font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <X size={16} strokeWidth={3} /> 반려
          </button>
          <button
            onClick={handleApprove}
            className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-200"
          >
            <Check size={16} strokeWidth={3} /> 승인
          </button>
        </div>
      )}

      {!approved && !rejected && (
        <p className="text-center text-xs text-on-surface-variant">
          학생이 제출한 기록을 검토하고 승인 또는 반려하세요
        </p>
      )}
    </div>
  );
};

// ─── STAGE 7: 선생님 — AI 세특 생성 ──────────────────────────────────────────

const Stage7 = ({ onNext }: { onNext: () => void }) => {
  const [phase, setPhase] = useState<'select' | 'loading' | 'result'>('select');
  const [displayedText, setDisplayedText] = useState('');
  const [charIdx, setCharIdx] = useState(0);

  const handleGenerate = () => {
    setPhase('loading');
    setTimeout(() => {
      setPhase('result');
      setCharIdx(0);
      setDisplayedText('');
    }, 2000);
  };

  useEffect(() => {
    if (phase !== 'result') return;
    if (charIdx >= MOCK_SESPEC.length) return;
    const t = setTimeout(() => {
      setDisplayedText(MOCK_SESPEC.slice(0, charIdx + 1));
      setCharIdx(c => c + 1);
    }, 18);
    return () => clearTimeout(t);
  }, [phase, charIdx]);

  const done = charIdx >= MOCK_SESPEC.length;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10 pt-4">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-violet-600 rounded-xl flex items-center justify-center">
          <Sparkles size={16} className="text-white" />
        </div>
        <h2 className="font-black text-lg text-on-surface">AI 세특 생성</h2>
      </div>

      {phase === 'select' && (
        <>
          <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-surface-container">
              <p className="text-xs font-black text-on-surface-variant">세특 생성할 학생 선택</p>
            </div>
            {[{ id: 's1', number: 1, name: '김민준', obsCount: 1 }].map(s => (
              <div key={s.id} className="px-4 py-3.5 flex items-center gap-3">
                <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </div>
                <div className="w-8 h-8 rounded-xl bg-primary-container text-primary flex items-center justify-center text-xs font-black">
                  {s.number}
                </div>
                <div className="flex-1">
                  <p className="font-black text-sm">{s.name}</p>
                  <p className="text-[10px] text-on-surface-variant">활동기록 {s.obsCount}건 · 승인 완료</p>
                </div>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">준비됨</span>
              </div>
            ))}
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 mb-5">
            <p className="text-xs font-black text-violet-800 mb-1">✨ AI 세특 생성 방식</p>
            <p className="text-[11px] text-violet-600/80 leading-relaxed">
              승인된 활동기록을 분석해 학교생활기록부에 바로 넣을 수 있는 500자 내외의 세특 문장을 자동으로 생성합니다.
            </p>
          </div>

          <button
            onClick={handleGenerate}
            className="w-full py-4 bg-gradient-to-r from-primary to-violet-600 hover:from-primary-dim hover:to-violet-700 text-white font-black rounded-2xl text-sm transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Sparkles size={18} />
            AI 세특 자동 생성
          </button>
        </>
      )}

      {phase === 'loading' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-violet-600 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={32} className="text-white" />
            </div>
          </div>
          <p className="font-black text-on-surface text-sm mb-1">Gemini AI가 세특을 작성하고 있습니다</p>
          <p className="text-xs text-on-surface-variant">활동기록 분석 중...</p>
          <div className="flex gap-1.5 justify-center mt-4">
            {[0,1,2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {phase === 'result' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black">
              <Check size={10} strokeWidth={3} /> 생성 완료
            </div>
            <span className="text-[10px] text-on-surface-variant">김민준 · {MOCK_CLASS.subject}</span>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border-2 border-primary/20 p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-primary">AI 세특 초안</p>
              <span className="text-[10px] text-on-surface-variant font-mono">{displayedText.length}/500자</span>
            </div>
            <p className="text-sm text-on-surface leading-relaxed">
              {displayedText}
              {!done && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />}
            </p>
          </div>

          {done && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex gap-2 mb-5">
                <button className="flex-1 py-2.5 border border-surface-container-high rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5">
                  <Copy size={12} /> 복사하기
                </button>
                <button className="flex-1 py-2.5 bg-surface-container rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5">
                  <PenLine size={12} /> 직접 수정
                </button>
              </div>
              <DemoNextButton onClick={onNext} label="다음 → 공유 URL 생성" color="amber" />
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
};

// ─── STAGE 8: 공유 URL + CTA ──────────────────────────────────────────────────

const Stage8 = ({ navigate, classId }: { navigate: ReturnType<typeof useNavigate>; classId: string }) => {
  const [copied, setCopied] = useState(false);
  const demoShareUrl = `${window.location.origin}/share/${classId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(demoShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16 pt-6">
      {/* 완료 배지 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black mb-4">
          <Trophy size={14} className="text-amber-500" />
          체험 완료! 8단계 전 과정을 경험했습니다
        </div>
        <h2 className="text-2xl font-black text-on-surface mb-2">공유 URL로 전달</h2>
        <p className="text-on-surface-variant text-sm">담당 선생님께 URL 하나로 전체 학생 기록을 공유합니다</p>
      </motion.div>

      {/* URL 카드 */}
      <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-surface-container bg-violet-50">
          <p className="text-xs font-black text-violet-800">📎 공유 링크 생성됨</p>
        </div>
        <div className="p-4">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-surface-container rounded-xl px-3 py-2.5 text-xs font-mono text-on-surface-variant truncate">
              {demoShareUrl}
            </div>
            <button
              onClick={handleCopy}
              className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-primary text-white hover:bg-primary-dim'}`}
            >
              {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
            </button>
          </div>
          <a
            href={demoShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 flex items-center justify-center gap-1.5 w-full py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 font-bold rounded-xl text-[11px] transition-all"
          >
            <ExternalLink size={12} />
            실제 공유 화면 열어보기
          </a>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-on-surface-variant">
            {[
              { icon: Eye, label: '열람: 링크만 있으면 OK' },
              { icon: Users, label: '로그인 불필요' },
              { icon: BookOpen, label: '학생 기록 전체 열람' },
              { icon: Share2, label: '카카오·이메일 공유' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon size={11} className="text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 체험 요약 */}
      <div className="bg-gradient-to-br from-primary/5 to-violet-50 rounded-2xl border border-primary/10 p-5 mb-6">
        <p className="text-xs font-black text-primary mb-3">방금 체험한 전체 흐름</p>
        <div className="space-y-2">
          {[
            '학급 생성 및 입장코드 발급',
            '학생 입장 (코드 + PIN)',
            '수업 자료 확인 + 활동기록 제출',
            '퀴즈 참여',
            '실시간 제출 현황 확인',
            '활동기록 승인 처리',
            'AI 세특 초안 자동 생성',
            '담당 선생님 공유 URL 전달',
          ].map((step, i) => (
            <div key={step} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[9px] font-black shrink-0">
                {i + 1}
              </div>
              <p className="text-xs font-medium text-on-surface">{step}</p>
              <CheckCircle2 size={12} className="text-emerald-500 ml-auto shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('/#request-section')}
          className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl text-base transition-all shadow-lg shadow-amber-200 hover:scale-[1.02] flex items-center justify-center gap-2"
        >
          <Heart size={18} fill="currentColor" />
          무료로 사용 신청하기
          <ArrowRight size={18} strokeWidth={3} />
        </button>

        {/* 영상 가이드 링크 */}
        <button
          onClick={() => navigate('/video-guide')}
          className="w-full py-3.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
        >
          <PlayCircle size={18} className="text-violet-500" />
          영상으로 더 자세히 알아보기
          <ChevronRight size={15} strokeWidth={2.5} />
        </button>

        <button
          onClick={() => navigate('/')}
          className="w-full py-3 border border-surface-container-high text-on-surface-variant hover:bg-surface-container font-bold rounded-2xl text-sm transition-all"
        >
          랜딩 페이지로 돌아가기
        </button>
      </div>
    </div>
  );
};

// ─── 공통 컴포넌트 ────────────────────────────────────────────────────────────

const DemoNextButton = ({
  onClick, label, color
}: {
  onClick: () => void;
  label: string;
  color: 'violet' | 'amber';
}) => (
  <button
    onClick={onClick}
    className={`w-full py-3.5 font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-md ${
      color === 'amber'
        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200'
        : 'bg-primary hover:bg-primary-dim text-white shadow-primary/20'
    }`}
  >
    {label} <ChevronRight size={16} strokeWidth={3} />
  </button>
);

export default Demo;
