import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, CalendarDays, Users,
  CheckCircle2, XCircle, Clock, LogOut, Shield, Loader2,
  Download, FileSpreadsheet, Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import GalleryEndPrompt from './GalleryEndPrompt';

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
  emerald: { bg: 'bg-primary-container', text: 'text-primary', border: 'border-primary/40', ring: 'ring-primary' },
  rose:    { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    ring: 'ring-rose-400'    },
  amber:   { bg: 'bg-surface-container', text: 'text-on-surface', border: 'border-slate-300 dark:border-slate-600', ring: 'ring-slate-400' },
  orange:  { bg: 'bg-surface-container', text: 'text-on-surface', border: 'border-slate-300 dark:border-slate-600', ring: 'ring-slate-400' },
  violet:  { bg: 'bg-surface-container', text: 'text-on-surface', border: 'border-slate-300 dark:border-slate-600', ring: 'ring-slate-400' },
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
  const [showGalleryPrompt, setShowGalleryPrompt] = useState(false);

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
        setShowGalleryPrompt(true);
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
      {showGalleryPrompt && <GalleryEndPrompt classId={classId} onClose={() => setShowGalleryPrompt(false)} />}

      {/* ── 날짜 네비게이션 ── */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap justify-center" data-tour="attendance-date">
          {/* 이전 날짜 */}
          <button
            onClick={() => changeDate(-1)}
            className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center text-on-surface-variant"
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
              className="flex items-center gap-3 px-6 py-3 bg-surface-container-lowest rounded-xl border border-slate-200 dark:border-slate-700 min-w-[260px] justify-center hover:border-primary/40 transition-all group"
            >
              <CalendarDays size={18} className="text-primary/60 group-hover:text-primary transition-colors" />
              <span className="font-bold text-[17px]">{formatDisplayDate(selectedDate)}</span>
              {isToday && (
                <span className="px-2 py-0.5 bg-primary-container text-primary text-[13px] font-bold rounded-full">오늘</span>
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
                  className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4 w-80"
                >
                  {/* 달력 헤더 */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={prevCalMonth}
                      className="w-8 h-8 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-all"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[16px] font-bold">
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
                      <div key={d} className={`text-center text-[13px] font-bold py-1 text-on-surface-variant`}>
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

                      return (
                        <button
                          key={dateStr}
                          disabled={isFuture}
                          onClick={() => selectDate(dateStr)}
                          className={`
                            relative flex flex-col items-center justify-center h-10 rounded-xl text-[15px] font-semibold transition-all
                            ${isSelected
                              ? 'bg-primary text-white shadow-md shadow-primary/30'
                              : isTod
                              ? 'bg-primary/10 text-primary font-black'
                              : isFuture
                              ? 'text-on-surface-variant/30 cursor-not-allowed'
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
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3 text-[14px] text-on-surface-variant font-semibold">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> 출석 기록 있음
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-6 h-6 rounded-lg bg-primary-container inline-flex items-center justify-center text-primary text-[12px] font-bold">오</span> 오늘
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
            className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center text-on-surface-variant disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>

          {!isToday && !showOnlyAttended && (
            <button
              onClick={() => setSelectedDate(today)}
              className="px-4 py-2.5 text-[15px] font-bold text-primary bg-primary-container hover:bg-primary/20 rounded-xl transition-all"
            >
              오늘로
            </button>
          )}

          {/* 출석 기록만 보기 토글 */}
          <button
            onClick={() => setShowOnlyAttended(v => !v)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[15px] font-bold border transition-all ${
              showOnlyAttended
                ? 'bg-primary text-white border-primary'
                : 'bg-surface-container-lowest border-slate-200 dark:border-slate-700 text-on-surface hover:border-primary/40 hover:text-primary'
            }`}
          >
            <Filter size={15} />
            출석 기록만
          </button>
        </div>

        {/* ── 오늘 수업 시작/종료 체크 (지금 필요한 버튼 하나만 보임) ── */}
        {isToday && !showOnlyAttended && (
          <div className="flex flex-col items-center gap-3" data-tour="session-control">
            {/* 현재 상태 표시 */}
            {isEndedToday ? (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold bg-surface-container text-on-surface border border-slate-300 dark:border-slate-600">
                <CheckCircle2 size={18} /> 오늘 수업이 종료되었습니다
              </div>
            ) : isStartedToday ? (
              <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[16px] font-bold bg-primary-container text-primary border border-primary/40">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
                </span>
                수업 진행 중{activeWeek ? ` · ${activeWeek}주차` : ''}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold bg-surface-container text-on-surface-variant border border-slate-200 dark:border-slate-700">
                <Clock size={18} /> 수업 시작 전
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap justify-center">
              {!isStartedToday && weeklyPlan.length > 0 && (
                <select
                  value={selectedStartWeek}
                  onChange={(e) => setSelectedStartWeek(e.target.value ? Number(e.target.value) : '')}
                  className="px-3.5 py-2.5 rounded-xl text-[15px] font-semibold border border-slate-200 dark:border-slate-700 text-on-surface bg-surface-container-lowest cursor-pointer focus:border-primary outline-none"
                >
                  <option value="">오늘 진행 주차 선택...</option>
                  {weeklyPlan.map((w: any, idx: number) => (
                    <option key={idx} value={w.week}>{w.week}주차{w.topic ? `: ${w.topic}` : ''}</option>
                  ))}
                </select>
              )}
              {!isStartedToday && (
                <button
                  type="button"
                  onClick={toggleSessionStart}
                  disabled={sessionSaving || (weeklyPlan.length > 0 && !selectedStartWeek)}
                  title={weeklyPlan.length > 0 && !selectedStartWeek ? '먼저 오늘 진행 주차를 선택해주세요' : undefined}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Clock size={16} /> 오늘 수업 시작
                </button>
              )}
              {isStartedToday && !isEndedToday && (
                <button
                  type="button"
                  onClick={toggleSessionEnd}
                  disabled={sessionSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold border border-rose-300 text-rose-600 bg-surface-container-lowest hover:bg-rose-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle size={16} /> 오늘 수업 종료
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-[15px] font-medium text-on-surface-variant">
                {isEndedToday
                  ? '오늘 수업이 종료되어 쉬는시간·수업종료 알람이 더 이상 울리지 않습니다.'
                  : isStartedToday
                  ? '자동 로그아웃이 해제되고 쉬는시간·수업종료 알람이 작동합니다.'
                  : '수업 시작을 체크해야 쉬는시간·수업종료 알람이 작동합니다.'}
              </span>
              {isStartedToday && !isEndedToday && (
                <button type="button" onClick={toggleSessionStart} disabled={sessionSaving}
                  className="text-[15px] font-semibold text-on-surface-variant underline hover:text-on-surface disabled:opacity-40">
                  시작 취소
                </button>
              )}
              {isEndedToday && (
                <button type="button" onClick={toggleSessionEnd} disabled={sessionSaving}
                  className="text-[15px] font-semibold text-on-surface-variant underline hover:text-on-surface disabled:opacity-40">
                  종료 취소
                </button>
              )}
            </div>
          </div>
        )}

        {/* Summary badges */}
        {!showOnlyAttended && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {STATUSES.map(s => {
              const c = COLOR_MAP[s.color];
              const count = counts[s.key] || 0;
              return (
                <div key={s.key} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border ${c.bg} ${c.text} ${c.border} text-[15px] font-bold`}>
                  <s.icon size={15} />
                  {s.label} <span className="font-manrope">{count}</span>명
                </div>
              );
            })}
            {unmarked > 0 && (
              <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border bg-surface-container-lowest text-on-surface-variant border-slate-200 dark:border-slate-700 text-[15px] font-bold">
                <Users size={15} />
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
            <p className="text-[16px] font-bold text-on-surface-variant">
              출석 기록이 있는 날짜
              <span className="ml-2 text-primary">{attendedDatesList.length}일</span>
            </p>
            <button
              onClick={() => setShowOnlyAttended(false)}
              className="text-[15px] font-semibold text-on-surface-variant hover:text-primary transition-all"
            >
              전체 보기로 돌아가기
            </button>
          </div>

          {attendedDatesList.length === 0 ? (
            <div className="py-20 text-center text-on-surface-variant text-[16px] font-semibold">
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
                    className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-all text-left ${
                      isSelected
                        ? 'bg-primary-container/50 border-primary/40'
                        : 'bg-surface-container-lowest border-slate-200 dark:border-slate-700 hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays size={16} className={isSelected ? 'text-primary' : 'text-on-surface-variant/40'} />
                      <span className={`font-bold text-[16px] ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {formatDisplayDate(date)}
                      </span>
                      {date === today && (
                        <span className="px-1.5 py-0.5 bg-primary-container text-primary text-[13px] font-bold rounded-full">오늘</span>
                      )}
                    </div>

                    {/* 상태별 미니 카운트 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {STATUSES.map(s => {
                        const cnt = dayCounts[s.key] || 0;
                        if (!cnt) return null;
                        const c = COLOR_MAP[s.color];
                        return (
                          <span key={s.key} className={`text-[14px] font-bold px-2 py-0.5 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>
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
              <span className="text-[15px] font-semibold text-on-surface-variant">일괄 설정</span>
              <button
                onClick={() => handleMarkAll('present')}
                className="px-3.5 py-2 text-[15px] font-bold bg-primary-container text-primary border border-primary/40 rounded-xl hover:bg-primary/20 transition-all"
              >
                전체 출석
              </button>
              <button
                onClick={handleClearAll}
                className="px-3.5 py-2 text-[15px] font-bold bg-surface-container-lowest text-on-surface-variant border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary/40 hover:text-primary transition-all"
              >
                전체 초기화
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-on-surface-variant flex items-center gap-1">
                <Download size={14} /> 다운로드
              </span>
              <button
                onClick={downloadDay}
                disabled={dlLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-[15px] font-bold bg-surface-container-lowest text-on-surface border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary/40 hover:text-primary transition-all disabled:opacity-50"
                title="선택 날짜 출석 엑셀 다운로드"
              >
                {dlLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                선택일
              </button>
              <button
                onClick={downloadMonth}
                disabled={dlLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-[15px] font-bold bg-surface-container-lowest text-on-surface border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary/40 hover:text-primary transition-all disabled:opacity-50"
                title="선택 달 전체 출석 엑셀 다운로드"
              >
                {dlLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                이번 달
              </button>
            </div>
          </div>

          {/* ── 출석 테이블 ── */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-surface-container-lowest">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-surface-container-low">
                  <th className="p-4 text-left text-[15px] font-semibold text-on-surface-variant w-16">NO.</th>
                  <th className="p-4 text-left text-[15px] font-semibold text-on-surface-variant">이름</th>
                  {STATUSES.map(s => (
                    <th key={s.key} className="p-4 text-center text-[15px] font-semibold text-on-surface-variant">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                <AnimatePresence>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <Loader2 size={24} className="animate-spin text-primary/40 mx-auto" />
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-on-surface-variant text-[16px] font-semibold">
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
                          className={`transition-colors ${currentStatus ? 'bg-surface-container-lowest' : 'bg-surface-container-low/50'}`}
                        >
                          <td className="p-3">
                            <span className="font-manrope font-bold text-on-surface-variant text-[17px]">
                              {s.number === '-' ? '—' : String(s.number).padStart(2, '0')}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-[17px] ${currentStatus ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                                {s.name}
                              </span>
                              {isSaving && <Loader2 size={12} className="animate-spin text-primary/40" />}
                            </div>
                          </td>
                          {STATUSES.map(st => {
                            const isActive = currentStatus === st.key;
                            const c = COLOR_MAP[st.color];
                            return (
                              <td key={st.key} className="p-3 text-center">
                                <button
                                  onClick={() => handleStatus(s.id, st.key)}
                                  disabled={isSaving}
                                  className={`
                                    w-11 h-11 rounded-xl border-2 flex items-center justify-center mx-auto
                                    transition-all duration-200 active:scale-90 disabled:opacity-50
                                    ${isActive
                                      ? `${c.bg} ${c.text} ${c.border} font-bold`
                                      : 'bg-surface-container-lowest border-slate-200 dark:border-slate-700 text-on-surface-variant hover:border-primary/40 hover:text-primary'
                                    }
                                  `}
                                  title={st.label}
                                >
                                  {isActive
                                    ? <st.icon size={16} strokeWidth={2.5} />
                                    : <span className="text-[15px] font-bold">{st.short}</span>
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

          <p className="text-center text-[15px] font-medium text-on-surface-variant pb-4">
            상태를 클릭하면 자동 저장됩니다 · 다시 클릭하면 미기록으로 초기화
          </p>
        </>
      )}
    </div>
  );
}
