import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { GraduationCap, BookOpen, FileText, CalendarRange, X, Loader2, User, ChevronRight } from 'lucide-react';

interface LessonPlanSections {
  basicInfo: {
    subject: string;
    unitTitle: string;
    target: string;
    periods: string;
    date: string;
    studentCount: number | null;
  };
  objectives: string;
  activities: {
    intro: string;
    development: string;
    closing: string;
  };
  materials: string;
  assessment: string;
  standards?: string;
}

interface ClassHistoryEntry {
  id: string;
  name: string;
  subject: string | null;
  classType: string | null;
  startDate: string | null;
  endDate: string | null;
  materialCount: number;
  plan: { purpose: 'formal' | 'summary' | 'parent'; sections: LessonPlanSections } | null;
}

interface PublicPortfolioData {
  teacherName: string;
  avatarUrl: string | null;
  intro: string;
  stats: {
    classCount: number;
    totalMaterials: number;
    periodStart: string | null;
    periodEnd: string | null;
  };
  subjectBreakdown: Array<{ subject: string; count: number }>;
  classHistory: ClassHistoryEntry[];
}

const CLASS_TYPE_LABEL: Record<string, string> = { subject: '교과 수업', homeroom: '담임 학급' };

const formatMonth = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
};

const formatPeriod = (start: string | null, end: string | null) => {
  const s = formatMonth(start);
  if (!s) return null;
  const e = formatMonth(end);
  return e && e !== s ? `${s} ~ ${e}` : `${s} ~ 진행중`;
};

const StatPill = ({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) => (
  <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-3">
    <div className="text-writer-orchid shrink-0">{icon}</div>
    <div>
      <p className="font-poppins text-lg font-bold leading-tight text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 font-medium">{label}</p>
    </div>
  </div>
);

const PortfolioPublic = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicPortfolioData | null | undefined>(undefined);
  const [visibility, setVisibility] = useState<'link_only' | 'public'>('public');
  const [viewingClass, setViewingClass] = useState<ClassHistoryEntry | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: rpcData } = await supabase.rpc('get_public_portfolio', { p_slug: slug });
      setData(rpcData ?? null);
      if (rpcData) {
        const { data: row } = await supabase.from('teacher_portfolios').select('visibility').eq('slug', slug).maybeSingle();
        if (row?.visibility === 'link_only') setVisibility('link_only');
      }
    })();
  }, [slug]);

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-3 px-6 text-center">
        <GraduationCap size={40} className="opacity-40" />
        <p className="font-bold text-slate-500">존재하지 않거나 비공개된 페이지입니다.</p>
      </div>
    );
  }

  const period = formatPeriod(data.stats.periodStart, data.stats.periodEnd);
  const topSubjects = data.subjectBreakdown.slice(0, 5);
  const hasAnyPlan = data.classHistory.some(c => c.plan);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-pretendard">
      {visibility === 'link_only' && (
        <meta name="robots" content="noindex" />
      )}

      {/* 히어로 */}
      <section className="bg-white border-b border-slate-200">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-4"
        >
          <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            {data.avatarUrl ? (
              <img src={data.avatarUrl} alt={data.teacherName} className="w-full h-full object-cover" />
            ) : (
              <User size={36} className="text-slate-300" />
            )}
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-poppins font-semibold tracking-[0.1em] text-slate-500">
            <GraduationCap size={12} /> TEACHER PORTFOLIO
          </div>

          <h1 className="text-3xl md:text-4xl font-black leading-snug text-slate-900">{data.teacherName || '선생님'}</h1>

          {topSubjects.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {topSubjects.map(s => (
                <span key={s.subject} className="text-xs font-bold px-3 py-1 rounded-full bg-writer-orchid/10 text-writer-orchid">
                  {s.subject}
                </span>
              ))}
            </div>
          )}

          {data.intro && (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-w-xl">{data.intro}</p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <StatPill icon={<BookOpen size={17} />} value={data.stats.classCount} label="운영 클래스" />
            <StatPill icon={<FileText size={17} />} value={data.stats.totalMaterials} label="누적 수업 자료" />
            {period && <StatPill icon={<CalendarRange size={17} />} value={period} label="활동 기간" />}
          </div>
        </motion.div>
      </section>

      {/* 진행한 수업 */}
      {data.classHistory.length > 0 && (
        <section className="py-14 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-lg font-black mb-1 text-slate-900">진행한 수업</h2>
            <p className="text-xs text-slate-500 mb-5">
              {hasAnyPlan ? '수업계획서가 등록된 항목은 클릭하면 자세히 볼 수 있습니다.' : '직접 진행한 수업 목록입니다.'}
            </p>
            <div className="flex flex-col divide-y divide-slate-200 border border-slate-200 rounded-2xl bg-white overflow-hidden">
              {data.classHistory.map(c => (
                <div
                  key={c.id}
                  onClick={() => c.plan && setViewingClass(c)}
                  className={`flex items-center gap-4 px-5 py-4 ${c.plan ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-writer-orchid/10 text-writer-orchid flex items-center justify-center shrink-0">
                    <BookOpen size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatPeriod(c.startDate, c.endDate) || '기간 미상'}
                      {c.classType && CLASS_TYPE_LABEL[c.classType] ? ` · ${CLASS_TYPE_LABEL[c.classType]}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.subject && (
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{c.subject}</span>
                    )}
                    <span className="text-[11px] font-medium text-slate-400">자료 {c.materialCount}건</span>
                    {c.plan && <ChevronRight size={16} className="text-slate-300 shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {viewingClass?.plan && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4" onClick={() => setViewingClass(null)}>
          <div className="bg-white text-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm truncate">{viewingClass.plan.sections.basicInfo.unitTitle || viewingClass.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{viewingClass.name}</p>
              </div>
              <button onClick={() => setViewingClass(null)} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors shrink-0"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-slate-700">
              {(viewingClass.plan.sections.basicInfo.target || viewingClass.plan.sections.basicInfo.periods) && (
                <div className="flex flex-wrap gap-2">
                  {viewingClass.plan.sections.basicInfo.target && (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-bold text-slate-600">{viewingClass.plan.sections.basicInfo.target}</span>
                  )}
                  {viewingClass.plan.sections.basicInfo.periods && (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-bold text-slate-600">{viewingClass.plan.sections.basicInfo.periods}</span>
                  )}
                </div>
              )}
              {viewingClass.plan.sections.objectives && (
                <div>
                  <p className="text-xs font-black text-writer-orchid mb-1.5">학습목표</p>
                  <p className="whitespace-pre-wrap leading-relaxed">{viewingClass.plan.sections.objectives}</p>
                </div>
              )}
              {(viewingClass.plan.sections.activities.intro || viewingClass.plan.sections.activities.development || viewingClass.plan.sections.activities.closing) && (
                <div>
                  <p className="text-xs font-black text-writer-orchid mb-1.5">활동 흐름</p>
                  <div className="space-y-2">
                    {viewingClass.plan.sections.activities.intro && (
                      <p><span className="font-bold">도입 ·</span> {viewingClass.plan.sections.activities.intro}</p>
                    )}
                    {viewingClass.plan.sections.activities.development && (
                      <p><span className="font-bold">전개 ·</span> {viewingClass.plan.sections.activities.development}</p>
                    )}
                    {viewingClass.plan.sections.activities.closing && (
                      <p><span className="font-bold">정리 ·</span> {viewingClass.plan.sections.activities.closing}</p>
                    )}
                  </div>
                </div>
              )}
              {viewingClass.plan.sections.assessment && (
                <div>
                  <p className="text-xs font-black text-writer-orchid mb-1.5">평가 계획</p>
                  <p className="whitespace-pre-wrap leading-relaxed">{viewingClass.plan.sections.assessment}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioPublic;
