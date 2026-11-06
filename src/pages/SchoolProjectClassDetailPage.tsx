import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { SCHOOL_LEVEL_PRESETS, buildDaySchedule } from '../lib/breakTimes';
import {
  ArrowLeft,
  Users,
  BookOpen,
  Loader2,
  Eye,
  EyeOff,
  ClipboardList,
  FileText,
  Plus,
  X,
  Link2,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { appConfirm, appToast } from '../lib/appDialog';

interface StudentRow {
  id: string;
  full_name: string;
  resultCount: number;
  lastResultAt: string | null;
}

interface MaterialRow {
  id: string;
  title: string;
  week_number: number | null;
  is_published: boolean;
  updated_at: string;
}

interface LessonPlanRow {
  id: string;
  purpose: string | null;
  updated_at: string;
}

interface GeneralMaterialRow {
  id: string;
  title: string;
  url: string;
}

const TABS = [
  { key: 'students', label: '학생 현황' },
  { key: 'materials', label: '수업 자료 현황' },
  { key: 'links', label: '일반 자료' },
  { key: 'submit', label: '결과 제출 링크' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SchoolProjectClassDetailPage = () => {
  const { projectId, schoolId, classId } = useParams<{ projectId: string; schoolId: string; classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  // 학생 결과 제출 링크 설정·대기 목록
  const [submitCfg, setSubmitCfg] = useState<{ entry_code: string | null; entry_mode: string; submit_link_enabled: boolean; result_review: boolean } | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [pendingResults, setPendingResults] = useState<{ id: string; student_id: string; title: string | null; result_type: string | null; created_at: string; submission_group: string | null }[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [tab, setTab] = useState<TabKey>('students');
  const [classInfo, setClassInfo] = useState<{ id: string; name: string; teacherName: string | null } | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlanRow[]>([]);

  // 우리 반 수업일 — 비우면 학교 전체 기간을 따름
  const [classDates, setClassDates] = useState<string[]>([]);
  const [schoolRange, setSchoolRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [datesSaving, setDatesSaving] = useState(false);

  // 우리 반 수업 시간·쉬는 시간·종료 알람
  const [timeForm, setTimeForm] = useState<{ start: string; end: string; alarms: number[]; breaks: string[] }>({ start: '', end: '', alarms: [], breaks: [] });
  const [timeSaving, setTimeSaving] = useState(false);
  const [levelIdx, setLevelIdx] = useState(1);
  const [periodCount, setPeriodCount] = useState(3);

  // 일반 자료(주차와 무관한 링크) 관리
  const [generalMaterials, setGeneralMaterials] = useState<GeneralMaterialRow[]>([]);
  const [generalMatForm, setGeneralMatForm] = useState({ title: '', url: '' });
  const [showAddGeneralForm, setShowAddGeneralForm] = useState(false);
  const [generalMatSaving, setGeneralMatSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, assigned_teacher_id, entry_code, entry_mode, submit_link_enabled, result_review, weekly_plan, schedule_mode, class_specific_dates, class_start_time, class_end_time, end_alarm_minutes, break_times')
        .eq('id', classId)
        .single();

      let teacherName: string | null = null;
      if (cls?.assigned_teacher_id) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', cls.assigned_teacher_id).single();
        teacherName = profile?.full_name || null;
      }
      setClassInfo(cls ? { id: cls.id, name: cls.name, teacherName } : null);
      setSubmitCfg(cls ? {
        entry_code: cls.entry_code || null,
        entry_mode: cls.entry_mode || 'roster',
        submit_link_enabled: !!cls.submit_link_enabled,
        result_review: !!cls.result_review,
      } : null);
      if ((cls?.weekly_plan || []).length > 0) setPeriodCount(Math.min(8, cls!.weekly_plan.length));
      setClassDates(cls?.schedule_mode === 'dates' ? [...(cls?.class_specific_dates || [])] : []);
      setTimeForm({
        start: (cls?.class_start_time || '').slice(0, 5),
        end: (cls?.class_end_time || '').slice(0, 5),
        alarms: cls?.end_alarm_minutes || [],
        breaks: (cls?.break_times || []).map((t: string) => t.slice(0, 5)),
      });
      if (schoolId) {
        const { data: sp } = await supabase.from('school_projects').select('start_date, end_date').eq('id', schoolId).single();
        setSchoolRange({ start: sp?.start_date || null, end: sp?.end_date || null });
      }

      const { data: generalRows } = await supabase
        .from('class_general_materials')
        .select('id, title, url')
        .eq('class_id', classId)
        .eq('type', 'link')
        .order('created_at', { ascending: false });
      setGeneralMaterials(generalRows || []);

      const { data: studentRows } = await supabase.from('students').select('id, full_name').eq('class_id', classId);
      const studentIds = (studentRows || []).map(s => s.id);

      setPendingResults([]);
      const resultStatsByStudent: Record<string, { count: number; last: string | null }> = {};
      if (studentIds.length > 0) {
        const { data: results } = await supabase
          .from('student_results')
          .select('id, student_id, created_at, title, result_type, status, submission_group')
          .in('student_id', studentIds);
        setPendingResults((results || []).filter((r: any) => r.status === 'pending').sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)));
        (results || []).forEach((r: any) => {
          if (!resultStatsByStudent[r.student_id]) resultStatsByStudent[r.student_id] = { count: 0, last: null };
          const stat = resultStatsByStudent[r.student_id];
          stat.count++;
          if (!stat.last || r.created_at > stat.last) stat.last = r.created_at;
        });
      }

      setStudents((studentRows || []).map(s => ({
        id: s.id,
        full_name: s.full_name,
        resultCount: resultStatsByStudent[s.id]?.count || 0,
        lastResultAt: resultStatsByStudent[s.id]?.last || null,
      })));

      const { data: materialRows } = await supabase
        .from('class_materials')
        .select('id, title, week_number, is_published, updated_at')
        .eq('class_id', classId)
        .order('week_number', { ascending: true, nullsFirst: true })
        .order('updated_at', { ascending: false });
      setMaterials(materialRows || []);

      const { data: planRows } = await supabase
        .from('lesson_plans')
        .select('id, purpose, updated_at')
        .eq('class_id', classId)
        .order('updated_at', { ascending: false });
      setLessonPlans(planRows || []);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveSubmitCfg = async (patch: Partial<{ submit_link_enabled: boolean; result_review: boolean; entry_mode: string }>) => {
    if (!classId) return;
    setSubmitBusy(true);
    const { error } = await supabase.from('classes').update(patch).eq('id', classId);
    setSubmitBusy(false);
    if (error) { appToast('저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setSubmitCfg(prev => (prev ? { ...prev, ...patch } : prev));
  };

  const reviewPending = async (ids: string[], status: 'approved' | 'rejected') => {
    const { data, error } = await supabase.from('student_results').update({ status }).in('id', ids).select('id');
    if (error || !data || data.length === 0) {
      appToast('이 화면에서는 승인할 권한이 없어요. 담당 선생님의 반 화면(빠른 확인)에서 처리해 주세요.');
      return;
    }
    setPendingResults(prev => prev.filter(r => !ids.includes(r.id)));
    appToast(status === 'approved' ? '승인했어요. 공유 페이지에 공개돼요.' : '반려했어요.');
  };

  const handleSaveDates = async () => {
    if (!classId) return;
    const dates = Array.from(new Set(classDates.filter(d => d))).sort();
    if (schoolRange.start && schoolRange.end && dates.some(d => d < schoolRange.start! || d > schoolRange.end!)) {
      appToast('학교 전체 기간 밖의 날짜가 있어요. 학교 기간 안에서 골라 주세요.');
      return;
    }
    setDatesSaving(true);
    try {
      const { error } = await supabase.from('classes')
        .update(dates.length > 0
          // 수업일이 하루뿐이면 학생 화면 단위를 '차시'로 자동 전환
          ? { schedule_mode: 'dates', class_specific_dates: dates, ...(dates.length === 1 ? { unit_label: '차시' } : {}) }
          : { schedule_mode: null, class_specific_dates: [] })
        .eq('id', classId);
      if (error) throw error;
      setClassDates(dates);
      appToast(dates.length > 0 ? '우리 반 수업일이 저장되었습니다.' : '수업일을 비웠어요. 학교 전체 기간을 따릅니다.');
    } catch (err) {
      console.error('handleSaveDates error:', err);
      appToast('저장 중 오류가 발생했습니다.');
    } finally {
      setDatesSaving(false);
    }
  };

  const handleSaveTime = async () => {
    if (!classId) return;
    if (timeForm.start && timeForm.end && timeForm.end <= timeForm.start) {
      appToast('종료 시각은 시작 시각보다 늦어야 해요.');
      return;
    }
    setTimeSaving(true);
    try {
      const { error } = await supabase.from('classes').update({
        class_start_time: timeForm.start || null,
        class_end_time: timeForm.end || null,
        end_alarm_minutes: timeForm.end ? timeForm.alarms : [],
        break_times: timeForm.breaks.filter(t => t).sort(),
      }).eq('id', classId);
      if (error) throw error;
      appToast('수업 시간이 저장되었습니다.');
    } catch (err) {
      console.error('handleSaveTime error:', err);
      appToast('저장 중 오류가 발생했습니다.');
    } finally {
      setTimeSaving(false);
    }
  };

  const handleAutoFill = () => {
    if (!timeForm.start) { appToast('먼저 시작 시각을 골라 주세요.'); return; }
    const lv = SCHOOL_LEVEL_PRESETS[levelIdx];
    const r = buildDaySchedule(timeForm.start, periodCount, lv.periodMinutes, lv.breakMinutes);
    if (!r) return;
    setTimeForm(f => ({ ...f, end: r.end, breaks: r.breaks, alarms: f.alarms.length ? f.alarms : [10] }));
  };

  const handleAddGeneralMat = async () => {
    if (!user || !classId || !generalMatForm.title.trim() || !generalMatForm.url.trim()) return;
    setGeneralMatSaving(true);
    try {
      const { error } = await supabase.from('class_general_materials').insert({
        class_id: classId,
        teacher_id: user.id,
        title: generalMatForm.title.trim(),
        type: 'link',
        url: generalMatForm.url.trim(),
        is_published: true,
      });
      if (error) throw error;
      setGeneralMatForm({ title: '', url: '' });
      setShowAddGeneralForm(false);
      await fetchData();
    } catch (err) {
      console.error('handleAddGeneralMat error:', err);
      appToast('자료 등록 중 오류가 발생했습니다.');
    } finally {
      setGeneralMatSaving(false);
    }
  };

  const handleDeleteGeneralMat = async (id: string) => {
    if (!await appConfirm('이 자료를 삭제할까요?')) return;
    try {
      const { error } = await supabase.from('class_general_materials').delete().eq('id', id);
      if (error) throw error;
      setGeneralMaterials(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('handleDeleteGeneralMat error:', err);
      appToast('삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!classInfo) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center text-on-surface-variant">
        반 정보를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <button
        onClick={() => navigate(`/school-projects/${projectId}/schools/${schoolId}`)}
        className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> 개요 화면으로
      </button>

      <div>
        <h1 className="text-2xl font-black">{classInfo.name}</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {classInfo.teacherName ? `담당 강사: ${classInfo.teacherName}` : <span className="text-orange-500">담당 강사 미배정</span>}
        </p>
      </div>

      <div className="surface-card p-4 border border-surface-container-high space-y-3">
        <div>
          <h2 className="text-sm font-black">우리 반 수업일</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            이 반이 수업하는 날짜를 골라 주세요. 비워 두면 학교 전체 기간
            {schoolRange.start && schoolRange.end ? `(${schoolRange.start.slice(5).replace('-', '/')} ~ ${schoolRange.end.slice(5).replace('-', '/')})` : ''}을 따릅니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {classDates.map((d, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <input
                type="date"
                value={d}
                min={schoolRange.start || undefined}
                max={schoolRange.end || undefined}
                onChange={e => setClassDates(prev => prev.map((x, i) => (i === idx ? e.target.value : x)))}
                className="px-2 py-1.5 rounded-lg border border-surface-container-high bg-surface text-sm"
              />
              <button onClick={() => setClassDates(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-on-surface-variant hover:text-red-500" aria-label="날짜 삭제">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setClassDates(prev => [...prev, ''])} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-primary/40 text-primary text-xs font-bold">
            <Plus size={12} /> 날짜 추가
          </button>
        </div>
        <button onClick={handleSaveDates} disabled={datesSaving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">
          {datesSaving ? '저장 중...' : '수업일 저장'}
        </button>
      </div>

      <div className="surface-card p-4 border border-surface-container-high space-y-3">
        <div>
          <h2 className="text-sm font-black">수업 시간 · 쉬는 시간</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            담당 강사 화면의 수업 시작·종료 알림에 쓰입니다. 비워 두면 알림이 울리지 않아요.
          </p>
        </div>
        <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high space-y-2.5">
          <p className="text-xs font-bold text-on-surface-variant">빠른 설정 — 학교급·교시 수·시작 시각만 고르면 종료 시각과 쉬는 시간이 자동으로 채워져요</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {SCHOOL_LEVEL_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => setLevelIdx(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${levelIdx === i ? 'bg-primary text-white border-primary' : 'border-surface-container-high text-on-surface-variant'}`}>
                {p.label} ({p.periodMinutes}분 수업 · {p.breakMinutes}분 쉬는 시간)
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-on-surface-variant">하루 교시</span>
            <button onClick={() => setPeriodCount(c => Math.max(1, c - 1))} className="w-7 h-7 rounded-lg border border-surface-container-high font-bold" aria-label="교시 줄이기">−</button>
            <span className="text-sm font-black tabular-nums w-6 text-center">{periodCount}</span>
            <button onClick={() => setPeriodCount(c => Math.min(8, c + 1))} className="w-7 h-7 rounded-lg border border-surface-container-high font-bold" aria-label="교시 늘리기">+</button>
            <span className="text-xs font-bold text-on-surface-variant ml-2">시작 시각</span>
            {['08:50', '09:00', '09:30', '10:00', '13:00'].map(t => (
              <button key={t} onClick={() => setTimeForm(f => ({ ...f, start: t }))}
                className={`px-2 py-1 rounded-lg text-xs font-bold border ${timeForm.start === t ? 'bg-primary/10 text-primary border-primary/40' : 'border-surface-container-high text-on-surface-variant'}`}>{t}</button>
            ))}
          </div>
          <button onClick={handleAutoFill} className="w-full py-2 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold">
            ✨ 종료 시각·쉬는 시간 자동 채우기
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="time" value={timeForm.start} onChange={e => setTimeForm(f => ({ ...f, start: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-surface-container-high bg-surface text-sm" aria-label="시작 시각" />
          <span className="text-on-surface-variant">~</span>
          <input type="time" value={timeForm.end} onChange={e => setTimeForm(f => ({ ...f, end: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-surface-container-high bg-surface text-sm" aria-label="종료 시각" />
        </div>
        {timeForm.end && (
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-on-surface-variant">종료 알림</span>
            {[30, 15, 10].map(m => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={timeForm.alarms.includes(m)}
                  onChange={e => setTimeForm(f => ({ ...f, alarms: e.target.checked ? [...f.alarms, m] : f.alarms.filter(x => x !== m) }))}
                  className="accent-primary"
                />
                <span className="text-xs font-bold">{m}분 전</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-on-surface-variant">쉬는 시간</span>
          {timeForm.breaks.map((t, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <input type="time" value={t} onChange={e => setTimeForm(f => ({ ...f, breaks: f.breaks.map((x, i) => (i === idx ? e.target.value : x)) }))} className="px-2 py-1.5 rounded-lg border border-surface-container-high bg-surface text-sm" />
              <button onClick={() => setTimeForm(f => ({ ...f, breaks: f.breaks.filter((_, i) => i !== idx) }))} className="p-1 text-on-surface-variant hover:text-red-500" aria-label="쉬는 시간 삭제">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setTimeForm(f => ({ ...f, breaks: [...f.breaks, ''] }))} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-primary/40 text-primary text-xs font-bold">
            <Plus size={12} /> 쉬는 시간 추가
          </button>
        </div>
        <button onClick={handleSaveTime} disabled={timeSaving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">
          {timeSaving ? '저장 중...' : '수업 시간 저장'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="surface-card p-4 border border-surface-container-high">
          <Users size={18} className="text-primary" />
          <p className="text-2xl font-black mt-2 tabular-nums">{students.length}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">학생</p>
        </div>
        <div className="surface-card p-4 border border-surface-container-high">
          <BookOpen size={18} className="text-secondary" />
          <p className="text-2xl font-black mt-2 tabular-nums">{materials.length}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">등록 자료</p>
        </div>
        <div className="surface-card p-4 border border-surface-container-high">
          <ClipboardList size={18} className="text-accent" />
          <p className="text-2xl font-black mt-2 tabular-nums">{lessonPlans.length}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">수업 계획서</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-surface-container-high">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant/60 hover:text-on-surface-variant'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'students' && (
        students.length === 0 ? (
          <div className="surface-card p-10 text-center text-on-surface-variant/60 text-sm">
            아직 등록된 학생이 없습니다.
          </div>
        ) : (
          <div className="surface-card border border-surface-container-high overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-container-high text-left text-xs text-on-surface-variant/70">
                    <th className="px-4 py-3 font-bold">이름</th>
                    <th className="px-4 py-3 font-bold text-right">제출/기록 수</th>
                    <th className="px-4 py-3 font-bold">최근 제출일</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-b border-surface-container-high last:border-0">
                      <td className="px-4 py-3 font-bold">{s.full_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.resultCount === 0 ? (
                          <span className="text-orange-500 font-bold">0</span>
                        ) : s.resultCount}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {s.lastResultAt ? new Date(s.lastResultAt).toLocaleDateString('ko-KR') : <span className="text-on-surface-variant/40">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === 'materials' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-black mb-2 flex items-center gap-1.5"><BookOpen size={14} /> 수업 자료</h2>
            {materials.length === 0 ? (
              <div className="surface-card p-6 text-center text-on-surface-variant/60 text-sm">
                아직 등록된 수업 자료가 없습니다.
              </div>
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {materials.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {m.week_number != null && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                          {m.week_number}주차
                        </span>
                      )}
                      <span className="text-sm font-bold truncate">{m.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${m.is_published ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_published ? <Eye size={10} /> : <EyeOff size={10} />}
                        {m.is_published ? '공개' : '비공개'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/50">{new Date(m.updated_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-black mb-2 flex items-center gap-1.5"><FileText size={14} /> 수업 계획서</h2>
            {lessonPlans.length === 0 ? (
              <div className="surface-card p-6 text-center text-on-surface-variant/60 text-sm">
                아직 작성된 수업 계획서가 없습니다.
              </div>
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {lessonPlans.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-bold truncate">{p.purpose || '제목 없음'}</span>
                    <span className="text-[10px] text-on-surface-variant/50 shrink-0">{new Date(p.updated_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'submit' && submitCfg && (() => {
        const link = `https://classlog-ai.vercel.app/classroom-entry?code=${submitCfg.entry_code}&mode=submit`;
        const nameOnly = submitCfg.entry_mode === 'common_named';
        const nameOf = (sid: string) => students.find(x => x.id === sid)?.full_name || '학생';
        // 한 번에 낸 여러 건(같은 묶음)은 한 줄로 합쳐 보여 준다
        const groups: { key: string; ids: string[]; student_id: string; title: string | null; created_at: string }[] = [];
        pendingResults.forEach(r => {
          const key = r.submission_group || r.id;
          const g = groups.find(x => x.key === key);
          if (g) g.ids.push(r.id); else groups.push({ key, ids: [r.id], student_id: r.student_id, title: r.title, created_at: r.created_at });
        });
        return (
        <div className="space-y-6">
          <p className="text-xs font-bold text-on-surface-variant/70">
            학생이 이름만 입력하고 수업 결과만 올리는 링크예요. 올린 결과는 이 반에 쌓이고, 결과 공유 페이지와 엑셀에 나와요.
          </p>

          <p className="text-xs leading-relaxed text-on-surface-variant bg-surface-container-low rounded-xl p-3">
            이 설정은 <b>전용 링크에만</b> 적용돼요. 새로 들어온 학생은 결과 내기 화면만 보여요. 반의 일반 입장 링크는 따로 열려 있고 이 설정과 상관없어요. 시험은 새 탭(시크릿 창)에서 해 보세요.
          </p>

          {!nameOnly && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-800 leading-relaxed">
                이 반은 지금 '이름만 입력' 입장 방식이 아니라서 링크를 쓸 수 없어요. 방식을 바꾸면 이미 등록된 학생 번호/PIN 입장은 더 이상 쓰이지 않아요. (학생 {students.length}명)
              </p>
              <button
                disabled={submitBusy}
                onClick={async () => { if (await appConfirm('입장 방식을 "이름만 입력"으로 바꿀까요?\n기존 PIN·번호 입장은 쓰이지 않게 돼요.')) saveSubmitCfg({ entry_mode: 'common_named' }); }}
                className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-black disabled:opacity-50"
              >이름만 입력 방식으로 바꾸기</button>
            </div>
          )}

          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-surface-container-high">
            <span className="text-sm font-black">제출 링크 켜기</span>
            <input type="checkbox" className="w-5 h-5 accent-primary" disabled={!nameOnly || submitBusy} checked={submitCfg.submit_link_enabled}
              onChange={e => saveSubmitCfg(e.target.checked ? { submit_link_enabled: true, result_review: true } : { submit_link_enabled: false })} />
          </label>
          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-surface-container-high">
            <span>
              <span className="block text-sm font-black">확인한 뒤 공개</span>
              <span className="block text-xs text-on-surface-variant">끄면 학생이 내자마자 공유 페이지에 보여요.</span>
            </span>
            <input type="checkbox" className="w-5 h-5 accent-primary" disabled={!nameOnly || submitBusy} checked={submitCfg.result_review}
              onChange={e => saveSubmitCfg({ result_review: e.target.checked })} />
          </label>

          {submitCfg.submit_link_enabled && nameOnly && submitCfg.entry_code && (
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl border border-surface-container-high">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`} alt="결과 제출 QR" className="w-40 h-40 rounded-lg border border-surface-container-high bg-white p-2" />
              <div className="flex-1 min-w-0 space-y-3 w-full">
                <p className="text-xs text-on-surface-variant break-all select-all">{link}</p>
                <button
                  onClick={() => { navigator.clipboard?.writeText(link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }, () => appToast('복사하지 못했어요. 주소를 직접 복사해 주세요.')); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-black"
                >{linkCopied ? <Check size={16} /> : <Copy size={16} />} {linkCopied ? '복사됨' : '링크 복사'}</button>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-black mb-2">승인 기다리는 결과 ({groups.length})</h2>
            {groups.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-6 text-center rounded-xl border border-dashed border-surface-container-high">기다리는 결과가 없어요.</p>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.key} className="flex items-center gap-3 p-3 rounded-xl border border-surface-container-high">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{nameOf(g.student_id)}{g.ids.length > 1 ? ` · ${g.ids.length}건` : ''}</p>
                      <p className="text-xs text-on-surface-variant truncate">{g.title || '제목 없음'} · {new Date(g.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button onClick={() => reviewPending(g.ids, 'rejected')} className="px-3 py-2 rounded-lg border border-surface-container-high text-sm font-bold text-on-surface-variant">반려</button>
                    <button onClick={() => reviewPending(g.ids, 'approved')} className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-black">승인</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {tab === 'links' && (
        <div className="space-y-6">
          <p className="text-xs font-bold text-on-surface-variant/70">
            이 반 학생 화면에 보일 참고 링크를 모아 둡니다. 차시별 내용은 학교 화면의 "주차별 계획"에서 설정하세요.
          </p>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black flex items-center gap-1.5"><Link2 size={14} /> 일반 자료 (링크)</h2>
              <button
                type="button"
                onClick={() => setShowAddGeneralForm(v => !v)}
                className="flex items-center gap-1 text-xs font-black px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
              >
                <Plus size={13} /> 자료 추가
              </button>
            </div>

            {showAddGeneralForm && (
              <div className="surface-card p-4 border border-surface-container-high space-y-2.5 mb-3">
                <input
                  type="text"
                  value={generalMatForm.title}
                  onChange={e => setGeneralMatForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="자료 제목"
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-surface-container-high rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                />
                <input
                  type="text"
                  value={generalMatForm.url}
                  onChange={e => setGeneralMatForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-surface-container-high rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddGeneralForm(false); setGeneralMatForm({ title: '', url: '' }); }}
                    className="text-xs font-black px-3 py-2 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
                  >취소</button>
                  <button
                    type="button"
                    onClick={handleAddGeneralMat}
                    disabled={generalMatSaving || !generalMatForm.title.trim() || !generalMatForm.url.trim()}
                    className="text-xs font-black px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-dim transition-all disabled:opacity-50"
                  >{generalMatSaving ? '저장 중...' : '저장'}</button>
                </div>
              </div>
            )}

            {generalMaterials.length === 0 ? (
              <div className="surface-card p-6 text-center text-on-surface-variant/60 text-sm">
                등록된 일반 자료가 없습니다.
              </div>
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {generalMaterials.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 text-sm font-bold hover:text-primary transition-colors">
                      <Link2 size={13} className="text-on-surface-variant/40 shrink-0" />
                      <span className="truncate">{m.title}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteGeneralMat(m.id)}
                      className="text-on-surface-variant/40 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolProjectClassDetailPage;
