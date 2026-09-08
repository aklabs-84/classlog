import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, CalendarDays, Users,
  CheckCircle2, XCircle, Clock, LogOut, Shield, Loader2,
  Download, FileSpreadsheet, Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

interface AttendanceTabProps {
  classId: string;
  students: any[];
}

const STATUSES = [
  { key: 'present',     label: '출석', short: '출',  icon: CheckCircle2, color: 'emerald' },
  { key: 'absent',      label: '결석', short: '결',  icon: XCircle,      color: 'rose'    },
  { key: 'late',        label: '지각', short: '지',  icon: Clock,        color: 'amber'   },
  { key: 'early_leave', label: '조퇴', short: '조',  icon: LogOut,       color: 'orange'  },
  { key: 'excused',     label: '공결', short: '공',  icon: Shield,       color: 'violet'  },
] as const;

type StatusKey = (typeof STATUSES)[number]['key'];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-400' },
  rose:    { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    ring: 'ring-rose-400'    },
  amber:   { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   ring: 'ring-amber-400'   },
  orange:  { bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  ring: 'ring-orange-400'  },
  violet:  { bg: 'bg-violet-50',   text: 'text-violet-700',  border: 'border-violet-200',  ring: 'ring-violet-400'  },
};

const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = toDateStr(new Date());

const formatDisplayDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const STATUS_LABEL: Record<string, string> = {
  present: '출석', absent: '결석', late: '지각', early_leave: '조퇴', excused: '공결',
};

export default function AttendanceTab({ classId, students }: AttendanceTabProps) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [records, setRecords] = useState<Record<string, StatusKey>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);

  // 달력 팝업
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear]   = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const calendarRef = useRef<HTMLDivElement>(null);

  // 출석 기록이 있는 날짜 전체 목록
  const [allAttendedDates, setAllAttendedDates] = useState<Set<string>>(new Set());
  const [attendedDatesList, setAttendedDatesList] = useState<string[]>([]);
  const [showOnlyAttended, setShowOnlyAttended] = useState(false);

  // ── 전체 출석 날짜 조회 ────────────────────────────────────────────────────
  const fetchAllAttendedDates = useCallback(async () => {
    if (!classId) return;
    const { data } = await supabase
      .from('attendance')
      .select('date')
      .eq('class_id', classId);
    const dates = new Set<string>((data || []).map((r: any) => r.date));
    setAllAttendedDates(dates);
    setAttendedDatesList([...dates].sort().reverse());
  }, [classId]);

  useEffect(() => { fetchAllAttendedDates(); }, [fetchAllAttendedDates]);

  // ── 선택 날짜 출석 조회 ───────────────────────────────────────────────────
  const fetchAttendance = useCallback(async (date: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('class_id', classId)
        .eq('date', date);
      const map: Record<string, StatusKey> = {};
      (data || []).forEach((r: any) => { map[r.student_id] = r.status; });
      setRecords(map);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetchAttendance(selectedDate); }, [selectedDate, fetchAttendance]);

  // ── 오늘 수업 시작/종료 체크 ─────────────────────────────────────────────
  // (학기 전체를 닫는 is_closed와 별개 — 그날그날 리셋되는 상태)
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [sessionEndedAt, setSessionEndedAt] = useState<string | null>(null);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState<any[]>([]);
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [selectedStartWeek, setSelectedStartWeek] = useState<number | ''>('');

  const fetchSession = useCallback(async () => {
    if (!classId) return;
    const { data } = await supabase
      .from('classes')
      .select('today_started_at, today_ended_at, weekly_plan, active_week, parent_class_id')
      .eq('id', classId)
      .single();
    setSessionStartedAt(data?.today_started_at ?? null);
    setSessionEndedAt(data?.today_ended_at ?? null);
    setActiveWeek(data?.active_week ?? null);

    // 학교 프로젝트 소속 반(서브클래스)은 주차별 계획이 자신이 아니라 학교 루트 클래스에 저장되므로,
    // 부모 클래스가 있으면 그쪽의 weekly_plan을 가져와야 오늘 수업 시작 시 차시 선택 목록이 뜬다.
    if (data?.parent_class_id) {
      const { data: parentData } = await supabase
        .from('classes')
        .select('weekly_plan')
        .eq('id', data.parent_class_id)
        .single();
      setWeeklyPlan(Array.isArray(parentData?.weekly_plan) ? parentData.weekly_plan : []);
    } else {
      setWeeklyPlan(Array.isArray(data?.weekly_plan) ? data.weekly_plan : []);
    }
  }, [classId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  const isStartedToday = !!sessionStartedAt && toDateStr(new Date(sessionStartedAt)) === today;
  const isEndedToday = !!sessionEndedAt && toDateStr(new Date(sessionEndedAt)) === today;

  const toggleSessionStart = async () => {
    setSessionSaving(true);
    try {
      if (isStartedToday) {
        // 시작 취소 시 종료·진행 주차도 함께 취소 (시작 없이 종료만 있는 상태 방지)
        await supabase.from('classes').update({ today_started_at: null, today_ended_at: null, active_week: null }).eq('id', classId);
        setSessionStartedAt(null);
        setSessionEndedAt(null);
        setActiveWeek(null);
        setSelectedStartWeek('');
      } else {
        const now = new Date().toISOString();
        const weekToStart = weeklyPlan.length > 0 ? (selectedStartWeek || null) : null;
        await supabase.from('classes').update({ today_started_at: now, active_week: weekToStart }).eq('id', classId);
        setSessionStartedAt(now);
        setActiveWeek(weekToStart);
      }
    } finally {
      setSessionSaving(false);
    }
  };

  const toggleSessionEnd = async () => {
    if (!isStartedToday) return;
    setSessionSaving(true);
    try {
      if (isEndedToday) {
        await supabase.from('classes').update({ today_ended_at: null }).eq('id', classId);
        setSessionEndedAt(null);
      } else {
        const now = new Date().toISOString();
        await supabase.from('classes').update({ today_ended_at: now }).eq('id', classId);
        setSessionEndedAt(now);
      }
    } finally {
      setSessionSaving(false);
    }
  };

  // 달력 바깥 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar]);

  // ── 날짜 이동 ─────────────────────────────────────────────────────────────
  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(toDateStr(d));
  };

  const selectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowCalendar(false);
    setShowOnlyAttended(false);
  };

  // ── 출석 저장 ─────────────────────────────────────────────────────────────
  const handleStatus = async (studentId: string, status: StatusKey) => {
    setSavingId(studentId);
    const isToggle = records[studentId] === status;

    setRecords(prev => {
      const next = { ...prev };
      if (isToggle) delete next[studentId];
      else next[studentId] = status;
      return next;
    });

    try {
      if (isToggle) {
        await supabase.from('attendance').delete()
          .eq('class_id', classId).eq('student_id', studentId).eq('date', selectedDate);
      } else {
        await supabase.from('attendance').upsert(
          { class_id: classId, student_id: studentId, date: selectedDate, status },
          { onConflict: 'class_id,student_id,date' },
        );
      }
      // 출석 날짜 목록 갱신
      await fetchAllAttendedDates();
    } catch {
      fetchAttendance(selectedDate);
    } finally {
      setSavingId(null);
    }
  };

  const handleMarkAll = async (status: StatusKey) => {
    const upserts = students.map(s => ({
      class_id: classId, student_id: s.id, date: selectedDate, status,
    }));
    const optimistic: Record<string, StatusKey> = {};
    students.forEach(s => { optimistic[s.id] = status; });
    setRecords(optimistic);
    await supabase.from('attendance').upsert(upserts, { onConflict: 'class_id,student_id,date' });
    await fetchAllAttendedDates();
  };

  const handleClearAll = async () => {
    setRecords({});
    await supabase.from('attendance').delete()
      .eq('class_id', classId).eq('date', selectedDate);
    await fetchAllAttendedDates();
  };

  // ── 다운로드 ──────────────────────────────────────────────────────────────
  const downloadDay = async () => {
    setDlLoading(true);
    try {
      const { data } = await supabase.from('attendance').select('student_id, status')
        .eq('class_id', classId).eq('date', selectedDate);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.student_id] = r.status; });
      const rows = students.map(s => ({
        '번호': s.number === '-' ? '' : s.number,
        '이름': s.name,
        '출석상태': STATUS_LABEL[map[s.id]] || '미기록',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '출석');
      XLSX.writeFile(wb, `출석_${selectedDate}.xlsx`);
    } finally { setDlLoading(false); }
  };

  const downloadMonth = async () => {
    setDlLoading(true);
    try {
      const [year, month] = selectedDate.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay   = new Date(year, month, 0).getDate();
      const endDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await supabase.from('attendance').select('student_id, date, status')
        .eq('class_id', classId).gte('date', startDate).lte('date', endDate);

      const dateSet = new Set<string>();
      (data || []).forEach((r: any) => dateSet.add(r.date));
      const dates = [...dateSet].sort();

      const pivotMap: Record<string, Record<string, string>> = {};
      students.forEach(s => { pivotMap[s.id] = {}; });
      (data || []).forEach((r: any) => {
        if (pivotMap[r.student_id]) pivotMap[r.student_id][r.date] = r.status;
      });

      const rows = students.map(s => {
        const row: Record<string, any> = {
          '번호': s.number === '-' ? '' : s.number,
          '이름': s.name,
        };
        dates.forEach(d => {
          const dayNum = parseInt(d.split('-')[2]);
          row[`${month}/${dayNum}`] = STATUS_LABEL[pivotMap[s.id]?.[d]] || '';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, ...dates.map(() => ({ wch: 5 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${year}년 ${month}월 출석`);
      XLSX.writeFile(wb, `출석_${year}년_${month}월.xlsx`);
    } finally { setDlLoading(false); }
  };

  // ── 달력 계산 ─────────────────────────────────────────────────────────────
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay(); // 0=일
  const daysInMonth     = new Date(calYear, calMonth + 1, 0).getDate();

  const prevCalMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextCalMonth = () => {
    const nextDate = `${calYear}-${String(calMonth + 2).padStart(2, '0')}-01`;
    if (nextDate > today) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const calCells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 7의 배수로 패딩
  while (calCells.length % 7 !== 0) calCells.push(null);

  // ── Summary ───────────────────────────────────────────────────────────────
  const counts = STATUSES.reduce((acc, s) => {
    acc[s.key] = Object.values(records).filter(v => v === s.key).length;
    return acc;
  }, {} as Record<string, number>);
  const unmarked = students.length - Object.keys(records).length;
  const isToday  = selectedDate === today;

  // ── 출석기록만 보기: 날짜별 미리보기 카운트 ──────────────────────────────
  const [attendedDateCounts, setAttendedDateCounts] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    if (!showOnlyAttended || attendedDatesList.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('class_id', classId)
        .in('date', attendedDatesList);

      const counts: Record<string, Record<string, number>> = {};
      (data || []).forEach((r: any) => {
        if (!counts[r.date]) counts[r.date] = {};
        counts[r.date][r.status] = (counts[r.date][r.status] || 0) + 1;
      });
      setAttendedDateCounts(counts);
    })();
  }, [showOnlyAttended, attendedDatesList, classId]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── 날짜 네비게이션 ── */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {/* 이전 날짜 */}
          <button
            onClick={() => changeDate(-1)}
            className="w-10 h-10 rounded-xl bg-surface-container hover:bg-white hover:shadow-soft transition-all flex items-center justify-center text-on-surface-variant"
          >
            <ChevronLeft size={20} />
          </button>

          {/* 날짜 표시 — 클릭 시 달력 팝업 */}
          <div className="relative" ref={calendarRef}>
            <button
              onClick={() => {
                const d = new Date(selectedDate + 'T00:00:00');
                setCalYear(d.getFullYear());
                setCalMonth(d.getMonth());
                setShowCalendar(v => !v);
              }}
              className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl shadow-soft border border-white/60 min-w-[260px] justify-center hover:border-primary/30 hover:shadow-md transition-all group"
            >
              <CalendarDays size={18} className="text-primary/60 group-hover:text-primary transition-colors" />
              <span className="font-black text-sm tracking-tight">{formatDisplayDate(selectedDate)}</span>
              {isToday && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black rounded-full uppercase tracking-widest">오늘</span>
              )}
            </button>

            {/* ── 달력 팝업 ── */}
            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-neutral-100 p-4 w-72"
                >
                  {/* 달력 헤더 */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={prevCalMonth}
                      className="w-8 h-8 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-all"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-black">
                      {calYear}년 {calMonth + 1}월
                    </span>
                    <button
                      onClick={nextCalMonth}
                      disabled={`${calYear}-${String(calMonth + 2).padStart(2, '0')}-01` > today}
                      className="w-8 h-8 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* 요일 헤더 */}
                  <div className="grid grid-cols-7 mb-1">
                    {WEEK_LABELS.map(d => (
                      <div key={d} className={`text-center text-[10px] font-black py-1 ${d === '일' ? 'text-rose-400' : d === '토' ? 'text-blue-400' : 'text-on-surface-variant/40'}`}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* 날짜 그리드 */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {calCells.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} />;

                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isFuture   = dateStr > today;
                      const isSelected = dateStr === selectedDate;
                      const isAttended = allAttendedDates.has(dateStr);
                      const isTod      = dateStr === today;
                      const dayOfWeek  = (firstDayOfMonth + day - 1) % 7;
                      const isSun = dayOfWeek === 0;
                      const isSat = dayOfWeek === 6;

                      return (
                        <button
                          key={dateStr}
                          disabled={isFuture}
                          onClick={() => selectDate(dateStr)}
                          className={`
                            relative flex flex-col items-center justify-center h-9 rounded-xl text-xs font-bold transition-all
                            ${isSelected
                              ? 'bg-primary text-white shadow-md shadow-primary/30'
                              : isTod
                              ? 'bg-primary/10 text-primary font-black'
                              : isFuture
                              ? 'text-neutral-200 cursor-not-allowed'
                              : isSun
                              ? 'text-rose-400 hover:bg-rose-50'
                              : isSat
                              ? 'text-blue-400 hover:bg-blue-50'
                              : 'text-on-surface hover:bg-surface-container'
                            }
                          `}
                        >
                          {day}
                          {/* 출석 기록 있는 날 점 표시 */}
                          {isAttended && !isSelected && (
                            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* 범례 */}
                  <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-3 text-[11px] text-on-surface-variant font-bold">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> 출석 기록 있음
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded-lg bg-primary/10 inline-flex items-center justify-center text-primary text-[9px] font-black">오</span> 오늘
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 다음 날짜 */}
          <button
            onClick={() => changeDate(1)}
            disabled={selectedDate >= today}
            className="w-10 h-10 rounded-xl bg-surface-container hover:bg-white hover:shadow-soft transition-all flex items-center justify-center text-on-surface-variant disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>

          {!isToday && !showOnlyAttended && (
            <button
              onClick={() => setSelectedDate(today)}
              className="px-4 py-2 text-xs font-black text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-all"
            >
              오늘로
            </button>
          )}

          {/* 출석 기록만 보기 토글 */}
          <button
            onClick={() => setShowOnlyAttended(v => !v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              showOnlyAttended
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-surface-container text-on-surface-variant hover:bg-white hover:shadow-soft'
            }`}
          >
            <Filter size={13} />
            출석 기록만
          </button>
        </div>

        {/* ── 오늘 수업 시작/종료 체크 ── */}
        {isToday && !showOnlyAttended && (
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {!isStartedToday && weeklyPlan.length > 0 && (
              <select
                value={selectedStartWeek}
                onChange={(e) => setSelectedStartWeek(e.target.value ? Number(e.target.value) : '')}
                className="px-3 py-2 rounded-xl text-xs font-black border-2 border-blue-200 text-blue-600 bg-white cursor-pointer"
              >
                <option value="">오늘 진행 주차 선택...</option>
                {weeklyPlan.map((w: any, idx: number) => (
                  <option key={idx} value={w.week}>{w.week}주차{w.topic ? `: ${w.topic}` : ''}</option>
                ))}
              </select>
            )}
            {isStartedToday && activeWeek && (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-blue-50 text-blue-600 border-2 border-blue-200">
                {activeWeek}주차 진행 중
              </span>
            )}
            <button
              type="button"
              onClick={toggleSessionStart}
              disabled={sessionSaving || (!isStartedToday && weeklyPlan.length > 0 && !selectedStartWeek)}
              title={!isStartedToday && weeklyPlan.length > 0 && !selectedStartWeek ? '먼저 오늘 진행 주차를 선택해주세요' : undefined}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isStartedToday
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-blue-600 border-blue-200 hover:border-blue-400'
              }`}
            >
              {isStartedToday ? <CheckCircle2 size={14} /> : <Clock size={14} />}
              오늘 수업 시작
            </button>
            <button
              type="button"
              onClick={toggleSessionEnd}
              disabled={sessionSaving || !isStartedToday}
              title={!isStartedToday ? '먼저 수업 시작을 체크해주세요' : undefined}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isEndedToday
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-white text-rose-500 border-rose-200 hover:border-rose-400'
              }`}
            >
              {isEndedToday ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              오늘 수업 종료
            </button>
            <span className="text-[11px] font-bold text-on-surface-variant/50">
              {isEndedToday
                ? '오늘 수업이 종료되어 쉬는시간·수업종료 알람이 더 이상 울리지 않습니다.'
                : isStartedToday
                ? '수업 진행 중 — 자동 로그아웃이 해제되고 쉬는시간·수업종료 알람이 작동합니다.'
                : '수업 시작을 체크해야 쉬는시간·수업종료 알람이 작동합니다.'}
            </span>
          </div>
        )}

        {/* Summary badges */}
        {!showOnlyAttended && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {STATUSES.map(s => {
              const c = COLOR_MAP[s.color];
              const count = counts[s.key] || 0;
              return (
                <div key={s.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${c.bg} ${c.text} ${c.border} text-xs font-black`}>
                  <s.icon size={13} />
                  {s.label} <span className="font-manrope">{count}</span>명
                </div>
              );
            })}
            {unmarked > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-neutral-50 text-neutral-400 border-neutral-200 text-xs font-black">
                <Users size={13} />
                미기록 <span className="font-manrope">{unmarked}</span>명
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 출석 기록만 보기: 날짜 목록 ── */}
      {showOnlyAttended ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-black text-on-surface-variant">
              출석 기록이 있는 날짜
              <span className="ml-2 text-primary">{attendedDatesList.length}일</span>
            </p>
            <button
              onClick={() => setShowOnlyAttended(false)}
              className="text-xs font-black text-on-surface-variant/50 hover:text-on-surface transition-all"
            >
              전체 보기로 돌아가기
            </button>
          </div>

          {attendedDatesList.length === 0 ? (
            <div className="py-20 text-center text-on-surface-variant/30 text-sm font-black">
              아직 출석 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {attendedDatesList.map(date => {
                const isSelected = date === selectedDate;
                const dayCounts = attendedDateCounts[date] || {};
                return (
                  <motion.button
                    key={date}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => { setSelectedDate(date); setShowOnlyAttended(false); }}
                    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all text-left ${
                      isSelected
                        ? 'bg-primary/8 border-primary/30'
                        : 'bg-white border-white hover:border-primary/20 hover:shadow-soft'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays size={16} className={isSelected ? 'text-primary' : 'text-on-surface-variant/40'} />
                      <span className={`font-black text-sm ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {formatDisplayDate(date)}
                      </span>
                      {date === today && (
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[9px] font-black rounded-full">오늘</span>
                      )}
                    </div>

                    {/* 상태별 미니 카운트 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {STATUSES.map(s => {
                        const cnt = dayCounts[s.key] || 0;
                        if (!cnt) return null;
                        const c = COLOR_MAP[s.color];
                        return (
                          <span key={s.key} className={`text-[10px] font-black px-1.5 py-0.5 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>
                            {s.short}{cnt}
                          </span>
                        );
                      })}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── 빠른 액션 ── */}
          <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-on-surface-variant/50 uppercase tracking-widest">일괄 설정</span>
              <button
                onClick={() => handleMarkAll('present')}
                className="px-3 py-1.5 text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all"
              >
                전체 출석
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-[11px] font-black bg-neutral-50 text-neutral-400 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-all"
              >
                전체 초기화
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-on-surface-variant/50 uppercase tracking-widest flex items-center gap-1">
                <Download size={11} /> 다운로드
              </span>
              <button
                onClick={downloadDay}
                disabled={dlLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50"
                title="선택 날짜 출석 엑셀 다운로드"
              >
                {dlLoading ? <Loader2 size={11} className="animate-spin" /> : <FileSpreadsheet size={11} />}
                선택일
              </button>
              <button
                onClick={downloadMonth}
                disabled={dlLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-all disabled:opacity-50"
                title="선택 달 전체 출석 엑셀 다운로드"
              >
                {dlLoading ? <Loader2 size={11} className="animate-spin" /> : <FileSpreadsheet size={11} />}
                이번 달
              </button>
            </div>
          </div>

          {/* ── 출석 테이블 ── */}
          <div className="layered-card rounded-[2rem] overflow-hidden border border-white/60">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="p-5 text-left text-[11px] font-black text-on-surface/60 uppercase tracking-widest w-16">NO.</th>
                  <th className="p-5 text-left text-[11px] font-black text-on-surface/60 uppercase tracking-widest">이름</th>
                  {STATUSES.map(s => (
                    <th key={s.key} className="p-5 text-center text-[11px] font-black text-on-surface/60 uppercase tracking-widest">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                <AnimatePresence>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <Loader2 size={24} className="animate-spin text-primary/40 mx-auto" />
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-on-surface-variant/30 text-sm font-black">
                        학생이 없습니다
                      </td>
                    </tr>
                  ) : (
                    students.map((s, idx) => {
                      const currentStatus = records[s.id] as StatusKey | undefined;
                      const isSaving = savingId === s.id;
                      return (
                        <motion.tr
                          key={s.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          className={`transition-colors ${currentStatus ? 'bg-white' : 'bg-neutral-50/30'}`}
                        >
                          <td className="p-5">
                            <span className="font-manrope font-black text-on-surface-variant/30 text-lg">
                              {s.number === '-' ? '—' : String(s.number).padStart(2, '0')}
                            </span>
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-2">
                              <span className={`font-black text-sm ${currentStatus ? 'text-on-surface' : 'text-on-surface/50'}`}>
                                {s.name}
                              </span>
                              {isSaving && <Loader2 size={12} className="animate-spin text-primary/40" />}
                            </div>
                          </td>
                          {STATUSES.map(st => {
                            const isActive = currentStatus === st.key;
                            const c = COLOR_MAP[st.color];
                            return (
                              <td key={st.key} className="p-5 text-center">
                                <button
                                  onClick={() => handleStatus(s.id, st.key)}
                                  disabled={isSaving}
                                  className={`
                                    w-10 h-10 rounded-xl border-2 flex items-center justify-center mx-auto
                                    transition-all duration-200 active:scale-90 disabled:opacity-50
                                    ${isActive
                                      ? `${c.bg} ${c.text} ${c.border} shadow-sm ring-2 ${c.ring}/30 scale-110`
                                      : 'bg-white border-neutral-100 text-neutral-300 hover:border-neutral-200 hover:text-neutral-400'
                                    }
                                  `}
                                  title={st.label}
                                >
                                  {isActive
                                    ? <st.icon size={16} strokeWidth={2.5} />
                                    : <span className="text-[10px] font-black">{st.short}</span>
                                  }
                                </button>
                              </td>
                            );
                          })}
                        </motion.tr>
                      );
                    })
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <p className="text-center text-[10px] font-bold text-on-surface-variant/30 tracking-widest uppercase pb-4">
            상태를 클릭하면 자동 저장됩니다 · 다시 클릭하면 미기록으로 초기화
          </p>
        </>
      )}
    </div>
  );
}
