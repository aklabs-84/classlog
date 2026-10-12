import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/auth';
import SendQuizTab from '../components/classroom/SendQuizTab';
import SendBoardTab from '../components/classroom/SendBoardTab';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  School,
  MapPin,
  Users,
  GraduationCap,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  CalendarDays,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  BookOpen,
  FileText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  Search,
  X,
  UserPlus,
  Bell,
  BellOff,
} from 'lucide-react';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { collectClassResultPaths, removeStoragePaths } from '../lib/storageCleanup';
import SchoolInfoEditModal from '../components/classroom/SchoolInfoEditModal';
import SchoolMaterialsTab from '../components/classroom/SchoolMaterialsTab';
import InstructorDocsAdminTab from '../components/classroom/InstructorDocsAdminTab';
import ClassRosterModal from '../components/classroom/ClassRosterModal';
import SchoolPlanTab from '../components/classroom/SchoolPlanTab';
import ProjectResultSummary from '../components/classroom/ProjectResultSummary';
import SchoolProjectSurveyTab from '../components/classroom/SchoolProjectSurveyTab';

interface TeachingClass {
  id: string;
  name: string;
  entry_code: string;
  assigned_teacher_id: string | null;
  teacherName: string | null;
  teacherAvatar: string | null;
  studentCount: number;
  students: { id: string; full_name: string }[];
  materialCount: number;
  publishedMaterialCount: number;
  lastMaterialUpdate: string | null;
  hasLessonPlan: boolean;
}

interface ObservationRow {
  id: string;
  student_id: string;
  activity_name: string | null;
  content: string | null;
  created_at: string;
}

interface ResultRow {
  id: string;
  student_id: string;
  week_number: number | null;
  title: string | null;
  text_content: string | null;
  result_type: string | null;
  created_at: string;
  link_url: string | null;
  storage_path: string | null;
  storage_paths: string[] | null;
}

interface EvalRow {
  setech_content: string | null;
  achievement_level: string | null;
  status: string | null;
}

const EVAL_STATUS_META: Record<string, { label: string; className: string }> = {
  done: { label: '완료', className: 'bg-green-100 text-green-600' },
  final: { label: '완료', className: 'bg-green-100 text-green-600' },
  draft: { label: '초안', className: 'bg-amber-100 text-amber-700' },
};
const EVAL_STATUS_NONE = { label: '미작성', className: 'bg-gray-100 text-gray-500' };

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: '진행 중', className: 'bg-green-100 text-green-600' },
  closed: { label: '수업 종료', className: 'bg-orange-100 text-orange-600' },
  archived: { label: '보관됨', className: 'bg-gray-100 text-gray-500' },
};

const ATT_STATUSES = [
  { key: 'present', label: '출석', className: 'bg-emerald-100 text-emerald-700' },
  { key: 'absent', label: '결석', className: 'bg-rose-100 text-rose-700' },
  { key: 'late', label: '지각', className: 'bg-amber-100 text-amber-700' },
  { key: 'early_leave', label: '조퇴', className: 'bg-sky-100 text-sky-700' },
  { key: 'excused', label: '공결', className: 'bg-violet-100 text-violet-700' },
] as const;

// 반의 오늘 수업 상태 (시작/종료 시각이 '오늘'인지 기기 시간 기준으로 판단)
interface ClassSession { startedAt: string | null; endedAt: string | null; week: number | null }
const isToday = (iso: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const SESSION_REFRESH_MS = 30000;

const todayStr = () => new Date().toISOString().split('T')[0];

const TABS = [
  { key: 'overview', label: '개요' },
  { key: 'docs', label: '강사 제출 서류' },
  { key: 'attendance', label: '출결' },
  { key: 'results', label: '결과' },
  { key: 'records', label: '기록' },
  { key: 'materials', label: '수업 자료' },
  { key: 'quiz', label: '퀴즈 보내기' },
  { key: 'board', label: '보드 보내기' },
  { key: 'plan', label: '주차별 계획' },
  { key: 'survey', label: '설문' },
  { key: 'summary', label: '결과 요약' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SchoolProjectDetailPage = () => {
  const { projectId, schoolId } = useParams<{ projectId: string; schoolId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('overview');
  const [program, setProgram] = useState<{ id: string; name: string } | null>(null);
  const [school, setSchool] = useState<any>(null);
  const [classes, setClasses] = useState<TeachingClass[]>([]);
  const { profile } = useAuth();

  // 담당 강사 지정 (강사 관리 화면과 같은 방식)
  const [assigningClassId, setAssigningClassId] = useState<string | null>(null);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [projectTeachers, setProjectTeachers] = useState<{ id: string; full_name: string; avatar_url: string | null; school_code?: string | null }[]>([]);
  const [searchedTeachers, setSearchedTeachers] = useState<{ id: string; full_name: string; avatar_url: string | null; school_code: string | null }[]>([]);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [attDate, setAttDate] = useState(todayStr());
  const [attRecords, setAttRecords] = useState<Record<string, string>>({});
  const [attLoading, setAttLoading] = useState(false);
  const [sessions, setSessions] = useState<Record<string, ClassSession>>({});
  const [notifyOn, setNotifyOn] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);
  const { permission: notifPermission } = useNotificationPermission();

  const [menuOpen, setMenuOpen] = useState(false);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingSchool, setDeletingSchool] = useState(false);

  // 반 수정/삭제
  const [rosterClass, setRosterClass] = useState<TeachingClass | null>(null);
  const [editingClass, setEditingClass] = useState<TeachingClass | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [savingClass, setSavingClass] = useState(false);
  const [deletingClass, setDeletingClass] = useState<TeachingClass | null>(null);
  const [deletingClassBusy, setDeletingClassBusy] = useState(false);
  const [classActionError, setClassActionError] = useState('');

  const [obsRecords, setObsRecords] = useState<ObservationRow[]>([]);
  const [resultRecords, setResultRecords] = useState<ResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const [evalRecords, setEvalRecords] = useState<Record<string, EvalRow>>({});
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [expandedEvalId, setExpandedEvalId] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!schoolId) return;
    if (!silent) setLoading(true);
    try {
      const { data: s } = await supabase
        .from('school_projects')
        .select('id, name, school_name, region, status, entry_code, created_at, parent_project_id, start_date, end_date')
        .eq('id', schoolId)
        .single();
      setSchool(s || null);

      if (s?.parent_project_id) {
        const { data: p } = await supabase
          .from('school_projects')
          .select('id, name')
          .eq('id', s.parent_project_id)
          .single();
        setProgram(p || null);
      }

      const { data: allClasses } = await supabase
        .from('classes')
        .select('id, name, entry_code, parent_class_id, assigned_teacher_id')
        .eq('school_project_id', schoolId)
        .order('created_at', { ascending: true });

      const teaching = (allClasses || []).filter(c => c.parent_class_id !== null);
      const teacherIds = [...new Set(teaching.map(c => c.assigned_teacher_id).filter(Boolean))] as string[];

      const teacherMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', teacherIds);
        (profiles || []).forEach((p: any) => { teacherMap[p.id] = p; });
      }

      const classIds = teaching.map(c => c.id);
      const studentsByClass: Record<string, { id: string; full_name: string }[]> = {};
      if (classIds.length > 0) {
        const { data: allStudents } = await supabase.from('students').select('id, full_name, class_id').in('class_id', classIds);
        (allStudents || []).forEach((st: any) => {
          if (!studentsByClass[st.class_id]) studentsByClass[st.class_id] = [];
          studentsByClass[st.class_id].push({ id: st.id, full_name: st.full_name });
        });
      }

      const materialStatsByClass: Record<string, { count: number; published: number; lastUpdate: string | null }> = {};
      if (classIds.length > 0) {
        const { data: allMaterials } = await supabase
          .from('class_materials')
          .select('class_id, is_published, updated_at')
          .in('class_id', classIds);
        (allMaterials || []).forEach((m: any) => {
          if (!materialStatsByClass[m.class_id]) materialStatsByClass[m.class_id] = { count: 0, published: 0, lastUpdate: null };
          const stat = materialStatsByClass[m.class_id];
          stat.count++;
          if (m.is_published) stat.published++;
          if (!stat.lastUpdate || m.updated_at > stat.lastUpdate) stat.lastUpdate = m.updated_at;
        });
      }

      const lessonPlanClassIds = new Set<string>();
      if (classIds.length > 0) {
        const { data: allPlans } = await supabase.from('lesson_plans').select('class_id').in('class_id', classIds);
        (allPlans || []).forEach((p: any) => { if (p.class_id) lessonPlanClassIds.add(p.class_id); });
      }

      setClasses(teaching.map(c => ({
        id: c.id,
        name: c.name,
        entry_code: c.entry_code,
        assigned_teacher_id: c.assigned_teacher_id,
        teacherName: c.assigned_teacher_id ? (teacherMap[c.assigned_teacher_id]?.full_name || null) : null,
        teacherAvatar: c.assigned_teacher_id ? (teacherMap[c.assigned_teacher_id]?.avatar_url || null) : null,
        studentCount: (studentsByClass[c.id] || []).length,
        students: studentsByClass[c.id] || [],
        materialCount: materialStatsByClass[c.id]?.count || 0,
        publishedMaterialCount: materialStatsByClass[c.id]?.published || 0,
        lastMaterialUpdate: materialStatsByClass[c.id]?.lastUpdate || null,
        hasLessonPlan: lessonPlanClassIds.has(c.id),
      })));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  const fetchAttendance = useCallback(async () => {
    const classIds = classes.map(c => c.id);
    if (classIds.length === 0) { setAttRecords({}); return; }
    setAttLoading(true);
    try {
      const { data } = await supabase
        .from('attendance')
        .select('student_id, status, class_id')
        .in('class_id', classIds)
        .eq('date', attDate);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.student_id] = r.status; });
      setAttRecords(map);
    } finally {
      setAttLoading(false);
    }
  }, [classes, attDate]);

  useEffect(() => {
    if (tab === 'attendance' && classes.length > 0) fetchAttendance();
  }, [tab, attDate, classes, fetchAttendance]);

  // 출결 탭이 열려 있는 동안 30초마다 각 반의 오늘 수업 상태를 새로 읽는다
  const classIdKey = classes.map(c => c.id).join(',');
  useEffect(() => {
    if (tab !== 'attendance' || !classIdKey) return;
    const ids = classIdKey.split(',');
    let stopped = false;
    const load = async () => {
      const { data } = await supabase.from('classes').select('id, today_started_at, today_ended_at, active_week').in('id', ids);
      if (stopped || !data) return;
      const map: Record<string, ClassSession> = {};
      data.forEach((r: any) => { map[r.id] = { startedAt: r.today_started_at, endedAt: r.today_ended_at, week: r.active_week }; });
      setSessions(map);
    };
    load();
    const timer = setInterval(load, SESSION_REFRESH_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [tab, classIdKey]);

  // 수업 시작/종료 알림 받기 스위치 (저장된 값이 없으면 켜짐)
  useEffect(() => {
    if (tab !== 'attendance' || !profile?.id) return;
    supabase.from('class_session_notify_prefs').select('enabled').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => { if (data) setNotifyOn(data.enabled); });
  }, [tab, profile?.id]);

  const toggleNotify = async () => {
    if (!profile?.id || notifySaving) return;
    const next = !notifyOn;
    setNotifySaving(true);
    const { error } = await supabase.from('class_session_notify_prefs')
      .upsert({ user_id: profile.id, enabled: next, updated_at: new Date().toISOString() });
    setNotifySaving(false);
    if (!error) setNotifyOn(next);
  };

  const totals = useMemo(() => {
    const assigned = classes.filter(c => c.assigned_teacher_id);
    return {
      classCount: classes.length,
      teacherCount: new Set(assigned.map(c => c.assigned_teacher_id)).size,
      unassignedCount: classes.length - assigned.length,
      studentCount: classes.reduce((sum, c) => sum + c.studentCount, 0),
    };
  }, [classes]);

  const studentIds = useMemo(() => classes.flatMap(c => c.students.map(s => s.id)), [classes]);

  const fetchResults = useCallback(async () => {
    if (studentIds.length === 0) { setObsRecords([]); setResultRecords([]); return; }
    setResultsLoading(true);
    try {
      const [{ data: obs }, { data: results }] = await Promise.all([
        supabase
          .from('observations')
          .select('id, student_id, activity_name, content, created_at')
          .in('student_id', studentIds)
          .eq('is_student_record', true)
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase
          .from('student_results')
          .select('id, student_id, week_number, title, text_content, result_type, created_at, link_url, storage_path, storage_paths')
          .in('student_id', studentIds)
          .order('created_at', { ascending: false }),
      ]);
      setObsRecords(obs || []);
      setResultRecords(results || []);
    } finally {
      setResultsLoading(false);
    }
  }, [studentIds]);

  useEffect(() => {
    if (tab === 'results' && studentIds.length > 0) fetchResults();
  }, [tab, studentIds, fetchResults]);

  const fetchEvaluations = useCallback(async () => {
    if (studentIds.length === 0) { setEvalRecords({}); return; }
    setRecordsLoading(true);
    try {
      const { data } = await supabase
        .from('student_evaluations')
        .select('student_id, setech_content, achievement_level, status')
        .in('student_id', studentIds);
      const map: Record<string, EvalRow> = {};
      (data || []).forEach((e: any) => { map[e.student_id] = e; });
      setEvalRecords(map);
    } finally {
      setRecordsLoading(false);
    }
  }, [studentIds]);

  useEffect(() => {
    if (tab === 'records' && studentIds.length > 0) fetchEvaluations();
  }, [tab, studentIds, fetchEvaluations]);

  const getResultUrl = (r: ResultRow): string | null => {
    if (r.link_url) return r.link_url;
    const path = r.storage_path || r.storage_paths?.[0];
    if (!path) return null;
    return supabase.storage.from('student-attachments').getPublicUrl(path).data.publicUrl;
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const handleToggleArchive = async () => {
    if (!school) return;
    const nextStatus = school.status === 'archived' ? 'active' : 'archived';
    setArchiving(true);
    setMenuOpen(false);
    try {
      await supabase.from('school_projects').update({ status: nextStatus }).eq('id', school.id);
      setSchool((prev: any) => ({ ...prev, status: nextStatus }));
    } finally {
      setArchiving(false);
    }
  };

  const handleDeleteSchool = async () => {
    if (!schoolId) return;
    setDeletingSchool(true);
    try {
      await supabase.from('classes').delete().eq('school_project_id', schoolId);
      await supabase.from('school_projects').delete().eq('id', schoolId);
      navigate(projectId ? `/school-projects/${projectId}/schools` : '/classes');
    } finally {
      setDeletingSchool(false);
    }
  };

  useEffect(() => {
    if (!profile?.school_code) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('school_code', profile.school_code)
        .eq('role', 'teacher');
      setProjectTeachers(data || []);
    })();
  }, [profile?.school_code]);

  // 이름을 입력하면 소속과 무관하게 가입된 모든 강사에서 검색
  useEffect(() => {
    const q = teacherSearchQuery.trim();
    if (!assigningClassId || !q) { setSearchedTeachers([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const escaped = q.replace(/[%_\\]/g, m => '\\' + m);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, school_code')
        .eq('role', 'teacher')
        .ilike('full_name', `%${escaped}%`)
        .limit(20);
      if (!cancelled) setSearchedTeachers(data || []);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [teacherSearchQuery, assigningClassId]);

  const filteredTeachers = teacherSearchQuery.trim() ? searchedTeachers : projectTeachers;

  const closeAssignModal = () => { setAssigningClassId(null); setTeacherSearchQuery(''); };

  const handleAssignTeacher = async (teacherId: string, classId: string, newTeacherName?: string) => {
    if (!school) return;
    const target = classes.find(c => c.id === classId);
    if (target?.assigned_teacher_id && target.assigned_teacher_id !== teacherId) {
      const oldName = target.teacherName ? `${target.teacherName} 선생님` : '기존 강사';
      const newName = newTeacherName ? `${newTeacherName} 선생님` : '선택한 강사';
      if (!confirm(`'${target.name}' 반에는 이미 ${oldName}이 배정되어 있습니다.\n${newName}으로 교체하면 ${oldName}은 이 반에서 빠집니다.\n\n그래도 교체하시겠습니까?`)) return;
    }
    const { error } = await supabase.rpc('assign_teacher_to_subclass', {
      p_class_id: classId,
      p_teacher_id: teacherId,
      p_project_id: school.id,
    });
    if (error) { setClassActionError('강사 배정에 실패했어요. 잠시 후 다시 시도해 주세요.'); return; }
    closeAssignModal();
    fetchData();
  };

  const handleRemoveTeacher = async (c: TeachingClass) => {
    if (!c.assigned_teacher_id) return;
    if (!confirm(`'${c.name}' 반의 담당 강사(${c.teacherName || '선생님'})를 배정 해제할까요?`)) return;
    await supabase.rpc('remove_teacher_from_subclass', { p_class_id: c.id, p_teacher_id: c.assigned_teacher_id });
    fetchData();
  };

  const handleSaveClassName = async () => {
    const name = editClassName.trim();
    if (!editingClass || !name) return;
    setSavingClass(true);
    setClassActionError('');
    try {
      const { data, error } = await supabase
        .from('classes')
        .update({ name })
        .eq('id', editingClass.id)
        .select('id');
      if (error || !data || data.length === 0) {
        setClassActionError('반 이름을 바꾸지 못했습니다. 권한이 없거나 잠시 후 다시 시도해 주세요.');
        return;
      }
      setClasses(prev => prev.map(c => (c.id === editingClass.id ? { ...c, name } : c)));
      setEditingClass(null);
    } finally {
      setSavingClass(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!deletingClass) return;
    setDeletingClassBusy(true);
    setClassActionError('');
    try {
      const filePaths = await collectClassResultPaths(deletingClass.id);
      const { data, error } = await supabase
        .from('classes')
        .delete()
        .eq('id', deletingClass.id)
        .select('id');
      if (error || !data || data.length === 0) {
        setClassActionError('반을 삭제하지 못했습니다. 권한이 없거나 잠시 후 다시 시도해 주세요.');
        return;
      }
      await removeStoragePaths(filePaths);
      setClasses(prev => prev.filter(c => c.id !== deletingClass.id));
      setDeletingClass(null);
    } finally {
      setDeletingClassBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center text-on-surface-variant">
        학교 정보를 찾을 수 없습니다.
      </div>
    );
  }

  const statusMeta = STATUS_META[school.status] || STATUS_META.archived;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <button
        onClick={() => navigate(projectId ? `/school-projects/${projectId}/schools` : '/classes')}
        className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> {program ? `${program.name} 학교 목록` : '학교 목록'}
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
            <School size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black">{school.name}</h1>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-1">
              {school.region && <span className="flex items-center gap-1"><MapPin size={12} />{school.region}</span>}
              {(school.start_date || school.end_date) && (
                <span className="flex items-center gap-1 font-bold text-primary">
                  <CalendarDays size={12} />
                  수업 기간 {school.start_date ? new Date(school.start_date).toLocaleDateString('ko-KR') : '미정'}
                  {school.end_date && school.end_date !== school.start_date ? ` ~ ${new Date(school.end_date).toLocaleDateString('ko-KR')}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {school.entry_code && (
            <button
              onClick={() => handleCopyCode(school.entry_code)}
              className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high px-3 py-2 rounded-xl transition-all"
            >
              {copiedCode === school.entry_code ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              참가코드 {school.entry_code}
            </button>
          )}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-2 rounded-xl text-on-surface-variant/60 bg-surface-container hover:bg-surface-container-high hover:text-on-surface transition-all"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-40 bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-lg z-20 overflow-hidden py-1"
              >
                <button
                  onClick={() => { setMenuOpen(false); setEditInfoOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
                >
                  <Pencil size={13} /> 정보 수정
                </button>
                <button
                  onClick={handleToggleArchive}
                  disabled={archiving}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-all disabled:opacity-50"
                >
                  {school.status === 'archived' ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                  {school.status === 'archived' ? '보관 해제' : '보관하기'}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setDeleteConfirmOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={13} /> 학교 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-surface-container-high overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap shrink-0 ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant/60 hover:text-on-surface-variant'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'materials' && projectId && schoolId && (
        <SchoolMaterialsTab projectId={projectId} schoolId={schoolId} schoolName={school?.name || '이 학교'} />
      )}

      {tab === 'survey' && projectId && schoolId && (
        <SchoolProjectSurveyTab
          projectId={projectId}
          schoolId={schoolId}
          schoolName={school?.name || '이 학교'}
          schools={[{ id: schoolId, name: school?.name || '이 학교', school_name: school?.school_name ?? null, classes: classes.map(c => ({ id: c.id, name: c.name })) }]}
        />
      )}

      {tab === 'summary' && projectId && schoolId && (
        <ProjectResultSummary
          projectId={projectId}
          schoolId={schoolId}
          program={{ name: school?.name || program?.name || '', school_name: school?.school_name ?? null, start_date: school?.start_date ?? null, end_date: school?.end_date ?? null }}
          totals={{ schoolCount: 1, teacherCount: totals.teacherCount, studentCount: totals.studentCount }}
        />
      )}

      {tab === 'plan' && projectId && schoolId && (
        <SchoolPlanTab projectId={projectId} schoolId={schoolId} />
      )}

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '반', value: totals.classCount, icon: School, color: 'text-primary' },
              { label: '배정 강사', value: totals.teacherCount, icon: GraduationCap, color: 'text-secondary' },
              { label: '학생', value: totals.studentCount, icon: Users, color: 'text-accent' },
              { label: '미배정 반', value: totals.unassignedCount, icon: AlertTriangle, color: totals.unassignedCount > 0 ? 'text-orange-500' : 'text-on-surface-variant/50' },
            ].map(kpi => (
              <div key={kpi.label} className="surface-card p-4 border border-surface-container-high">
                <kpi.icon size={18} className={kpi.color} />
                <p className="text-2xl font-black mt-2 tabular-nums">{kpi.value}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          {classes.length === 0 ? (
            <div className="surface-card p-8 text-center text-on-surface-variant/60 text-sm">
              아직 생성된 반이 없습니다. 프로젝트의 "강사 관리" 화면에서 이 학교의 반을 추가할 수 있습니다.
            </div>
          ) : (
            <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
              {classes.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-bold">{c.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {c.teacherName || <span className="text-orange-500">담당 강사 미배정</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-on-surface-variant/70 mr-2">학생 {c.studentCount}명</span>
                    <button
                      onClick={() => setRosterClass(c)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition-all"
                      title="학생 명단 등록"
                    >
                      <Users size={13} /> 학생 명단
                    </button>
                    <button
                      onClick={() => { setClassActionError(''); setAssigningClassId(c.id); }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition-all"
                      title={c.teacherName ? '담당 강사 변경' : '담당 강사 지정'}
                    >
                      <UserPlus size={13} /> {c.teacherName ? '강사 변경' : '강사 지정'}
                    </button>
                    {c.assigned_teacher_id && (
                      <button
                        onClick={() => handleRemoveTeacher(c)}
                        className="p-1.5 rounded-lg text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface transition-all"
                        aria-label="담당 강사 해제"
                        title="담당 강사 해제"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => { setClassActionError(''); setEditClassName(c.name); setEditingClass(c); }}
                      className="p-1.5 rounded-lg text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface transition-all"
                      aria-label="반 이름 수정"
                      title="반 이름 수정"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { setClassActionError(''); setDeletingClass(c); }}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-500 transition-all"
                      aria-label="반 삭제"
                      title="반 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'quiz' && schoolId && (
        <SendQuizTab schools={[{ id: schoolId, name: school?.name || '이 학교' }]} teacherNames={Object.fromEntries(classes.filter(c => c.assigned_teacher_id && c.teacherName).map(c => [c.assigned_teacher_id as string, c.teacherName as string]))} />
      )}

      {tab === 'board' && schoolId && (
        <SendBoardTab schools={[{ id: schoolId, name: school?.name || '이 학교' }]} teacherNames={Object.fromEntries(classes.filter(c => c.assigned_teacher_id && c.teacherName).map(c => [c.assigned_teacher_id as string, c.teacherName as string]))} />
      )}

      {tab === 'docs' && projectId && schoolId && (
        <InstructorDocsAdminTab
          projectId={projectId}
          schoolId={schoolId}
          teacherNames={Object.fromEntries(classes.filter(c => c.assigned_teacher_id && c.teacherName).map(c => [c.assigned_teacher_id as string, c.teacherName as string]))}
        />
      )}

      {rosterClass && (
        <ClassRosterModal
          classId={rosterClass.id}
          className={rosterClass.name}
          students={classes.find(c => c.id === rosterClass.id)?.students || []}
          onClose={() => setRosterClass(null)}
          onSaved={() => { fetchData(true); }}
        />
      )}

      {tab === 'attendance' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-on-surface-variant/60" />
            <input
              type="date"
              value={attDate}
              onChange={e => setAttDate(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-bold bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={toggleNotify}
              disabled={notifySaving}
              title="내가 관리하는 프로젝트의 반이 수업을 시작·종료하면 알림을 받습니다"
              className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border transition-all disabled:opacity-50 ${
                notifyOn ? 'text-emerald-600 border-emerald-200 bg-emerald-50/60' : 'text-on-surface-variant/60 border-on-surface/10'
              }`}
            >
              {notifyOn ? <Bell size={13} /> : <BellOff size={13} />}
              수업 시작·종료 알림 {notifyOn ? 'ON' : 'OFF'}
            </button>
          </div>
          {notifyOn && notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
            <p className="text-xs font-bold text-on-surface-variant/70">
              이 기기에서는 아직 알림이 허용되지 않았어요. 위쪽 메뉴의 "클래스 알림 켜기"를 눌러 허용하면 폰·PC로 알림이 도착해요.
            </p>
          )}

          {classes.length === 0 ? (
            <div className="surface-card p-8 text-center text-on-surface-variant/60 text-sm">
              아직 생성된 반이 없습니다.
            </div>
          ) : attLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={22} />
            </div>
          ) : (
            <div className="space-y-4">
              {classes.map(c => (
                <div key={c.id} className="surface-card border border-surface-container-high overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40 flex items-center justify-between">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{c.name}</span>
                      {(() => {
                        const ss = sessions[c.id];
                        const started = ss && isToday(ss.startedAt);
                        const ended = ss && isToday(ss.endedAt);
                        if (ended) return <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">종료</span>;
                        if (started) return (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
                            진행 중{ss.week ? ` · ${ss.week}주차` : ''}
                          </span>
                        );
                        return <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant/60">시작 전</span>;
                      })()}
                    </span>
                    <span className="text-xs text-on-surface-variant/60">
                      학생 {c.students.length}명 중 {c.students.filter(st => attRecords[st.id]).length}명 기록됨
                    </span>
                  </div>
                  {c.students.length === 0 ? (
                    <p className="text-xs text-on-surface-variant/50 text-center py-6">등록된 학생이 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-surface-container-high">
                      {c.students.map(st => {
                        const status = attRecords[st.id];
                        const meta = ATT_STATUSES.find(s => s.key === status);
                        return (
                          <div key={st.id} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-sm font-bold">{st.full_name}</span>
                            {meta ? (
                              <span className={`text-xs font-black px-2.5 py-1 rounded-full ${meta.className}`}>{meta.label}</span>
                            ) : (
                              <span className="text-xs font-bold text-on-surface-variant/40 px-2.5 py-1">미기록</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4">
          {classes.length === 0 ? (
            <div className="surface-card p-8 text-center text-on-surface-variant/60 text-sm">
              아직 생성된 반이 없습니다.
            </div>
          ) : resultsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={22} />
            </div>
          ) : (
            <div className="space-y-4">
              {classes.map(c => {
                if (c.students.length === 0) return null;
                return (
                  <div key={c.id} className="surface-card border border-surface-container-high overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40">
                      <span className="text-sm font-bold">{c.name}</span>
                    </div>
                    <div className="divide-y divide-surface-container-high">
                      {c.students.map(st => {
                        const obs = obsRecords.filter(o => o.student_id === st.id);
                        const results = resultRecords.filter(r => r.student_id === st.id);
                        const expanded = expandedStudentId === st.id;
                        return (
                          <div key={st.id}>
                            <button
                              onClick={() => setExpandedStudentId(expanded ? null : st.id)}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-container-low/40 transition-all text-left"
                            >
                              <span className="text-sm font-bold flex items-center gap-1.5">
                                {expanded ? <ChevronDown size={14} className="text-on-surface-variant/40" /> : <ChevronRight size={14} className="text-on-surface-variant/40" />}
                                {st.full_name}
                              </span>
                              <span className="flex items-center gap-3 text-xs text-on-surface-variant">
                                <span className="flex items-center gap-1"><FileText size={12} />활동기록 {obs.length}</span>
                                <span className="flex items-center gap-1"><BookOpen size={12} />결과물 {results.length}</span>
                              </span>
                            </button>
                            {expanded && (
                              <div className="px-4 pb-3 pl-9 space-y-3">
                                {obs.length === 0 && results.length === 0 ? (
                                  <p className="text-xs text-on-surface-variant/50 py-2">제출된 활동기록/결과물이 없습니다.</p>
                                ) : (
                                  <>
                                    {obs.length > 0 && (
                                      <div className="space-y-1.5">
                                        <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-wide">활동기록</p>
                                        {obs.map(o => (
                                          <div key={o.id} className="bg-surface-container-low/60 rounded-lg px-3 py-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-bold">{o.activity_name || '활동'}</span>
                                              <span className="text-[10px] text-on-surface-variant/50">{new Date(o.created_at).toLocaleDateString('ko-KR')}</span>
                                            </div>
                                            {o.content && <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 whitespace-pre-wrap">{o.content}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {results.length > 0 && (
                                      <div className="space-y-1.5">
                                        <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-wide">결과물</p>
                                        {results.map(r => {
                                          const url = getResultUrl(r);
                                          return (
                                            <div key={r.id} className="bg-surface-container-low/60 rounded-lg px-3 py-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-bold flex items-center gap-1.5">
                                                  {r.week_number != null && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{r.week_number}주차</span>}
                                                  {r.title || '제출 결과'}
                                                </span>
                                                <span className="text-[10px] text-on-surface-variant/50 shrink-0">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
                                              </div>
                                              {r.text_content && <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 whitespace-pre-wrap">{r.text_content}</p>}
                                              {url && (
                                                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary mt-1 hover:underline">
                                                  <ExternalLink size={10} /> 결과 보기
                                                </a>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'records' && (
        <div className="space-y-4">
          {classes.length === 0 ? (
            <div className="surface-card p-8 text-center text-on-surface-variant/60 text-sm">
              아직 생성된 반이 없습니다.
            </div>
          ) : recordsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={22} />
            </div>
          ) : (
            <div className="space-y-4">
              {classes.map(c => {
                if (c.students.length === 0) return null;
                return (
                  <div key={c.id} className="surface-card border border-surface-container-high overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40">
                      <span className="text-sm font-bold">{c.name}</span>
                    </div>
                    <div className="divide-y divide-surface-container-high">
                      {c.students.map(st => {
                        const ev = evalRecords[st.id];
                        const statusMeta = ev?.status ? (EVAL_STATUS_META[ev.status] || EVAL_STATUS_NONE) : EVAL_STATUS_NONE;
                        const expanded = expandedEvalId === st.id;
                        return (
                          <div key={st.id}>
                            <button
                              onClick={() => setExpandedEvalId(expanded ? null : st.id)}
                              disabled={!ev?.setech_content}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-container-low/40 transition-all text-left disabled:cursor-default"
                            >
                              <span className="text-sm font-bold flex items-center gap-1.5">
                                {ev?.setech_content ? (expanded ? <ChevronDown size={14} className="text-on-surface-variant/40" /> : <ChevronRight size={14} className="text-on-surface-variant/40" />) : <span className="w-3.5" />}
                                {st.full_name}
                              </span>
                              <span className="flex items-center gap-2">
                                {ev?.achievement_level && (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">{ev.achievement_level}</span>
                                )}
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusMeta.className}`}>{statusMeta.label}</span>
                              </span>
                            </button>
                            {expanded && ev?.setech_content && (
                              <div className="px-4 pb-3 pl-9">
                                <p className="text-xs text-on-surface-variant bg-surface-container-low/60 rounded-lg px-3 py-2 whitespace-pre-wrap">{ev.setech_content}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editInfoOpen && (
        <SchoolInfoEditModal
          schoolId={school.id}
          initialName={school.school_name || school.name}
          initialRegion={school.region}
          initialStartDate={school.start_date ?? null}
          initialEndDate={school.end_date ?? null}
          onClose={() => setEditInfoOpen(false)}
          onSaved={(name, region, start_date, end_date) => setSchool((prev: any) => ({ ...prev, name, school_name: name, region, start_date, end_date }))}
        />
      )}

      {/* 담당 강사 지정 모달 */}
      {assigningClassId && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeAssignModal}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="font-black text-lg">담당 강사 지정</h2>
              <button onClick={closeAssignModal} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container mb-3 shrink-0">
              <Search size={14} className="text-on-surface-variant/50" />
              <input
                type="text"
                placeholder="선생님 이름 검색..."
                value={teacherSearchQuery}
                onChange={e => setTeacherSearchQuery(e.target.value)}
                className="flex-1 text-sm font-bold outline-none bg-transparent text-on-surface"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto -mx-2">
              {filteredTeachers.length === 0 ? (
                <p className="text-xs text-on-surface-variant/50 text-center py-6">
                  {teacherSearchQuery.trim() ? '검색 결과 없음' : '같은 소속 선생님이 없습니다. 이름으로 검색해 보세요'}
                </p>
              ) : (
                filteredTeachers.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleAssignTeacher(t.id, assigningClassId, t.full_name)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-primary/5 text-left transition-all"
                  >
                    <img
                      src={t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.full_name)}&background=random`}
                      alt={t.full_name}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                    <p className="text-sm font-bold text-on-surface">{t.full_name} 선생님</p>
                    {teacherSearchQuery.trim() && t.school_code !== profile?.school_code && (
                      <span className="ml-auto text-[10px] font-bold text-on-surface-variant/60">{t.school_code ? '다른 소속' : '소속 없음'}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            {classActionError && <p className="text-xs text-red-500 mt-2">{classActionError}</p>}
          </div>
        </div>,
        document.body
      )}

      {/* 반 이름 수정 모달 */}
      {editingClass && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !savingClass && setEditingClass(null)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="font-black text-lg mb-3">반 이름 수정</h2>
            <input
              autoFocus
              value={editClassName}
              onChange={e => setEditClassName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveClassName(); }}
              maxLength={50}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {classActionError && <p className="text-xs text-red-500 mt-2">{classActionError}</p>}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingClass(null)}
                disabled={savingClass}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleSaveClassName}
                disabled={savingClass || !editClassName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {savingClass ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 반 삭제 확인 모달 */}
      {deletingClass && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !deletingClassBusy && setDeletingClass(null)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3 text-red-500">
              <AlertTriangle size={20} />
              <h2 className="font-black text-lg">반 삭제</h2>
            </div>
            <p className="text-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">{deletingClass.name}</span> 반을 삭제하면 학생 {deletingClass.studentCount}명, 수업 자료 {deletingClass.materialCount}개, 출결·제출 기록이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            {classActionError && <p className="text-xs text-red-500 mt-2">{classActionError}</p>}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeletingClass(null)}
                disabled={deletingClassBusy}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleDeleteClass}
                disabled={deletingClassBusy}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {deletingClassBusy ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 학교 삭제 확인 모달 */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !deletingSchool && setDeleteConfirmOpen(false)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3 text-red-500">
              <AlertTriangle size={20} />
              <h2 className="font-black text-lg">학교 삭제</h2>
            </div>
            <p className="text-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">{school.name}</span>의 모든 반, 학생, 출결 기록이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deletingSchool}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleDeleteSchool}
                disabled={deletingSchool}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {deletingSchool ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolProjectDetailPage;
