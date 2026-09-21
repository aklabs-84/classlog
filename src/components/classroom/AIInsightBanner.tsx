import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, MessageSquare, RefreshCw, BarChart3 } from 'lucide-react';
import { generateClassInsight } from '../../lib/gemini';
import AiCreditCost from '../common/AiCreditCost';

interface AIInsightBannerProps {
  className: string;
  classId?: string;
  students: any[];
  onOpenReport: () => void;
  onOpenChat: () => void;
}

const AIInsightBanner = ({ className, classId, students, onOpenReport, onOpenChat }: AIInsightBannerProps) => {
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  const fetchInsight = async () => {
    const allObservations = students.flatMap(s => s.all_observations || []);

    if (students.length === 0 || allObservations.length === 0) {
      setInsight('아직 분석할 활동 기록이 없습니다. 학생들의 활동을 기록하면 AI가 학급 현황을 분석해드립니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await generateClassInsight(className, allObservations, classId);
      setInsight(result);
    } catch (error: any) {
      console.error('AI Insight Error:', error);
      const isNetworkError = error?.message?.includes('404') || error?.message?.includes('JSON');
      setInsight(
        isNetworkError
          ? 'AI 서버에 연결할 수 없습니다. vercel dev로 실행 중인지 확인하거나, 배포 환경에서 GEMINI_API_KEY를 설정해 주세요.'
          : 'AI 분석 중 오류가 발생했습니다. 잠시 후 새로고침 버튼을 눌러 다시 시도해 주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    setStarted(true);
    fetchInsight();
  };

  // className 변경(학급 전환) 시 분석 초기화
  useEffect(() => {
    setStarted(false);
    setInsight('');
    setLoading(false);
  }, [className]);

  // ── 분석 시작 전 — 대기 화면 ────────────────────────────────────────────
  if (!started) {
    const obsCount = students.flatMap(s => s.all_observations || []).length;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group mb-10 w-full max-w-3xl mx-auto"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/15 via-secondary/8 to-primary/15 rounded-3xl blur-xl opacity-25" />
        <div className="relative glass rounded-3xl p-10 md:p-14 border border-white/50 shadow-soft flex flex-col items-center text-center gap-8 overflow-hidden bg-white/60">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />

          {/* 아이콘 */}
          <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl flex items-center justify-center relative z-10 border border-primary/10">
            <Sparkles size={36} className="text-primary/50" />
          </div>

          {/* 설명 */}
          <div className="space-y-3 z-10">
            <h3 className="text-2xl font-black tracking-tight">AI 인사이트 분석</h3>
            <p className="text-base text-on-surface-variant leading-relaxed max-w-md">
              누적된 활동 기록을 AI가 분석하여 <span className="font-black text-on-surface">학급 현황 인사이트</span>를 생성합니다.
            </p>
            {/* 데이터 현황 */}
            <div className="flex items-center justify-center gap-6 pt-2">
              <div className="text-center">
                <p className="text-2xl font-black text-primary">{students.length}</p>
                <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">학생</p>
              </div>
              <div className="w-px h-8 bg-surface-container-high" />
              <div className="text-center">
                <p className="text-2xl font-black text-primary">{obsCount}</p>
                <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">활동 기록</p>
              </div>
            </div>
            {obsCount === 0 && (
              <p className="text-xs text-on-surface-variant/50 mt-1">
                활동 기록이 없으면 분석 결과가 제한적일 수 있습니다.
              </p>
            )}
          </div>

          {/* 시작 버튼 */}
          <button
            onClick={handleStart}
            className="relative z-10 flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-primary to-primary-dim text-white rounded-2xl font-black text-sm shadow-xl shadow-primary/25 hover:scale-[1.03] active:scale-95 transition-all"
          >
            <Sparkles size={18} />
            인사이트 분석 시작
          </button>
          <AiCreditCost feature="class_insight" className="relative z-10" />

          {/* 보조 버튼 */}
          <div className="flex gap-3 z-10 w-full max-w-sm">
            <button
              onClick={onOpenReport}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-surface-container-high rounded-2xl text-xs font-black text-on-surface-variant hover:bg-surface-container transition-all"
            >
              <BarChart3 size={14} /> 상세 리포트
            </button>
            <button
              onClick={onOpenChat}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-surface-container-high rounded-2xl text-xs font-black text-on-surface-variant hover:bg-surface-container transition-all"
            >
              <MessageSquare size={14} /> AI 질문하기
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── 분석 중 / 결과 화면 ──────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group mb-10 w-full max-w-5xl mx-auto"
    >
      {/* Premium Glow Background */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-secondary/10 to-primary/20 rounded-3xl blur-xl opacity-30 group-hover:opacity-40 transition duration-1000 animate-pulse" />

      <div className="relative glass rounded-3xl p-10 md:p-14 border border-white/50 shadow-soft flex flex-col items-center text-center gap-8 overflow-hidden bg-white/50">
        {/* Dynamic Abstract Background Elements */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />

        {/* AI Icon Orb */}
        <div className="relative shrink-0">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-dim rounded-2xl shadow-xl flex items-center justify-center text-white relative z-10 overflow-hidden group-hover:scale-105 transition-transform duration-700">
            <motion.div
              animate={loading ? { rotate: 360 } : {}}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            >
              <Sparkles size={28} className="relative z-10" />
            </motion.div>
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {/* Pulsing ring */}
          <div className="absolute inset-0 bg-primary/20 rounded-2xl animate-ping opacity-10" />
        </div>

        {/* Content Section */}
        <div className="flex-1 space-y-5 text-center z-10 w-full">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">
              <BarChart3 size={11} className="shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-[0.15em] whitespace-nowrap">AI Insight Engine</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest bg-surface-container/50 px-3 py-1 rounded-full whitespace-nowrap">
              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
              {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              <button
                onClick={fetchInsight}
                className="ml-1.5 p-1 hover:bg-white rounded-md transition-all active:scale-90"
                disabled={loading}
                title="다시 분석"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <p className="text-sm font-bold text-on-surface-variant/50 mb-4">AI가 분석하는 중...</p>
                <div className="h-6 bg-surface-container/50 rounded-lg w-full lg:w-4/5 animate-pulse mx-auto" />
                <div className="h-6 bg-surface-container/50 rounded-lg w-3/4 lg:w-1/2 animate-pulse mx-auto" />
              </motion.div>
            ) : (
              <motion.p
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl md:text-3xl font-black leading-tight text-on-surface font-pretendard tracking-tight max-w-2xl mx-auto"
              >
                {insight}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full max-w-xl mx-auto z-10 pt-2">
          <button
            onClick={onOpenReport}
            className="group/btn flex-1 px-6 py-4 bg-on-surface text-surface rounded-2xl font-black text-xs hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2.5 shadow-xl shadow-on-surface/10 whitespace-nowrap"
          >
            <span>상세 분석 레포트</span>
            <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={onOpenChat}
            className="flex-1 px-6 py-4 bg-white text-on-surface border border-on-surface/10 rounded-2xl font-black text-xs hover:bg-surface-container transition-all flex items-center justify-center gap-2.5 shadow-soft whitespace-nowrap group/chat"
          >
            <MessageSquare size={16} className="group-hover/chat:scale-110 transition-transform" />
            <span>AI 질문하기</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default AIInsightBanner;
