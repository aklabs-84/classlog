import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import {
  Clock,
  ArrowRight,
  BarChart3,
  Users,
  Sparkles,
  GraduationCap,
  BellRing,
  Check,
  X,
  BookOpen,
  TrendingUp,
  School,
  Plus,
  ExternalLink,
  Map,
  BookMarked,
  PlayCircle,
  Trash2,
  AlertTriangle,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  Crown,
  Zap,
  Archive
} from 'lucide-react';
import { useAuth, checkIsPro } from '../lib/auth';
import { useNavigate, NavLink } from 'react-router-dom';
import { isDemoTeacher, getDemoClassId } from '../lib/demo';
import SchoolProjectModal from '../components/classroom/SchoolProjectModal';
import QuickReviewPanel from '../components/classroom/QuickReviewPanel';
import WelcomeGuideModal, { type WelcomeGuideVideo } from '../components/WelcomeGuideModal';

const Dashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [totalActivitiesCount, setTotalActivitiesCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, inProgress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [subjectInputs, setSubjectInputs] = useState<Record<string, string>>({});
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingProjectName, setDeletingProjectName] = useState('');
  const [showActivityChart, setShowActivityChart] = useState(false);
  const [chartData, setChartData] = useState<{ daily: { label: string; count: number }[]; byClass: { name: string; count: number }[]; totalCount: number; uniqueStudents: number }>({ daily: [], byClass: [], totalCount: 0, uniqueStudents: 0 });

  // 폴더 관련 상태
  const [folders, setFolders] = useState<{ id: string; name: string; color_hex: string }[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null = 전체
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingClassId, setMovingClassId] = useState<string | null>(null); // 드롭다운 열린 클래스 ID

  // 빠른 처리 큐
  const [quickReviewOpen, setQuickReviewOpen] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // 학교 프로젝트 참여
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinSearching, setJoinSearching] = useState(false);
  const [joinProject, setJoinProject] = useState<any>(null);
  const [joinSubClasses, setJoinSubClasses] = useState<any[]>([]);
  const [joiningClassId, setJoiningClassId] = useState<string | null>(null);
  const [joinDone, setJoinDone] = useState(false);

  // 시작 가이드(온보딩 영상) 모달
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [guideVideos, setGuideVideos] = useState<WelcomeGuideVideo[]>([]);

  useEffect(() => {
    fetchDashboardData();
    fetchPendingInvitations();
    fetchMyProjects();
    fetchAssignedClasses();
    fetchFolders();
    if (user?.id) fetchPendingReviewCount();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('video_guides')
      .select('id, title, description, url')
      .eq('is_active', true)
      .order('order_num')
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setGuideVideos(data);

        // 가입 후 10분 이내 첫 대시보드 진입 + 아직 안 본 유저에게만 자동으로 띄움
        const seenKey = `onboarding_guide_seen_${user.id}`;
        if (localStorage.getItem(seenKey)) return;
        const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
        const isRecentSignup = createdAt > 0 && Date.now() - createdAt < 10 * 60 * 1000;
        if (isRecentSignup) setWelcomeModalOpen(true);
      });
  }, [user?.id, profile?.created_at]);

  const closeWelcomeGuide = () => {
    setWelcomeModalOpen(false);
    if (user?.id) {
      try { localStorage.setItem(`onboarding_guide_seen_${user.id}`, '1'); } catch { /* noop */ }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deletingProjectId) setDeletingProjectId(null);
      else if (showActivityChart) setShowActivityChart(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletingProjectId, showActivityChart]);

  const fetchPendingReviewCount = async () => {
    if (!user?.id) return;
    try {
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, students(id)')
        .eq('teacher_id', user.id)
        .eq('is_archived', false);

      // 데모 교사 계정은 여러 방문자가 공유하므로 본인이 발급받은 학급만 집계 대상으로 남긴다
      const scopedClasses = isDemoTeacher(user)
        ? (classesData || []).filter((c: any) => c.id === getDemoClassId())
        : classesData;

      const studentIds: string[] = (scopedClasses || []).flatMap(
        (c: any) => (c.students || []).map((s: any) => s.id)
      );
      if (studentIds.length === 0) return;

      const [{ count: obsCount }, resultsRes] = await Promise.all([
        supabase
          .from('observations')
          .select('*', { count: 'exact', head: true })
          .in('student_id', studentIds)
          .eq('is_student_record', true)
          .eq('status', 'pending'),
        supabase
          .from('student_results')
          .select('id, submission_group')
          .in('student_id', studentIds)
          .or('status.is.null,status.eq.submitted')
          .limit(200),
      ]);

      // submission_group이 있는 경우 그룹 단위로 중복 제거
      const seenGroups = new Set<string>();
      let resultCount = 0;
      for (const r of (resultsRes.data || [])) {
        const key = r.submission_group || r.id;
        if (!seenGroups.has(key)) { seenGroups.add(key); resultCount++; }
      }

      setPendingReviewCount((obsCount || 0) + resultCount);
    } catch (_e) { /* 조용히 실패 */ }
  };

  const fetchFolders = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('class_folders')
      .select('id, name, color_hex')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: true });
    setFolders(data || []);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    const { data, error } = await supabase
      .from('class_folders')
      .insert({ teacher_id: user.id, name: newFolderName.trim(), color_hex: '#6366f1' })
      .select('id, name, color_hex')
      .single();
    if (!error && data) {
      setFolders(prev => [...prev, data]);
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    await supabase.from('class_folders').delete().eq('id', folderId);
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (activeFolderId === folderId) setActiveFolderId(null);
  };

  const handleMoveClassToFolder = async (classId: string, folderId: string | null) => {
    await supabase.from('classes').update({ folder_id: folderId }).eq('id', classId);
    setClasses(prev => prev.map(c => c.id === classId ? { ...c, folder_id: folderId } : c));
    setMovingClassId(null);
  };

  const fetchMyProjects = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('school_projects')
      .select(`
        id, name, school_name, status, start_date, end_date, share_token, created_at,
        classes!school_project_id(id, parent_class_id, assigned_teacher_id)
      `)
      .eq('admin_id', user.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });
    setMyProjects(data || []);
  };

  const fetchAssignedClasses = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('classes')
        .select('id, name, subject, color_hex, school_project_id')
        .eq('assigned_teacher_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });
      if (!data || data.length === 0) { setAssignedClasses([]); return; }

      const { data: studentData } = await supabase
        .from('students')
        .select('id, class_id, avatar_url, full_name')
        .in('class_id', data.map(c => c.id));

      const studentMap = (studentData || []).reduce((acc: any, curr: any) => {
        if (!acc[curr.class_id]) acc[curr.class_id] = [];
        acc[curr.class_id].push({ avatar: curr.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(curr.full_name)}&background=random` });
        return acc;
      }, {});

      setAssignedClasses(data.map(c => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        students: (studentMap[c.id] || []).length,
        avatars: (studentMap[c.id] || []).slice(0, 3).map((s: any) => s.avatar),
        color: c.color_hex || 'bg-violet-100',
        school_project_id: c.school_project_id,
      })));
    } catch (_e) { /* assigned_teacher_id 컬럼 미존재 시 무시 */ }
  };

  const handleSearchJoinProject = async () => {
    if (!joinCode.trim()) return;
    setJoinSearching(true);
    setJoinProject(null);
    setJoinSubClasses([]);
    try {
      const { data } = await supabase
        .from('school_projects')
        .select(`id, name, school_name, share_token, classes!school_project_id(id, name, assigned_teacher_id, parent_class_id)`)
        .eq('share_token', joinCode.trim())
        .single();
      if (!data) { alert('코드를 다시 확인해주세요.'); return; }
      const unassigned = (data.classes || []).filter(
        (c: any) => c.parent_class_id !== null && !c.assigned_teacher_id
      );
      setJoinProject(data);
      setJoinSubClasses(unassigned);
    } finally {
      setJoinSearching(false);
    }
  };

  const handleJoinSubClass = async (classId: string) => {
    if (!user || !joinProject) return;
    setJoiningClassId(classId);
    try {
      const { error } = await supabase.rpc('assign_teacher_to_subclass', {
        p_class_id: classId,
        p_teacher_id: user.id,
        p_project_id: joinProject.id,
      });
      if (!error) {
        setJoinDone(true);
        fetchAssignedClasses();
        setTimeout(() => {
          setJoinModalOpen(false);
          setJoinCode('');
          setJoinProject(null);
          setJoinSubClasses([]);
          setJoinDone(false);
        }, 1500);
      }
    } finally {
      setJoiningClassId(null);
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProjectId) return;

    // 배정된 선생님들의 Pro 권한 먼저 회수
    const { data: subClasses } = await supabase
      .from('classes')
      .select('id, assigned_teacher_id')
      .eq('school_project_id', deletingProjectId)
      .not('parent_class_id', 'is', null)
      .not('assigned_teacher_id', 'is', null);

    if (subClasses && subClasses.length > 0) {
      await Promise.all(
        subClasses.map((cls: any) =>
          supabase.rpc('remove_teacher_from_subclass', {
            p_class_id: cls.id,
            p_teacher_id: cls.assigned_teacher_id,
          })
        )
      );
    }

    // 하위 클래스 먼저 삭제 (parent_class_id가 있는 것)
    await supabase.from('classes').delete()
      .eq('school_project_id', deletingProjectId)
      .not('parent_class_id', 'is', null);
    // 부모 클래스 삭제
    await supabase.from('classes').delete()
      .eq('school_project_id', deletingProjectId)
      .is('parent_class_id', null);
    await supabase.from('school_projects').delete().eq('id', deletingProjectId);
    setDeletingProjectId(null);
    setDeletingProjectName('');
    await Promise.all([fetchDashboardData(), fetchMyProjects(), fetchAssignedClasses()]);
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Classes
      const { data: allClassesData } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user?.id)
        .eq('is_archived', false);

      // 데모 교사 계정은 여러 방문자가 공유하므로 본인이 발급받은 학급만 화면에 남긴다
      const rawClassesData = isDemoTeacher(user)
        ? (allClassesData || []).filter(c => c.id === getDemoClassId())
        : allClassesData;

      let scopedStudentIds: string[] = [];

      if (rawClassesData) {
        // 모든 실제 데이터 타겟 ID 수집 (본인 ID 또는 연동 ID)
        const targetIds = rawClassesData.map(c => c.linked_class_id || c.id);
        
        // 타겟 ID별 학생 데이터 및 아바타 일괄 조회
        const { data: studentData } = await supabase
          .from('students')
          .select('id, class_id, avatar_url, full_name')
          .in('class_id', targetIds);

        const studentMap = (studentData || []).reduce((acc: any, curr: any) => {
          if (!acc[curr.class_id]) acc[curr.class_id] = [];
          acc[curr.class_id].push({
            avatar: curr.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(curr.full_name)}&background=random`
          });
          return acc;
        }, {});

        // 학생별 관찰 기록을 조회하여 고유 작성비율(Progress) 파악
        scopedStudentIds = studentData ? studentData.map(s => s.id) : [];
        let classProgressMap: Record<string, number> = {};

        if (scopedStudentIds.length > 0) {
          const { data: allObsData, count } = await supabase
            .from('observations')
            .select('student_id, students(class_id)', { count: 'exact' })
            .in('student_id', scopedStudentIds)
            .eq('is_student_record', true);

          setTotalActivitiesCount(count || 0);

          const classToObservedStudents: Record<string, Set<string>> = {};
          (allObsData || []).forEach((obs: any) => {
            const cId = obs.students?.class_id;
            if (cId) {
              if (!classToObservedStudents[cId]) classToObservedStudents[cId] = new Set();
              classToObservedStudents[cId].add(obs.student_id);
            }
          });

          Object.keys(classToObservedStudents).forEach(cId => {
            classProgressMap[cId] = classToObservedStudents[cId].size;
          });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        setClasses(rawClassesData.map(c => {
          const targetId = c.linked_class_id || c.id;
          const classStudents = studentMap[targetId] || [];
          const observedCount = classProgressMap[targetId] || 0;
          const progressPercent = classStudents.length > 0 ? Math.round((observedCount / classStudents.length) * 100) : 0;
          const isEffectivelyClosed = c.is_closed || (c.end_date ? new Date(c.end_date) < today : false);

          return {
            id: c.id,
            name: c.name,
            subject: c.subject,
            students: classStudents.length,
            avatars: classStudents.slice(0, 3).map((s: any) => s.avatar),
            progress: progressPercent,
            color: c.color_hex || 'bg-surface-container-high',
            folder_id: c.folder_id || null,
            is_closed: isEffectivelyClosed
          };
        }));

        // 3. Fetch Stats — AI 초안 생성 완료 학생 수 기준
        const totalStudents = studentData?.length || 0;
        let completedCount = 0;
        if (!isDemoTeacher(user) || scopedStudentIds.length > 0) {
          let evalQuery = supabase
            .from('student_evaluations')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', user?.id)
            .eq('academic_year', new Date().getFullYear())
            .neq('setech_content', '')
            .neq('status', 'empty');
          if (isDemoTeacher(user)) evalQuery = evalQuery.in('student_id', scopedStudentIds);
          const { count } = await evalQuery;
          completedCount = count || 0;
        }

        setStats({
          total: totalStudents,
          inProgress: totalStudents - completedCount,
          completed: completedCount
        });
      }

      // 2. Fetch Recent Activities — 학생 제출 기록만 표시
      let obsData: any[] | null = null;
      if (!isDemoTeacher(user) || scopedStudentIds.length > 0) {
        let obsQuery = supabase
          .from('observations')
          .select('*, students!inner(full_name, class_id(name))')
          .eq('teacher_id', user?.id)
          .eq('is_student_record', true)
          .order('created_at', { ascending: false })
          .limit(5);
        if (isDemoTeacher(user)) obsQuery = obsQuery.in('student_id', scopedStudentIds);
        ({ data: obsData } = await obsQuery);
      }

      if (obsData) {
        setActivities(obsData.map(o => ({
          id: o.id,
          name: o.students?.full_name || '학생',
          class: o.students?.class_id?.name?.replace('2학년 ', '') || '',
          time: new Date(o.created_at).toLocaleString('ko-KR', { hour: 'numeric', minute: 'numeric', hour12: true }),
          action: o.activity_name || '활동 기록',
          content: o.content,
          icon: Clock
        })));
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityChartData = async () => {
    if (!user) return;

    // 데모 교사 계정은 여러 방문자가 공유하므로 본인이 발급받은 학급 학생의 기록만 집계한다
    let demoStudentIds: string[] | null = null;
    if (isDemoTeacher(user)) {
      const demoClassId = getDemoClassId();
      if (!demoClassId) return;
      const { data: demoStudents } = await supabase.from('students').select('id').eq('class_id', demoClassId);
      demoStudentIds = (demoStudents || []).map(s => s.id);
      if (demoStudentIds.length === 0) return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    let query = supabase
      .from('observations')
      .select('created_at, student_id, students!inner(class_id(name))')
      .eq('teacher_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });
    if (demoStudentIds) query = query.in('student_id', demoStudentIds);

    const { data } = await query;

    if (!data) return;

    // 일별 집계
    const dayMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      dayMap[key] = 0;
    }
    data.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (key in dayMap) dayMap[key]++;
    });

    // 클래스별 집계
    const classMap: Record<string, number> = {};
    data.forEach(o => {
      const name = (o.students as any)?.class_id?.name || '기타';
      classMap[name] = (classMap[name] || 0) + 1;
    });

    setChartData({
      daily: Object.entries(dayMap).map(([label, count]) => ({ label, count })),
      byClass: Object.entries(classMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      totalCount: data.length,
      uniqueStudents: new Set(data.map(o => o.student_id)).size,
    });
  };

  const fetchPendingInvitations = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('class_invitations')
        .select(`
          id,
          source_class_id,
          created_at,
          sender:sender_id ( full_name ),
          source_class:source_class_id ( name, subject )
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (data) setPendingInvitations(data);
    } catch (err) {
      console.error('초대 조회 오류:', err);
    }
  };

  const handleAcceptInvitation = async (inv: any) => {
    const subject = subjectInputs[inv.id]?.trim();
    if (!subject) {
      alert('담당 과목명을 입력해주세요.');
      return;
    }
    setInviteActionLoading(inv.id);
    try {
      const entryCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error: classError } = await supabase
        .from('classes')
        .insert({
          teacher_id: user?.id,
          name: inv.source_class?.name || '연동 학급',
          subject: subject,
          class_type: 'subject',
          linked_class_id: inv.source_class_id,
          entry_code: entryCode,
          school_code: profile?.school_code || null,
          student_guide_prompt: '수업 시간에 배운 내용과 본인의 활동 역할을 구체적으로 작성하세요. 단답형이나 단순 감상평은 지양해 주세요. 의미없이 반복되는 문장이나 맥락상 전혀 이해 할 수 없는 아무 의미없는 내용을 작성하는 것도 지양해 주세요. 글의 일부에라도 같은 글자·자음·모음이 의미 없이 반복되는 부분이 있다면, 앞부분에 정상적인 내용이 있더라도 반드시 반려 처리해 주세요.',
          teacher_report_prompt: '교육부 기재 요령을 준수하여 사실 기반의 객관적인 문체(~함, ~임)로 작성해줘.',
          weekly_plan: []
        });

      if (classError) throw classError;

      await supabase
        .from('class_invitations')
        .update({ status: 'accepted' })
        .eq('id', inv.id);

      setPendingInvitations(prev => prev.filter(i => i.id !== inv.id));
      fetchDashboardData();
    } catch (err: any) {
      alert('수락 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setInviteActionLoading(null);
    }
  };

  const handleRejectInvitation = async (invId: string) => {
    setInviteActionLoading(invId);
    try {
      await supabase
        .from('class_invitations')
        .update({ status: 'rejected' })
        .eq('id', invId);
      setPendingInvitations(prev => prev.filter(i => i.id !== invId));
    } catch (err) {
      console.error('거절 오류:', err);
    } finally {
      setInviteActionLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      {/* 교과 연동 초대 알림 */}
      <AnimatePresence>
        {pendingInvitations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 px-1">
              <BellRing size={16} className="text-primary animate-pulse" />
              <h3 className="text-sm font-black text-primary uppercase tracking-widest">교과 연동 초대 {pendingInvitations.length}건</h3>
            </div>
            {pendingInvitations.map((inv) => (
              <motion.div
                key={inv.id}
                layout
                exit={{ opacity: 0, height: 0 }}
                className="surface-card p-6 border-l-4 border-primary shadow-ambient flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
                  <BookOpen size={22} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-black text-base">
                    <span className="text-primary">{inv.sender?.full_name} 선생님</span>이 학급 연동을 요청했습니다
                  </p>
                  <p className="text-xs font-bold text-on-surface-variant">
                    학급: {inv.source_class?.name} · {new Date(inv.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="text"
                    placeholder="담당 과목 입력 (예: 국어)"
                    value={subjectInputs[inv.id] || ''}
                    onChange={(e) => setSubjectInputs(prev => ({ ...prev, [inv.id]: e.target.value }))}
                    className="px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 w-48 border border-surface-container-highest"
                  />
                  <button
                    onClick={() => handleAcceptInvitation(inv)}
                    disabled={inviteActionLoading === inv.id}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/80 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                  >
                    <Check size={16} />
                    수락
                  </button>
                  <button
                    onClick={() => handleRejectInvitation(inv.id)}
                    disabled={inviteActionLoading === inv.id}
                    className="p-2.5 text-neutral-400 hover:text-error hover:bg-error/10 rounded-xl transition-all disabled:opacity-50"
                  >
                    <X size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 업그레이드 유도 배너 — free/basic 유저 */}
      {!checkIsPro(profile) && profile?.plan !== 'admin' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-5 py-4 flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Crown size={20} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-amber-900">
              {profile?.plan === 'free'
                ? 'Basic으로 업그레이드하면 클래스 5개 · AI를 넉넉하게 사용할 수 있어요'
                : 'Pro로 업그레이드하면 AI를 더 넉넉하게 · 학급 전체 일괄 생성이 가능해요'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              현재: {profile?.plan === 'free' ? '무료 플랜 (AI 월 20회)' : 'Basic 플랜 (AI 넉넉하게)'}
            </p>
          </div>
          <NavLink
            to="/pricing"
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm"
          >
            <Zap size={13} />
            플랜 보기
          </NavLink>
        </motion.div>
      )}

      {/* Hero & Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
        <div className="md:col-span-8 surface-zone p-6 md:p-10 flex flex-col justify-center relative overflow-hidden min-h-[200px] md:h-[340px]">
          <div className="relative z-10 max-w-lg">
            <p className="text-primary font-bold text-xs mb-3 tracking-widest uppercase">인텔리전스 허브</p>
            <h1 className="text-2xl md:text-4xl font-extrabold mb-4 md:mb-6 leading-[1.2] font-manrope">
              AI로 간편하게 만드는<br />
              학생 맞춤형 생기부 초안
            </h1>
            <p className="text-on-surface-variant text-sm md:text-base mb-6 md:mb-8 leading-relaxed hidden sm:block">
              학급 내 관찰 기록을 바탕으로 세밀하게 튜닝된 AI가 학기말 리포트 초안을<br />
              정성스럽게 작성해 드립니다.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/ai-assistant')}
                className="btn-gradient px-6 md:px-8 py-3 md:py-3.5 rounded-xl font-bold flex items-center gap-2 w-fit hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20 text-sm"
              >
                <Sparkles size={18} />
                AI 리포트 자동 생성
              </button>
              {guideVideos.length > 0 && (
                <button
                  onClick={() => setWelcomeModalOpen(true)}
                  className="px-5 py-3 md:py-3.5 rounded-xl font-bold flex items-center gap-2 w-fit bg-white/70 hover:bg-white text-primary border border-primary/20 transition-all active:scale-95 text-sm"
                >
                  <PlayCircle size={18} />
                  시작 가이드 보기
                </button>
              )}
            </div>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[300px] md:h-[300px] opacity-10 hidden sm:block">
            <GraduationCap size={300} />
          </div>
        </div>

        <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-1 gap-4 md:gap-6">
          <div className="surface-card p-5 md:p-8 flex flex-col justify-between shadow-ambient">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">리포트 완성도</p>
              <div className="text-primary bg-primary-container/30 px-2 py-1 rounded-lg text-[10px] font-bold">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
              </div>
            </div>
            <div className="my-2 md:my-4">
              <p className="text-3xl md:text-5xl font-extrabold font-manrope">{stats.completed}</p>
            </div>
            <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                className="h-full bg-primary"
              />
            </div>
          </div>

          <div className="surface-card p-5 md:p-8 flex flex-col justify-between shadow-ambient">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">기록된 관찰 내용</p>
              <div className="text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-lg text-[10px] font-bold">주간 목표</div>
            </div>
            <div className="my-2 md:my-4">
              <p className="text-3xl md:text-5xl font-extrabold font-manrope">{totalActivitiesCount}</p>
            </div>
            <p className="text-[11px] text-on-surface-variant italic hidden sm:block">
              "지속적인 관찰 기록이 AI 초안의 정확도를 높입니다."
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
        {/* Classes Section */}
        <div className="col-span-12 space-y-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-2">
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-manrope">나의 학급</h2>
              <p className="text-xs text-on-surface-variant/60 mt-0.5">폴더로 묶어 내 화면에서만 정리할 수 있어요</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveFolderId(activeFolderId === '__closed__' ? null : '__closed__')}
                className={`text-xs font-bold flex items-center gap-1 transition-colors ${activeFolderId === '__closed__' ? 'text-on-surface' : 'text-on-surface-variant/60 hover:text-on-surface-variant'}`}
              >
                <Archive size={13} />
                종료된 학급
              </button>
              <button
                onClick={() => navigate('/classroom')}
                className="text-xs font-bold text-primary flex items-center gap-1 hover:underline underline-offset-4 decoration-2"
              >
                전체 보기 <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* 폴더 탭 */}
          <div className="flex items-center gap-2 flex-wrap px-1">
            {/* 전체 탭 */}
            <button
              onClick={() => setActiveFolderId(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeFolderId === null
                  ? 'bg-primary text-white shadow-sm shadow-primary/30'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Folder size={13} />
              전체
            </button>

            {/* 폴더 탭 목록 */}
            {folders.map(folder => (
              <div key={folder.id} className="relative group/folder flex items-center">
                <button
                  onClick={() => setActiveFolderId(folder.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all pr-7 ${
                    activeFolderId === folder.id
                      ? 'bg-primary text-white shadow-sm shadow-primary/30'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {activeFolderId === folder.id
                    ? <FolderOpen size={13} />
                    : <Folder size={13} />
                  }
                  {folder.name}
                </button>
                {/* 폴더 삭제 버튼 */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-white/60 hover:text-white opacity-0 group-hover/folder:opacity-100 transition-all"
                  title="폴더 삭제"
                >
                  <X size={10} />
                </button>
              </div>
            ))}

            {/* 종료된 학습 탭 */}
            {classes.some(c => c.is_closed) && (
              <button
                onClick={() => setActiveFolderId(activeFolderId === '__closed__' ? null : '__closed__')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeFolderId === '__closed__'
                    ? 'bg-neutral-700 text-white shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <Archive size={13} />
                종료된 학습 ({classes.filter(c => c.is_closed).length})
              </button>
            )}

            {/* 폴더 만들기 버튼 */}
            {!showCreateFolder ? (
              <button
                onClick={() => setShowCreateFolder(true)}
                title="내 화면에서만 보이는 정리용 폴더예요 (다른 사람에게 공유되지 않아요)"
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-on-surface-variant/60 hover:text-primary hover:bg-primary/8 border border-dashed border-surface-container-high transition-all"
              >
                <FolderPlus size={13} />
                폴더 만들기
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowCreateFolder(false); setNewFolderName(''); } }}
                  placeholder="폴더 이름"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface-container border border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 w-28"
                />
                <button onClick={handleCreateFolder} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/80 transition-all">
                  <Check size={12} />
                </button>
                <button onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }} className="px-2 py-1.5 rounded-xl text-xs text-on-surface-variant hover:bg-surface-container-high transition-all">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* 클래스 그리드 */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 md:gap-6">
            {loading ? (
              [1, 2].map(i => <div key={i} className="h-[160px] md:h-[200px] surface-card animate-pulse" />)
            ) : (() => {
              const filteredClasses = activeFolderId === '__closed__'
                ? classes.filter(c => c.is_closed)
                : activeFolderId === null
                  ? classes.filter(c => !c.is_closed)
                  : classes.filter(c => c.folder_id === activeFolderId && !c.is_closed);

              if (filteredClasses.length === 0) {
                return (
                  <div className="col-span-full surface-zone p-10 text-center text-on-surface-variant">
                    {activeFolderId === '__closed__' ? '종료된 학급이 없습니다.' : activeFolderId ? '이 폴더에 학급이 없습니다. 학급 카드의 폴더 버튼으로 이동하세요.' : '등록된 학급이 없습니다. 학급을 먼저 추가해주세요.'}
                  </div>
                );
              }

              return filteredClasses.map((cls) => {
                const folderOfClass = folders.find(f => f.id === cls.folder_id);
                return (
                  <div
                    key={cls.id}
                    className="surface-card p-5 md:p-8 shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group relative"
                    onClick={() => navigate(`/classroom?id=${cls.id}`)}
                  >
                    {/* 폴더 이동 버튼 */}
                    <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setMovingClassId(movingClassId === cls.id ? null : cls.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-on-surface-variant/50 hover:text-primary hover:bg-primary/8 opacity-0 group-hover:opacity-100 transition-all"
                        title="폴더 이동"
                      >
                        <Folder size={11} />
                        {folderOfClass ? folderOfClass.name : '폴더 없음'}
                        <ChevronDown size={10} />
                      </button>

                      {/* 폴더 선택 드롭다운 */}
                      <AnimatePresence>
                        {movingClassId === cls.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute top-full right-0 mt-1 bg-white border border-surface-container-high rounded-2xl shadow-xl p-2 min-w-[140px] z-20"
                          >
                            <button
                              onClick={() => handleMoveClassToFolder(cls.id, null)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold hover:bg-surface-container transition-all ${!cls.folder_id ? 'text-primary' : 'text-on-surface-variant'}`}
                            >
                              <Folder size={12} /> 폴더 없음
                            </button>
                            {folders.map(f => (
                              <button
                                key={f.id}
                                onClick={() => handleMoveClassToFolder(cls.id, f.id)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold hover:bg-surface-container transition-all ${cls.folder_id === f.id ? 'text-primary' : 'text-on-surface-variant'}`}
                              >
                                <FolderOpen size={12} /> {f.name}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className={`w-12 h-12 ${cls.color} rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-12 transition-transform`}>
                      <Users size={24} className="text-on-surface" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{cls.name}</h3>
                    <p className="text-sm text-on-surface-variant mb-6">{cls.students}명 학생 • {cls.subject}</p>
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex -space-x-2">
                        {cls.avatars && cls.avatars.map((avatar: string, i: number) => (
                          <div key={i} className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-high overflow-hidden shadow-sm">
                            <img src={avatar} alt="student" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        <div className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-highest flex items-center justify-center text-[10px] font-bold shadow-sm">
                          +{cls.students > 3 ? cls.students - 3 : 0}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">진척도</p>
                        <p className="text-sm font-black text-primary">{cls.progress}%</p>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* 담당 학급 섹션 (학교 프로젝트에서 초대받은 클래스) */}
        {assignedClasses.length > 0 && (
          <div className="col-span-12 space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <School size={18} className="text-violet-500" />
                <h2 className="text-xl font-bold font-manrope">담당 학급</h2>
                <span className="text-[10px] font-black bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">학교 프로젝트</span>
              </div>
              <button
                onClick={() => { setJoinModalOpen(true); setJoinCode(''); setJoinProject(null); setJoinSubClasses([]); setJoinDone(false); }}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
              >
                <Plus size={13} /> 프로젝트 참여
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
              {assignedClasses.map(cls => (
                <div
                  key={cls.id}
                  onClick={() => navigate(`/classroom?id=${cls.id}`)}
                  className="surface-card p-5 md:p-8 shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group border-l-4 border-violet-400"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                      <School size={22} className="text-violet-600" />
                    </div>
                    <span className="text-[10px] font-black bg-violet-50 text-violet-500 px-2 py-1 rounded-xl border border-violet-100">담당 교사</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{cls.name}</h3>
                  <p className="text-sm text-on-surface-variant mb-6">{cls.students}명 학생 • {cls.subject}</p>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex -space-x-2">
                      {cls.avatars && cls.avatars.map((avatar: string, i: number) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-high overflow-hidden shadow-sm">
                          <img src={avatar} alt="student" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-violet-400 font-bold flex items-center gap-1">
                      <School size={10} /> 학교 프로젝트
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 학교 프로젝트 참여 — 담당 학급이 없는 선생님용 */}
        {assignedClasses.length === 0 && (
          <div className="col-span-12">
            <button
              onClick={() => { setJoinModalOpen(true); setJoinCode(''); setJoinProject(null); setJoinSubClasses([]); setJoinDone(false); }}
              className="w-full flex items-center gap-3 px-5 py-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-2xl transition-all group"
            >
              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <School size={18} className="text-indigo-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-indigo-700">학교 프로젝트 참여</p>
                <p className="text-xs text-indigo-400">담임 선생님에게 받은 코드로 담당 반에 참여하세요</p>
              </div>
              <ArrowRight size={16} className="text-indigo-400 ml-auto group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {/* 학교 프로젝트 섹션 - Pro/School/Admin 요금제만 표시 */}
        {['pro', 'school', 'admin'].includes(profile?.plan ?? 'free') && (
        <div className="col-span-12 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <School size={20} className="text-violet-500" />
              <h2 className="text-xl font-bold font-manrope">학교 프로젝트</h2>
              <span className="text-[10px] font-black bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full uppercase tracking-wide">PRO</span>
            </div>
            <button
              onClick={() => { setEditingProject(null); setProjectModalOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-all"
            >
              <Plus size={14} /> 새 프로젝트
            </button>
          </div>

          {myProjects.length === 0 ? (
            <button
              onClick={() => { setEditingProject(null); setProjectModalOpen(true); }}
              className="w-full surface-card p-8 border-2 border-dashed border-violet-200 hover:border-violet-400 text-center text-violet-400 hover:text-violet-600 transition-all group"
            >
              <School size={32} className="mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-bold">학교 프로젝트 만들기</p>
              <p className="text-xs mt-1 opacity-70">여러 반을 여러 선생님과 함께 관리하세요</p>
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myProjects.map(proj => {
                const allClasses = proj.classes || [];
                const subClassCount = allClasses.filter((c: any) => c.parent_class_id !== null).length;
                const assignedCount = allClasses.filter((c: any) => c.parent_class_id !== null && c.assigned_teacher_id).length;
                const isActive = proj.status === 'active';
                const isClosed = proj.status === 'closed';
                return (
                  <div
                    key={proj.id}
                    className="surface-card p-6 hover:scale-[1.02] transition-all cursor-pointer group border border-violet-100 relative"
                    onClick={() => { setEditingProject(proj); setProjectModalOpen(true); }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600">
                        <School size={20} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          isActive ? 'bg-green-100 text-green-600' :
                          isClosed ? 'bg-orange-100 text-orange-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {isActive ? '진행 중' : isClosed ? '수업 종료' : '보관됨'}
                        </span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeletingProjectId(proj.id);
                            setDeletingProjectName(proj.name);
                          }}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                          title="프로젝트 삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h3 className="font-black text-base mb-1 truncate">{proj.name}</h3>
                    {proj.school_name && <p className="text-xs text-gray-400 mb-3">{proj.school_name}</p>}
                    <div className="flex items-center justify-between mt-auto">
                      <div>
                        <p className="text-xs text-gray-500">{subClassCount}개 반 · {assignedCount}명 담당</p>
                        {proj.end_date && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            ~ {new Date(proj.end_date).toLocaleDateString('ko-KR')}
                          </p>
                        )}
                      </div>
                      {proj.share_token && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            window.open(`/school-project/${proj.share_token}`, '_blank');
                          }}
                          className="flex items-center gap-1 text-[10px] font-bold text-violet-500 hover:text-violet-700 transition-all"
                        >
                          <ExternalLink size={11} /> 공유 URL
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => { setEditingProject(null); setProjectModalOpen(true); }}
                className="surface-card p-6 border-2 border-dashed border-violet-200 hover:border-violet-400 text-center text-violet-400 hover:text-violet-600 transition-all flex flex-col items-center justify-center gap-2 min-h-[140px]"
              >
                <Plus size={24} />
                <span className="text-xs font-bold">새 프로젝트</span>
              </button>
            </div>
          )}
        </div>
        )}

        {/* 가이드 & 카탈로그 링크 */}
        <div className="col-span-12 grid grid-cols-3 gap-3">
          <a
            href="/catalog.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-3.5 surface-card hover:bg-surface-container-high border border-surface-container-high transition-all group"
          >
            <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform">
              <BookMarked size={16} />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">제품 소개</p>
              <p className="text-[11px] text-on-surface-variant">플랜 및 기능 안내</p>
            </div>
            <ArrowRight size={14} className="ml-auto text-on-surface-variant/40 group-hover:text-primary transition-colors" />
          </a>
          <a
            href="/guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-3.5 surface-card hover:bg-surface-container-high border border-surface-container-high transition-all group"
          >
            <div className="w-8 h-8 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary shrink-0 group-hover:scale-110 transition-transform">
              <Map size={16} />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">사용 가이드</p>
              <p className="text-[11px] text-on-surface-variant">처음 시작하는 분께</p>
            </div>
            <ArrowRight size={14} className="ml-auto text-on-surface-variant/40 group-hover:text-secondary transition-colors" />
          </a>
          <button
            onClick={() => navigate('/video-guide')}
            className="flex items-center gap-3 px-5 py-3.5 surface-card hover:bg-surface-container-high border border-surface-container-high transition-all group text-left"
          >
            <div className="w-8 h-8 bg-accent/10 rounded-xl flex items-center justify-center text-accent shrink-0 group-hover:scale-110 transition-transform">
              <PlayCircle size={16} />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">영상 가이드</p>
              <p className="text-[11px] text-on-surface-variant">사용법 영상으로 확인</p>
            </div>
            <ArrowRight size={14} className="ml-auto text-on-surface-variant/40 group-hover:text-accent transition-colors" />
          </button>
        </div>

        {/* Activity Section */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold font-manrope">최근 학생 활동</h2>
            <button
              onClick={() => { fetchActivityChartData(); setShowActivityChart(true); }}
              title="활동 통계 보기"
              className="p-2 rounded-lg hover:bg-surface-container-high transition-all text-on-surface-variant hover:text-primary"
            >
              <BarChart3 size={18} />
            </button>
          </div>
          <div className="surface-zone p-4 flex flex-col gap-2">
            {loading ? (
               [1, 2, 3].map(i => <div key={i} className="h-16 surface-card animate-pulse rounded-2xl" />)
            ) : activities.length > 0 ? (
              activities.map((act) => (
                <div key={act.id} className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white hover:shadow-sm transition-all cursor-pointer group border border-transparent hover:border-surface-container-high">
                  <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center text-primary shrink-0">
                    <act.icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold truncate">{act.name}</span>
                      <span className="text-[10px] font-black text-primary bg-primary/8 px-2 py-0.5 rounded-md shrink-0 truncate max-w-[120px]">{act.action}</span>
                    </div>
                    {act.content && (
                      <p className="text-[11px] text-on-surface-variant line-clamp-1 leading-snug">{act.content}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-[10px] font-bold text-on-surface-variant/60 whitespace-nowrap">{act.time}</p>
                    {act.class && <p className="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-wider">{act.class}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-on-surface-variant text-sm">
                최근 활동이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Chart Modal */}
      <AnimatePresence>
        {showActivityChart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowActivityChart(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight">활동 통계</h2>
                    <p className="text-[11px] text-on-surface-variant/60 font-medium">최근 7일 기준</p>
                  </div>
                </div>
                <button onClick={() => setShowActivityChart(false)} className="w-8 h-8 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <X size={16} />
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3 mb-8">
                {[
                  { label: '총 활동 기록', value: chartData.totalCount, unit: '건', color: 'bg-primary/10 text-primary' },
                  { label: '참여 학생 수', value: chartData.uniqueStudents, unit: '명', color: 'bg-secondary/10 text-secondary' },
                ].map((item) => (
                  <div key={item.label} className="bg-surface-container-low rounded-2xl p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-2">{item.label}</p>
                    <p className="text-4xl font-black tracking-tighter">
                      {item.value}
                      <span className={`text-sm font-bold ml-1 ${item.color.split(' ')[1]}`}>{item.unit}</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* Daily Bar Chart */}
              <div className="mb-8">
                <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-4">일별 활동 추이</h3>
                {chartData.daily.length > 0 ? (
                  <div className="flex items-end gap-2 h-32">
                    {(() => {
                      const max = Math.max(...chartData.daily.map(d => d.count), 1);
                      return chartData.daily.map((d) => (
                        <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-on-surface-variant/70">{d.count > 0 ? d.count : ''}</span>
                          <div className="w-full rounded-t-lg bg-primary/15 relative overflow-hidden" style={{ height: '88px' }}>
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${(d.count / max) * 100}%` }}
                              transition={{ duration: 0.5, delay: 0.1 }}
                              className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-lg"
                            />
                          </div>
                          <span className="text-[9px] font-black text-on-surface-variant/50">{d.label}</span>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-sm text-on-surface-variant/40">데이터 없음</div>
                )}
              </div>

              {/* By Class */}
              {chartData.byClass.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-4">클래스별 활동 수</h3>
                  <div className="flex flex-col gap-3">
                    {(() => {
                      const max = Math.max(...chartData.byClass.map(c => c.count), 1);
                      return chartData.byClass.map((c, i) => (
                        <div key={c.name} className="flex items-center gap-3">
                          <span className="text-[11px] font-bold text-on-surface-variant w-24 shrink-0 truncate">{c.name}</span>
                          <div className="flex-1 bg-surface-container-low rounded-full h-2.5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(c.count / max) * 100}%` }}
                              transition={{ duration: 0.5, delay: 0.1 + i * 0.05 }}
                              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                            />
                          </div>
                          <span className="text-[11px] font-black text-primary w-8 text-right shrink-0">{c.count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 시작 가이드(온보딩 영상) 모달 */}
      <WelcomeGuideModal
        isOpen={welcomeModalOpen}
        videos={guideVideos}
        onClose={closeWelcomeGuide}
      />

      {/* 학교 프로젝트 모달 */}
      <SchoolProjectModal
        isOpen={projectModalOpen}
        onClose={() => { setProjectModalOpen(false); setEditingProject(null); }}
        onSaved={() => fetchMyProjects()}
        editProject={editingProject}
      />

      {/* 학교 프로젝트 참여 모달 */}
      <AnimatePresence>
        {joinModalOpen && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setJoinModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-8 py-6 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <School size={20} />
                    <h2 className="text-xl font-black">학교 프로젝트 참여</h2>
                  </div>
                  <p className="text-sm text-white/70">담임 선생님에게 받은 코드를 입력하세요</p>
                </div>
                <button onClick={() => setJoinModalOpen(false)} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-5">
                {joinDone ? (
                  <div className="text-center py-6 space-y-3">
                    <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto">
                      <Check size={28} className="text-green-500" />
                    </div>
                    <p className="font-black text-lg">참여 완료!</p>
                    <p className="text-sm text-gray-500">담당 학급이 대시보드에 추가됩니다.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">참여 코드</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="ex) abc123xyz"
                          value={joinCode}
                          onChange={e => { setJoinCode(e.target.value); setJoinProject(null); setJoinSubClasses([]); }}
                          onKeyDown={e => e.key === 'Enter' && handleSearchJoinProject()}
                          className="flex-1 px-4 py-3.5 bg-gray-50 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-indigo-300 focus:bg-white outline-none transition-all font-mono"
                        />
                        <button
                          onClick={handleSearchJoinProject}
                          disabled={!joinCode.trim() || joinSearching}
                          className="px-5 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black text-sm disabled:opacity-40 active:scale-95 transition-all"
                        >
                          {joinSearching ? '검색 중...' : '확인'}
                        </button>
                      </div>
                    </div>

                    {joinProject && (
                      <div className="space-y-4">
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                          <p className="font-black text-indigo-900">{joinProject.name}</p>
                          {joinProject.school_name && <p className="text-xs text-indigo-500 mt-0.5">{joinProject.school_name}</p>}
                        </div>

                        {joinSubClasses.length === 0 ? (
                          <div className="text-center py-6 text-gray-400">
                            <GraduationCap size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm font-bold">배정 가능한 반이 없습니다</p>
                            <p className="text-xs mt-1">담임 선생님에게 문의해주세요</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">담당할 반을 선택하세요</p>
                            {joinSubClasses.map((cls: any) => (
                              <button
                                key={cls.id}
                                onClick={() => handleJoinSubClass(cls.id)}
                                disabled={joiningClassId === cls.id}
                                className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-indigo-50 border-2 border-transparent hover:border-indigo-200 rounded-2xl text-left transition-all active:scale-[0.99] group"
                              >
                                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-200 transition-colors shrink-0">
                                  <GraduationCap size={18} className="text-indigo-600" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-black">{cls.name}</p>
                                  <p className="text-xs text-gray-400">담당 선생님 없음 · 참여 가능</p>
                                </div>
                                {joiningClassId === cls.id
                                  ? <span className="text-xs text-indigo-400 font-bold">참여 중...</span>
                                  : <ArrowRight size={16} className="text-gray-300 group-hover:text-indigo-400 transition-colors" />
                                }
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 학교 프로젝트 삭제 확인 모달 */}
      <AnimatePresence>
        {deletingProjectId && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingProjectId(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center text-red-500">
                  <AlertTriangle size={26} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-900">프로젝트 삭제</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="font-bold text-gray-800">"{deletingProjectName}"</span>을(를)<br />
                    삭제하면 복구할 수 없습니다.
                  </p>
                  <div className="mt-3 p-3 bg-orange-50 rounded-xl text-left space-y-1">
                    <p className="text-xs text-orange-700 font-bold">삭제 시 함께 사라지는 것:</p>
                    <p className="text-xs text-orange-600">• 학교 담당자 공유 URL 접근 불가</p>
                    <p className="text-xs text-orange-600">• 초대된 선생님의 Pro 혜택 만료</p>
                    <p className="text-xs text-gray-500 mt-1">※ 각 반 클래스와 학생 데이터는 유지됩니다</p>
                  </div>
                </div>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => { setDeletingProjectId(null); setDeletingProjectName(''); }}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-sm transition-all"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteProject}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-sm transition-all active:scale-95"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 빠른 처리 큐 플로팅 버튼 */}
      <AnimatePresence>
        {pendingReviewCount > 0 && !quickReviewOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onClick={() => setQuickReviewOpen(true)}
            className="fixed bottom-20 right-4 z-[500] flex items-center gap-2.5 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-lg font-black text-sm transition-colors active:scale-95"
          >
            <BellRing size={16} />
            <span>미처리 {pendingReviewCount}건</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* 빠른 처리 패널 */}
      <AnimatePresence>
        {quickReviewOpen && (
          <QuickReviewPanel
            onClose={() => { setQuickReviewOpen(false); fetchPendingReviewCount(); }}
            onCountChange={(count) => setPendingReviewCount(count)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Dashboard;
