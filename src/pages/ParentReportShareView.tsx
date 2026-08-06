import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, Printer, Sparkles, CalendarCheck, Activity, Star, Trophy, Quote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AttendanceDonutChart, WeeklyTrendChart, type WeeklyTrendPoint } from '../components/share/ShareCharts';

interface ParentReportStats {
  attendance: { total: number; byStatus: Record<string, number> };
  weeklyTrend: WeeklyTrendPoint[];
  avgScore: number | null;
  participationCount: number;
  achievementLevel: string | null;
}

interface ParentReport {
  student_name: string;
  org_name: string | null;
  period_label: string | null;
  content: string;
  stats: ParentReportStats | null;
  created_at: string;
}

const ParentReportShareView = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [report, setReport] = useState<ParentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shareToken) return;
    (async () => {
      const { data, error: rpcError } = await supabase
        .rpc('get_parent_report_by_token', { p_token: shareToken })
        .maybeSingle();
      if (rpcError || !data) {
        setError('링크가 만료되었거나 존재하지 않습니다.');
      } else {
        setReport(data as ParentReport);
      }
      setLoading(false);
    })();
  }, [shareToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-indigo-500" />
          <p className="text-sm font-semibold text-gray-500">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-black text-gray-800">확인할 수 없는 링크입니다</h2>
          <p className="text-sm text-gray-500 leading-relaxed">{error || '링크를 다시 확인해주세요.'}</p>
        </div>
      </div>
    );
  }

  const dateStr = new Date(report.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const stats = report.stats;
  const attendanceRate = stats?.attendance?.total
    ? Math.round(((stats.attendance.byStatus.present || 0) / stats.attendance.total) * 100)
    : null;

  const statCards = [
    attendanceRate !== null && {
      icon: CalendarCheck, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-300',
      label: '출석률', value: `${attendanceRate}%`,
    },
    stats && stats.participationCount > 0 && {
      icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-300',
      label: '참여 활동', value: `${stats.participationCount}건`,
    },
    stats?.avgScore != null && {
      icon: Star, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-300',
      label: '평균 평가 점수', value: `${stats.avgScore.toFixed(1)}점`,
    },
    stats?.achievementLevel && {
      icon: Trophy, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-300',
      label: '종합 성취도', value: stats.achievementLevel,
    },
  ].filter(Boolean) as { icon: typeof CalendarCheck; color: string; bg: string; border: string; label: string; value: string }[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 font-sans relative">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .pr-print-card, .pr-print-card * { visibility: visible !important; }
          .pr-print-card {
            position: absolute !important;
            top: 0; left: 0;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print:hidden pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 -left-20 w-72 h-72 bg-indigo-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-blue-200/30 rounded-full blur-3xl" />
      </div>

      <div className="print:hidden sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl lg:max-w-4xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-xs font-black text-gray-400">클래스로그 AI</span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-all"
          >
            <Printer size={14} /> PDF로 저장
          </button>
        </div>
      </div>

      <div className="relative max-w-2xl lg:max-w-4xl mx-auto px-5 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pr-print-card bg-white rounded-3xl shadow-xl shadow-indigo-100/60 border border-gray-100 overflow-hidden"
        >
          <div className="relative bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 px-8 py-10 text-center overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '16px 16px' }}
            />
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-4 border border-white/25">
                <span className="text-white text-2xl font-black">{report.student_name.charAt(0)}</span>
              </div>
              {report.org_name && <p className="text-indigo-100 text-xs font-bold mb-1 tracking-wide">{report.org_name}</p>}
              <h1 className="text-white font-black text-2xl">{report.student_name} 학생 성장 보고서</h1>
              {report.period_label && <p className="text-indigo-100 text-xs font-semibold mt-1.5">{report.period_label}</p>}
              {stats?.achievementLevel && (
                <div className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur border border-white/30">
                  <Trophy size={12} className="text-amber-200" />
                  <span className="text-white text-[11px] font-bold">종합 성취도 {stats.achievementLevel}</span>
                </div>
              )}
            </div>
          </div>

          {statCards.length > 0 && (
            <div className={`grid gap-3 px-8 pt-7 ${statCards.length >= 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
              {statCards.map((card) => (
                <div key={card.label} className={`rounded-2xl ${card.bg} border-l-4 ${card.border} p-3.5`}>
                  <div className="w-8 h-8 rounded-xl bg-white/70 flex items-center justify-center mb-2.5 shadow-sm">
                    <card.icon size={15} className={card.color} />
                  </div>
                  <p className="text-lg font-black text-gray-900 tabular-nums">{card.value}</p>
                  <p className="text-[10px] font-bold text-gray-500 mt-0.5">{card.label}</p>
                </div>
              ))}
            </div>
          )}

          {stats && stats.weeklyTrend.length > 0 && (
            <div className="px-8 pt-8">
              <div className="rounded-2xl bg-blue-50/60 border border-blue-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-blue-400 flex items-center justify-center">
                    <Activity size={12} className="text-white" />
                  </div>
                  <p className="text-[11px] font-black text-blue-500 uppercase tracking-widest">주차별 성장 추이</p>
                </div>
                <WeeklyTrendChart data={stats.weeklyTrend} height={180} />
              </div>
            </div>
          )}

          {stats && stats.attendance.total > 0 && (
            <div className="px-8 pt-8">
              <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-emerald-400 flex items-center justify-center">
                    <CalendarCheck size={12} className="text-white" />
                  </div>
                  <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">출석 현황</p>
                </div>
                <AttendanceDonutChart total={stats.attendance.total} byStatus={stats.attendance.byStatus} />
              </div>
            </div>
          )}

          <div className="px-8 py-9">
            <div className="relative rounded-2xl bg-indigo-50/60 border-l-4 border-indigo-400 p-6">
              <Quote size={30} className="absolute top-4 right-5 text-indigo-200" />
              <div className="relative flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-indigo-400" />
                <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">선생님의 코멘트</p>
              </div>
              <p className="relative text-[15px] text-gray-700 leading-[2] whitespace-pre-wrap">{report.content}</p>
            </div>
          </div>

          <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-semibold">{dateStr} 작성</p>
            <p className="text-[11px] text-gray-300 font-bold">클래스로그 AI</p>
          </div>
        </motion.div>

        <p className="text-center text-[11px] text-gray-400 font-semibold mt-6 print:hidden">
          이 보고서는 AI가 작성한 초안이며, 담당 선생님이 검토 후 전달한 내용입니다.
        </p>
      </div>
    </div>
  );
};

export default ParentReportShareView;
