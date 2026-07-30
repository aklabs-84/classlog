import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import {
  X, Play, Pause, SkipForward, SkipBack,
  Volume2, Loader2, CheckCircle2, Circle, Download, BookOpen,
} from 'lucide-react';

interface BriefingModalProps {
  classId: string;
  className: string;
  onClose: () => void;
}

interface BriefingRecord {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string;
  activity_name: string;
  content: string;
  week_number: number | null;
  created_at: string;
  status: 'pending' | 'approved';
}

const SPEEDS = [0.8, 1.0, 1.2, 1.5, 2.0];

const BriefingModal = ({ classId, className, onClose }: BriefingModalProps) => {
  const [records, setRecords] = useState<BriefingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekFilter, setWeekFilter] = useState<number | 'all'>('all');
  const [weekList, setWeekList] = useState<number[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<{ week: number; topic: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.2);
  const [isDone, setIsDone] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'intro' | 'reading'>('idle');

  // refs for use inside speechSynthesis callbacks (avoid stale closures)
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1.2);
  const currentIndexRef = useRef(0);
  const studentsRef = useRef<BriefingRecord[]>([]);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // iOS keepalive: speechSynthesis pauses after ~15s on iOS
  const startKeepAlive = () => {
    if (keepAliveRef.current) return;
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  };
  const stopKeepAlive = () => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      stopKeepAlive();
    };
  }, []);

  // Fetch data
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';

      // number 컬럼은 클라이언트 정렬 — DB order()로 타입 불일치 에러 방지
      const [
        { data: students, error: studentsErr },
        { data: classData, error: classErr },
      ] = await Promise.all([
        supabase.from('students').select('id, full_name, student_number').eq('class_id', classId),
        supabase.from('classes').select('weekly_plan').eq('id', classId).single(),
      ]);

      if (studentsErr) console.error('BriefingModal students error:', studentsErr);
      if (classErr) console.error('BriefingModal class error:', classErr);

      const plan: { week: number; topic: string }[] = classData?.weekly_plan || [];
      setWeeklyPlan(plan);
      const topicWeekMap: Record<string, number> = {};
      plan.forEach((p: any) => { if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week); });

      const studentIds = (students || []).map((s: any) => s.id);
      const nameMap: Record<string, { name: string; number: string }> = Object.fromEntries(
        (students || []).map((s: any) => [s.id, { name: s.full_name, number: String(s.student_number || '-') }])
      );

      if (!studentIds.length) {
        console.warn('BriefingModal: 학생 없음 (classId:', classId, ')');
        setRecords([]);
        setLoading(false);
        return;
      }

      // pending + approved 모두 조회 — 이동 중 내용 파악 후 도착 후 승인 처리
      const { data: obs, error: obsErr } = await supabase
        .from('observations')
        .select('id, student_id, activity_name, content, created_at, status')
        .in('student_id', studentIds)
        .eq('is_student_record', true)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (obsErr) console.error('BriefingModal obs error:', obsErr);

      const enriched: BriefingRecord[] = (obs || []).map((o: any) => ({
        ...o,
        student_name: nameMap[o.student_id]?.name || '학생',
        student_number: nameMap[o.student_id]?.number || '-',
        week_number: topicWeekMap[norm(o.activity_name)] ?? null,
        status: o.status,
      }));

      const weeks = Array.from(new Set(enriched.map(r => r.week_number).filter(Boolean) as number[])).sort((a, b) => a - b);
      setWeekList(weeks);
      setRecords(enriched);
    } catch (err) {
      console.error('BriefingModal fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // 주차 필터 + 학생당 최신 1건만 + 번호순 정렬
  const byStudent: BriefingRecord[] = Object.values(
    (weekFilter === 'all' ? records : records.filter(r => r.week_number === weekFilter))
      .reduce((acc: Record<string, BriefingRecord>, r) => {
        if (!acc[r.student_id] || new Date(r.created_at) > new Date(acc[r.student_id].created_at)) acc[r.student_id] = r;
        return acc;
      }, {})
  ).sort((a, b) => {
    const na = parseInt(a.student_number) || 999;
    const nb = parseInt(b.student_number) || 999;
    return na - nb;
  });

  useEffect(() => { studentsRef.current = byStudent; }, [byStudent]);

  // Core speak function — uses refs to avoid stale closures
  const speak = useCallback((idx: number) => {
    window.speechSynthesis.cancel();
    const students = studentsRef.current;
    if (idx < 0 || idx >= students.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsDone(true);
      setPhase('idle');
      stopKeepAlive();
      return;
    }

    currentIndexRef.current = idx;
    setCurrentIndex(idx);

    const r = students[idx];
    const numStr = r.student_number !== '-' ? `${r.student_number}번, ` : '';
    const text = `${numStr}${r.student_name}. ${r.activity_name || '활동 기록'}. ${r.content || '내용이 없습니다.'}`;

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'ko-KR';
    utt.rate = speedRef.current;
    utt.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang === 'ko-KR') || voices.find(v => v.lang.startsWith('ko'));
    if (koVoice) utt.voice = koVoice;

    utt.onend = () => {
      if (!isPlayingRef.current) return;
      setTimeout(() => speak(currentIndexRef.current + 1), 600);
    };
    utt.onerror = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopKeepAlive();
    };

    window.speechSynthesis.speak(utt);
    setPhase('reading');
  }, []);

  // Intro speech then start
  const startBriefing = useCallback((startIdx: number) => {
    window.speechSynthesis.cancel();
    const students = studentsRef.current;
    const weekLabel = weekFilter === 'all' ? '전체' : `${weekFilter}주차`;
    const pendingCount = students.filter(s => s.status === 'pending').length;
    const pendingStr = pendingCount > 0 ? ` 승인 대기 ${pendingCount}건 포함.` : '';
    const introText = `${className} 이동 중 브리핑을 시작합니다. ${weekLabel} 관찰 기록, 총 ${students.length}명.${pendingStr}`;

    const utt = new SpeechSynthesisUtterance(introText);
    utt.lang = 'ko-KR';
    utt.rate = speedRef.current;
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang === 'ko-KR') || voices.find(v => v.lang.startsWith('ko'));
    if (koVoice) utt.voice = koVoice;

    utt.onend = () => {
      if (!isPlayingRef.current) return;
      setTimeout(() => speak(startIdx), 400);
    };

    setPhase('intro');
    startKeepAlive();
    window.speechSynthesis.speak(utt);
  }, [className, weekFilter, speak]);

  const handlePlay = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopKeepAlive();
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsDone(false);
      if (isDone || currentIndex >= byStudent.length) {
        setCurrentIndex(0);
        currentIndexRef.current = 0;
        startBriefing(0);
      } else if (phase === 'idle' && currentIndex === 0) {
        startBriefing(0);
      } else {
        speak(currentIndex);
      }
    }
  };

  const handleNext = () => {
    window.speechSynthesis.cancel();
    const next = currentIndex + 1;
    if (next < byStudent.length) {
      if (isPlaying) speak(next);
      else { setCurrentIndex(next); currentIndexRef.current = next; }
    }
  };

  const handlePrev = () => {
    window.speechSynthesis.cancel();
    const prev = currentIndex - 1;
    if (prev >= 0) {
      if (isPlaying) speak(prev);
      else { setCurrentIndex(prev); currentIndexRef.current = prev; }
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    speedRef.current = newSpeed;
    setSpeed(newSpeed);
    if (isPlaying) {
      // restart current with new speed
      speak(currentIndexRef.current);
    }
  };

  const handleWeekChange = (w: number | 'all') => {
    window.speechSynthesis.cancel();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPhase('idle');
    setIsDone(false);
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setWeekFilter(w);
    stopKeepAlive();
  };

  const handleClose = () => {
    window.speechSynthesis.cancel();
    stopKeepAlive();
    onClose();
  };

  // NotebookLM 소스용 텍스트 내보내기
  const handleNotebookLMExport = () => {
    if (byStudent.length === 0) return;

    const weekLabel = weekFilter === 'all' ? '전체 주차' : `${weekFilter}주차`;
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const weekTopic = weekFilter !== 'all' ? weeklyPlan.find(p => p.week === weekFilter)?.topic : null;

    let doc = '';
    doc += `학급 관찰 기록 브리핑\n`;
    doc += `${'═'.repeat(46)}\n\n`;
    doc += `학급명 : ${className}\n`;
    doc += `대상   : ${weekLabel}${weekTopic ? ` (${weekTopic})` : ''}\n`;
    doc += `생성일 : ${today}\n`;
    doc += `학생 수: ${byStudent.length}명\n`;

    const pendingCnt = byStudent.filter(s => s.status === 'pending').length;
    const approvedCnt = byStudent.filter(s => s.status === 'approved').length;
    if (pendingCnt > 0) doc += `승인 대기: ${pendingCnt}건 / 승인 완료: ${approvedCnt}건\n`;

    doc += `\n${'─'.repeat(46)}\n\n`;
    doc += `[활용 안내]\n`;
    doc += `이 문서는 Google NotebookLM에 소스로 추가하여\n`;
    doc += `"오디오 개요(Audio Overview)" 기능으로 학급 기록을\n`;
    doc += `자연스러운 팟캐스트 형식으로 들을 수 있습니다.\n`;
    doc += `\n${'═'.repeat(46)}\n\n`;

    byStudent.forEach((r, i) => {
      const numStr = r.student_number !== '-' ? `${r.student_number}번 ` : '';
      const dateStr = new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      const statusStr = r.status === 'pending' ? '승인 대기 중' : '승인 완료';

      doc += `■ 학생 ${i + 1}. ${numStr}${r.student_name}  [${statusStr}]\n`;
      doc += `활동명: ${r.activity_name || '(활동명 없음)'}\n`;
      doc += `제출일: ${dateStr}\n`;
      doc += `\n`;
      doc += `${r.content || '(내용 없음)'}\n`;
      doc += `\n${'─'.repeat(46)}\n\n`;
    });

    doc += `[클래스로그(ClassLog) 학급 관찰 기록 · 총 ${byStudent.length}명]\n`;

    const blob = new Blob([doc], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `브리핑_${className}_${weekLabel}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const current = byStudent[currentIndex];

  return (
    <AnimatePresence>
      <motion.div
        key="briefing-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md"
      />

      <motion.div
        key="briefing-modal"
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[300] pointer-events-none"
      >
        <div className="pointer-events-auto w-full md:w-[760px] bg-slate-900 rounded-t-3xl md:rounded-3xl border border-slate-700/60 shadow-2xl overflow-hidden flex flex-col max-h-[88svh] md:max-h-[88vh]">

          {/* 모바일 드래그 핸들 */}
          <div className="flex justify-center pt-3 pb-0 md:hidden shrink-0">
            <div className="w-10 h-1 bg-white/25 rounded-full" />
          </div>

          {/* 헤더 — 항상 고정, 전체 너비 */}
          <div className="px-6 pt-3 md:pt-5 pb-4 border-b border-slate-700/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                <Volume2 size={18} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">이동 중 브리핑</p>
                <h2 className="text-sm font-black text-white leading-tight">{className}</h2>
              </div>
            </div>
            <button onClick={handleClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
              <X size={16} className="text-white" />
            </button>
          </div>

          {/* 바디 — 모바일: 단일 컬럼 / 데스크탑: 좌우 2열 */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

            {/* ── 왼쪽 패널 (플레이어 + 컨트롤) ── */}
            <div className="flex flex-col md:flex-1 overflow-hidden">

              {/* 상단 영역 — 데스크탑만 스크롤, 모바일은 고정 */}
              <div className="shrink-0 md:flex-1 md:overflow-y-auto md:custom-scrollbar md:min-h-0">
                {/* 요약 카운트 + 주차 필터 — 모바일 통합 한 줄 */}
                <div className="md:hidden px-4 pt-3 pb-0 flex items-center gap-2">
                  {!loading && byStudent.length > 0 && (
                    <span className="text-[11px] font-black text-slate-400 shrink-0">총 {byStudent.length}명</span>
                  )}
                  {!loading && byStudent.filter(s => s.status === 'pending').length > 0 && (
                    <span className="text-[10px] font-black text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded-md border border-amber-700/40 shrink-0">
                      ⏳ {byStudent.filter(s => s.status === 'pending').length}건 대기
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
                    <button
                      onClick={() => handleWeekChange('all')}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all ${weekFilter === 'all' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/5 text-slate-400 border-white/10'}`}
                    >
                      전체
                    </button>
                    {weekList.map(w => (
                      <button
                        key={w}
                        onClick={() => handleWeekChange(w)}
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all ${weekFilter === w ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/5 text-slate-400 border-white/10'}`}
                      >
                        {w}주
                      </button>
                    ))}
                  </div>
                </div>

                {/* 요약 카운트 — 데스크탑 전용 */}
                {!loading && byStudent.length > 0 && (
                  <div className="hidden md:flex px-6 pt-3 pb-0 items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-black text-slate-400">총 {byStudent.length}명 제출</span>
                    {byStudent.filter(s => s.status === 'pending').length > 0 && (
                      <span className="text-[11px] font-black text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-lg border border-amber-700/40">
                        ⏳ 승인 대기 {byStudent.filter(s => s.status === 'pending').length}건
                      </span>
                    )}
                    {byStudent.filter(s => s.status === 'approved').length > 0 && (
                      <span className="text-[11px] font-black text-emerald-400">
                        ✅ {byStudent.filter(s => s.status === 'approved').length}건 승인 완료
                      </span>
                    )}
                  </div>
                )}

                {/* 현재 재생 중인 학생 카드 */}
                <div className="px-4 md:px-6 py-3 md:py-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-indigo-400" />
                    </div>
                  ) : byStudent.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <p className="text-slate-400 font-bold text-sm">제출된 활동 기록이 없습니다</p>
                      <p className="text-slate-600 text-xs">({weekFilter === 'all' ? '전체 주차' : `${weekFilter}주차`} · 총 {records.length}건 조회됨)</p>
                    </div>
                  ) : (
                    <div className={`rounded-2xl border p-4 transition-all ${isPlaying && phase === 'reading' ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-white/5 border-white/10'}`}>
                      {phase === 'intro' ? (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                            <Volume2 size={16} className="text-indigo-400 animate-pulse" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-indigo-400">브리핑 시작 중...</p>
                            <p className="text-sm font-black text-white mt-0.5">
                              {weekFilter === 'all' ? '전체' : `${weekFilter}주차`} · 총 {byStudent.length}명
                            </p>
                          </div>
                        </div>
                      ) : isDone ? (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={16} className="text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-emerald-400">브리핑 완료</p>
                            <p className="text-sm font-black text-white mt-0.5">전체 {byStudent.length}명 읽기 완료</p>
                          </div>
                        </div>
                      ) : current ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {current.student_number !== '-' && (
                                <span className="text-[10px] font-black text-slate-500">{current.student_number}번</span>
                              )}
                              <span className="text-base font-black text-white">{current.student_name}</span>
                              {isPlaying && phase === 'reading' && (
                                <span className="flex gap-0.5 items-end h-4">
                                  {[0, 1, 2].map(i => (
                                    <motion.span
                                      key={i}
                                      className="w-0.5 bg-indigo-400 rounded-full"
                                      animate={{ height: ['6px', '14px', '6px'] }}
                                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                                    />
                                  ))}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                current.status === 'pending'
                                  ? 'bg-amber-900/40 text-amber-400 border-amber-700/50'
                                  : 'bg-emerald-900/40 text-emerald-400 border-emerald-700/50'
                              }`}>
                                {current.status === 'pending' ? '⏳ 대기' : '✅ 승인'}
                              </span>
                              <span className="text-[10px] font-black text-slate-500">
                                {currentIndex + 1} / {byStudent.length}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs font-black text-indigo-300 mb-1 truncate">{current.activity_name}</p>
                          <p className="hidden md:block text-xs text-slate-400 font-bold leading-relaxed line-clamp-2">{current.content}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 font-bold text-center py-2">재생 버튼을 눌러 시작하세요</p>
                      )}
                    </div>
                  )}
                </div>

                {/* 진행 바 */}
                {byStudent.length > 0 && (
                  <div className="px-4 md:px-6 mb-2 md:mb-3">
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: byStudent.length > 0 ? `${((currentIndex + (isDone ? 1 : 0)) / byStudent.length) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 컨트롤 — 하단 고정 */}
              <div className="px-4 md:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6 pt-2 md:pt-2 space-y-3 md:space-y-4 shrink-0 border-t border-slate-800/60">
                {/* 재생 컨트롤 */}
                <div className="flex items-center justify-center gap-4 md:gap-5 pt-2 md:pt-3">
                  <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <SkipBack size={18} className="text-white" />
                  </button>

                  <button
                    onClick={handlePlay}
                    disabled={loading || byStudent.length === 0}
                    className="w-16 h-16 md:w-20 md:h-20 rounded-[1.5rem] md:rounded-[1.75rem] bg-indigo-500 hover:bg-indigo-400 active:scale-95 flex items-center justify-center transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isPlaying
                      ? <Pause size={28} className="text-white" fill="white" />
                      : <Play size={28} className="text-white fill-white" />
                    }
                  </button>

                  <button
                    onClick={handleNext}
                    disabled={currentIndex >= byStudent.length - 1}
                    className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <SkipForward size={18} className="text-white" />
                  </button>
                </div>

                {/* 속도 선택 */}
                <div className="flex items-center justify-center gap-1.5 md:gap-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">속도</span>
                  {SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`px-2.5 md:px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                        speed === s
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-400'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                {/* 내보내기 + 닫기 — 모바일: 나란히, 데스크탑: 기존 세로 */}
                <div className="space-y-2">
                  <div className="h-px bg-white/5" />
                  {/* 모바일: 나란히 */}
                  <div className="flex gap-2 md:hidden">
                    {byStudent.length > 0 && (
                      <button
                        onClick={handleNotebookLMExport}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-xs font-black text-slate-400 active:scale-95 transition-all"
                      >
                        <Download size={12} />
                        내보내기
                      </button>
                    )}
                    <button
                      onClick={handleClose}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-xs font-black text-slate-400 active:scale-95 transition-all"
                    >
                      <X size={12} />
                      닫기
                    </button>
                  </div>
                  {/* 데스크탑: 세로 */}
                  {byStudent.length > 0 && (
                    <div className="hidden md:block space-y-2">
                      <button
                        onClick={handleNotebookLMExport}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-indigo-500/15 border border-white/10 hover:border-indigo-500/40 rounded-2xl text-xs font-black text-slate-400 hover:text-indigo-300 transition-all group"
                      >
                        <Download size={13} className="group-hover:-translate-y-0.5 transition-transform" />
                        NotebookLM 소스 텍스트 내보내기
                        <BookOpen size={13} className="opacity-50" />
                      </button>
                      <p className="text-[9px] text-slate-600 font-bold text-center leading-relaxed">
                        .txt 다운로드 → NotebookLM 소스 추가 → 오디오 개요 생성
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 오른쪽 패널 — 데스크탑 전용 (주차 필터 + 학생 목록) ── */}
            <div className="hidden md:flex flex-col w-64 border-l border-slate-700/40 shrink-0">
              {/* 주차 필터 */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-700/30 shrink-0">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">주차 필터</p>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleWeekChange('all')}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${weekFilter === 'all' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-400'}`}
                  >
                    전체
                  </button>
                  {weekList.map(w => (
                    <button
                      key={w}
                      onClick={() => handleWeekChange(w)}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-black border transition-all truncate ${weekFilter === w ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-400'}`}
                    >
                      {w}주차{weeklyPlan.find(p => p.week === w)?.topic ? ` · ${weeklyPlan.find(p => p.week === w)!.topic}` : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* 학생 목록 — 전체 높이 스크롤 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4 pt-3 pb-1.5">
                  학생 목록 ({byStudent.length}명)
                </p>
                {byStudent.map((r, i) => (
                  <button
                    key={r.student_id}
                    onClick={() => {
                      window.speechSynthesis.cancel();
                      setCurrentIndex(i);
                      currentIndexRef.current = i;
                      setIsDone(false);
                      if (isPlaying) speak(i);
                    }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-all hover:bg-white/5 ${i === currentIndex ? 'bg-indigo-900/30' : ''}`}
                  >
                    {i < currentIndex || isDone ? (
                      <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />
                    ) : i === currentIndex && (isPlaying || phase !== 'idle') ? (
                      <Volume2 size={13} className="text-indigo-400 shrink-0 animate-pulse" />
                    ) : (
                      <Circle size={13} className="text-slate-600 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black truncate ${i === currentIndex ? 'text-white' : i < currentIndex ? 'text-slate-500' : 'text-slate-300'}`}>
                        {r.student_number !== '-' ? `${r.student_number}번 ` : ''}{r.student_name}
                      </p>
                      <p className="text-[10px] text-slate-600 truncate">{r.activity_name}</p>
                    </div>
                    {r.status === 'pending' && (
                      <span className="text-[8px] font-black text-amber-500 bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-700/40 shrink-0">대기</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BriefingModal;
