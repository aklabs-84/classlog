import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import RichEditor from '../components/RichEditor';
import {
  ArrowLeft,
  School,
  Search,
  MapPin,
  Users,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  AlertTriangle,
  Loader2,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  BookOpen,
  Eye,
  EyeOff,
  Pencil,
  Copy,
  Check,
  UserPlus,
  UserMinus,
  Download,
  Link as LinkIcon,
  Save,
  CalendarRange,
} from 'lucide-react';

interface ProgramMaterial {
  id: string;
  title: string;
  content: string | null;
  week_number: number | null;
  is_published: boolean;
  updated_at: string;
}

interface ImportableMaterial {
  id: string;
  title: string;
  content: string | null;
  week_number: number | null;
  class_id: string | null;
  className: string;
  activity_urls?: { url: string; label: string }[];
}

interface WeeklyPlanItem {
  week: number;
  topic: string;
  url?: string;
  material_id?: string;
  requires_result?: boolean;
  requires_activity?: boolean;
}

const PAGE_TABS = [
  { key: 'schools', label: '학교 목록' },
  { key: 'teachers', label: '강사 관리' },
  { key: 'materials', label: '수업 자료' },
  { key: 'plan', label: '주차별 계획' },
] as const;
type PageTabKey = (typeof PAGE_TABS)[number]['key'];

interface SchoolRow {
  id: string;
  name: string;
  school_name: string | null;
  region: string | null;
  status: string;
  entry_code: string | null;
  created_at: string;
  rootClassId: string | null;
  classCount: number;
  teacherCount: number;
  unassignedCount: number;
  studentCount: number;
  classes: { id: string; name: string; entry_code: string; assigned_teacher_id: string | null; teacherName: string | null; studentCount: number }[];
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: '진행 중', className: 'bg-green-100 text-green-600' },
  closed: { label: '수업 종료', className: 'bg-orange-100 text-orange-600' },
  archived: { label: '보관됨', className: 'bg-gray-100 text-gray-500' },
};

const generateEntryCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const compressToWebP = (file: File, maxWidth = 1280, quality = 0.85): Promise<File> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas context 생성 실패')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('이미지 변환 실패')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' }));
      }, 'image/webp', quality);
    };
    img.onerror = reject;
    img.src = url;
  });

const SchoolProjectSchoolsPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<{ id: string; name: string; school_name: string | null; share_token: string | null } | null>(null);
  const [copiedProjectShare, setCopiedProjectShare] = useState<'code' | 'url' | null>(null);
  const [schools, setSchools] = useState<SchoolRow[]>([]);

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [addOpen, setAddOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<PageTabKey>('schools');
  const [materials, setMaterials] = useState<ProgramMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ProgramMaterial | null>(null);
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialContent, setMaterialContent] = useState('');
  const [materialWeek, setMaterialWeek] = useState('');
  const [materialPublished, setMaterialPublished] = useState(false);
  const [materialSaving, setMaterialSaving] = useState(false);
  const [materialUploading, setMaterialUploading] = useState(false);
  const [materialDeleteTarget, setMaterialDeleteTarget] = useState<ProgramMaterial | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCandidates, setImportCandidates] = useState<ImportableMaterial[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  const [projectRootClassId, setProjectRootClassId] = useState<string | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planMaterials, setPlanMaterials] = useState<ImportableMaterial[]>([]);
  const [planMaterialsLoading, setPlanMaterialsLoading] = useState(false);
  const [planMaterialDropdownIdx, setPlanMaterialDropdownIdx] = useState<number | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSchoolId, setNewClassSchoolId] = useState('');
  const [savingClass, setSavingClass] = useState(false);
  const [assigningClassId, setAssigningClassId] = useState<string | null>(null);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [projectTeachers, setProjectTeachers] = useState<{ id: string; full_name: string; avatar_url: string | null }[]>([]);

  useEffect(() => {
    if (projectId) fetchData();
  }, [projectId]);

  const fetchMaterials = async () => {
    if (!projectId) return;
    setMaterialsLoading(true);
    try {
      const { data } = await supabase
        .from('program_materials')
        .select('id, title, content, week_number, is_published, updated_at')
        .eq('program_project_id', projectId)
        .order('week_number', { ascending: true, nullsFirst: true })
        .order('updated_at', { ascending: false });
      setMaterials(data || []);
    } finally {
      setMaterialsLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && activeTab === 'materials') fetchMaterials();
  }, [projectId, activeTab]);

  const fetchPlan = async () => {
    if (!projectId) return;
    setPlanLoading(true);
    try {
      const { data } = await supabase
        .from('classes')
        .select('id, weekly_plan')
        .eq('school_project_id', projectId)
        .is('parent_class_id', null)
        .maybeSingle();
      setProjectRootClassId(data?.id || null);
      setWeeklyPlan(data?.weekly_plan || []);
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && activeTab === 'plan') {
      fetchPlan();
      fetchPlanMaterials();
    }
  }, [projectId, activeTab]);

  const fetchPlanMaterials = async () => {
    if (!user) return;
    setPlanMaterialsLoading(true);
    try {
      setPlanMaterials(await loadImportableMaterials());
    } finally {
      setPlanMaterialsLoading(false);
    }
  };

  const handleSavePlan = async () => {
    if (!projectRootClassId) return;
    setPlanSaving(true);
    try {
      const targetIds = [projectRootClassId, ...schools.map(s => s.rootClassId).filter(Boolean)] as string[];
      const { error } = await supabase.from('classes').update({ weekly_plan: weeklyPlan }).in('id', targetIds);
      if (error) throw error;
      alert('주차별 계획이 저장되었습니다. 모든 학교의 반에 적용됩니다.');
    } catch (err) {
      console.error('handleSavePlan error:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setPlanSaving(false);
    }
  };

  const openAddMaterial = () => {
    setEditingMaterial(null);
    setMaterialTitle('');
    setMaterialContent('');
    setMaterialWeek('');
    setMaterialPublished(false);
    setMaterialModalOpen(true);
  };

  const openEditMaterial = (m: ProgramMaterial) => {
    setEditingMaterial(m);
    setMaterialTitle(m.title);
    setMaterialContent(m.content || '');
    setMaterialWeek(m.week_number != null ? String(m.week_number) : '');
    setMaterialPublished(m.is_published);
    setMaterialModalOpen(true);
  };

  const handleUploadMaterialImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('로그인 필요');
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기가 너무 큽니다. 50MB 이하 이미지만 업로드 가능합니다.');
      throw new Error('파일 크기 초과');
    }
    const compressed = await compressToWebP(file);
    if (compressed.size > 20 * 1024 * 1024) {
      alert('변환 후에도 20MB를 초과합니다. 더 작은 이미지를 사용해주세요.');
      throw new Error('파일 크기 초과');
    }
    const path = `program-materials/${user.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
    if (error) throw error;
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSaveMaterial = async () => {
    if (!materialTitle.trim() || !user || !projectId) return;
    setMaterialSaving(true);
    try {
      const payload = {
        title: materialTitle.trim(),
        content: materialContent.trim() || null,
        week_number: materialWeek.trim() ? Number(materialWeek.trim()) : null,
        is_published: materialPublished,
      };
      if (editingMaterial) {
        await supabase.from('program_materials').update(payload).eq('id', editingMaterial.id);
      } else {
        await supabase.from('program_materials').insert({
          ...payload,
          program_project_id: projectId,
          admin_id: user.id,
        });
      }
      setMaterialModalOpen(false);
      fetchMaterials();
    } finally {
      setMaterialSaving(false);
    }
  };

  const handleToggleMaterialPublish = async (m: ProgramMaterial) => {
    await supabase.from('program_materials').update({ is_published: !m.is_published }).eq('id', m.id);
    setMaterials(prev => prev.map(x => x.id === m.id ? { ...x, is_published: !x.is_published } : x));
  };

  const handleDeleteMaterial = async () => {
    if (!materialDeleteTarget) return;
    await supabase.from('program_materials').delete().eq('id', materialDeleteTarget.id);
    setMaterials(prev => prev.filter(x => x.id !== materialDeleteTarget.id));
    setMaterialDeleteTarget(null);
  };

  const loadImportableMaterials = async (): Promise<ImportableMaterial[]> => {
    if (!user) return [];
    const classMap: Record<string, string> = {};
    schools.forEach(s => s.classes.forEach(c => { classMap[c.id] = `${s.name} · ${c.name}`; }));

    const { data: myClasses } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', user.id);
    (myClasses || []).forEach(c => {
      if (!classMap[c.id]) classMap[c.id] = c.name;
    });

    const { data } = await supabase
      .from('class_materials')
      .select('id, title, content, week_number, class_id, activity_urls')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    return (data || []).map(m => ({
      id: m.id,
      title: m.title,
      content: m.content,
      week_number: m.week_number,
      class_id: m.class_id,
      className: m.class_id ? (classMap[m.class_id] || '') : '자료실 (수업 미배정)',
      activity_urls: m.activity_urls || [],
    }));
  };

  const handleOpenImport = async () => {
    if (!user) return;
    setImportOpen(true);
    setImportLoading(true);
    try {
      setImportCandidates(await loadImportableMaterials());
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportMaterial = (m: ImportableMaterial) => {
    setMaterialTitle(m.title);
    setMaterialContent(m.content || '');
    setMaterialWeek(m.week_number ? String(m.week_number) : '');
    setImportOpen(false);
  };

  const handlePickPlanMaterial = async (idx: number, m: ImportableMaterial) => {
    const plan = [...weeklyPlan];
    plan[idx] = { ...plan[idx], topic: m.title, material_id: m.id, url: m.activity_urls?.[0]?.url || plan[idx].url };
    setWeeklyPlan(plan);
    setPlanMaterialDropdownIdx(null);
    // 주차별 계획에 연결된 자료는 학교 프로젝트의 다른 강사/학생도 봐야 하므로 공개 상태로 전환
    await supabase.from('class_materials').update({ is_published: true, updated_at: new Date().toISOString() }).eq('id', m.id);
  };

  const handleUnlinkPlanMaterial = (idx: number) => {
    const plan = [...weeklyPlan];
    plan[idx] = { ...plan[idx], material_id: '' };
    setWeeklyPlan(plan);
  };

  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenId]);

  useEffect(() => {
    if (planMaterialDropdownIdx === null) return;
    const close = () => setPlanMaterialDropdownIdx(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [planMaterialDropdownIdx]);

  const fetchData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data: proj } = await supabase
        .from('school_projects')
        .select('id, name, school_name, share_token')
        .eq('id', projectId)
        .single();
      setProgram(proj || null);

      const { data: subProjects } = await supabase
        .from('school_projects')
        .select('id, name, school_name, region, status, entry_code, created_at')
        .eq('parent_project_id', projectId)
        .order('created_at', { ascending: false });

      if (!subProjects || subProjects.length === 0) {
        setSchools([]);
        return;
      }

      const schoolIds = subProjects.map(s => s.id);

      const { data: allClasses } = await supabase
        .from('classes')
        .select('id, name, entry_code, school_project_id, parent_class_id, assigned_teacher_id')
        .in('school_project_id', schoolIds);

      const teachingClasses = (allClasses || []).filter(c => c.parent_class_id !== null);
      const rootClassBySchool: Record<string, string> = {};
      (allClasses || []).filter(c => c.parent_class_id === null).forEach(c => {
        rootClassBySchool[c.school_project_id] = c.id;
      });
      const teacherIds = [...new Set(teachingClasses.map(c => c.assigned_teacher_id).filter(Boolean))] as string[];

      const teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
        (profiles || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });
      }

      const classIds = teachingClasses.map(c => c.id);
      const studentCountByClass: Record<string, number> = {};
      if (classIds.length > 0) {
        const { data: allStudents } = await supabase.from('students').select('class_id').in('class_id', classIds);
        (allStudents || []).forEach((s: any) => {
          studentCountByClass[s.class_id] = (studentCountByClass[s.class_id] || 0) + 1;
        });
      }

      const rows: SchoolRow[] = subProjects.map(s => {
        const myClasses = teachingClasses.filter(c => c.school_project_id === s.id);
        const assigned = myClasses.filter(c => c.assigned_teacher_id);
        return {
          id: s.id,
          name: s.name,
          school_name: s.school_name,
          region: s.region,
          status: s.status,
          entry_code: s.entry_code,
          created_at: s.created_at,
          rootClassId: rootClassBySchool[s.id] || null,
          classCount: myClasses.length,
          teacherCount: new Set(assigned.map(c => c.assigned_teacher_id)).size,
          unassignedCount: myClasses.length - assigned.length,
          studentCount: myClasses.reduce((sum, c) => sum + (studentCountByClass[c.id] || 0), 0),
          classes: myClasses.map(c => ({
            id: c.id,
            name: c.name,
            entry_code: c.entry_code,
            assigned_teacher_id: c.assigned_teacher_id,
            teacherName: c.assigned_teacher_id ? (teacherMap[c.assigned_teacher_id] || null) : null,
            studentCount: studentCountByClass[c.id] || 0,
          })),
        };
      });

      setSchools(rows);
    } finally {
      setLoading(false);
    }
  };

  const regions = useMemo(
    () => [...new Set(schools.map(s => s.region).filter(Boolean))] as string[],
    [schools]
  );

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      if (search.trim() && !`${s.name} ${s.school_name || ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (regionFilter !== 'all' && s.region !== regionFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [schools, search, regionFilter, statusFilter]);

  const totals = useMemo(() => ({
    schoolCount: schools.length,
    teacherCount: schools.reduce((sum, s) => sum + s.teacherCount, 0),
    studentCount: schools.reduce((sum, s) => sum + s.studentCount, 0),
    needsAttention: schools.filter(s => s.unassignedCount > 0).length,
  }), [schools]);

  const handleAddSchool = async () => {
    if (!newSchoolName.trim() || !user || !projectId || !program) return;
    setSaving(true);
    setAddError('');
    try {
      const { data: newProject, error: projError } = await supabase
        .from('school_projects')
        .insert({
          name: newSchoolName.trim(),
          school_name: newSchoolName.trim(),
          admin_id: user.id,
          parent_project_id: projectId,
          region: newRegion.trim() || null,
          entry_code: generateEntryCode(),
          status: 'active',
        })
        .select('id')
        .single();

      if (projError || !newProject) {
        setAddError('학교 추가에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      const { data: programRoot } = await supabase
        .from('classes')
        .select('weekly_plan')
        .eq('school_project_id', projectId)
        .is('parent_class_id', null)
        .maybeSingle();

      await supabase.from('classes').insert({
        name: `${newSchoolName.trim()} (전체)`,
        subject: program.name,
        teacher_id: user.id,
        entry_code: generateEntryCode(),
        school_project_id: newProject.id,
        weekly_plan: programRoot?.weekly_plan || [],
      });

      setNewSchoolName('');
      setNewRegion('');
      setAddOpen(false);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (school: SchoolRow) => {
    const nextStatus = school.status === 'archived' ? 'active' : 'archived';
    setArchivingId(school.id);
    setMenuOpenId(null);
    try {
      await supabase.from('school_projects').update({ status: nextStatus }).eq('id', school.id);
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, status: nextStatus } : s));
    } finally {
      setArchivingId(null);
    }
  };

  const handleDeleteSchool = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from('classes').delete().eq('school_project_id', deleteTarget.id);
      await supabase.from('school_projects').delete().eq('id', deleteTarget.id);
      setSchools(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
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

  const filteredTeachers = useMemo(() => {
    const q = teacherSearchQuery.trim().toLowerCase();
    if (!q) return projectTeachers;
    return projectTeachers.filter(t => t.full_name?.toLowerCase().includes(q));
  }, [projectTeachers, teacherSearchQuery]);

  const handleAddClass = async () => {
    const targetSchool = schools.find(s => s.id === newClassSchoolId);
    if (!newClassName.trim() || !user || !targetSchool?.rootClassId || !program) return;
    setSavingClass(true);
    try {
      await supabase.from('classes').insert({
        name: newClassName.trim(),
        subject: program.name,
        teacher_id: user.id,
        entry_code: generateEntryCode(),
        school_project_id: newClassSchoolId,
        parent_class_id: targetSchool.rootClassId,
      });
      setNewClassName('');
      setAddClassOpen(false);
      fetchData();
    } finally {
      setSavingClass(false);
    }
  };

  const handleAssignTeacher = async (teacherId: string, classId: string, school: SchoolRow) => {
    const { error } = await supabase.rpc('assign_teacher_to_subclass', {
      p_class_id: classId,
      p_teacher_id: teacherId,
      p_project_id: school.id,
    });
    if (!error) {
      setAssigningClassId(null);
      setTeacherSearchQuery('');
      fetchData();
    }
  };

  const handleRemoveTeacher = async (classId: string, teacherId: string) => {
    await supabase.rpc('remove_teacher_from_subclass', { p_class_id: classId, p_teacher_id: teacherId });
    fetchData();
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('이 반을 삭제하시겠습니까? 소속 학생과 출결 기록도 함께 삭제됩니다.')) return;
    await supabase.from('classes').delete().eq('id', classId);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <button
        onClick={() => navigate('/classes')}
        className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> 대시보드로
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">사업 관리</p>
          <h1 className="text-2xl font-black">{program?.name || '학교 목록'}</h1>
          {program?.school_name && <p className="text-sm text-on-surface-variant mt-0.5">{program.school_name}</p>}
        </div>
        {activeTab === 'schools' && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dim px-4 py-2.5 rounded-xl transition-all"
          >
            <Plus size={16} /> 학교 추가
          </button>
        )}
      </div>

      {program?.share_token && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="p-4 bg-secondary/5 rounded-2xl border border-secondary/10 space-y-2">
            <div className="flex items-center gap-2">
              <UserPlus size={14} className="text-secondary" />
              <p className="text-xs font-black text-on-surface uppercase tracking-widest">선생님 참여 코드</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1 px-3 py-2.5 bg-surface-container-lowest rounded-xl text-sm font-black font-mono text-secondary border-2 border-secondary/20 tracking-widest text-center">
                {program.share_token}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(program.share_token!);
                  setCopiedProjectShare('code');
                  setTimeout(() => setCopiedProjectShare(null), 2000);
                }}
                className="px-3 py-2.5 bg-secondary hover:bg-secondary-dim text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
              >
                {copiedProjectShare === 'code' ? <><Check size={13} /> 복사됨</> : <><Copy size={13} /> 복사</>}
              </button>
            </div>
          </div>

          <div className="p-4 bg-surface-container rounded-2xl border border-surface-container-high space-y-2">
            <div className="flex items-center gap-2">
              <LinkIcon size={14} className="text-on-surface-variant" />
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest">학교 담당자 공유 URL</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1 px-3 py-2.5 bg-surface-container-lowest rounded-xl text-[11px] font-mono text-on-surface-variant border border-surface-container-high truncate">
                {window.location.origin}/school-project/{program.share_token}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/school-project/${program.share_token}`);
                  setCopiedProjectShare('url');
                  setTimeout(() => setCopiedProjectShare(null), 2000);
                }}
                className="px-3 py-2.5 bg-primary hover:bg-primary-dim text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
              >
                {copiedProjectShare === 'url' ? <><Check size={13} /> 복사됨</> : <><Copy size={13} /> 복사</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-surface-container-high">
        {PAGE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'schools' && (
      <>
      {/* KPI 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '참여 학교', value: totals.schoolCount, icon: School, color: 'text-primary' },
          { label: '전체 강사', value: totals.teacherCount, icon: GraduationCap, color: 'text-secondary' },
          { label: '전체 학생', value: totals.studentCount, icon: Users, color: 'text-accent' },
          { label: '확인 필요 학교', value: totals.needsAttention, icon: AlertTriangle, color: totals.needsAttention > 0 ? 'text-orange-500' : 'text-on-surface-variant/50' },
        ].map(kpi => (
          <div key={kpi.label} className="surface-card p-4 border border-surface-container-high">
            <kpi.icon size={18} className={kpi.color} />
            <p className="text-2xl font-black mt-2 tabular-nums">{kpi.value}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* 검색 & 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="학교명으로 검색"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
          />
        </div>
        {regions.length > 0 && (
          <div className="relative">
            <select
              value={regionFilter}
              onChange={e => setRegionFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl text-sm font-bold bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="all">전체 지역</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant/50" />
          </div>
        )}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl text-sm font-bold bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            <option value="all">전체 상태</option>
            <option value="active">진행 중</option>
            <option value="closed">수업 종료</option>
            <option value="archived">보관됨</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant/50" />
        </div>
      </div>

      {/* 학교 목록 */}
      {schools.length === 0 ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full surface-card p-10 border-2 border-dashed border-surface-container-high hover:border-primary/40 text-center text-on-surface-variant/60 hover:text-primary transition-all"
        >
          <School size={32} className="mx-auto mb-2" />
          <p className="text-sm font-bold">아직 등록된 학교가 없습니다</p>
          <p className="text-xs mt-1 opacity-70">이 사업에 참여하는 첫 번째 학교를 추가해보세요</p>
        </button>
      ) : filteredSchools.length === 0 ? (
        <div className="surface-card p-10 text-center text-on-surface-variant/60 text-sm">
          검색 조건에 맞는 학교가 없습니다.
        </div>
      ) : (
        <div className="surface-card border border-surface-container-high overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-container-high text-left text-xs text-on-surface-variant/70">
                  <th className="px-4 py-3 font-bold">학교</th>
                  <th className="px-4 py-3 font-bold">지역</th>
                  <th className="px-4 py-3 font-bold">상태</th>
                  <th className="px-4 py-3 font-bold text-right">반</th>
                  <th className="px-4 py-3 font-bold text-right">강사</th>
                  <th className="px-4 py-3 font-bold text-right">학생</th>
                  <th className="px-4 py-3 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map(s => {
                  const statusMeta = STATUS_META[s.status] || STATUS_META.archived;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/school-projects/${projectId}/schools/${s.id}`)}
                      className="border-b border-surface-container-high last:border-0 hover:bg-surface-container-low/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{s.name}</span>
                          {s.unassignedCount > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                              <AlertTriangle size={10} /> 미배정 {s.unassignedCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {s.region ? (
                          <span className="flex items-center gap-1"><MapPin size={12} />{s.region}</span>
                        ) : <span className="text-on-surface-variant/40">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.classCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.teacherCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.studentCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <div className="relative">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (menuOpenId === s.id) {
                                  setMenuOpenId(null);
                                  return;
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
                                setMenuOpenId(s.id);
                              }}
                              className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high transition-all"
                            >
                              <MoreVertical size={14} />
                            </button>
                            {menuOpenId === s.id && menuPos && createPortal(
                              <div
                                onClick={e => e.stopPropagation()}
                                style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
                                className="w-40 bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-lg z-50 overflow-hidden py-1"
                              >
                                <button
                                  onClick={() => { setMenuOpenId(null); handleToggleArchive(s); }}
                                  disabled={archivingId === s.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-all disabled:opacity-50"
                                >
                                  {s.status === 'archived' ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                                  {s.status === 'archived' ? '보관 해제' : '보관하기'}
                                </button>
                                <button
                                  onClick={() => { setMenuOpenId(null); setDeleteTarget(s); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition-all"
                                >
                                  <Trash2 size={13} /> 삭제
                                </button>
                              </div>,
                              document.body
                            )}
                          </div>
                          <ChevronRight size={14} className="text-on-surface-variant/50" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {activeTab === 'teachers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-on-surface-variant">
              이 사업의 모든 학교에 걸쳐 반을 만들고 담당 강사를 배정합니다. 강사에게는 참가코드를 전달하거나, 직접 강사를 검색해 배정할 수 있습니다.
            </p>
            <button
              onClick={() => { setNewClassSchoolId(schools[0]?.id || ''); setAddClassOpen(true); }}
              disabled={schools.length === 0}
              className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-40 px-4 py-2.5 rounded-xl transition-all shrink-0"
            >
              <Plus size={16} /> 반 추가
            </button>
          </div>

          {schools.every(s => s.classes.length === 0) ? (
            <div className="w-full surface-card p-10 border-2 border-dashed border-surface-container-high text-center text-on-surface-variant/60">
              <GraduationCap size={32} className="mx-auto mb-2" />
              <p className="text-sm font-bold">아직 생성된 반이 없습니다</p>
              <p className="text-xs mt-1 opacity-70">반을 추가하고 참가코드를 강사에게 전달하세요</p>
            </div>
          ) : (
            <div className="space-y-4">
              {schools.filter(s => s.classes.length > 0).map(school => (
                <div key={school.id} className="surface-card border border-surface-container-high overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40 flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-1.5">
                      <School size={13} className="text-on-surface-variant/50" />
                      {school.name}
                    </span>
                    {school.unassignedCount > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                        <AlertTriangle size={10} /> 미배정 {school.unassignedCount}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-container-high text-left text-xs text-on-surface-variant/70">
                          <th className="px-4 py-2.5 font-bold">반 이름</th>
                          <th className="px-4 py-2.5 font-bold">담당 강사</th>
                          <th className="px-4 py-2.5 font-bold">참가코드</th>
                          <th className="px-4 py-2.5 font-bold text-right">학생</th>
                          <th className="px-4 py-2.5 font-bold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {school.classes.map(c => (
                          <tr
                            key={c.id}
                            onClick={() => navigate(`/school-projects/${projectId}/schools/${school.id}/classes/${c.id}`)}
                            className="border-b border-surface-container-high last:border-0 hover:bg-surface-container-low/60 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-2.5 font-bold">{c.name}</td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={e => { e.stopPropagation(); setAssigningClassId(c.id); }}
                                className="flex items-center gap-1.5 hover:text-primary transition-all"
                              >
                                {c.teacherName ? (
                                  <span>{c.teacherName}</span>
                                ) : (
                                  <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">미배정</span>
                                )}
                                <UserPlus size={12} className="text-on-surface-variant/40" />
                              </button>
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={e => { e.stopPropagation(); handleCopyCode(c.entry_code); }}
                                className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary transition-all"
                              >
                                {copiedCode === c.entry_code ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                {c.entry_code}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{c.studentCount}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {c.assigned_teacher_id && (
                                  <button
                                    onClick={e => { e.stopPropagation(); handleRemoveTeacher(c.id, c.assigned_teacher_id!); }}
                                    title="담당 강사 해제"
                                    className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-orange-500 hover:bg-orange-50 transition-all"
                                  >
                                    <UserMinus size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteClass(c.id); }}
                                  title="반 삭제"
                                  className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                                <ChevronRight size={14} className="text-on-surface-variant/40" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-on-surface-variant">
              여기 등록한 자료는 이 프로그램의 각 반에 배정된 강사에게 <span className="font-bold text-primary">공개(발행)</span> 상태일 때만 노출됩니다.
            </p>
            <button
              onClick={openAddMaterial}
              className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dim px-4 py-2.5 rounded-xl transition-all shrink-0"
            >
              <Plus size={16} /> 자료 추가
            </button>
          </div>

          {materialsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : materials.length === 0 ? (
            <button
              onClick={openAddMaterial}
              className="w-full surface-card p-10 border-2 border-dashed border-surface-container-high hover:border-primary/40 text-center text-on-surface-variant/60 hover:text-primary transition-all"
            >
              <BookOpen size={32} className="mx-auto mb-2" />
              <p className="text-sm font-bold">아직 등록된 공용 수업 자료가 없습니다</p>
              <p className="text-xs mt-1 opacity-70">일반 자료 또는 주차별 자료를 추가해보세요</p>
            </button>
          ) : (
            <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
              {materials.map(m => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.week_number != null && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                          {m.week_number}주차
                        </span>
                      )}
                      <span className="font-bold text-sm truncate">{m.title}</span>
                      <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${m.is_published ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_published ? <Eye size={10} /> : <EyeOff size={10} />}
                        {m.is_published ? '공개' : '비공개'}
                      </span>
                    </div>
                    {m.content && (
                      <p className="text-xs text-on-surface-variant mt-1.5 line-clamp-2 whitespace-pre-wrap">{m.content}</p>
                    )}
                    <p className="text-[10px] text-on-surface-variant/50 mt-1.5">
                      {new Date(m.updated_at).toLocaleDateString('ko-KR')} 수정
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleMaterialPublish(m)}
                      className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-primary hover:bg-surface-container-high transition-all"
                      title={m.is_published ? '비공개로 전환' : '공개로 전환'}
                    >
                      {m.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => openEditMaterial(m)}
                      className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high transition-all"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setMaterialDeleteTarget(m)}
                      className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-all"
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

      {activeTab === 'plan' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
            <CalendarRange size={16} className="text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-on-surface-variant">
              여기서 설정한 주차별 계획은 <span className="font-bold text-primary">프로젝트 전체(모든 학교의 모든 반)</span>에 자동 적용됩니다.
              새로 추가되는 학교에도 현재 계획이 그대로 반영됩니다.
            </p>
          </div>

          {planLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {weeklyPlan.map((item, idx) => (
                  <div key={idx} className="surface-card p-4 border border-surface-container-high space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black px-2 py-1 rounded-full bg-primary/10 text-primary shrink-0">
                        {item.week}주차
                      </span>
                      <input
                        type="text"
                        value={item.topic}
                        onChange={e => {
                          const plan = [...weeklyPlan];
                          plan[idx] = { ...plan[idx], topic: e.target.value };
                          setWeeklyPlan(plan);
                        }}
                        placeholder="주제/제목"
                        className="flex-1 px-3 py-2 bg-surface-container rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        onClick={() => setWeeklyPlan(weeklyPlan.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="relative">
                      {item.material_id ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-2 border-primary/20 rounded-xl">
                          <BookOpen size={14} className="text-primary shrink-0" />
                          <span className="text-xs font-black text-primary flex-1 truncate">
                            {planMaterials.find(m => m.id === item.material_id)?.title || '연결된 자료'} 연결됨
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUnlinkPlanMaterial(idx)}
                            className="p-0.5 text-on-surface-variant/50 hover:text-error transition-colors shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPlanMaterialDropdownIdx(planMaterialDropdownIdx === idx ? null : idx); }}
                          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dim transition-colors"
                        >
                          <BookOpen size={13} /> 수업 자료에서 가져오기
                        </button>
                      )}
                      {planMaterialDropdownIdx === idx && (
                        <div className="absolute z-10 mt-1.5 w-full max-w-sm bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-lg max-h-64 overflow-y-auto" onClick={e => e.stopPropagation()}>
                          {planMaterialsLoading ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="animate-spin text-primary" size={16} />
                            </div>
                          ) : planMaterials.length === 0 ? (
                            <p className="text-xs text-on-surface-variant/60 text-center py-6 px-3">가져올 수 있는 수업 자료가 없습니다.</p>
                          ) : (
                            <>
                              <p className="text-[10px] text-on-surface-variant/60 px-3 pt-2.5 pb-1">반 페이지에서 열람하려면 자료를 "공개" 상태로 발행해야 합니다.</p>
                              {planMaterials.map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => handlePickPlanMaterial(idx, m)}
                                  className="w-full text-left px-3 py-2 hover:bg-surface-container transition-colors"
                                >
                                  <p className="text-xs font-bold text-on-surface truncate">{m.title}</p>
                                  <p className="text-[10px] text-on-surface-variant/60">{m.className}</p>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <input
                      type="text"
                      value={item.url || ''}
                      onChange={e => {
                        const plan = [...weeklyPlan];
                        plan[idx] = { ...plan[idx], url: e.target.value };
                        setWeeklyPlan(plan);
                      }}
                      placeholder="자료 링크 (URL, 선택)"
                      className="w-full px-3 py-2 bg-surface-container rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <div className="flex items-center gap-4 mt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.requires_result !== false}
                          onChange={e => {
                            const plan = [...weeklyPlan];
                            plan[idx] = { ...plan[idx], requires_result: e.target.checked };
                            setWeeklyPlan(plan);
                          }}
                          className="w-3.5 h-3.5 rounded accent-primary"
                        />
                        <span className="text-xs font-black text-neutral-600">결과제출 필요</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.requires_activity !== false}
                          onChange={e => {
                            const plan = [...weeklyPlan];
                            plan[idx] = { ...plan[idx], requires_activity: e.target.checked };
                            setWeeklyPlan(plan);
                          }}
                          className="w-3.5 h-3.5 rounded accent-primary"
                        />
                        <span className="text-xs font-black text-neutral-600">활동 필요</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setWeeklyPlan(prev => [...prev, { week: prev.length + 1, topic: '', url: '', requires_result: true, requires_activity: true }])}
                className="w-full py-3 rounded-xl border-2 border-dashed border-surface-container-high hover:border-primary/40 text-sm font-bold text-on-surface-variant/60 hover:text-primary transition-all flex items-center justify-center gap-1.5"
              >
                <Plus size={16} /> 주차 추가
              </button>

              <button
                onClick={handleSavePlan}
                disabled={planSaving || !projectRootClassId}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {planSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                주차별 계획 저장
              </button>
            </>
          )}
        </div>
      )}

      {/* 학교 추가 모달 */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setAddOpen(false)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">학교 추가</h2>
              <button onClick={() => setAddOpen(false)} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-on-surface-variant">학교명</label>
                <input
                  autoFocus
                  type="text"
                  value={newSchoolName}
                  onChange={e => setNewSchoolName(e.target.value)}
                  placeholder="예: OO중학교"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant">지역 (선택)</label>
                <input
                  type="text"
                  value={newRegion}
                  onChange={e => setNewRegion(e.target.value)}
                  placeholder="예: 서울"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {addError && <p className="text-xs text-red-500 font-bold">{addError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setAddOpen(false)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleAddSchool}
                disabled={saving || !newSchoolName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all"
              >
                {saving ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 학교 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3 text-red-500">
              <AlertTriangle size={20} />
              <h2 className="font-black text-lg">학교 삭제</h2>
            </div>
            <p className="text-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">{deleteTarget.name}</span>의 모든 반, 학생, 출결 기록이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleDeleteSchool}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 자료 추가/수정 전체화면 */}
      {materialModalOpen && createPortal(
        <div className="fixed inset-0 bg-surface-container-lowest z-50 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-high shrink-0">
            <h2 className="font-black text-lg">{editingMaterial ? '자료 수정' : '자료 추가'}</h2>
            <div className="flex items-center gap-2">
              {!editingMaterial && (
                <button
                  onClick={handleOpenImport}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-all"
                >
                  <Download size={13} /> 가져오기
                </button>
              )}
              <button onClick={() => setMaterialModalOpen(false)} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs font-bold text-on-surface-variant">제목</label>
                  <input
                    autoFocus
                    type="text"
                    value={materialTitle}
                    onChange={e => setMaterialTitle(e.target.value)}
                    placeholder="예: 1주차 오리엔테이션 자료"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="w-32">
                  <label className="text-xs font-bold text-on-surface-variant">주차 (선택)</label>
                  <input
                    type="number"
                    min={1}
                    value={materialWeek}
                    onChange={e => setMaterialWeek(e.target.value)}
                    placeholder="예: 1"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">내용</label>
                <div className="rounded-xl border border-surface-container-high">
                  <RichEditor
                    value={materialContent}
                    onChange={setMaterialContent}
                    onUploadImage={handleUploadMaterialImage}
                    onUploadingChange={setMaterialUploading}
                    uploading={materialUploading}
                    minHeight="420px"
                    stickyToolbar={false}
                    toolbarRoundedClassName="rounded-t-xl"
                    contentRoundedClassName="rounded-b-xl"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={materialPublished}
                  onChange={e => setMaterialPublished(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-xs font-bold text-on-surface-variant">강사에게 바로 공개</span>
              </label>
            </div>
          </div>
          <div className="shrink-0 border-t border-surface-container-high px-6 py-4">
            <div className="max-w-3xl mx-auto flex gap-2">
              <button
                onClick={() => setMaterialModalOpen(false)}
                disabled={materialSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleSaveMaterial}
                disabled={materialSaving || materialUploading || !materialTitle.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all"
              >
                {materialSaving ? '저장 중...' : materialUploading ? '이미지 업로드 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 자료 가져오기 모달 */}
      {importOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={() => setImportOpen(false)}>
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-lg h-full max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-container-high shrink-0">
              <h3 className="font-black text-sm">내 수업 자료에서 가져오기</h3>
              <button onClick={() => setImportOpen(false)} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {importLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-on-surface-variant/40" />
                </div>
              ) : importCandidates.length === 0 ? (
                <p className="text-xs text-on-surface-variant/50 text-center py-10">가져올 수 있는 수업 자료가 없습니다</p>
              ) : (
                importCandidates.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleImportMaterial(m)}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-primary/5 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-on-surface truncate">{m.title}</p>
                      {m.week_number != null && (
                        <span className="text-[10px] font-black text-on-surface-variant/60 bg-surface-container px-1.5 py-0.5 rounded-full shrink-0">{m.week_number}주차</span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{m.className}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 자료 삭제 확인 모달 */}
      {materialDeleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMaterialDeleteTarget(null)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3 text-red-500">
              <AlertTriangle size={20} />
              <h2 className="font-black text-lg">자료 삭제</h2>
            </div>
            <p className="text-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">{materialDeleteTarget.title}</span> 자료를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setMaterialDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleDeleteMaterial}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 반 추가 모달 */}
      {addClassOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !savingClass && setAddClassOpen(false)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">반 추가</h2>
              <button onClick={() => setAddClassOpen(false)} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-on-surface-variant">학교</label>
                <select
                  value={newClassSchoolId}
                  onChange={e => setNewClassSchoolId(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant">반 이름</label>
                <input
                  autoFocus
                  type="text"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="예: 1반"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setAddClassOpen(false)}
                disabled={savingClass}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleAddClass}
                disabled={savingClass || !newClassName.trim() || !newClassSchoolId}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all"
              >
                {savingClass ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 담당 강사 지정 모달 */}
      {assigningClassId && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setAssigningClassId(null); setTeacherSearchQuery(''); }}
        >
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="font-black text-lg">담당 강사 지정</h2>
              <button
                onClick={() => { setAssigningClassId(null); setTeacherSearchQuery(''); }}
                className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant"
              >
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
                  {projectTeachers.length === 0 ? '같은 소속 선생님이 없습니다' : '검색 결과 없음'}
                </p>
              ) : (
                filteredTeachers.map(t => {
                  const school = schools.find(s => s.classes.some(c => c.id === assigningClassId));
                  return (
                    <button
                      key={t.id}
                      onClick={() => school && handleAssignTeacher(t.id, assigningClassId, school)}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-primary/5 text-left transition-all"
                    >
                      <img
                        src={t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.full_name)}&background=random`}
                        alt={t.full_name}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <p className="text-sm font-bold text-on-surface">{t.full_name} 선생님</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SchoolProjectSchoolsPage;
