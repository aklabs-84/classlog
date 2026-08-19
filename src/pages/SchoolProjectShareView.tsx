import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import JSZip from 'jszip';
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { GALLERY_PAGE_SIZE, parseVideoUrl } from '../lib/gallery';
import { getResultImagePublicUrls } from '../components/common/ImageCarousel';
import { buildXlsxBlob } from '../lib/xlsxBuilder';
import type { XCell } from '../lib/xlsxBuilder';
import { BANNER_THEMES } from '../components/classroom/SchoolProjectModal';
import {
  School, Users, ChevronDown, ChevronUp, ExternalLink,
  FileText, Loader2, AlertCircle, Lock, Calendar,
  Images, Download, ZoomIn, X, BookOpen,
  AlignLeft, Link2, ImageIcon, File as FileIcon,
  Sparkles, ArrowRight, CheckCircle2, FolderOpen, RefreshCw, Quote, BarChart2, MousePointerClick,
} from 'lucide-react';
import { ShortTextChart } from './tools/SurveyTool';
import type { SurveyQuestion, SurveyAnswer } from './tools/SurveyTool';
import {
  AttendanceDonutChart, MultipleChoiceBarChart, YesNoPieChart, StarRatingBarChart, OpinionScaleBarChart, RankingBarChart,
} from '../components/share/ShareCharts';

async function blobDownload(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function getAvatarUrl(student: { avatar_url?: string | null; full_name: string }) {
  return student.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.full_name)}&background=random`;
}

const CountUpNumber = ({ value }: { value: number }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return controls.stop;
  }, [value]);
  return <>{display}</>;
};

interface ResultRow {
  id: string;
  student_id: string;
  submission_group: string | null;
  is_group_submission: boolean;
  week_number: number | null;
  title: string | null;
  text_content: string | null;
  result_type: string;
  link_url: string | null;
  image_url: string | null;
  image_urls?: string[];
  file_url: string | null;
  file_name?: string | null;
  created_at: string;
}

interface ResultGroup {
  groupId: string;
  items: ResultRow[];
  title: string | null;
  week_number: number | null;
  isGroupSubmission: boolean;
  types: string[];
  created_at: string;
}

interface StudentWithData {
  id: string;
  full_name: string;
  student_number: number | null;
  avatar_url: string | null;
  observations: { id: string; activity_name: string; content: string; created_at: string; week_number: number | null }[];
  resultGroups: ResultGroup[];
}

interface GalleryItem {
  id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  caption: string | null;
  week_number: number | null;
  created_at: string;
}

interface EvalRow {
  student_id: string;
  setech_content: string;
  achievement_level: string | null;
  status: string | null;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  text:  { icon: <AlignLeft size={12} />,   color: 'text-blue-600 bg-blue-50 border-blue-200',       label: '텍스트' },
  link:  { icon: <Link2 size={12} />,        color: 'text-indigo-600 bg-indigo-50 border-indigo-200', label: '링크' },
  image: { icon: <ImageIcon size={12} />,    color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: '이미지' },
  file:  { icon: <FileIcon size={12} />,     color: 'text-amber-600 bg-amber-50 border-amber-200',   label: '파일' },
};

const SchoolProjectShareView = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [project, setProject] = useState<any>(null);
  const [classList, setClassList] = useState<any[]>([]);
  const [attendanceByClass, setAttendanceByClass] = useState<Record<string, { total: number; byStatus: Record<string, number> }>>({});
  const [surveyDataByForm, setSurveyDataByForm] = useState<Record<string, { formTitle: string; questions: SurveyQuestion[]; answersByQuestion: Record<string, SurveyAnswer[]>; responseCount: number }>>({});
  const [projectStats, setProjectStats] = useState<{ studentCount: number; obsCount: number; resultCount: number; galleryCount: number; setechDoneCount: number } | null>(null);
  const [highlightGallery, setHighlightGallery] = useState<Array<{ id: string; file_url: string; caption: string | null; class_id: string }>>([]);
  const [spotlightQuotes, setSpotlightQuotes] = useState<{ content: string; studentName: string; className: string }[]>([]);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [snapshotResult, setSnapshotResult] = useState<{ title: string | null; resultType: string; createdAt: string; studentName: string; className: string; url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [classStudents, setClassStudents] = useState<Record<string, StudentWithData[]>>({});
  const [classGallery, setClassGallery] = useState<Record<string, GalleryItem[]>>({});
  const [classGalleryHasMore, setClassGalleryHasMore] = useState<Record<string, boolean>>({});
  const [galleryLoadingMore, setGalleryLoadingMore] = useState<string | null>(null);
  const galleryOffsetRef = useRef<Record<string, number>>({});
  const [classEvalMap, setClassEvalMap] = useState<Record<string, Record<string, EvalRow>>>({});
  const [loadingClass, setLoadingClass] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  // 결과물 상세 모달
  const [detailGroup, setDetailGroup] = useState<{ group: ResultGroup; studentName: string } | null>(null);
  // 학생 상세 모달 (활동 기록 + 결과물 목록)
  const [modalStudent, setModalStudent] = useState<StudentWithData | null>(null);
  // 학습 여정 / 결과 확인 / 갤러리 / 학급 기록 탭
  const [activeTab, setActiveTab] = useState<'results' | 'gallery' | 'setech' | 'survey'>('results');
  const [weekFilter, setWeekFilter] = useState<number | 'all'>('all');
  const [zipping, setZipping] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => { setSpotlightIndex(0); }, [spotlightQuotes.length]);
  useEffect(() => {
    if (reduceMotion || spotlightQuotes.length <= 1) return;
    const timer = setInterval(() => {
      setSpotlightIndex((i) => (i + 1) % spotlightQuotes.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [reduceMotion, spotlightQuotes.length]);

  useEffect(() => {
    if (!shareToken) return;
    fetchProjectMeta();
  }, [shareToken]);

  const fetchProjectMeta = async () => {
    setLoading(true);
    try {
      const { data: proj, error: projErr } = await supabase
        .from('school_projects')
        .select('id, name, school_name, status, end_date, created_at, banner_color')
        .eq('share_token', shareToken)
        .single();

      if (projErr || !proj) {
        setError('공유 링크가 유효하지 않거나 존재하지 않습니다.');
        return;
      }
      setProject(proj);

      const { data: subClasses } = await supabase
        .from('classes')
        .select('id, name, subject, assigned_teacher_id, weekly_plan, show_learning_journey, show_attendance_summary, shared_survey_form_id')
        .eq('school_project_id', proj.id)
        .not('parent_class_id', 'is', null)
        .order('created_at', { ascending: true });

      if (!subClasses || subClasses.length === 0) { setClassList([]); return; }

      const teacherIds = [...new Set(subClasses.map((c: any) => c.assigned_teacher_id).filter(Boolean))];
      const teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
        (profiles || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });
      }
      const classIds = subClasses.map((c: any) => c.id);
      const { data: allStudents } = await supabase.from('students').select('id, class_id, full_name').in('class_id', classIds);
      const allStudentIds = (allStudents || []).map((s: any) => s.id);
      const studentInfoMap: Record<string, { class_id: string; full_name: string }> = {};
      (allStudents || []).forEach((s: any) => { studentInfoMap[s.id] = { class_id: s.class_id, full_name: s.full_name }; });
      const classNameMap: Record<string, string> = {};
      subClasses.forEach((c: any) => { classNameMap[c.id] = c.name; });
      const studentCountByClass: Record<string, number> = {};
      (allStudents || []).forEach((s: any) => { studentCountByClass[s.class_id] = (studentCountByClass[s.class_id] || 0) + 1; });

      setClassList(subClasses.map((c: any) => ({
        id: c.id, name: c.name, subject: c.subject || '',
        teacher_name: c.assigned_teacher_id ? (teacherMap[c.assigned_teacher_id] || null) : null,
        weekly_plan: c.weekly_plan || [],
        show_learning_journey: c.show_learning_journey ?? true,
        show_attendance_summary: c.show_attendance_summary ?? true,
        shared_survey_form_id: c.shared_survey_form_id || null,
        studentCount: studentCountByClass[c.id] || 0,
      })));

      const attendanceClassIds = subClasses.filter((c: any) => c.show_attendance_summary ?? true).map((c: any) => c.id);

      const [obsCountRes, resultsCountRes, galleryCountRes, setechDoneCountRes, highlightRes, spotlightObsRes, snapshotResultRes, attendanceRes] = await Promise.all([
        allStudentIds.length > 0
          ? supabase.from('observations').select('id', { count: 'exact', head: true })
              .in('student_id', allStudentIds).eq('is_student_record', true).eq('status', 'approved')
          : Promise.resolve({ count: 0 }),
        allStudentIds.length > 0
          ? supabase.from('student_results').select('id', { count: 'exact', head: true }).in('student_id', allStudentIds)
          : Promise.resolve({ count: 0 }),
        supabase.from('class_gallery_items').select('id', { count: 'exact', head: true }).in('class_id', classIds),
        allStudentIds.length > 0
          ? supabase.from('student_evaluations').select('id', { count: 'exact', head: true })
              .in('student_id', allStudentIds).in('status', ['final', 'done'])
          : Promise.resolve({ count: 0 }),
        supabase.from('class_gallery_items')
          .select('id, file_url, caption, class_id')
          .in('class_id', classIds).eq('file_type', 'image')
          .order('created_at', { ascending: false }).limit(8),
        allStudentIds.length > 0
          ? supabase.from('observations').select('id, student_id, content, created_at')
              .in('student_id', allStudentIds).eq('is_student_record', true).eq('status', 'approved')
              .order('created_at', { ascending: false }).limit(40)
          : Promise.resolve({ data: [] }),
        allStudentIds.length > 0
          ? supabase.from('student_results').select('id, student_id, title, result_type, created_at, link_url, storage_path')
              .in('student_id', allStudentIds).order('created_at', { ascending: false }).limit(1)
          : Promise.resolve({ data: [] }),
        attendanceClassIds.length > 0
          ? supabase.from('attendance').select('class_id, status').in('class_id', attendanceClassIds)
          : Promise.resolve({ data: [] }),
      ]);

      // 학급별 출석 요약 (학급 전체 통계만, 학생별 상세는 노출하지 않음)
      const attendanceByClass: Record<string, { total: number; byStatus: Record<string, number> }> = {};
      (attendanceRes.data || []).forEach((r: any) => {
        if (!attendanceByClass[r.class_id]) attendanceByClass[r.class_id] = { total: 0, byStatus: {} };
        attendanceByClass[r.class_id].total += 1;
        attendanceByClass[r.class_id].byStatus[r.status] = (attendanceByClass[r.class_id].byStatus[r.status] || 0) + 1;
      });
      setAttendanceByClass(attendanceByClass);

      // 학급별 공개 설문 결과 (교사가 지정한 설문 1개씩, 응답자 식별 없이 집계만)
      const surveyFormIds = [...new Set(subClasses.map((c: any) => c.shared_survey_form_id).filter(Boolean))] as string[];
      if (surveyFormIds.length > 0) {
        const [{ data: forms }, { data: questions }, { data: answers }, { data: responses }] = await Promise.all([
          supabase.from('survey_forms').select('id, title').in('id', surveyFormIds),
          supabase.from('survey_questions').select('id, form_id, order_index, type, text, options').in('form_id', surveyFormIds).order('order_index', { ascending: true }),
          supabase.from('survey_answers').select('id, response_id, question_id, form_id, value').in('form_id', surveyFormIds),
          supabase.from('survey_responses').select('id, form_id').in('form_id', surveyFormIds),
        ]);
        const formTitleMap: Record<string, string> = {};
        (forms || []).forEach((f: any) => { formTitleMap[f.id] = f.title; });
        const responseCountByForm: Record<string, number> = {};
        (responses || []).forEach((r: any) => { responseCountByForm[r.form_id] = (responseCountByForm[r.form_id] || 0) + 1; });
        const questionsByForm: Record<string, SurveyQuestion[]> = {};
        (questions || []).forEach((q: any) => {
          if (!questionsByForm[q.form_id]) questionsByForm[q.form_id] = [];
          questionsByForm[q.form_id].push(q);
        });
        const answersByFormAndQuestion: Record<string, Record<string, SurveyAnswer[]>> = {};
        (answers || []).forEach((a: any) => {
          if (!answersByFormAndQuestion[a.form_id]) answersByFormAndQuestion[a.form_id] = {};
          if (!answersByFormAndQuestion[a.form_id][a.question_id]) answersByFormAndQuestion[a.form_id][a.question_id] = [];
          answersByFormAndQuestion[a.form_id][a.question_id].push(a);
        });
        const surveyDataByForm: Record<string, { formTitle: string; questions: SurveyQuestion[]; answersByQuestion: Record<string, SurveyAnswer[]>; responseCount: number }> = {};
        surveyFormIds.forEach(formId => {
          surveyDataByForm[formId] = {
            formTitle: formTitleMap[formId] || '설문',
            questions: questionsByForm[formId] || [],
            answersByQuestion: answersByFormAndQuestion[formId] || {},
            responseCount: responseCountByForm[formId] || 0,
          };
        });
        setSurveyDataByForm(surveyDataByForm);
      } else {
        setSurveyDataByForm({});
      }

      setProjectStats({
        studentCount: allStudentIds.length,
        obsCount: obsCountRes.count || 0,
        resultCount: resultsCountRes.count || 0,
        galleryCount: galleryCountRes.count || 0,
        setechDoneCount: setechDoneCountRes.count || 0,
      });
      setHighlightGallery(highlightRes.data || []);

      // 스포트라이트 인용구: 20~220자 관찰기록 중 학생별로 하나씩 골라 매번 랜덤 3개 선택
      const quoteByStudent = new Map<string, { content: string; studentName: string; className: string }[]>();
      (spotlightObsRes.data || []).forEach((o: any) => {
        const text = (o.content || '').trim();
        if (text.length < 20 || text.length > 220) return;
        const info = studentInfoMap[o.student_id];
        if (!info) return;
        const arr = quoteByStudent.get(o.student_id) ?? [];
        arr.push({ content: text, studentName: info.full_name, className: classNameMap[info.class_id] || '' });
        quoteByStudent.set(o.student_id, arr);
      });
      const perStudentQuotes = Array.from(quoteByStudent.values()).map(arr => arr[Math.floor(Math.random() * arr.length)]);
      for (let i = perStudentQuotes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perStudentQuotes[i], perStudentQuotes[j]] = [perStudentQuotes[j], perStudentQuotes[i]];
      }
      setSpotlightQuotes(perStudentQuotes.slice(0, 3));

      // 결과물 스냅샷: 가장 최근 결과물 1건
      const snapRow = (snapshotResultRes.data || [])[0] as any;
      if (snapRow) {
        const info = studentInfoMap[snapRow.student_id];
        const snapUrl = snapRow.result_type === 'link'
          ? (snapRow.link_url || null)
          : (snapRow.result_type === 'image' || snapRow.result_type === 'file') && snapRow.storage_path
            ? supabase.storage.from('student-attachments').getPublicUrl(snapRow.storage_path).data?.publicUrl || null
            : null;
        setSnapshotResult(info ? {
          title: snapRow.title,
          resultType: snapRow.result_type,
          createdAt: snapRow.created_at,
          studentName: info.full_name,
          className: classNameMap[info.class_id] || '',
          url: snapUrl,
        } : null);
      } else {
        setSnapshotResult(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchClassData = async (classId: string) => {
    setLoadingClass(classId);
    try {
      const cls = classList.find(c => c.id === classId);
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
      const topicWeekMap: Record<string, number> = {};
      ((cls?.weekly_plan as any[]) || []).forEach((p: any) => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      const { data: students } = await supabase
        .from('students').select('id, full_name, student_number, avatar_url')
        .eq('class_id', classId).order('student_number', { ascending: true });

      if (!students || students.length === 0) {
        setClassStudents(prev => ({ ...prev, [classId]: [] }));
        setClassGallery(prev => ({ ...prev, [classId]: [] }));
        setActiveClassId(classId);
        return;
      }
      const studentIds = students.map(s => s.id);

      const [obsRes, resultsRes, galleryRes, evalRes] = await Promise.all([
        supabase.from('observations')
          .select('id, student_id, activity_name, content, created_at')
          .in('student_id', studentIds)
          .eq('is_student_record', true)
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase.from('student_results')
          .select('id, student_id, submission_group, is_group_submission, week_number, title, text_content, result_type, created_at, link_url, storage_path, storage_paths')
          .in('student_id', studentIds).order('created_at', { ascending: false }),
        supabase.from('class_gallery_items')
          .select('id, file_url, file_type, file_name, caption, week_number, created_at')
          .eq('class_id', classId).order('created_at', { ascending: false })
          .range(0, GALLERY_PAGE_SIZE - 1),
        supabase.from('student_evaluations')
          .select('student_id, setech_content, achievement_level, status')
          .in('student_id', studentIds),
      ]);

      // 결과물 URL 처리
      const resultsWithUrls: ResultRow[] = (resultsRes.data || []).map((r: any) => {
        let image_url: string | null = null;
        let file_url: string | null = null;
        let image_urls: string[] = [];
        if (r.result_type === 'image') {
          image_urls = getResultImagePublicUrls(supabase.storage, r);
          image_url = image_urls[0] || null;
        } else if (r.result_type === 'file' && r.storage_path) {
          file_url = supabase.storage.from('student-attachments').getPublicUrl(r.storage_path).data?.publicUrl || null;
        }
        return { ...r, image_url, image_urls, file_url };
      });

      // submission_group 기준 그룹핑 함수
      const groupResults = (rows: ResultRow[]): ResultGroup[] => {
        const map: Record<string, ResultRow[]> = {};
        rows.forEach(r => {
          const key = r.submission_group || r.id;
          if (!map[key]) map[key] = [];
          map[key].push(r);
        });
        return Object.entries(map)
          .map(([groupId, items]) => ({
            groupId,
            items,
            title: items.find(r => r.title)?.title || null,
            week_number: items.find(r => r.week_number)?.week_number || null,
            isGroupSubmission: items.some(r => r.is_group_submission),
            types: [...new Set(items.map(r => r.result_type))],
            created_at: items[0].created_at,
          }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      };

      const obsMap: Record<string, any[]> = {};
      (obsRes.data || []).forEach((o: any) => {
        if (!obsMap[o.student_id]) obsMap[o.student_id] = [];
        obsMap[o.student_id].push({ ...o, week_number: topicWeekMap[norm(o.activity_name)] ?? null });
      });
      const resultsMap: Record<string, ResultRow[]> = {};
      resultsWithUrls.forEach(r => {
        if (!resultsMap[r.student_id]) resultsMap[r.student_id] = [];
        resultsMap[r.student_id].push(r);
      });

      setClassStudents(prev => ({
        ...prev,
        [classId]: students.map(s => ({
          ...s,
          observations: obsMap[s.id] || [],
          resultGroups: groupResults(resultsMap[s.id] || []),
        })),
      }));
      const galleryPage = galleryRes.data || [];
      setClassGallery(prev => ({ ...prev, [classId]: galleryPage }));
      galleryOffsetRef.current[classId] = galleryPage.length;
      setClassGalleryHasMore(prev => ({ ...prev, [classId]: galleryPage.length === GALLERY_PAGE_SIZE }));

      const evalMap: Record<string, EvalRow> = {};
      (evalRes.data || []).forEach((e: any) => { evalMap[e.student_id] = e; });
      setClassEvalMap(prev => ({ ...prev, [classId]: evalMap }));

      setActiveClassId(classId);
    } finally {
      setLoadingClass(null);
    }
  };

  const handleLoadMoreGallery = async (classId: string) => {
    setGalleryLoadingMore(classId);
    try {
      const offset = galleryOffsetRef.current[classId] || 0;
      const { data } = await supabase
        .from('class_gallery_items')
        .select('id, file_url, file_type, file_name, caption, week_number, created_at')
        .eq('class_id', classId).order('created_at', { ascending: false })
        .range(offset, offset + GALLERY_PAGE_SIZE - 1);
      const page = data || [];
      setClassGallery(prev => ({ ...prev, [classId]: [...(prev[classId] || []), ...page] }));
      galleryOffsetRef.current[classId] = offset + page.length;
      setClassGalleryHasMore(prev => ({ ...prev, [classId]: page.length === GALLERY_PAGE_SIZE }));
    } finally {
      setGalleryLoadingMore(null);
    }
  };

  const handleToggleClass = (classId: string) => {
    if (activeClassId === classId) {
      setActiveClassId(null);
      return;
    }
    setActiveTab('results');
    setWeekFilter('all');
    setExpandedStudents(new Set());
    if (classStudents[classId]) {
      setActiveClassId(classId);
    } else {
      fetchClassData(classId);
    }
  };

  const handleRefreshClass = (classId: string) => {
    setClassStudents(prev => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
    fetchClassData(classId);
  };

  const toggleStudent = (studentId: string) => {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <Loader2 size={32} className="animate-spin" />
        <p className="text-sm font-bold">프로젝트 불러오는 중...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-3 max-w-sm">
        <AlertCircle size={40} className="mx-auto text-red-400" />
        <p className="font-black text-gray-700">{error}</p>
        <p className="text-sm text-gray-400">URL을 확인하거나 담당 선생님에게 문의하세요.</p>
      </div>
    </div>
  );

  const isClosed = project?.status === 'closed' || project?.status === 'archived';
  const theme = BANNER_THEMES.find(t => t.key === (project?.banner_color || 'violet')) ?? BANNER_THEMES[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white">

      {/* ── 이미지 라이트박스 ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}><X size={28} /></button>
          <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
            onClick={e => { e.stopPropagation(); setLightbox(lb => lb && lb.index > 0 ? { ...lb, index: lb.index - 1 } : lb); }}>
            <ChevronDown size={32} className="-rotate-90" />
          </button>
          <img src={lightbox.urls[lightbox.index]} alt="" className="max-w-full max-h-[85vh] rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
            onClick={e => { e.stopPropagation(); setLightbox(lb => lb && lb.index < lb.urls.length - 1 ? { ...lb, index: lb.index + 1 } : lb); }}>
            <ChevronDown size={32} className="rotate-90" />
          </button>
          <p className="absolute bottom-4 text-white/50 text-sm">{lightbox.index + 1} / {lightbox.urls.length}</p>
        </div>
      )}

      {/* ── 학생 상세 모달 ── */}
      {modalStudent && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModalStudent(null)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-gray-100">
                <img src={getAvatarUrl(modalStudent)} alt={modalStudent.full_name} className="w-full h-full object-cover" />
              </div>
              <p className="font-black text-gray-900 text-sm flex-1 min-w-0 truncate">{modalStudent.full_name}</p>
              <button onClick={() => setModalStudent(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {modalStudent.observations.map(obs => (
                <div key={obs.id} className="bg-white rounded-xl border border-violet-100 p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">📝 활동 기록</span>
                    {obs.week_number && <span className="text-[10px] font-bold text-gray-400">{obs.week_number}주차</span>}
                    <span className="text-[10px] text-gray-400 ml-auto">{new Date(obs.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  {obs.activity_name && <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{obs.activity_name}</p>}
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{obs.content}</p>
                </div>
              ))}

              {modalStudent.resultGroups.map(group => {
                const imageItem = group.items.find(r => r.image_urls && r.image_urls.length > 0);
                const textItem  = group.items.find(r => r.result_type === 'text');
                const linkItem  = group.items.find(r => r.result_type === 'link');
                const fileItem  = group.items.find(r => r.result_type === 'file');

                return (
                  <div key={group.groupId}
                    onClick={() => setDetailGroup({ group, studentName: modalStudent.full_name })}
                    className="bg-white rounded-xl border border-emerald-100 p-4 cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group">
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {group.isGroupSubmission && (
                        <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200">👥 조별 제출</span>
                      )}
                      {group.types.map(type => {
                        const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.file;
                        return (
                          <span key={type} className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.color}`}>
                            {cfg.icon}{cfg.label}
                          </span>
                        );
                      })}
                      {group.week_number && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 ml-auto">{group.week_number}주차</span>
                      )}
                    </div>
                    {group.title && <p className="font-black text-sm text-gray-800 mb-2 group-hover:text-emerald-700 transition-colors">{group.title}</p>}
                    <div className="space-y-2">
                      {imageItem?.image_urls && imageItem.image_urls.length > 0 && (
                        <div className="relative">
                          <img src={imageItem.image_urls[0]} alt="" className="rounded-lg w-full max-h-36 object-cover" />
                          {imageItem.image_urls.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              1/{imageItem.image_urls.length}
                            </div>
                          )}
                        </div>
                      )}
                      {textItem?.text_content && <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{textItem.text_content}</p>}
                      {linkItem?.link_url && <p className="text-xs text-indigo-500 truncate flex items-center gap-1"><Link2 size={10} />{linkItem.link_url}</p>}
                      {fileItem && <p className="text-xs text-amber-600 flex items-center gap-1"><FileIcon size={10} />첨부파일 있음</p>}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] text-gray-400">{new Date(group.created_at).toLocaleDateString('ko-KR')}</span>
                      <span className="text-[10px] text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">자세히 보기 →</span>
                    </div>
                  </div>
                );
              })}

              {!modalStudent.observations.length && !modalStudent.resultGroups.length && (
                <p className="text-xs font-bold text-gray-400 text-center py-8">기록이 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 결과물 상세 모달 ── */}
      {detailGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetailGroup(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {detailGroup.group.title && (
                    <h3 className="text-lg font-black text-gray-900 mb-2">{detailGroup.group.title}</h3>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {detailGroup.group.isGroupSubmission && (
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200">
                        👥 조별 제출
                      </span>
                    )}
                    {detailGroup.group.types.map(type => {
                      const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.file;
                      return (
                        <span key={type} className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      );
                    })}
                    {detailGroup.group.week_number && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                        {detailGroup.group.week_number}주차
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    {detailGroup.studentName} · {new Date(detailGroup.group.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <button onClick={() => setDetailGroup(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 shrink-0 transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {(() => {
                const items = detailGroup.group.items;
                const textItem  = items.find(r => r.result_type === 'text');
                const linkItem  = items.find(r => r.result_type === 'link');
                const imageItem = items.find(r => r.result_type === 'image');
                const fileItem  = items.find(r => r.result_type === 'file');
                const allImgUrls = items.flatMap(r => r.image_urls || []);

                return (
                  <>
                    {/* 이미지 */}
                    {imageItem?.image_urls && imageItem.image_urls.length > 0 && (
                      <div className="relative group cursor-pointer rounded-2xl overflow-hidden"
                        onClick={() => setLightbox({ urls: allImgUrls, index: allImgUrls.indexOf(imageItem.image_urls![0]) })}>
                        <img src={imageItem.image_urls[0]} alt="결과 이미지" className="w-full max-h-64 object-cover group-hover:opacity-90 transition-opacity" />
                        {imageItem.image_urls.length > 1 && (
                          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            1/{imageItem.image_urls.length}
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                          <ZoomIn size={24} className="text-white" />
                        </div>
                      </div>
                    )}
                    {/* 텍스트 */}
                    {textItem?.text_content && (
                      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                        <p className="text-[11px] font-black text-blue-500 mb-2 flex items-center gap-1"><AlignLeft size={12} />텍스트</p>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{textItem.text_content}</p>
                      </div>
                    )}
                    {/* 링크 */}
                    {linkItem?.link_url && (
                      <a href={linkItem.link_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-sm font-black text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-3 rounded-2xl transition-colors shadow-sm">
                        <ExternalLink size={16} /> 링크 열기
                      </a>
                    )}
                    {/* 파일 */}
                    {fileItem?.file_url && (
                      <a href={fileItem.file_url} download target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-sm font-black text-white bg-amber-500 hover:bg-amber-600 px-4 py-3 rounded-2xl transition-colors shadow-sm">
                        <Download size={16} /> 파일 다운로드
                      </a>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      {(() => {
        return (
          <div className="bg-white">
            <motion.div
              className="max-w-4xl mx-auto px-6 py-12 sm:py-16"
              initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <div className="flex items-start justify-between gap-3 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${theme.from}14` }}>
                    <School size={24} style={{ color: theme.from }} />
                  </div>
                  <div>
                    {project?.school_name && (
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.from }}>{project.school_name}</p>
                    )}
                  </div>
                </div>
                <a href="/" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 transition-all border border-gray-200 hover:bg-gray-50">
                  <Sparkles size={12} style={{ color: theme.from }} />
                  <span className="text-[11px] font-black text-gray-600">Powered by 클래스로그 AI</span>
                </a>
              </div>

              <h1 className="text-4xl sm:text-5xl font-black leading-[1.1] tracking-tight mb-3 text-gray-900">{project?.name}</h1>

              <div className="flex items-center gap-4 text-sm flex-wrap mb-8 text-gray-400">
                {project?.end_date && (
                  <span className="flex items-center gap-1.5"><Calendar size={14} /> 종료일: {new Date(project.end_date).toLocaleDateString('ko-KR')}</span>
                )}
                {isClosed && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${theme.from}14`, color: theme.from }}>
                    <Lock size={11} /> 수업 종료됨
                  </span>
                )}
              </div>

              {projectStats && (
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-6xl sm:text-7xl font-black tracking-tight tabular-nums text-gray-900">
                    <CountUpNumber value={projectStats.studentCount} />
                  </span>
                  <span className="text-base sm:text-lg font-bold text-gray-400">명의 학생과 함께한 프로젝트</span>
                </div>
              )}
            </motion.div>
          </div>
        );
      })()}

      {/* 스포트라이트 인용구 (자동 슬라이드 캐러셀) */}
      {spotlightQuotes.length > 0 && (
        <div className="border-t border-b border-gray-100 overflow-hidden" style={{ background: `${theme.from}0a` }}>
          <div className="max-w-4xl mx-auto px-6 py-8 sm:py-10">
            <Quote size={26} className="mb-3" style={{ color: `${theme.from}66` }} />
            <AnimatePresence mode="wait">
              <motion.div
                key={spotlightIndex}
                initial={reduceMotion ? undefined : { opacity: 0, x: 16 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <blockquote className="text-lg sm:text-2xl font-bold text-gray-900 leading-snug tracking-tight mb-4">
                  “{spotlightQuotes[spotlightIndex].content}”
                </blockquote>
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  {spotlightQuotes[spotlightIndex].className} · {spotlightQuotes[spotlightIndex].studentName}
                </p>
              </motion.div>
            </AnimatePresence>
            {spotlightQuotes.length > 1 && (
              <div className="flex items-center gap-1.5 mt-6">
                {spotlightQuotes.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSpotlightIndex(i)}
                    aria-label={`${i + 1}번째 인용구 보기`}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: i === spotlightIndex ? 24 : 6, background: i === spotlightIndex ? theme.from : `${theme.from}33` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 통합 통계 대시보드 카드 */}
      {projectStats && (
        <div className="max-w-4xl mx-auto px-6 pt-8">
          {(() => {
            const navCards = [
              { label: '참여 학급', value: classList.length, unit: '개', icon: School, color: 'indigo' as const },
              { label: '학습 여정', value: projectStats.obsCount, unit: '건', icon: Sparkles, color: 'violet' as const },
              { label: '결과 확인', value: projectStats.resultCount, unit: '건', icon: FileText, color: 'blue' as const },
              { label: '갤러리', value: projectStats.galleryCount, unit: '장', icon: Images, color: 'emerald' as const },
              { label: '학급 기록', value: projectStats.setechDoneCount, unit: '건', icon: BookOpen, color: 'amber' as const },
            ];
            const maxValue = Math.max(1, ...navCards.map((c) => c.value));
            const colorMap = {
              indigo: { tint: 'bg-indigo-50', ink: 'text-indigo-600', border: 'border-indigo-100', bar: 'bg-indigo-400' },
              violet: { tint: 'bg-violet-50', ink: 'text-violet-600', border: 'border-violet-100', bar: 'bg-violet-400' },
              blue: { tint: 'bg-blue-50', ink: 'text-blue-600', border: 'border-blue-100', bar: 'bg-blue-400' },
              emerald: { tint: 'bg-emerald-50', ink: 'text-emerald-600', border: 'border-emerald-100', bar: 'bg-emerald-400' },
              amber: { tint: 'bg-amber-50', ink: 'text-amber-600', border: 'border-amber-100', bar: 'bg-amber-400' },
            };
            return (
              <>
                <p className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-3">
                  <MousePointerClick size={13} className="text-gray-300" />
                  카드를 클릭하면 자세한 내용을 볼 수 있어요
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {navCards.map(({ label, value, unit, icon: Icon, color }, i) => {
                  const c = colorMap[color];
                  const filled = value > 0;
                  const barPct = Math.round((value / maxValue) * 100);
                  return (
                    <motion.button
                      key={label}
                      onClick={() => document.getElementById('class-list')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })}
                      initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.4, delay: i * 0.06, ease: 'easeOut' }}
                      whileHover={reduceMotion ? undefined : { y: -4 }}
                      className={`text-left rounded-2xl border p-4 transition-shadow ${filled ? `${c.tint} ${c.border} shadow-sm hover:shadow-md` : 'bg-gray-50 border-gray-100'}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${filled ? 'bg-white/70' : 'bg-white'}`}>
                        <Icon size={15} className={filled ? c.ink : 'text-gray-300'} />
                      </div>
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${filled ? c.ink : 'text-gray-400'}`}>{label}</p>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className={`text-xl font-black ${filled ? 'text-gray-900' : 'text-gray-400'}`}><CountUpNumber value={value} /></span>
                        <span className={`text-xs font-bold ${filled ? 'text-gray-400' : 'text-gray-300'}`}>{unit}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${filled ? c.bar : 'bg-transparent'}`}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${barPct}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.6, delay: i * 0.06, ease: 'easeOut' }}
                        />
                      </div>
                    </motion.button>
                  );
                })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 결과물 스냅샷 카드 */}
      {snapshotResult && (() => {
        const cardInner = (
          <>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${theme.from}14` }}>
              {TYPE_CONFIG[snapshotResult.resultType]?.icon ?? <FileText size={18} style={{ color: theme.from }} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-black text-gray-900 text-sm truncate">{snapshotResult.title || '제목 없음'}</p>
              <p className="text-xs text-gray-400 font-semibold truncate">
                {snapshotResult.className} · {snapshotResult.studentName} · {new Date(snapshotResult.createdAt).toLocaleDateString('ko-KR')}
              </p>
            </div>
            {TYPE_CONFIG[snapshotResult.resultType] && (
              <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border ${TYPE_CONFIG[snapshotResult.resultType].color}`}>
                {TYPE_CONFIG[snapshotResult.resultType].icon}
                {TYPE_CONFIG[snapshotResult.resultType].label}
              </span>
            )}
            {snapshotResult.url && <ExternalLink size={14} className="text-gray-300 shrink-0" />}
          </>
        );
        return (
          <div className="max-w-4xl mx-auto px-6 pt-6">
            {snapshotResult.url ? (
              <a
                href={snapshotResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-all"
              >
                {cardInner}
              </a>
            ) : (
              <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4">
                {cardInner}
              </div>
            )}
          </div>
        );
      })()}

      {/* 하이라이트 갤러리 */}
      {highlightGallery.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pt-8">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon size={16} className="text-violet-400" />
            <h2 className="text-sm font-black text-gray-700">수업 속 순간들</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {highlightGallery.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setLightbox({ urls: highlightGallery.map(g => g.file_url), index: idx })}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-100"
              >
                <img src={item.file_url} alt={item.caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {(() => {
                  const clsName = classList.find(c => c.id === item.class_id)?.name;
                  return clsName ? (
                    <p className="absolute bottom-1.5 left-2 right-2 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity truncate">{clsName}</p>
                  ) : null;
                })()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 클래스 목록 */}
      <div id="class-list" className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {classList.length === 0 ? (
          <div className="text-center py-16 text-gray-300">
            <School size={40} className="mx-auto mb-3" />
            <p className="font-bold text-gray-400">등록된 학급이 없습니다.</p>
          </div>
        ) : classList.map(cls => {
          const isExpanded = activeClassId === cls.id;
          const students = classStudents[cls.id] || [];
          const gallery = classGallery[cls.id] || [];
          const isLoading = loadingClass === cls.id;
          const totalObs = students.reduce((s, st) => s + st.observations.length, 0);
          const totalResults = students.reduce((s, st) => s + st.resultGroups.length, 0);

          return (
            <motion.div key={cls.id}
              initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 ${isExpanded ? 'border-violet-200 shadow-md' : 'border-violet-100 shadow-sm hover:shadow-md hover:border-violet-200'}`}>
              {/* 클래스 헤더 */}
              <button onClick={() => handleToggleClass(cls.id)}
                className="w-full flex items-center justify-between px-6 py-5 hover:bg-violet-50/60 transition-all text-left">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shrink-0"
                    style={{ background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}>
                    {cls.name?.charAt(0) || '반'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-base truncate">{cls.name}</h3>
                    <p className="text-xs text-gray-400 truncate">
                      {cls.subject && <span className="mr-2">{cls.subject}</span>}
                      {cls.teacher_name && <span className="text-violet-500 font-bold">{cls.teacher_name} 선생님</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                  <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                    <Users size={11} /> {cls.studentCount}명
                  </span>
                  {isExpanded && students.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5">
                      {totalObs > 0 && (
                        <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">📝 {totalObs}건</span>
                      )}
                      {totalResults > 0 && (
                        <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">📁 {totalResults}건</span>
                      )}
                      {gallery.length > 0 && (
                        <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100">🖼️ {gallery.length}장</span>
                      )}
                    </div>
                  )}
                  {isLoading ? <Loader2 size={18} className="animate-spin text-violet-400" />
                    : isExpanded ? <ChevronUp size={18} className="text-violet-400" />
                    : <ChevronDown size={18} className="text-gray-300" />}
                </div>
              </button>

              {/* 펼쳐진 내용 */}
              <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="border-t border-violet-100 overflow-hidden"
                >
                  {students.length === 0 && !isLoading ? (
                    <div className="py-8 text-center text-gray-300">
                      <Users size={24} className="mx-auto mb-2" />
                      <p className="text-xs">등록된 학생이 없습니다.</p>
                    </div>
                  ) : (() => {
                    const evalMap = classEvalMap[cls.id] || {};

                    const allWeeks = Array.from(new Set([
                      ...students.flatMap(s => s.observations.map(o => o.week_number).filter(Boolean)),
                      ...students.flatMap(s => s.resultGroups.map(g => g.week_number).filter(Boolean)),
                    ] as number[])).sort((a, b) => a - b);

                    // 주차별 학습 여정 집계
                    type WeekEntry = { week: number; topic: string | null; participants: Set<string>; obsCount: number; resultCount: number; images: string[]; sampleText: string | null };
                    const weekMap: Record<number, WeekEntry> = {};
                    const ensureWeek = (w: number) => {
                      if (!weekMap[w]) weekMap[w] = { week: w, topic: null, participants: new Set(), obsCount: 0, resultCount: 0, images: [], sampleText: null };
                      return weekMap[w];
                    };
                    (cls.weekly_plan || []).forEach((p: any) => {
                      const w = Number(p.week);
                      if (!w) return;
                      ensureWeek(w).topic = p.topic || null;
                    });
                    students.forEach(student => {
                      student.observations.forEach(o => {
                        if (!o.week_number) return;
                        const wk = ensureWeek(o.week_number);
                        wk.participants.add(student.id);
                        wk.obsCount += 1;
                        if (!wk.sampleText && o.content) wk.sampleText = o.content.length > 120 ? `${o.content.slice(0, 120)}…` : o.content;
                      });
                      student.resultGroups.forEach(group => {
                        if (!group.week_number) return;
                        const wk = ensureWeek(group.week_number);
                        wk.participants.add(student.id);
                        wk.resultCount += 1;
                        const imgItem = group.items.find(r => r.image_urls && r.image_urls.length > 0);
                        (imgItem?.image_urls || []).forEach(u => { if (wk.images.length < 8 && !wk.images.includes(u)) wk.images.push(u); });
                        const textItem = group.items.find(r => r.text_content);
                        if (!wk.sampleText && textItem?.text_content) wk.sampleText = textItem.text_content.length > 120 ? `${textItem.text_content.slice(0, 120)}…` : textItem.text_content;
                      });
                    });
                    gallery.forEach(g => {
                      if (!g.week_number || g.file_type !== 'image') return;
                      const wk = ensureWeek(g.week_number);
                      if (wk.images.length < 8 && !wk.images.includes(g.file_url)) wk.images.push(g.file_url);
                    });
                    const weeklyJourney = Object.values(weekMap)
                      .map(wk => ({ ...wk, participantCount: wk.participants.size }))
                      .sort((a, b) => a.week - b.week);

                    const filteredStudents = weekFilter === 'all' ? students : students.map(s => ({
                      ...s,
                      observations: s.observations.filter(o => o.week_number === weekFilter),
                      resultGroups: s.resultGroups.filter(g => g.week_number === weekFilter),
                    }));
                    const filteredGallery = weekFilter === 'all' ? gallery : gallery.filter(g => g.week_number === weekFilter);

                    const totalObsF = filteredStudents.reduce((a, s) => a + s.observations.length, 0);
                    const totalResultsF = filteredStudents.reduce((a, s) => a + s.resultGroups.length, 0);
                    const activeCountF = filteredStudents.filter(s => s.observations.length > 0 || s.resultGroups.length > 0).length;
                    const galleryImgs = filteredGallery.filter(g => g.file_type === 'image');
                    const galleryImgUrls = galleryImgs.map(g => g.file_url);

                    const statusLabelText = (s?: string | null) => (s === 'done' || s === 'final' ? '완료' : s === 'draft' ? '초안' : '미작성');
                    const statusLabelStyle = (s?: string | null) => {
                      if (s === 'final' || s === 'done') return { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                      if (s === 'draft') return { label: '초안', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
                      return { label: '미작성', cls: 'bg-gray-100 text-gray-400 border-gray-200' };
                    };
                    const achLabel = (a?: string | null) => {
                      if (a === '상') return 'bg-blue-100 text-blue-700';
                      if (a === '중') return 'bg-yellow-100 text-yellow-700';
                      if (a === '하') return 'bg-red-100 text-red-700';
                      return 'bg-gray-100 text-gray-400';
                    };

                    const downloadCSV = () => {
                      const className = cls.name || '학급';
                      const headers = ['번호', '이름', '활동기록 수', '결과물 수', '세특 상태', '성취도', '세특 글자수'];
                      const rows = students.map(s => {
                        const ev = evalMap[s.id];
                        return [
                          s.student_number ?? '', s.full_name, s.observations.length, s.resultGroups.length,
                          statusLabelText(ev?.status), ev?.achievement_level ?? '', (ev?.setech_content || '').length,
                        ];
                      });
                      const csvContent = [headers, ...rows]
                        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                        .join('\n');
                      const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace(/\.$/, '');
                      a.download = `${project?.name || ''}_${className}_전체학생_${todayStr}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    };

                    const downloadXLSX = async () => {
                      setDownloading(true);
                      try {
                        const className = cls.name || '학급';
                        const sheet1Rows: XCell[][] = [
                          [
                            { value: '번호', style: 'header' }, { value: '이름', style: 'header' },
                            { value: '활동기록 수', style: 'header' }, { value: '결과물 수', style: 'header' },
                            { value: '성취도', style: 'header' },
                          ],
                          ...students.map(s => {
                            const ev = evalMap[s.id];
                            return [
                              { value: s.student_number ?? null }, { value: s.full_name },
                              { value: s.observations.length }, { value: s.resultGroups.length },
                              { value: ev?.achievement_level ?? '' },
                            ] as XCell[];
                          }),
                        ];

                        const studentSheets = students.map(s => {
                          const sheetName = `${s.student_number ?? '?'}. ${s.full_name}`.replace(/[/\\?*[\]:]/g, '_').slice(0, 31);
                          const label = `${s.student_number != null ? s.student_number + '번 ' : ''}${s.full_name}`;
                          const rows: (XCell | null)[][] = [];
                          rows.push([{ value: label, span: 4, style: 'section' }, null, null, null]);
                          rows.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }]);

                          if (s.observations.length === 0 && s.resultGroups.length === 0) {
                            rows.push([{ value: '제출 없음', span: 4 }, null, null, null]);
                          } else {
                            if (s.observations.length > 0) {
                              rows.push([{ value: '활동기록', span: 4, style: 'section' }, null, null, null]);
                              rows.push([
                                { value: '주차', style: 'header' }, { value: '활동명', style: 'header' },
                                { value: '내용', style: 'header' }, { value: '날짜', style: 'header' },
                              ]);
                              s.observations.forEach(o => {
                                rows.push([
                                  { value: o.week_number != null ? `${o.week_number}주차` : '' },
                                  { value: o.activity_name || '' },
                                  { value: o.content, style: 'wrap' },
                                  { value: new Date(o.created_at).toLocaleDateString('ko-KR') },
                                ]);
                              });
                              rows.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }]);
                            }
                            if (s.resultGroups.length > 0) {
                              rows.push([{ value: '결과제출', span: 4, style: 'section' }, null, null, null]);
                              rows.push([
                                { value: '주차', style: 'header' }, { value: '제목', style: 'header' },
                                { value: '내용', style: 'header' }, { value: '날짜', style: 'header' },
                              ]);
                              s.resultGroups.forEach(group => {
                                const textItem = group.items.find(r => r.result_type === 'text');
                                const linkItem = group.items.find(r => r.result_type === 'link');
                                const fileItem = group.items.find(r => r.result_type === 'file');
                                const ct = textItem?.text_content || (linkItem?.link_url ? `링크: ${linkItem.link_url}` : fileItem ? '파일 첨부' : (group.items.find(r => r.image_url) ? '이미지 첨부' : ''));
                                rows.push([
                                  { value: group.week_number != null ? `${group.week_number}주차` : '' },
                                  { value: group.title || '' },
                                  { value: ct, style: 'wrap' },
                                  { value: new Date(group.created_at).toLocaleDateString('ko-KR') },
                                ]);
                              });
                            }
                          }
                          return { name: sheetName, colWidths: [10, 22, 55, 14], rows };
                        });

                        const sheet3Rows: XCell[][] = [
                          [
                            { value: '번호', style: 'header' }, { value: '이름', style: 'header' },
                            { value: '성취도', style: 'header' }, { value: '상태', style: 'header' },
                            { value: '세특 문장', style: 'header' }, { value: '글자수', style: 'header' },
                          ],
                          ...students.map(s => {
                            const ev = evalMap[s.id];
                            const content = ev?.setech_content || '';
                            return [
                              { value: s.student_number ?? null }, { value: s.full_name },
                              { value: ev?.achievement_level ?? '' }, { value: statusLabelText(ev?.status) },
                              { value: content, style: 'wrap' }, { value: content.length },
                            ] as XCell[];
                          }),
                        ];

                        const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace(/\.$/, '');
                        const blob = await buildXlsxBlob([
                          { name: '전체학생', colWidths: [6, 14, 13, 12, 10], rows: sheet1Rows },
                          ...studentSheets,
                          { name: '학급 기록', colWidths: [6, 14, 10, 10, 65, 10], rows: sheet3Rows },
                        ]);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${project?.name || ''}${project?.name ? '_' : ''}${className}_학생기록_${todayStr}.xlsx`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error('XLSX 다운로드 오류:', err);
                        alert('엑셀 파일 생성 중 오류가 발생했습니다.');
                      } finally {
                        setDownloading(false);
                      }
                    };

                    const handleZipDownload = async () => {
                      if (zipping || galleryImgs.length === 0) return;
                      setZipping(true);
                      try {
                        const zip = new JSZip();
                        await Promise.all(
                          galleryImgs.map(async (item, i) => {
                            const res = await fetch(item.file_url);
                            const blob = await res.blob();
                            const ext = item.file_url.split('.').pop()?.split('?')[0] || 'webp';
                            const name = `${String(i + 1).padStart(3, '0')}_${item.file_name?.replace(/\.[^.]+$/, '') || `image_${i + 1}`}.${ext}`;
                            zip.file(name, blob);
                          })
                        );
                        const zipBlob = await zip.generateAsync({ type: 'blob' });
                        const label = weekFilter === 'all' ? '전체' : `${weekFilter}주차`;
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(zipBlob);
                        a.download = `${cls.name || '갤러리'}_${label}.zip`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      } finally {
                        setZipping(false);
                      }
                    };

                    return (
                      <>
                        {/* ── 학습 여정 타임라인 (탭과 무관하게 항상 상단에 고정 노출) ── */}
                        {cls.show_learning_journey && (
                          <div className="px-6 pt-5 pb-1">
                            {weeklyJourney.length === 0 ? (
                              <div className="flex flex-col items-center py-10 space-y-2">
                                <Sparkles size={24} className="text-gray-300" />
                                <p className="text-xs font-bold text-gray-400">아직 등록된 주차별 활동이 없습니다</p>
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="flex items-center gap-1.5 mb-3">
                                  <Sparkles size={13} className="text-violet-400" />
                                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">학습 여정</h4>
                                </div>
                                <div className="absolute left-[23px] top-9 bottom-2 w-0.5 bg-gradient-to-b from-violet-200 via-violet-100 to-transparent" />
                                <div className="space-y-5">
                                  {weeklyJourney.map((wk, wi) => (
                                    <motion.div
                                      key={wk.week}
                                      initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                                      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                      viewport={{ once: true, margin: '-40px' }}
                                      transition={{ duration: 0.45, delay: Math.min(wi, 4) * 0.05, ease: 'easeOut' }}
                                      className="relative flex gap-3"
                                    >
                                      <div className="relative z-10 shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex flex-col items-center justify-center shadow-md">
                                        <span className="text-[8px] font-bold opacity-80 leading-none">WEEK</span>
                                        <span className="text-base font-black leading-none">{wk.week}</span>
                                      </div>
                                      <div className="flex-1 min-w-0 bg-gray-50 rounded-xl border border-gray-100 p-4">
                                        <div className="flex items-start justify-between gap-2 flex-wrap">
                                          <div className="min-w-0">
                                            <p className="text-[9px] font-black text-violet-500 uppercase tracking-widest mb-0.5">{wk.week}주차</p>
                                            <h4 className="text-sm font-black text-gray-900">{wk.topic || `${wk.week}주차 활동`}</h4>
                                          </div>
                                          <button
                                            onClick={() => { setWeekFilter(wk.week); setActiveTab('results'); }}
                                            className="shrink-0 flex items-center gap-1 text-[11px] font-black text-violet-600 hover:text-violet-800 transition-colors"
                                          >
                                            자세히 보기 <ArrowRight size={11} />
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-2.5 mt-2 flex-wrap text-[10px] font-bold text-gray-400">
                                          <span className="flex items-center gap-1"><Users size={10} /> 참여 {wk.participantCount}명</span>
                                          {wk.obsCount > 0 && <span className="text-violet-500">📝 활동기록 {wk.obsCount}건</span>}
                                          {wk.resultCount > 0 && <span className="text-emerald-500">📁 결과물 {wk.resultCount}건</span>}
                                        </div>
                                        {wk.sampleText && (
                                          <p className="mt-2 text-xs text-gray-600 leading-relaxed line-clamp-2 bg-white rounded-lg px-2.5 py-2 border border-gray-100">“{wk.sampleText}”</p>
                                        )}
                                        {wk.images.length > 0 && (
                                          <div className="flex gap-1.5 mt-2 overflow-x-auto custom-scrollbar pb-1">
                                            {wk.images.map((url, i) => (
                                              <img
                                                key={url}
                                                src={url}
                                                alt={`${wk.week}주차 사진 ${i + 1}`}
                                                loading="lazy"
                                                onClick={() => setLightbox({ urls: wk.images, index: i })}
                                                className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 탭 바 + 다운로드 */}
                        <div className="px-6 pt-4 pb-3 flex items-center gap-2 flex-wrap border-b border-gray-100">
                          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                            {[
                              { key: 'results', label: '결과 확인', icon: FileText },
                              { key: 'gallery', label: `갤러리${gallery.length > 0 ? ` (${gallery.length})` : ''}`, icon: Images },
                              { key: 'setech', label: '학급 기록', icon: BookOpen },
                              ...(cls.shared_survey_form_id && surveyDataByForm[cls.shared_survey_form_id] ? [{ key: 'survey', label: '설문 결과', icon: BarChart2 }] : []),
                            ].map(({ key, label, icon: Icon }) => (
                              <button
                                key={key}
                                onClick={() => setActiveTab(key as 'results' | 'gallery' | 'setech' | 'survey')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === key ? 'bg-white text-violet-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                              >
                                <Icon size={13} />{label}
                              </button>
                            ))}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5">
                            <button onClick={() => handleRefreshClass(cls.id)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all" title="새로고침">
                              <RefreshCw size={13} />
                            </button>
                            <button onClick={downloadCSV} className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-black transition-all" title="CSV 다운로드">
                              <FileText size={13} /><span className="hidden sm:inline">CSV</span>
                            </button>
                            <button onClick={downloadXLSX} disabled={downloading} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg text-xs font-black transition-all" title="XLSX 엑셀 다운로드">
                              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}<span className="hidden sm:inline">XLSX</span>
                            </button>
                          </div>
                        </div>

                        <div className="px-6 py-5 space-y-5">
                          {/* ── 결과 확인 탭 ── */}
                          {activeTab === 'results' && (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {[
                                  { label: '전체 학생', value: students.length, unit: '명', icon: Users },
                                  { label: '활동 참여', value: activeCountF, unit: '명', icon: CheckCircle2 },
                                  { label: '활동 기록', value: totalObsF, unit: '건', icon: FileText },
                                  { label: '결과물', value: totalResultsF, unit: '건', icon: FolderOpen },
                                ].map(({ label, value, unit, icon: Icon }) => (
                                  <div key={label} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Icon size={12} className="text-gray-400" />
                                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-xl font-black text-gray-900">{value}</span>
                                      <span className="text-xs font-bold text-gray-400">{unit}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 출석 요약 카드 (학급 전체 통계만, 학생별 상세 없음) */}
                              {cls.show_attendance_summary && attendanceByClass[cls.id] && attendanceByClass[cls.id].total > 0 && (
                                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">출석 요약</p>
                                  <AttendanceDonutChart total={attendanceByClass[cls.id].total} byStatus={attendanceByClass[cls.id].byStatus} />
                                </div>
                              )}

                              {allWeeks.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black text-gray-500 mr-1">주차:</span>
                                  <button onClick={() => setWeekFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === 'all' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300'}`}>전체</button>
                                  {allWeeks.map(w => (
                                    <button key={w} onClick={() => setWeekFilter(w)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === w ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300'}`}>{w}주차</button>
                                  ))}
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {filteredStudents.map(student => {
                                  const hasData = student.observations.length > 0 || student.resultGroups.length > 0;
                                  return (
                                    <button
                                      key={student.id}
                                      onClick={() => hasData && setModalStudent(student)}
                                      disabled={!hasData}
                                      className={`text-left bg-white rounded-xl border p-3.5 transition-all ${hasData ? 'border-gray-100 hover:border-violet-200 hover:shadow-sm cursor-pointer' : 'border-gray-100 opacity-50 cursor-default'}`}
                                    >
                                      <div className="w-8 h-8 rounded-full overflow-hidden mb-2.5 bg-gray-100">
                                        <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                                      </div>
                                      <p className="font-bold text-sm truncate mb-1">{student.full_name}</p>
                                      <div className="flex flex-col gap-1">
                                        {student.observations.length > 0 && <span className="text-[10px] font-bold text-violet-600">📝 활동기록 {student.observations.length}건</span>}
                                        {student.resultGroups.length > 0 && <span className="text-[10px] font-bold text-emerald-600">📁 결과물 {student.resultGroups.length}건</span>}
                                        {!hasData && <span className="text-[10px] text-gray-400">기록 없음</span>}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>

                              {filteredStudents.length === 0 && (
                                <div className="flex flex-col items-center py-16 space-y-2">
                                  <Users size={28} className="text-gray-300" />
                                  <p className="text-xs font-bold text-gray-400">등록된 학생이 없습니다</p>
                                </div>
                              )}
                            </>
                          )}

                          {/* ── 갤러리 탭 ── */}
                          {activeTab === 'gallery' && (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                {allWeeks.length > 0 && (
                                  <>
                                    <span className="text-xs font-black text-gray-500 mr-1">주차:</span>
                                    <button onClick={() => setWeekFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === 'all' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300'}`}>전체</button>
                                    {allWeeks.map(w => (
                                      <button key={w} onClick={() => setWeekFilter(w)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === w ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300'}`}>{w}주차</button>
                                    ))}
                                  </>
                                )}
                                {galleryImgs.length > 0 && (
                                  <button onClick={handleZipDownload} disabled={zipping} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-black transition-all shadow-sm">
                                    {zipping ? <><Loader2 size={13} className="animate-spin" /> ZIP 생성 중...</> : <><Download size={13} /> 전체 ZIP 다운로드 ({galleryImgs.length}장)</>}
                                  </button>
                                )}
                              </div>
                              {filteredGallery.some((g) => g.file_type === 'video') && (
                                <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-2">
                                  <AlertCircle size={11} className="shrink-0" />
                                  영상은 이 버튼으로 받아지지 않습니다. 영상을 눌러 재생 화면에서 개별적으로 다운로드해 주세요.
                                </p>
                              )}

                              {filteredGallery.length === 0 ? (
                                <div className="flex flex-col items-center py-16 space-y-2">
                                  <Images size={28} className="text-gray-300" />
                                  <p className="text-xs font-bold text-gray-400">등록된 갤러리 항목이 없습니다</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {filteredGallery.map(item => (
                                    <div key={item.id} className="relative group cursor-pointer rounded-xl overflow-hidden bg-gray-100 aspect-square">
                                      {item.file_type === 'image' ? (
                                        <div className="w-full h-full" onClick={() => {
                                          const idx = galleryImgUrls.indexOf(item.file_url);
                                          if (idx >= 0) setLightbox({ urls: galleryImgUrls, index: idx });
                                        }}>
                                          <img src={item.file_url} alt={item.caption || ''} loading="lazy" className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                                            <ZoomIn size={20} className="text-white" />
                                          </div>
                                          <button
                                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 hover:bg-violet-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
                                            onClick={e => { e.stopPropagation(); blobDownload(item.file_url, item.file_name || 'image.webp'); }}
                                            title="개별 다운로드"
                                          >
                                            <Download size={12} />
                                          </button>
                                        </div>
                                      ) : item.file_type === 'video' ? (
                                        (() => {
                                          const info = parseVideoUrl(item.file_url);
                                          return info && info.platform !== 'direct' ? (
                                            <iframe src={info.embedUrl} className="w-full h-full" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" />
                                          ) : (
                                            <video src={item.file_url} controls preload="metadata" className="w-full h-full object-cover" />
                                          );
                                        })()
                                      ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400" onClick={() => window.open(item.file_url, '_blank')}>
                                          <FileText size={24} />
                                          <p className="text-[10px] font-bold px-2 text-center truncate w-full">{item.file_name || '파일'}</p>
                                        </div>
                                      )}
                                      {item.caption && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 pointer-events-none">
                                          <p className="text-[10px] text-white truncate">{item.caption}</p>
                                        </div>
                                      )}
                                      {item.week_number && (
                                        <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md pointer-events-none">
                                          {item.week_number}주
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {classGalleryHasMore[cls.id] && (
                                <div className="flex justify-center">
                                  <button
                                    onClick={() => handleLoadMoreGallery(cls.id)}
                                    disabled={galleryLoadingMore === cls.id}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 disabled:opacity-50 text-violet-600 text-xs font-black transition-all"
                                  >
                                    {galleryLoadingMore === cls.id ? <><Loader2 size={13} className="animate-spin" /> 불러오는 중...</> : '사진 더 보기'}
                                  </button>
                                </div>
                              )}
                            </>
                          )}

                          {/* ── 학급 기록 탭 ── */}
                          {activeTab === 'setech' && (() => {
                            const setechRows = students.map(s => ({ student: s, eval: evalMap[s.id] ?? null }));
                            const doneCount = setechRows.filter(r => r.eval?.status === 'final' || r.eval?.status === 'done').length;
                            const draftCount = setechRows.filter(r => r.eval?.status === 'draft').length;
                            const emptyCount = setechRows.filter(r => !r.eval?.setech_content).length;
                            const charCounts = setechRows.map(r => (r.eval?.setech_content || '').length);
                            const avgChars = charCounts.length > 0 ? Math.round(charCounts.reduce((a, b) => a + b, 0) / charCounts.length) : 0;

                            return (
                              <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                  {[
                                    { label: '전체 학생', value: students.length, unit: '명', icon: Users },
                                    { label: '완료', value: doneCount, unit: '명', icon: CheckCircle2 },
                                    { label: '초안/미작성', value: draftCount + emptyCount, unit: '명', icon: FileText },
                                    { label: '평균 글자수', value: avgChars, unit: '자', icon: BookOpen },
                                  ].map(({ label, value, unit, icon: Icon }) => (
                                    <div key={label} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Icon size={12} className="text-gray-400" />
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                                      </div>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-gray-900">{value}</span>
                                        <span className="text-xs font-bold text-gray-400">{unit}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="space-y-2">
                                  {setechRows.map(({ student, eval: ev }) => {
                                    const setechKey = `setech_${student.id}`;
                                    const isExpandedSetech = expandedStudents.has(setechKey);
                                    const content = ev?.setech_content || '';
                                    const hasContent = !!content;
                                    const st = statusLabelStyle(ev?.status);
                                    return (
                                      <div key={student.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                        <button
                                          onClick={() => hasContent && toggleStudent(setechKey)}
                                          disabled={!hasContent}
                                          className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${hasContent ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default opacity-60'}`}
                                        >
                                          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-gray-100">
                                            <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-gray-900">{student.full_name}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                              {ev?.achievement_level && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${achLabel(ev.achievement_level)}`}>성취도 {ev.achievement_level}</span>
                                              )}
                                              {hasContent && <span className="text-[10px] font-bold text-gray-400">{content.length}자</span>}
                                            </div>
                                          </div>
                                          <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                                          {hasContent && <div className="shrink-0 text-gray-400">{isExpandedSetech ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>}
                                        </button>
                                        {isExpandedSetech && (
                                          <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {setechRows.length === 0 && (
                                  <div className="flex flex-col items-center py-16 space-y-2">
                                    <BookOpen size={28} className="text-gray-300" />
                                    <p className="text-xs font-bold text-gray-400">등록된 학생이 없습니다</p>
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {/* ── 설문 결과 탭 ── */}
                          {activeTab === 'survey' && cls.shared_survey_form_id && surveyDataByForm[cls.shared_survey_form_id] && (() => {
                            const surveyResult = surveyDataByForm[cls.shared_survey_form_id];
                            return (
                              <div className="space-y-4">
                                <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                                  <p className="font-black text-gray-900">{surveyResult.formTitle}</p>
                                  <p className="text-xs font-bold text-gray-400">총 {surveyResult.responseCount}명 응답</p>
                                </div>
                                {surveyResult.questions.map((q, i) => {
                                  const answers = surveyResult.answersByQuestion[q.id] || [];
                                  return (
                                    <div key={q.id} className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                                      <p className="font-black text-gray-900 text-sm mb-3">{i + 1}. {q.text}</p>
                                      {q.type === 'multiple_choice' && <MultipleChoiceBarChart question={q} answers={answers} />}
                                      {q.type === 'yes_no' && <YesNoPieChart answers={answers} />}
                                      {q.type === 'star_rating' && <StarRatingBarChart answers={answers} />}
                                      {q.type === 'short_text' && <ShortTextChart answers={answers} />}
                                      {q.type === 'opinion_scale' && <OpinionScaleBarChart question={q} answers={answers} />}
                                      {q.type === 'ranking' && <RankingBarChart question={q} answers={answers} />}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* 푸터 */}
                        <div className="px-6 py-3 bg-gray-50 flex items-center justify-between border-t border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <BookOpen size={12} />
                            <span>총 {students.length}명 · 기록 {students.reduce((s, st) => s + st.observations.length + st.resultGroups.length, 0)}건</span>
                          </div>
                          <a href={`/share/${cls.id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-bold text-violet-500 hover:text-violet-700 transition-all">
                            <ExternalLink size={12} /> 학급 상세 페이지 →
                          </a>
                        </div>
                      </>
                    );
                  })()}
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* 클래스로그 홍보 CTA */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 print:hidden">
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-3xl px-7 py-9 sm:px-10 sm:py-14 text-center bg-gray-900">
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 bg-white/10">
              <Sparkles size={12} style={{ color: theme.from }} />
              <span className="text-[11px] font-black" style={{ color: theme.from }}>클래스로그 AI</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black mb-2 tracking-tight text-white">
              이런 학급 공유 페이지, 우리 학교도 만들어볼까요?
            </h2>
            <p className="text-sm mb-6 text-gray-400">
              학급 관리부터 학생 결과 공유, AI 세특 작성까지 — 클래스로그 AI 하나로 끝냅니다
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-7">
              {['학교·학급 그룹 관리', '학생 활동 기록 자동 정리', 'AI 세특 초안 생성'].map(item => (
                <span key={item} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/5 text-gray-300">
                  <CheckCircle2 size={13} style={{ color: theme.from }} /> {item}
                </span>
              ))}
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-black text-white transition-all active:scale-95 shadow-lg hover:brightness-110"
              style={{ background: theme.from }}
            >
              무료로 시작하기 <ArrowRight size={16} />
            </a>
          </div>
        </motion.div>
      </div>

      <footer className="text-center py-4 text-xs text-gray-300">
        클래스로그 · 학교 프로젝트 공유 페이지
      </footer>
    </div>
  );
};

export default SchoolProjectShareView;
