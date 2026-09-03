import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { GraduationCap, BookOpen, FileText, CalendarRange, X, Loader2, ChevronRight } from 'lucide-react';

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

/** 프로필 사진 미등록 시 표시하는 그라디언트 자리 아바타 */
const AvatarPlaceholder = () => (
  <svg viewBox="0 0 88 88" className="w-full h-full" role="img" aria-label="프로필 사진 미등록">
    <defs>
      <linearGradient id="portAvatarGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffc9c9" />
        <stop offset="100%" stopColor="#a4f4cf" />
      </linearGradient>
    </defs>
    <circle cx="44" cy="44" r="44" fill="url(#portAvatarGrad)" />
    <circle cx="44" cy="37" r="14" fill="#1a1a1a" opacity="0.82" />
    <path d="M14 84c3-19 14-28 30-28s27 9 30 28" fill="#1a1a1a" opacity="0.82" />
  </svg>
);

const StatCard = ({ tint, icon, value, label }: { tint: 'blue' | 'mint' | 'blush'; icon: React.ReactNode; value: string | number; label: string }) => {
  const bg = tint === 'blue' ? 'bg-port-blue' : tint === 'mint' ? 'bg-port-mint' : 'bg-port-blush';
  return (
    <div className={`${bg} rounded-[12px] p-7 min-h-[148px] flex flex-col justify-between`}>
      <div>
        <p className="text-[13px] font-semibold text-port-ink/60">{label}</p>
        <p className="text-[28px] md:text-[34px] font-bold tracking-[-0.02em] text-port-ink [font-variant-numeric:tabular-nums]">{value}</p>
      </div>
      <div className="flex justify-end text-port-ink/70">{icon}</div>
    </div>
  );
};

const PortfolioPublic = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicPortfolioData | null | undefined>(undefined);
  const [visibility, setVisibility] = useState<'link_only' | 'public'>('public');
  const [openClassId, setOpenClassId] = useState<string | null>(null);

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
      <div className="min-h-screen bg-port-cream flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-port-ink/30" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen bg-port-cream flex flex-col items-center justify-center text-port-ink/40 gap-3 px-6 text-center">
        <GraduationCap size={40} className="opacity-40" />
        <p className="font-bold text-port-ink/60">존재하지 않거나 비공개된 페이지입니다.</p>
      </div>
    );
  }

  const period = formatPeriod(data.stats.periodStart, data.stats.periodEnd);
  const topSubjects = data.subjectBreakdown.slice(0, 5);
  const hasAnyPlan = data.classHistory.some(c => c.plan);
  const openClass = data.classHistory.find(c => c.id === openClassId) || null;

  return (
    <div className="min-h-screen bg-port-cream text-port-ink font-pretendard">
      {visibility === 'link_only' && <meta name="robots" content="noindex" />}

      {/* 상단 스트립 */}
      <div className="border-b border-port-ink/10">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[13px] font-semibold tracking-[0.08em] uppercase text-port-ink/60">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M2 8L8 2L14 8L8 14L2 8Z" stroke="#1a1a1a" strokeWidth="1.4" />
            </svg>
            클래스로그 포트폴리오
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-port-signal shrink-0" />
            공개 중
          </div>
        </div>
      </div>

      {/* 히어로 */}
      <section className="max-w-[1200px] mx-auto px-6 pt-24 pb-20">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-[88px] h-[88px] rounded-full overflow-hidden shrink-0">
              {data.avatarUrl ? (
                <img src={data.avatarUrl} alt={data.teacherName} className="w-full h-full object-cover" />
              ) : (
                <AvatarPlaceholder />
              )}
            </div>
            <span className="text-[13px] font-semibold tracking-[0.08em] uppercase text-port-ink/60">Teacher Portfolio</span>
          </div>

          <h1 className="text-[44px] md:text-[72px] leading-[1.04] font-bold tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
            {data.teacherName || '선생님'}
          </h1>

          {data.intro && (
            <p className="mt-8 text-[17px] md:text-xl leading-relaxed text-port-ink/60 max-w-[62ch] whitespace-pre-wrap">{data.intro}</p>
          )}

          {topSubjects.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-7">
              {topSubjects.map(s => (
                <span key={s.subject} className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full border border-port-ink/12">
                  {s.subject}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      {/* 통계 */}
      <section className="max-w-[1200px] mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard tint="blue" icon={<BookOpen size={22} />} value={`${data.stats.classCount}개`} label="운영 클래스" />
          <StatCard tint="mint" icon={<FileText size={22} />} value={`${data.stats.totalMaterials}건`} label="누적 수업 자료" />
          <StatCard tint="blush" icon={<CalendarRange size={22} />} value={period || '기간 미상'} label="활동 기간" />
        </div>
      </section>

      {/* 진행한 수업 */}
      {data.classHistory.length > 0 && (
        <section className="max-w-[1200px] mx-auto px-6 pb-28">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-10">
            <h2 className="text-[26px] md:text-[36px] font-semibold tracking-[-0.015em]">진행한 수업</h2>
            <p className="text-sm font-medium text-port-ink/60">
              {hasAnyPlan ? '수업계획서가 등록된 항목은 클릭하면 자세히 볼 수 있습니다' : '직접 진행한 수업 목록입니다'}
            </p>
          </div>

          <div className="border-t border-port-ink">
            {data.classHistory.map(c => {
              const clickable = !!c.plan;
              const Row = clickable ? 'button' : 'div';
              return (
                <Row
                  key={c.id}
                  onClick={clickable ? () => setOpenClassId(prev => (prev === c.id ? null : c.id)) : undefined}
                  className={`w-full flex items-center gap-5 py-6 px-1 border-b border-port-ink/12 text-left group ${clickable ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-lg md:text-xl font-semibold tracking-[-0.01em] ${clickable ? 'group-hover:underline underline-offset-4' : ''}`}>{c.name}</p>
                    <p className="mt-1.5 text-sm text-port-ink/60">
                      {formatPeriod(c.startDate, c.endDate) || '기간 미상'}
                      {c.classType && CLASS_TYPE_LABEL[c.classType] ? ` · ${CLASS_TYPE_LABEL[c.classType]}` : ''}
                      {!c.plan && ' · 수업계획서 없음'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {c.subject && (
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-port-cream border border-port-ink/12">{c.subject}</span>
                    )}
                    <span className="text-[13px] font-medium text-port-ink/40 whitespace-nowrap">자료 {c.materialCount}건</span>
                    {clickable && (
                      <ChevronRight
                        size={16}
                        className={`text-port-ink/40 shrink-0 transition-transform ${openClassId === c.id ? 'rotate-90' : ''}`}
                      />
                    )}
                  </div>
                </Row>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {openClass?.plan && (
              <motion.div
                key={openClass.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-6 border border-port-ink rounded-[12px] p-6 md:p-10 bg-port-card"
              >
                <div className="flex items-start justify-between gap-4 mb-7">
                  <div className="min-w-0">
                    <p className="text-xl md:text-2xl font-bold tracking-[-0.015em] truncate">
                      {openClass.plan.sections.basicInfo.unitTitle || openClass.name}
                    </p>
                    <p className="text-sm text-port-ink/60 mt-1 truncate">{openClass.name}</p>
                  </div>
                  <button
                    onClick={() => setOpenClassId(null)}
                    className="p-1.5 rounded-lg border border-port-ink/12 hover:bg-port-cream transition-colors shrink-0"
                    aria-label="닫기"
                  >
                    <X size={16} />
                  </button>
                </div>

                {(openClass.plan.sections.basicInfo.target || openClass.plan.sections.basicInfo.periods) && (
                  <div className="flex flex-wrap gap-2 mb-7">
                    {openClass.plan.sections.basicInfo.target && (
                      <span className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full border border-port-ink/12">{openClass.plan.sections.basicInfo.target}</span>
                    )}
                    {openClass.plan.sections.basicInfo.periods && (
                      <span className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full border border-port-ink/12">{openClass.plan.sections.basicInfo.periods}</span>
                    )}
                  </div>
                )}

                {openClass.plan.sections.objectives && (
                  <div className="mb-6">
                    <p className="text-xs font-bold tracking-[0.04em] uppercase text-port-ink/60 mb-2">학습목표</p>
                    <p className="text-[15px] leading-[1.7] whitespace-pre-wrap">{openClass.plan.sections.objectives}</p>
                  </div>
                )}

                {(openClass.plan.sections.activities.intro || openClass.plan.sections.activities.development || openClass.plan.sections.activities.closing) && (
                  <div className="mb-6">
                    <p className="text-xs font-bold tracking-[0.04em] uppercase text-port-ink/60 mb-2">활동 흐름</p>
                    <div className="space-y-1.5 text-[15px] leading-[1.7]">
                      {openClass.plan.sections.activities.intro && (
                        <p><span className="font-bold">도입 ·</span> {openClass.plan.sections.activities.intro}</p>
                      )}
                      {openClass.plan.sections.activities.development && (
                        <p><span className="font-bold">전개 ·</span> {openClass.plan.sections.activities.development}</p>
                      )}
                      {openClass.plan.sections.activities.closing && (
                        <p><span className="font-bold">정리 ·</span> {openClass.plan.sections.activities.closing}</p>
                      )}
                    </div>
                  </div>
                )}

                {openClass.plan.sections.assessment && (
                  <div>
                    <p className="text-xs font-bold tracking-[0.04em] uppercase text-port-ink/60 mb-2">평가 계획</p>
                    <p className="text-[15px] leading-[1.7] whitespace-pre-wrap">{openClass.plan.sections.assessment}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* 푸터 */}
      <footer className="border-t border-port-ink">
        <div className="max-w-[1200px] mx-auto px-6 py-10 flex items-center justify-between flex-wrap gap-3">
          <p className="text-[13px] text-port-ink/60">{data.teacherName}</p>
          <p className="text-[13px] text-port-ink/60">클래스로그로 만든 포트폴리오입니다</p>
        </div>
      </footer>
    </div>
  );
};

export default PortfolioPublic;
