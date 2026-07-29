import {
  PieChart, Pie, Cell, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Star } from 'lucide-react';
import type { SurveyQuestion, SurveyAnswer } from '../../pages/tools/SurveyTool';

const ATTENDANCE_META: Record<string, { label: string; color: string }> = {
  present: { label: '출석', color: '#10b981' },
  absent: { label: '결석', color: '#f43f5e' },
  late: { label: '지각', color: '#f59e0b' },
  early_leave: { label: '조퇴', color: '#f97316' },
  excused: { label: '공결', color: '#8b5cf6' },
};

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, padding: '6px 10px' },
  itemStyle: { padding: 0 },
  labelStyle: { fontWeight: 900, marginBottom: 2 },
};

export function AttendanceDonutChart({ total, byStatus }: { total: number; byStatus: Record<string, number> }) {
  const presentCount = byStatus.present || 0;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;
  const data = Object.keys(ATTENDANCE_META)
    .filter((key) => byStatus[key])
    .map((key) => ({ key, name: ATTENDANCE_META[key].label, value: byStatus[key], color: ATTENDANCE_META[key].color }));

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none">
              {data.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl sm:text-3xl font-black text-gray-900 tabular-nums">{rate}%</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">출석률</span>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 min-w-0">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs font-bold text-gray-500 truncate">{d.name}</span>
            <span className="text-xs font-black text-gray-900 ml-auto tabular-nums">{d.value}건</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CHOICE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function MultipleChoiceBarChart({ question, answers }: { question: SurveyQuestion; answers: SurveyAnswer[] }) {
  const data = question.options.map((opt, i) => ({
    name: opt.label,
    count: answers.filter((a) => (a.value as any).selected === i).length,
    fill: CHOICE_COLORS[i % CHOICE_COLORS.length],
  }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const height = Math.max(120, data.length * 40);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#f3f4f6" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fontWeight: 700, fill: '#374151' }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}명`, '응답']} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 font-semibold mt-1">총 {total}명 응답</p>
    </div>
  );
}

export function YesNoPieChart({ answers }: { answers: SurveyAnswer[] }) {
  const yes = answers.filter((a) => (a.value as any).value === true).length;
  const no = answers.filter((a) => (a.value as any).value === false).length;
  const total = yes + no;
  const data = [
    { name: '예', value: yes, color: '#10B981' },
    { name: '아니오', value: no, color: '#EF4444' },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="100%" stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [`${value}명`, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2">
        {[{ label: '예', count: yes, color: '#10B981' }, { label: '아니오', count: no, color: '#EF4444' }].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-sm font-black" style={{ color: item.color }}>{item.label}</span>
            <span className="text-xs font-black text-gray-900 ml-auto tabular-nums">
              {total > 0 ? Math.round((item.count / total) * 100) : 0}% · {item.count}명
            </span>
          </div>
        ))}
        <p className="text-xs text-gray-400 font-semibold pt-1">총 {total}명 응답</p>
      </div>
    </div>
  );
}

export function StarRatingBarChart({ answers }: { answers: SurveyAnswer[] }) {
  const ratings = [1, 2, 3, 4, 5];
  const data = ratings.map((r) => ({ name: `${r}★`, count: answers.filter((a) => (a.value as any).rating === r).length }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = total > 0 ? (data.reduce((s, d, i) => s + d.count * (i + 1), 0) / total).toFixed(1) : '—';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-3xl font-black text-amber-500 tabular-nums">{avg}</span>
        <div className="flex gap-0.5">
          {ratings.map((r) => <Star key={r} size={16} fill={parseFloat(avg) >= r ? '#F59E0B' : 'none'} color="#F59E0B" />)}
        </div>
        <span className="text-xs font-bold text-gray-400">/ 5점</span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 700, fill: '#374151' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}명`, '응답']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#F59E0B" />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 font-semibold mt-1">총 {total}명 응답</p>
    </div>
  );
}

export function OpinionScaleBarChart({ question, answers }: { question: SurveyQuestion; answers: SurveyAnswer[] }) {
  const maxVal = parseInt(question.options[2]?.label ?? '5', 10) || 5;
  const lowLabel = question.options[0]?.label ?? '전혀 그렇지 않다';
  const highLabel = question.options[1]?.label ?? '매우 그렇다';
  const scale = Array.from({ length: maxVal }, (_, i) => i + 1);
  const data = scale.map((v) => ({ name: String(v), count: answers.filter((a) => (a.value as any).score === v).length }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = total > 0 ? (data.reduce((s, d, i) => s + d.count * (i + 1), 0) / total).toFixed(1) : '—';

  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-3xl font-black text-pink-500 tabular-nums">{avg}</span>
        <span className="text-xs font-bold text-gray-400">/ {maxVal}점 평균</span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 700, fill: '#374151' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}명`, '응답']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#EC4899" />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-gray-400 font-semibold">{lowLabel}</span>
        <span className="text-[11px] text-gray-400 font-semibold">{highLabel}</span>
      </div>
      <p className="text-xs text-gray-400 font-semibold mt-1">총 {total}명 응답</p>
    </div>
  );
}

const RANKING_COLORS = ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#E0F2FE', '#F0F9FF', '#ECFEFF', '#CFFAFE'];

export function RankingBarChart({ question, answers }: { question: SurveyQuestion; answers: SurveyAnswer[] }) {
  const n = question.options.length;
  if (n === 0) return null;
  const data = question.options
    .map((opt, i) => ({
      name: opt.label,
      score: answers.reduce((total, a) => {
        const order = (a.value as any).order as number[] | undefined;
        if (!order) return total;
        const rank = order.indexOf(i);
        return rank === -1 ? total : total + (n - rank);
      }, 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((d, i) => ({ ...d, fill: RANKING_COLORS[i % RANKING_COLORS.length] }));
  const height = Math.max(120, data.length * 40);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#f3f4f6" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fontWeight: 700, fill: '#374151' }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}점`, '가중 점수']} />
          <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={22}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 font-semibold mt-1">순위 선택 시 순서에 따라 가중치를 부여한 점수</p>
    </div>
  );
}

export interface WeeklyTrendPoint {
  week: number;
  engagement: number;
  avgScore: number | null;
}

export function WeeklyTrendChart({ data, height = 220 }: { data: WeeklyTrendPoint[]; height?: number }) {
  const hasScore = data.some((d) => d.avgScore !== null);
  const chartData = data.map((d) => ({ ...d, name: `${d.week}주차` }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 4, right: hasScore ? 8 : 24, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#374151' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="engagement" allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
          {hasScore && (
            <YAxis yAxisId="score" orientation="right" domain={[0, 5]} tick={{ fontSize: 11, fontWeight: 700, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
          )}
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number, key: string) => (key === 'avgScore' ? [`${value.toFixed(1)}점`, '평가점수 평균'] : [`${value}건`, '참여도'])}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} formatter={(key) => (key === 'avgScore' ? '평가점수 평균' : '참여도(관찰+결과 건수)')} />
          <Bar yAxisId="engagement" dataKey="engagement" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={20} />
          {hasScore && (
            <Line yAxisId="score" type="monotone" dataKey="avgScore" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
