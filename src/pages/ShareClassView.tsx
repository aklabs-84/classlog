import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import JSZip from 'jszip';
import { buildXlsxBlob } from '../lib/xlsxBuilder';
import type { XCell } from '../lib/xlsxBuilder';
import { supabase } from '../lib/supabase';
import { fetchPublicDriveFolderItems, driveItemToPublicGalleryItem, parseVideoUrl, isVerticalVideoUrl } from '../lib/gallery';
import Pagination from '../components/Pagination';
import { getResultImagePublicUrls } from '../components/common/ImageCarousel';
import {
  GraduationCap,
  RefreshCw,
  Users,
  FileText,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ExternalLink,
  Loader2,
  StickyNote,
  CheckCircle2,
  Download,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Images,
  Lock,
  ArrowRight,
  BookOpen,
  AlignLeft,
  Link2,
  ImageIcon,
  File as FileIcon,
  Sparkles,
  Quote,
  BarChart2,
  MousePointerClick,
} from 'lucide-react';
import { ShortTextChart } from './tools/SurveyTool';
import type { SurveyQuestion, SurveyAnswer } from './tools/SurveyTool';
import {
  AttendanceDonutChart, MultipleChoiceBarChart, YesNoPieChart, StarRatingBarChart, OpinionScaleBarChart, RankingBarChart,
} from '../components/share/ShareCharts';

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

const RingStat = ({ percent, size = 48, stroke = 5, color = '#7c3aed' }: { percent: number; size?: number; stroke?: number; color?: string }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (percent / 100) * c }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  );
};

const RESULT_TYPE_BADGE: Record<string, { icon: ReactNode; color: string; label: string }> = {
  text:  { icon: <AlignLeft size={11} />, color: 'text-primary bg-primary/10',     label: '텍스트' },
  link:  { icon: <Link2 size={11} />,     color: 'text-blue-500 bg-blue-50',       label: '링크' },
  image: { icon: <ImageIcon size={11} />, color: 'text-emerald-500 bg-emerald-50', label: '이미지' },
  file:  { icon: <FileIcon size={11} />,  color: 'text-amber-500 bg-amber-50',     label: '파일' },
};

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
};

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

interface StudentRow {
  id: string;
  full_name: string;
  student_number: number | null;
  avatar_url: string | null;
}

interface ObsRow {
  id: string;
  student_id: string;
  activity_name: string;
  content: string;
  created_at: string;
  week_number: number | null;
}

interface ResultRow {
  id: string;
  student_id: string;
  week_number: number | null;
  title: string;
  text_content: string;
  result_type: string;
  created_at: string;
  link_url?: string | null;
  file_url?: string | null;
  image_url?: string | null;
  image_urls?: string[];
  group_id?: string | null;
  is_group_submission?: boolean;
}

interface GroupRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface StudentData {
  student: StudentRow;
  obs: ObsRow[];
  results: ResultRow[];
}

interface GalleryItem {
  id: string;
  file_url: string;
  file_type: 'image' | 'video';
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

const ShareClassView = () => {
  const { classId } = useParams<{ classId: string }>();

  const reduceMotion = useReducedMotion();

  // ── 인증 상태 ──────────────────────────────────────────────────────────────
  const sessionKey = `share_verified_${classId}`;
  const codeSessionKey = `share_code_${classId}`;
  const [verified, setVerified] = useState(() => sessionStorage.getItem(`share_verified_${classId}`) === 'true');
  const [codeInput, setCodeInput] = useState('');
  // 새로고침 후에도 인증된 세션이면 업로드 검증에 쓸 입장 코드를 유지해야 함
  const [, setVerifiedCode] = useState(() => sessionStorage.getItem(`share_code_${classId}`) || '');
  const [codeError, setCodeError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // ── 클래스 메타 ────────────────────────────────────────────────────────────
  const [classInfo, setClassInfo] = useState<any>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // ── 데이터 ─────────────────────────────────────────────────────────────────
  const [studentData, setStudentData] = useState<StudentData[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, string[]>>({});
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [, setDriveFolders] = useState<{ folder_id: string; week_number: number | null }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [evalMap, setEvalMap] = useState<Record<string, EvalRow>>({});
  const [attendanceSummary, setAttendanceSummary] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [surveyResult, setSurveyResult] = useState<{ formTitle: string; questions: SurveyQuestion[]; answersByQuestion: Record<string, SurveyAnswer[]>; responseCount: number } | null>(null);

  // ── UI 상태 ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'results' | 'gallery' | 'setech' | 'survey'>('results');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [modalStudentId, setModalStudentId] = useState<string | null>(null);
  const [studentSubTab, setStudentSubTab] = useState<Record<string, 'obs' | 'results'>>({});
  const [obsPageByStudent, setObsPageByStudent] = useState<Record<string, number>>({});
  const [resultsPageByStudent, setResultsPageByStudent] = useState<Record<string, number>>({});
  const OBS_PAGE_SIZE = 1;
  const RESULTS_PAGE_SIZE = 1;
  const [weekFilter, setWeekFilter] = useState<number | 'all'>('all');
  const [resultsViewMode, setResultsViewMode] = useState<'student' | 'group'>('student');
  const [modalGroupId, setModalGroupId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; names: string[]; index: number } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [downloading, setDownloading] = useState(false);


  // ── Step 1: 클래스 메타 로드 (항상 실행) ──────────────────────────────────
  useEffect(() => {
    if (!classId) return;
    (async () => {
      setMetaLoading(true);
      const { data: cls, error } = await supabase
        .from('classes')
        .select('id, name, subject, weekly_plan, share_enabled, teacher_id, show_attendance_summary, shared_survey_form_id')
        .eq('id', classId)
        .single();

      if (error || !cls) {
        setMetaError('공유 링크가 유효하지 않거나 접근할 수 없습니다.');
      } else if (cls.share_enabled === false) {
        setMetaError('이 공유 링크는 현재 비활성화되어 있습니다.\n담당 선생님께 문의해주세요.');
      } else {
        setClassInfo(cls);
      }
      setMetaLoading(false);
    })();
  }, [classId]);

  // ── Step 2: 인증 후 전체 데이터 로드 ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!classId || !classInfo) return;
    setDataLoading(true);

    try {
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
      const topicWeekMap: Record<string, number> = {};
      ((classInfo.weekly_plan as any[]) || []).forEach((p: any) => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_number, avatar_url')
        .eq('class_id', classId)
        .order('student_number', { ascending: true });

      const studentList = (students || []).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ko'));
      const studentIds = studentList.map((s) => s.id);

      if (studentIds.length > 0) {
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
            .select('id, student_id, week_number, title, text_content, result_type, created_at, link_url, storage_path, storage_paths, group_id, is_group_submission')
            .in('student_id', studentIds)
            .order('created_at', { ascending: false }),
        ]);

        const obsWithWeek: ObsRow[] = (obs || []).map((o: any) => ({
          ...o,
          week_number: topicWeekMap[norm(o.activity_name)] ?? null,
        }));

        const resultsWithUrls: ResultRow[] = (results || []).map((r: any) => {
          let image_url: string | null = null;
          let file_url: string | null = null;
          let image_urls: string[] = [];
          if (r.result_type === 'image') {
            image_urls = getResultImagePublicUrls(supabase.storage, r);
            image_url = image_urls[0] || null;
          } else if (r.result_type === 'file' && r.storage_path) {
            const { data } = supabase.storage.from('student-attachments').getPublicUrl(r.storage_path);
            file_url = data?.publicUrl || null;
          }
          return { ...r, image_url, image_urls, file_url };
        });

          setStudentData(
          studentList.map((student) => ({
            student,
            obs: obsWithWeek.filter((o) => o.student_id === student.id),
            results: resultsWithUrls.filter((r) => r.student_id === student.id),
          }))
        );

        // 세특 (student_evaluations)
        const { data: evals } = await supabase
          .from('student_evaluations')
          .select('student_id, setech_content, achievement_level, status')
          .in('student_id', studentIds);
        const newEvalMap: Record<string, EvalRow> = {};
        (evals || []).forEach((e: any) => { newEvalMap[e.student_id] = e; });
        setEvalMap(newEvalMap);
      } else {
        setStudentData([]);
        setEvalMap({});
      }

      // 조(그룹) 목록 + 조원 매핑
      const { data: grps } = await supabase
        .from('class_groups')
        .select('id, name, color, sort_order')
        .eq('class_id', classId)
        .order('sort_order', { ascending: true });
      const groupList: GroupRow[] = grps || [];
      setGroups(groupList);

      const newGroupMembersMap: Record<string, string[]> = {};
      if (groupList.length > 0) {
        const { data: groupMembers } = await supabase
          .from('class_group_members')
          .select('group_id, student_id')
          .in('group_id', groupList.map((g) => g.id));
        (groupMembers || []).forEach((m: any) => {
          if (!newGroupMembersMap[m.group_id]) newGroupMembersMap[m.group_id] = [];
          newGroupMembersMap[m.group_id].push(m.student_id);
        });
      }
      setGroupMembersMap(newGroupMembersMap);

      // 갤러리 (업로드된 사진 + 구글 드라이브 연동 폴더)
      const [{ data: gallery }, driveResult] = await Promise.all([
        supabase
          .from('class_gallery_items')
          .select('id, file_url, file_type, file_name, caption, week_number, created_at')
          .eq('class_id', classId)
          .order('created_at', { ascending: false }),
        fetchPublicDriveFolderItems(classId).catch(() => ({ items: [], folders: [] })),
      ]);
      setGalleryItems([...(gallery || []), ...driveResult.items.map(driveItemToPublicGalleryItem)]);
      setDriveFolders(driveResult.folders);

      // 출석 요약 (교사가 공유페이지 노출을 켠 경우에만 집계)
      if (classInfo.show_attendance_summary ?? true) {
        const { data: attendanceRows } = await supabase
          .from('attendance')
          .select('status')
          .eq('class_id', classId);
        const byStatus: Record<string, number> = {};
        (attendanceRows || []).forEach((r: any) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        });
        setAttendanceSummary({ total: (attendanceRows || []).length, byStatus });
      } else {
        setAttendanceSummary(null);
      }

      // 설문 결과 (교사가 지정한 설문 1개, 응답자 식별 없이 집계만)
      if (classInfo.shared_survey_form_id) {
        const [{ data: form }, { data: questions }, { data: answers }, { count: responseCount }] = await Promise.all([
          supabase.from('survey_forms').select('title').eq('id', classInfo.shared_survey_form_id).single(),
          supabase.from('survey_questions').select('id, form_id, order_index, type, text, options').eq('form_id', classInfo.shared_survey_form_id).order('order_index', { ascending: true }),
          supabase.from('survey_answers').select('id, response_id, question_id, form_id, value').eq('form_id', classInfo.shared_survey_form_id),
          supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('form_id', classInfo.shared_survey_form_id),
        ]);
        const answersByQuestion: Record<string, SurveyAnswer[]> = {};
        (answers || []).forEach((a: any) => {
          if (!answersByQuestion[a.question_id]) answersByQuestion[a.question_id] = [];
          answersByQuestion[a.question_id].push(a);
        });
        setSurveyResult({
          formTitle: form?.title || '설문',
          questions: (questions || []) as SurveyQuestion[],
          answersByQuestion,
          responseCount: responseCount || 0,
        });
      } else {
        setSurveyResult(null);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('ShareClassView fetchData error:', err);
    } finally {
      setDataLoading(false);
    }
  }, [classId, classInfo]);

  useEffect(() => {
    if (verified && classInfo) fetchData();
  }, [verified, classInfo, fetchData]);

  // ── 입장 코드 확인 (서버 RPC로 검증) ─────────────────────────────────────
  const handleVerify = async () => {
    if (!classInfo) return;
    setVerifying(true);
    setCodeError('');
    const { data: isValid } = await supabase.rpc('verify_class_entry_code', {
      p_class_id: classInfo.id,
      p_code:     codeInput.trim(),
    });
    if (isValid) {
      sessionStorage.setItem(sessionKey, 'true');
      sessionStorage.setItem(codeSessionKey, codeInput.trim());
      setVerifiedCode(codeInput.trim());
      setVerified(true);
    } else {
      setCodeError('입장 코드가 올바르지 않습니다. 담당 선생님께 확인해 주세요.');
    }
    setVerifying(false);
  };


  const allWeeks = useMemo(() =>
    Array.from(new Set([
      ...studentData.flatMap((sd) => sd.obs.map((o) => o.week_number).filter(Boolean)),
      ...studentData.flatMap((sd) => sd.results.map((r) => r.week_number).filter(Boolean)),
    ] as number[])).sort((a, b) => a - b),
    [studentData]
  );

  const filteredData = useMemo(() =>
    studentData.map((sd) => ({
      ...sd,
      obs: weekFilter === 'all' ? sd.obs : sd.obs.filter((o) => o.week_number === weekFilter),
      results: weekFilter === 'all' ? sd.results : sd.results.filter((r) => r.week_number === weekFilter),
    })),
    [studentData, weekFilter]
  );

  const filteredGallery = useMemo(() =>
    weekFilter === 'all' ? galleryItems : galleryItems.filter((g) => g.week_number === weekFilter),
    [galleryItems, weekFilter]
  );

  const studentById = useMemo(() => {
    const map: Record<string, StudentRow> = {};
    studentData.forEach((sd) => { map[sd.student.id] = sd.student; });
    return map;
  }, [studentData]);

  const groupsWithMembers = useMemo(() =>
    groups.map((g) => ({
      group: g,
      students: (groupMembersMap[g.id] || [])
        .map((sid) => studentById[sid])
        .filter(Boolean)
        .sort((a, b) => (a.student_number ?? 0) - (b.student_number ?? 0)),
    })),
    [groups, groupMembersMap, studentById]
  );

  // 조별 제출은 조원 수만큼 행이 복제되므로 group_id+created_at+result_type 기준으로 중복 제거
  const groupResultsMap = useMemo(() => {
    const map: Record<string, ResultRow[]> = {};
    const seen = new Set<string>();
    for (const sd of filteredData) {
      for (const r of sd.results) {
        if (!r.is_group_submission || !r.group_id) continue;
        const dedupeKey = `${r.group_id}_${r.created_at}_${r.result_type}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        if (!map[r.group_id]) map[r.group_id] = [];
        map[r.group_id].push(r);
      }
    }
    Object.values(map).forEach((arr) => arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    return map;
  }, [filteredData]);

  const totalObs = filteredData.reduce((a, sd) => a + sd.obs.length, 0);
  const totalResults = filteredData.reduce((a, sd) => a + sd.results.length, 0);
  const activeCount = filteredData.filter((sd) => sd.obs.length > 0 || sd.results.length > 0).length;
  const setechDoneCount = useMemo(() =>
    studentData.filter((sd) => {
      const ev = evalMap[sd.student.id];
      return ev?.status === 'done' || ev?.status === 'final';
    }).length,
    [studentData, evalMap]
  );

  const spotlightQuotes = useMemo(() => {
    const byStudent = new Map<string, { student: StudentRow; content: string }[]>();
    for (const sd of studentData) {
      for (const o of sd.obs) {
        const text = (o.content || '').trim();
        if (text.length < 20 || text.length > 220) continue;
        const arr = byStudent.get(sd.student.id) ?? [];
        arr.push({ student: sd.student, content: text });
        byStudent.set(sd.student.id, arr);
      }
    }
    const perStudent = Array.from(byStudent.values()).map(arr => arr[Math.floor(Math.random() * arr.length)]);
    for (let i = perStudent.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perStudent[i], perStudent[j]] = [perStudent[j], perStudent[i]];
    }
    return perStudent.slice(0, 3);
  }, [studentData]);

  const [spotlightIndex, setSpotlightIndex] = useState(0);
  useEffect(() => { setSpotlightIndex(0); }, [spotlightQuotes.length]);
  useEffect(() => {
    if (reduceMotion || spotlightQuotes.length <= 1) return;
    const timer = setInterval(() => {
      setSpotlightIndex((i) => (i + 1) % spotlightQuotes.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [reduceMotion, spotlightQuotes.length]);

  const snapshotResults = useMemo(() => {
    const byStudent = new Map<string, { student: StudentRow; result: ResultRow }[]>();
    for (const sd of studentData) {
      for (const r of sd.results) {
        const arr = byStudent.get(sd.student.id) ?? [];
        arr.push({ student: sd.student, result: r });
        byStudent.set(sd.student.id, arr);
      }
    }
    const perStudent = Array.from(byStudent.values()).map((arr) => arr[Math.floor(Math.random() * arr.length)]);
    for (let i = perStudent.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perStudent[i], perStudent[j]] = [perStudent[j], perStudent[i]];
    }
    return perStudent.slice(0, 3);
  }, [studentData]);

  const [snapshotIndex, setSnapshotIndex] = useState(0);
  useEffect(() => { setSnapshotIndex(0); }, [snapshotResults.length]);
  useEffect(() => {
    if (reduceMotion || snapshotResults.length <= 1) return;
    const timer = setInterval(() => {
      setSnapshotIndex((i) => (i + 1) % snapshotResults.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [reduceMotion, snapshotResults.length]);

  const allGalleryImgs = filteredGallery.filter((g) => g.file_type === 'image');
  const allGalleryImgUrls = allGalleryImgs.map((g) => g.file_url);
  const allGalleryImgNames = allGalleryImgs.map((g, i) => g.file_name || `image_${i + 1}.webp`);
  const handleZipDownload = async () => {
    if (zipping || allGalleryImgs.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        allGalleryImgs.map(async (item, i) => {
          const res = await fetch(item.file_url);
          const blob = await res.blob();
          // 드라이브 연동 이미지는 file_url이 확장자 없는 프록시 주소(/api/drive-file?...)라
          // Content-Type/파일명 기준으로 확장자를 판별해야 함 (그렇지 않으면 파일명에 '/'가
          // 섞여 zip 안에 엉뚱한 폴더 구조가 생김)
          const ext =
            CONTENT_TYPE_EXT[(res.headers.get('content-type') || '').split(';')[0].trim()] ||
            item.file_name?.match(/\.([a-zA-Z0-9]+)$/)?.[1] ||
            item.file_url.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1] ||
            'jpg';
          const baseName = (item.file_name?.replace(/\.[^./]+$/, '') || `image_${i + 1}`).replace(/[\\/]/g, '_');
          const name = `${String(i + 1).padStart(3, '0')}_${baseName}.${ext}`;
          zip.file(name, blob);
        })
      );
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const label = weekFilter === 'all' ? '전체' : `${weekFilter}주차`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${classInfo?.name || '갤러리'}_${label}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setZipping(false);
    }
  };


  // ── XLSX / CSV 다운로드 ────────────────────────────────────────────────────
  const downloadXLSX = async () => {
    setDownloading(true);
    try {
      const className = classInfo?.name || '클래스';
      const sl = (s?: string | null) => (s === 'done' || s === 'final' ? '완료' : s === 'draft' ? '초안' : '미작성');

      // 시트 1: 전체학생
      const sheet1Rows: XCell[][] = [
        [
          { value: '번호', style: 'header' }, { value: '이름', style: 'header' },
          { value: '활동기록 수', style: 'header' }, { value: '결과물 수', style: 'header' },
          { value: '성취도', style: 'header' },
        ],
        ...studentData.map(({ student, obs, results }) => {
          const ev = evalMap[student.id];
          return [
            { value: student.student_number ?? null },
            { value: student.full_name },
            { value: obs.length },
            { value: results.length },
            { value: ev?.achievement_level ?? '' },
          ] as XCell[];
        }),
      ];

      // 시트 2~N: 학생별 개별 시트 (1학생 = 1시트)
      const studentSheets = studentData.map(({ student, obs, results }) => {
        const sheetName = `${student.student_number ?? '?'}. ${student.full_name}`
          .replace(/[/\\?*[\]:]/g, '_')
          .slice(0, 31);
        const label = `${student.student_number != null ? student.student_number + '번 ' : ''}${student.full_name}`;
        const rows: (XCell | null)[][] = [];

        // 학생 이름 헤더
        rows.push([{ value: label, span: 4, style: 'section' }, null, null, null]);
        rows.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }]);

        if (obs.length === 0 && results.length === 0) {
          rows.push([{ value: '제출 없음', span: 4 }, null, null, null]);
        } else {
          if (obs.length > 0) {
            rows.push([{ value: '활동기록', span: 4, style: 'section' }, null, null, null]);
            rows.push([
              { value: '주차', style: 'header' }, { value: '활동명', style: 'header' },
              { value: '내용', style: 'header' }, { value: '날짜', style: 'header' },
            ]);
            obs.forEach((o) => {
              rows.push([
                { value: o.week_number != null ? `${o.week_number}주차` : '' },
                { value: o.activity_name || '' },
                { value: o.content, style: 'wrap' },
                { value: new Date(o.created_at).toLocaleDateString('ko-KR') },
              ]);
            });
            rows.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }]);
          }
          if (results.length > 0) {
            rows.push([{ value: '결과제출', span: 4, style: 'section' }, null, null, null]);
            rows.push([
              { value: '주차', style: 'header' }, { value: '제목', style: 'header' },
              { value: '내용', style: 'header' }, { value: '날짜', style: 'header' },
            ]);
            results.forEach((r) => {
              const ct = r.text_content || (r.link_url ? `링크: ${r.link_url}` : r.file_url ? '파일 첨부' : r.image_url ? '이미지 첨부' : '');
              rows.push([
                { value: r.week_number != null ? `${r.week_number}주차` : '' },
                { value: r.title || '' },
                { value: ct, style: 'wrap' },
                { value: new Date(r.created_at).toLocaleDateString('ko-KR') },
              ]);
            });
          }
        }

        return { name: sheetName, colWidths: [10, 22, 55, 14], rows };
      });

      // 마지막 시트: 학생 기록 (세특)
      const sheet3Rows: XCell[][] = [
        [
          { value: '번호', style: 'header' }, { value: '이름', style: 'header' },
          { value: '성취도', style: 'header' }, { value: '상태', style: 'header' },
          { value: '세특 문장', style: 'header' }, { value: '글자수', style: 'header' },
        ],
        ...studentData.map(({ student }) => {
          const ev = evalMap[student.id];
          const content = ev?.setech_content || '';
          return [
            { value: student.student_number ?? null },
            { value: student.full_name },
            { value: ev?.achievement_level ?? '' },
            { value: sl(ev?.status) },
            { value: content, style: 'wrap' },
            { value: content.length },
          ] as XCell[];
        }),
      ];

      const todayStr = new Date()
        .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\. /g, '').replace(/\.$/, '');

      const blob = await buildXlsxBlob([
        { name: '전체학생', colWidths: [6, 14, 13, 12, 10], rows: sheet1Rows },
        ...studentSheets,
        { name: '학생 기록', colWidths: [6, 14, 10, 10, 65, 10], rows: sheet3Rows },
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${className}_학생기록_${todayStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('XLSX 다운로드 오류:', err);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const downloadCSV = () => {
    const className = classInfo?.name || '클래스';
    const headers = ['번호', '이름', '활동기록 수', '결과물 수', '세특 상태', '성취도', '세특 글자수'];
    const rows = studentData.map(({ student, obs, results }) => {
      const ev = evalMap[student.id];
      const sl = ev?.status === 'done' || ev?.status === 'final' ? '완료' : ev?.status === 'draft' ? '초안' : '미작성';
      return [
        student.student_number ?? '',
        student.full_name,
        obs.length,
        results.length,
        sl,
        ev?.achievement_level ?? '',
        (ev?.setech_content || '').length,
      ];
    });
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const todayStr = new Date()
      .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\. /g, '').replace(/\.$/, '');
    a.download = `${className}_전체학생_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 로딩 / 에러 ───────────────────────────────────────────────────────────
  if (metaLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-indigo-500" />
          <p className="text-sm font-semibold text-gray-500">확인 중...</p>
        </div>
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-black text-gray-800">접근할 수 없습니다</h2>
          <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{metaError}</p>
        </div>
      </div>
    );
  }

  // ── 입장 코드 화면 ────────────────────────────────────────────────────────
  if (!verified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6">
          {/* 카드 */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-7 text-center">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock size={26} className="text-white" />
              </div>
              <h1 className="text-white font-black text-lg leading-tight">
                {classInfo?.name}
                {classInfo?.subject ? ` · ${classInfo.subject}` : ''}
              </h1>
              <p className="text-indigo-200 text-xs font-semibold mt-1">선생님 공유 보기</p>
            </div>

            <div className="px-8 py-7 space-y-5">
              <p className="text-sm text-gray-600 text-center leading-relaxed">
                담당 선생님께 받은 <span className="font-black text-indigo-600">입장 코드</span>를<br />
                입력해 주세요.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCodeError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  placeholder="입장 코드 (예: AB1C2D)"
                  maxLength={10}
                  className={`w-full px-4 py-3.5 text-center text-xl font-black tracking-[0.3em] rounded-2xl border-2 outline-none transition-all ${
                    codeError
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-gray-200 focus:border-indigo-400 bg-gray-50 text-gray-900'
                  }`}
                />
                {codeError && (
                  <p className="text-xs text-red-500 font-semibold text-center">{codeError}</p>
                )}

                <button
                  onClick={handleVerify}
                  disabled={!codeInput.trim() || verifying}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200"
                >
                  {verifying
                    ? <Loader2 size={18} className="animate-spin" />
                    : <><span>입장하기</span><ArrowRight size={16} /></>
                  }
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-400 font-semibold">
            클래스로그 AI — 수업 기록부터 세특까지
          </p>
        </div>
      </div>
    );
  }

  // ── 메인 뷰 ───────────────────────────────────────────────────────────────
  const printImages = filteredGallery.filter((g) => g.file_type === 'image');
  const filterLabel = weekFilter === 'all' ? '전체' : `${weekFilter}주차`;
  const printToday = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
    <div className="min-h-screen bg-gray-50 font-sans print:hidden">
      {/* 헤더 */}
      <div className="print:hidden">
        {/* 히어로 배너 */}
        <div className="relative overflow-hidden bg-white">
          <motion.div
            className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8"
            initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-3 mb-8">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                  <GraduationCap size={22} className="text-violet-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-sm sm:text-base font-black text-gray-500 truncate">
                      {classInfo?.name}
                      {classInfo?.subject ? ` · ${classInfo.subject}` : ''}
                    </h1>
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 bg-violet-50 text-violet-600 rounded-full border border-violet-100">
                      선생님 공유 보기
                    </span>
                  </div>
                  {lastUpdated && (
                    <p className="text-[11px] text-gray-400 font-semibold mt-1">
                      {lastUpdated.toLocaleString('ko-KR')} 기준
                    </p>
                  )}
                </div>
              </div>
              <a
                href="/"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 transition-all border border-gray-200 hover:border-violet-200 hover:bg-violet-50"
              >
                <Sparkles size={12} className="text-violet-600" />
                <span className="text-[11px] font-black text-gray-600">Powered by 클래스로그 AI</span>
              </a>
            </div>

            {/* 리드 통계 */}
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl sm:text-7xl font-black tracking-tight tabular-nums text-gray-900">
                <CountUpNumber value={studentData.length} />
              </span>
              <span className="text-base sm:text-lg font-bold text-gray-400">명의 학생이 참여 중</span>
            </div>
          </motion.div>
        </div>

        {/* 통합 통계 대시보드 카드 */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-2 bg-white">
          {(() => {
            const participationRate = studentData.length > 0 ? Math.round((activeCount / studentData.length) * 100) : 0;
            const navCards = [
              { key: 'results' as const, label: '결과물', value: totalResults, unit: '건', icon: FolderOpen, color: 'blue' as const },
              { key: 'gallery' as const, label: '갤러리', value: galleryItems.length, unit: '장', icon: Images, color: 'emerald' as const },
              { key: 'setech' as const, label: '학생 기록', value: setechDoneCount, unit: '건', icon: BookOpen, color: 'amber' as const },
              ...(surveyResult ? [{ key: 'survey' as const, label: '설문 결과', value: surveyResult.responseCount, unit: '명', icon: BarChart2, color: 'pink' as const }] : []),
            ];
            const maxNavValue = Math.max(1, ...navCards.map((c) => c.value));
            const colorMap = {
              blue: { tint: 'bg-blue-50', ink: 'text-blue-600', border: 'border-blue-100', bar: 'bg-blue-400' },
              emerald: { tint: 'bg-emerald-50', ink: 'text-emerald-600', border: 'border-emerald-100', bar: 'bg-emerald-400' },
              amber: { tint: 'bg-amber-50', ink: 'text-amber-600', border: 'border-amber-100', bar: 'bg-amber-400' },
              pink: { tint: 'bg-pink-50', ink: 'text-pink-600', border: 'border-pink-100', bar: 'bg-pink-400' },
            };
            const goTo = (key: typeof activeTab) => {
              setActiveTab(key);
              document.getElementById('main-content')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
            };
            return (
              <>
                <p className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-3">
                  <MousePointerClick size={13} className="text-gray-300" />
                  카드를 클릭하면 자세한 내용을 볼 수 있어요
                </p>
                <div className={`grid grid-cols-2 gap-3 ${navCards.length === 4 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                {/* 참여율 카드 (링 차트) */}
                <motion.button
                  onClick={() => goTo('results')}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  className="text-left rounded-2xl border border-violet-100 bg-violet-50 p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  <RingStat percent={participationRate} color="#7c3aed" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-0.5">활동 참여</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-gray-900"><CountUpNumber value={participationRate} /></span>
                      <span className="text-xs font-bold text-gray-400">%</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400">{activeCount}/{studentData.length}명</p>
                  </div>
                </motion.button>

                {navCards.map(({ key, label, value, unit, icon: Icon, color }, i) => {
                  const c = colorMap[color];
                  const filled = value > 0;
                  const barPct = Math.round((value / maxNavValue) * 100);
                  return (
                    <motion.button
                      key={label}
                      onClick={() => goTo(key)}
                      initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.4, delay: (i + 1) * 0.06, ease: 'easeOut' }}
                      whileHover={reduceMotion ? undefined : { y: -4 }}
                      className={`text-left rounded-2xl border p-4 transition-shadow ${filled ? `${c.tint} ${c.border} shadow-sm hover:shadow-md` : 'bg-white border-gray-100'}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${filled ? 'bg-white/70' : 'bg-gray-50'}`}>
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
                          transition={{ duration: 0.6, delay: (i + 1) * 0.06, ease: 'easeOut' }}
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

        {/* 스포트라이트 인용구 (자동 슬라이드 캐러셀) */}
        {spotlightQuotes.length > 0 && (
          <div className="border-t border-b border-gray-100 bg-violet-50/40 overflow-hidden">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
              <Quote size={26} className="text-violet-300 mb-3" />
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
                    {classInfo?.name} · {spotlightQuotes[spotlightIndex].student.full_name}
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
                      className={`h-1.5 rounded-full transition-all ${i === spotlightIndex ? 'w-6 bg-violet-500' : 'w-1.5 bg-violet-200 hover:bg-violet-300'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 탭 바 + 다운로드 */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {[
                { key: 'results', label: '결과 확인', icon: FileText },
                { key: 'gallery', label: `갤러리${galleryItems.length > 0 ? ` (${galleryItems.length})` : ''}`, icon: Images },
                { key: 'setech', label: '학생 기록', icon: BookOpen },
                ...(surveyResult ? [{ key: 'survey', label: '설문 결과', icon: BarChart2 }] : []),
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as 'results' | 'gallery' | 'setech' | 'survey')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    activeTab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={fetchData}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all"
                title="새로고침"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-black transition-all"
                title="CSV 다운로드"
              >
                <FileText size={15} />
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={downloadXLSX}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-all"
                title="XLSX 엑셀 다운로드"
              >
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                <span className="hidden sm:inline">XLSX</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-sm font-semibold text-gray-400">데이터 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* ── 결과 확인 탭 ── */}
          {activeTab === 'results' && (
            <>
              {/* 결과물 스냅샷 카드 (랜덤 3개 스포트라이트 슬라이드) */}
              {snapshotResults.length > 0 && (() => {
                const { student, result: r } = snapshotResults[snapshotIndex];
                const url = r.link_url || r.image_url || r.file_url || null;
                const cardInner = (
                  <>
                    <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                      {r.image_url
                        ? <ImageIcon size={18} className="text-violet-500" />
                        : r.link_url
                          ? <Link2 size={18} className="text-violet-500" />
                          : r.file_url
                            ? <FileIcon size={18} className="text-violet-500" />
                            : <AlignLeft size={18} className="text-violet-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-gray-900 text-sm truncate">{r.title || '제목 없음'}</p>
                      <p className="text-xs text-gray-400 font-semibold truncate">
                        {student.full_name} · {new Date(r.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    {RESULT_TYPE_BADGE[r.result_type] && (
                      <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full ${RESULT_TYPE_BADGE[r.result_type].color}`}>
                        {RESULT_TYPE_BADGE[r.result_type].icon}
                        {RESULT_TYPE_BADGE[r.result_type].label}
                      </span>
                    )}
                    {url && <ExternalLink size={14} className="text-gray-300 shrink-0" />}
                  </>
                );
                return (
                  <div className="print:hidden">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${student.id}-${r.id}`}
                        initial={reduceMotion ? undefined : { opacity: 0, x: 16 }}
                        animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      >
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-violet-200 hover:shadow-sm transition-all"
                          >
                            {cardInner}
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4">
                            {cardInner}
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                    {snapshotResults.length > 1 && (
                      <div className="flex items-center gap-1.5 mt-2.5 px-1">
                        {snapshotResults.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setSnapshotIndex(i)}
                            aria-label={`${i + 1}번째 결과물 보기`}
                            className={`h-1.5 rounded-full transition-all ${i === snapshotIndex ? 'w-6 bg-violet-500' : 'w-1.5 bg-violet-200 hover:bg-violet-300'}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 출석 요약 카드 (학급 전체 통계만, 학생별 상세 없음) */}
              {attendanceSummary && attendanceSummary.total > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 print:hidden">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">출석 요약</p>
                  <AttendanceDonutChart total={attendanceSummary.total} byStatus={attendanceSummary.byStatus} />
                </div>
              )}

              {/* 주차 필터 */}
              {allWeeks.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap print:hidden">
                  <span className="text-xs font-black text-gray-500 mr-1">주차:</span>
                  <button
                    onClick={() => setWeekFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                      weekFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    전체
                  </button>
                  {allWeeks.map((w) => (
                    <button
                      key={w}
                      onClick={() => setWeekFilter(w)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                        weekFilter === w ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      {w}주차
                    </button>
                  ))}
                </div>
              )}

              {/* 학생별 / 조별 보기 전환 */}
              {groupsWithMembers.length > 0 && (
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit print:hidden">
                  {[
                    { key: 'student' as const, label: '학생별' },
                    { key: 'group' as const, label: `조별 (${groupsWithMembers.length})` },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setResultsViewMode(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                        resultsViewMode === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* 학생 목록 */}
              {resultsViewMode === 'student' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredData.map(({ student, obs, results }, i) => {
                    const hasActivity = obs.length > 0 || results.length > 0;
                    return (
                      <motion.button
                        key={student.id}
                        onClick={() => hasActivity && setModalStudentId(student.id)}
                        disabled={!hasActivity}
                        initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: 'easeOut' }}
                        whileHover={hasActivity && !reduceMotion ? { y: -4 } : undefined}
                        className={`text-left bg-white rounded-2xl border shadow-sm p-4 transition-all ${hasActivity ? 'border-gray-200 hover:shadow-md cursor-pointer' : 'border-gray-100 opacity-50 cursor-default'}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-gray-100">
                            <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                          </div>
                          {hasActivity && <ChevronRight size={15} className="text-gray-300" />}
                        </div>
                        <p className="font-black text-gray-900 text-sm truncate mb-1.5">{student.full_name}</p>
                        <div className="flex flex-col gap-1">
                          {obs.length > 0 && <span className="text-[10px] font-bold text-violet-600">📝 활동 기록 {obs.length}건</span>}
                          {results.length > 0 && <span className="text-[10px] font-bold text-emerald-600">📁 결과물 {results.length}건</span>}
                          {!hasActivity && <span className="text-[10px] font-bold text-gray-400">미제출</span>}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {resultsViewMode === 'student' && filteredData.length === 0 && (
                <div className="flex flex-col items-center py-20 space-y-3">
                  <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
                    <StickyNote size={32} className="text-gray-300" />
                  </div>
                  <p className="font-black text-gray-400 text-sm">등록된 학생이 없습니다</p>
                </div>
              )}

              {/* 조 목록 */}
              {resultsViewMode === 'group' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {groupsWithMembers.map(({ group, students }, i) => {
                    const resultCount = (groupResultsMap[group.id] || []).length;
                    return (
                      <motion.button
                        key={group.id}
                        onClick={() => setModalGroupId(group.id)}
                        initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: 'easeOut' }}
                        whileHover={!reduceMotion ? { y: -4 } : undefined}
                        className="text-left bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: group.color + '18' }}>
                            <Users size={16} style={{ color: group.color }} />
                          </div>
                          <ChevronRight size={15} className="text-gray-300" />
                        </div>
                        <p className="font-black text-gray-900 text-sm truncate mb-1.5">{group.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 truncate mb-1.5">
                          {students.length > 0 ? students.map((s) => s.full_name).join(' · ') : '조원 없음'}
                        </p>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-gray-400">👥 조원 {students.length}명</span>
                          {resultCount > 0
                            ? <span className="text-[10px] font-bold text-emerald-600">📁 조별 결과물 {resultCount}건</span>
                            : <span className="text-[10px] font-bold text-gray-400">조별 제출 없음</span>}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {resultsViewMode === 'group' && groupsWithMembers.length === 0 && (
                <div className="flex flex-col items-center py-20 space-y-3">
                  <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
                    <Users size={32} className="text-gray-300" />
                  </div>
                  <p className="font-black text-gray-400 text-sm">등록된 조가 없습니다</p>
                </div>
              )}
            </>
          )}

          {/* ── 갤러리 탭 ── */}
          {activeTab === 'gallery' && (
            <>
              {/* 주차 필터 + ZIP 다운로드 */}
              <div className="flex items-center gap-2 flex-wrap">
                {allWeeks.length > 0 && (
                  <>
                    <span className="text-xs font-black text-gray-500 mr-1">주차:</span>
                    <button
                      onClick={() => setWeekFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'}`}
                    >
                      전체
                    </button>
                    {allWeeks.map((w) => (
                      <button key={w} onClick={() => setWeekFilter(w)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === w ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'}`}
                      >
                        {w}주차
                      </button>
                    ))}
                  </>
                )}
                {allGalleryImgs.length > 0 && (
                  <button
                    onClick={handleZipDownload}
                    disabled={zipping}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black transition-all shadow-sm"
                  >
                    {zipping
                      ? <><Loader2 size={13} className="animate-spin" /> ZIP 생성 중...</>
                      : <><Download size={13} /> 전체 ZIP 다운로드 ({allGalleryImgs.length}장)</>
                    }
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
                <div className="flex flex-col items-center py-24 space-y-3">
                  <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
                    <Images size={32} className="text-gray-300" />
                  </div>
                  <p className="font-black text-gray-400 text-sm">등록된 갤러리 항목이 없습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredGallery.map((item) =>
                    item.file_type === 'video' ? (
                      <ShareGalleryVideo key={item.id} item={item} />
                    ) : (
                      <div
                        key={item.id}
                        className="relative group cursor-pointer aspect-square rounded-2xl overflow-hidden bg-gray-100 shadow-sm hover:shadow-md transition-all"
                        onClick={() => setLightbox({ urls: allGalleryImgUrls, names: allGalleryImgNames, index: allGalleryImgUrls.indexOf(item.file_url) })}
                      >
                        <img src={item.file_url} alt={item.caption || item.file_name || '갤러리'} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <ZoomIn size={22} className="text-white" />
                        </div>
                        <button
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-indigo-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => { e.stopPropagation(); blobDownload(item.file_url, item.file_name || 'image.webp'); }}
                          title="개별 다운로드"
                        >
                          <Download size={13} />
                        </button>
                        {(item.caption || item.week_number) && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.week_number && <p className="text-[10px] font-bold text-white/80">{item.week_number}주차</p>}
                            {item.caption && <p className="text-xs font-semibold text-white truncate">{item.caption}</p>}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 세특 현황 탭 ── */}
          {activeTab === 'setech' && (() => {
            const setechRows = studentData.map((sd) => ({
              student: sd.student,
              eval: evalMap[sd.student.id] ?? null,
            }));
            const doneCount = setechRows.filter((r) => r.eval?.status === 'done' || r.eval?.status === 'final').length;
            const draftCount = setechRows.filter((r) => r.eval?.status === 'draft').length;
            const emptyCount = setechRows.filter((r) => !r.eval?.setech_content).length;
            const charCounts = setechRows.map((r) => (r.eval?.setech_content || '').length);
            const avgChars = charCounts.length > 0 ? Math.round(charCounts.reduce((a, b) => a + b, 0) / charCounts.length) : 0;

            const statusLabel = (s: string | null | undefined) => {
              if (s === 'done' || s === 'final') return { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
              if (s === 'draft') return { label: '초안', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
              return { label: '미작성', cls: 'bg-gray-100 text-gray-400 border-gray-200' };
            };
            const achLabel = (a: string | null | undefined) => {
              if (a === '상') return 'bg-blue-100 text-blue-700';
              if (a === '중') return 'bg-yellow-100 text-yellow-700';
              if (a === '하') return 'bg-red-100 text-red-700';
              return 'bg-gray-100 text-gray-400';
            };

            return (
              <>
                {/* 통계 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: '전체 학생', value: studentData.length, unit: '명', icon: Users },
                    { label: '완료', value: doneCount, unit: '명', icon: CheckCircle2 },
                    { label: '초안/미작성', value: draftCount + emptyCount, unit: '명', icon: FileText },
                    { label: '평균 글자수', value: avgChars, unit: '자', icon: BookOpen },
                  ].map(({ label, value, unit, icon: Icon }) => (
                    <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon size={13} className="text-gray-400" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-gray-900">{value}</span>
                        <span className="text-sm font-bold text-gray-400">{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 학생 세특 목록 */}
                <div className="space-y-2">
                  {setechRows.map(({ student, eval: ev }) => {
                    const isExpanded = expandedIds.has(`setech_${student.id}`);
                    const content = ev?.setech_content || '';
                    const hasContent = !!content;
                    const st = statusLabel(ev?.status);
                    return (
                      <div key={student.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <button
                          onClick={() => {
                            if (!hasContent) return;
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              const k = `setech_${student.id}`;
                              if (next.has(k)) next.delete(k); else next.add(k);
                              return next;
                            });
                          }}
                          disabled={!hasContent}
                          className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${hasContent ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default opacity-60'}`}
                        >
                          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-gray-100">
                            <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-gray-900 text-sm">{student.full_name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {ev?.achievement_level && (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${achLabel(ev.achievement_level)}`}>
                                  성취도 {ev.achievement_level}
                                </span>
                              )}
                              {hasContent && (
                                <span className="text-[10px] font-bold text-gray-400">{content.length}자</span>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                          {hasContent && <div className="shrink-0 text-gray-400">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {setechRows.length === 0 && (
                  <div className="flex flex-col items-center py-20 space-y-3">
                    <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
                      <BookOpen size={32} className="text-gray-300" />
                    </div>
                    <p className="font-black text-gray-400 text-sm">등록된 학생이 없습니다</p>
                  </div>
                )}
              </>
            );
          })()}

          {/* ── 설문 결과 탭 (교사가 지정한 설문 1개, 집계만 노출) ── */}
          {activeTab === 'survey' && surveyResult && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                <p className="font-black text-gray-900">{surveyResult.formTitle}</p>
                <p className="text-xs font-bold text-gray-400">총 {surveyResult.responseCount}명 응답</p>
              </div>
              {surveyResult.questions.map((q, i) => {
                const answers = surveyResult.answersByQuestion[q.id] || [];
                return (
                  <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-5">
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
          )}

          {/* 학교 도입 유도 배너 */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-14 print:hidden bg-gray-900"
          >
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-black text-violet-300 mb-4">
                <Sparkles size={12} />
                클래스로그 AI
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-white leading-snug mb-2 tracking-tight">
                이런 학급 공유 페이지, 우리 학교도<br className="hidden sm:block" /> 만들어볼까요?
              </h3>
              <p className="text-sm text-gray-400 font-semibold mb-5">
                학급 활동 기록부터 세특 작성까지, 클래스로그 AI가 도와드립니다
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                {['학교 그룹 관리', '교사 계정 연동', '학급 공유 URL 발급'].map((item) => (
                  <span key={item} className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
                    <CheckCircle2 size={14} className="text-violet-400" />
                    {item}
                  </span>
                ))}
              </div>
              <a
                href="/school-intro"
                className="inline-flex items-center gap-2 px-5 py-3 bg-violet-500 hover:bg-violet-400 rounded-2xl text-sm font-black text-white transition-all active:scale-95"
              >
                무료로 시작하기
                <ArrowRight size={16} />
              </a>
            </div>
          </motion.div>

          {/* 푸터 */}
          <div className="text-center pt-4 pb-8 print:pt-8">
            <p className="text-[10px] text-gray-300 font-semibold">
              클래스로그 AI — 선생님 공유 보기 · {new Date().getFullYear()}
            </p>
          </div>
        </main>
      )}

      {/* 학생 상세 모달 */}
      <AnimatePresence>
        {modalStudentId && (() => {
          const entry = filteredData.find((d) => d.student.id === modalStudentId);
          if (!entry) return null;
          const { student, obs, results } = entry;
          const subTab = studentSubTab[student.id] ?? (obs.length > 0 ? 'obs' : 'results');

          const obsTotalPages = Math.max(1, Math.ceil(obs.length / OBS_PAGE_SIZE));
          const obsSafePage = Math.min(obsPageByStudent[student.id] ?? 1, obsTotalPages);
          const pagedObs = obs.slice((obsSafePage - 1) * OBS_PAGE_SIZE, obsSafePage * OBS_PAGE_SIZE);

          const resultsTotalPages = Math.max(1, Math.ceil(results.length / RESULTS_PAGE_SIZE));
          const resultsSafePage = Math.min(resultsPageByStudent[student.id] ?? 1, resultsTotalPages);
          const pagedResults = results.slice((resultsSafePage - 1) * RESULTS_PAGE_SIZE, resultsSafePage * RESULTS_PAGE_SIZE);

          return (
            <motion.div
              key="student-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setModalStudentId(null)}
            >
              <motion.div
                initial={reduceMotion ? undefined : { y: 24, opacity: 0 }}
                animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
                exit={reduceMotion ? undefined : { y: 24, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
                  <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-gray-100">
                    <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                  </div>
                  <p className="font-black text-gray-900 text-sm flex-1 min-w-0 truncate">{student.full_name}</p>
                  <button onClick={() => setModalStudentId(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors shrink-0">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex gap-1 px-5 pt-3 shrink-0">
                  <button
                    onClick={() => setStudentSubTab((prev) => ({ ...prev, [student.id]: 'obs' }))}
                    disabled={obs.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      subTab === 'obs' ? 'bg-violet-100 text-violet-700 border border-violet-200' : 'bg-white text-gray-400 border border-gray-200 hover:text-gray-600'
                    }`}
                  >
                    📝 활동 기록 {obs.length}건
                  </button>
                  <button
                    onClick={() => setStudentSubTab((prev) => ({ ...prev, [student.id]: 'results' }))}
                    disabled={results.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      subTab === 'results' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-white text-gray-400 border border-gray-200 hover:text-gray-600'
                    }`}
                  >
                    📁 결과물 {results.length}건
                  </button>
                </div>

                <div className="px-5 py-4 space-y-3 overflow-y-auto">
                  {subTab === 'obs' && pagedObs.map((o) => (
                    <div key={o.id} className="bg-white rounded-xl border border-violet-100 p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">📝 활동 기록</span>
                        {o.week_number && <span className="text-[10px] font-bold text-gray-400">{o.week_number}주차</span>}
                        <span className="text-[10px] font-bold text-gray-400 ml-auto">{new Date(o.created_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                      {o.activity_name && <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{o.activity_name}</p>}
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{o.content}</p>
                    </div>
                  ))}
                  {subTab === 'obs' && (
                    <Pagination
                      page={obsSafePage}
                      totalPages={obsTotalPages}
                      onChange={(p) => setObsPageByStudent((prev) => ({ ...prev, [student.id]: p }))}
                    />
                  )}

                  {subTab === 'results' && pagedResults.map((r) => {
                    const allImgResults = results.filter((x) => x.image_urls && x.image_urls.length > 0);
                    const allImgUrls = allImgResults.flatMap((x) => x.image_urls as string[]);
                    const allImgNames = allImgResults.flatMap((x) => (x.image_urls as string[]).map((_, i) => `${x.title || '결과물'}-${i + 1}.webp`));
                    const typeBadge = RESULT_TYPE_BADGE[r.result_type];
                    return (
                      <div key={r.id} className="bg-white rounded-xl border border-emerald-100 p-4">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">📁 결과물</span>
                          {typeBadge && (
                            <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${typeBadge.color}`}>
                              {typeBadge.icon} {typeBadge.label}
                            </span>
                          )}
                          {r.week_number && <span className="text-[10px] font-bold text-gray-400">{r.week_number}주차</span>}
                          <span className="text-[10px] font-bold text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
                        </div>
                        {r.title && <p className="text-sm font-black text-gray-800 mb-1.5">{r.title}</p>}
                        {r.text_content && r.result_type !== 'link' && r.result_type !== 'file' && (
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.text_content}</p>
                        )}
                        {r.image_urls && r.image_urls.length > 0 && (
                          <div className="mt-2 relative group cursor-pointer" onClick={() => setLightbox({ urls: allImgUrls, names: allImgNames, index: allImgUrls.indexOf(r.image_urls![0]) })}>
                            <img src={r.image_urls[0]} alt="결과물 이미지" className="rounded-lg max-h-56 object-cover w-full transition-opacity group-hover:opacity-90" />
                            {r.image_urls.length > 1 && (
                              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                1/{r.image_urls.length}
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/50 rounded-full p-2"><ZoomIn size={20} className="text-white" /></div>
                            </div>
                          </div>
                        )}
                        {r.link_url && (
                          <a href={r.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-2 text-sm font-black text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
                            <ExternalLink size={14} /> 링크 열기
                          </a>
                        )}
                        {r.file_url && (
                          <a href={r.file_url} download target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-2 text-sm font-black text-white bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
                            <Download size={14} /> 파일 다운로드
                          </a>
                        )}
                      </div>
                    );
                  })}
                  {subTab === 'results' && (
                    <Pagination
                      page={resultsSafePage}
                      totalPages={resultsTotalPages}
                      onChange={(p) => setResultsPageByStudent((prev) => ({ ...prev, [student.id]: p }))}
                    />
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* 조 상세 모달 */}
      <AnimatePresence>
        {modalGroupId && (() => {
          const entry = groupsWithMembers.find((g) => g.group.id === modalGroupId);
          if (!entry) return null;
          const { group, students } = entry;
          const results = groupResultsMap[group.id] || [];

          return (
            <motion.div
              key="group-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setModalGroupId(null)}
            >
              <motion.div
                initial={reduceMotion ? undefined : { y: 24, opacity: 0 }}
                animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
                exit={reduceMotion ? undefined : { y: 24, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: group.color + '18' }}>
                    <Users size={16} style={{ color: group.color }} />
                  </div>
                  <p className="font-black text-gray-900 text-sm flex-1 min-w-0 truncate">{group.name}</p>
                  <button onClick={() => setModalGroupId(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors shrink-0">
                    <X size={18} />
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4 overflow-y-auto">
                  {/* 조원 명단 */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">👥 조원 {students.length}명</p>
                    <div className="flex flex-wrap gap-2">
                      {students.length === 0 && <span className="text-xs font-semibold text-gray-400">등록된 조원이 없습니다</span>}
                      {students.map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-full pl-1 pr-3 py-1">
                          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-gray-100">
                            <img src={getAvatarUrl(s)} alt={s.full_name} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-xs font-bold text-gray-700">{s.full_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 조별 결과물 */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">📁 조별 결과물 {results.length}건</p>
                    {results.length === 0 && <p className="text-xs font-semibold text-gray-400">조별로 제출된 결과물이 없습니다</p>}
                    <div className="space-y-3">
                      {results.map((r) => {
                        const typeBadge = RESULT_TYPE_BADGE[r.result_type];
                        return (
                          <div key={r.id} className="bg-white rounded-xl border border-emerald-100 p-4">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {typeBadge && (
                                <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${typeBadge.color}`}>
                                  {typeBadge.icon} {typeBadge.label}
                                </span>
                              )}
                              {r.week_number && <span className="text-[10px] font-bold text-gray-400">{r.week_number}주차</span>}
                              <span className="text-[10px] font-bold text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
                            </div>
                            {r.title && <p className="text-sm font-black text-gray-800 mb-1.5">{r.title}</p>}
                            {r.text_content && r.result_type !== 'link' && r.result_type !== 'file' && (
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.text_content}</p>
                            )}
                            {r.image_urls && r.image_urls.length > 0 && (
                              <div className="mt-2 relative group cursor-pointer" onClick={() => setLightbox({ urls: r.image_urls!, names: r.image_urls!.map((_, idx) => `${r.title || '결과물'}-${idx + 1}.webp`), index: 0 })}>
                                <img src={r.image_urls[0]} alt="결과물 이미지" className="rounded-lg max-h-56 object-cover w-full transition-opacity group-hover:opacity-90" />
                                {r.image_urls.length > 1 && (
                                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    1/{r.image_urls.length}
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="bg-black/50 rounded-full p-2"><ZoomIn size={20} className="text-white" /></div>
                                </div>
                              </div>
                            )}
                            {r.link_url && (
                              <a href={r.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-2 text-sm font-black text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
                                <ExternalLink size={14} /> 링크 열기
                              </a>
                            )}
                            {r.file_url && (
                              <a href={r.file_url} download target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-2 text-sm font-black text-white bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
                                <Download size={14} /> 파일 다운로드
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* 이미지 라이트박스 */}
      {lightbox && (
        <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <button
            className="absolute top-4 right-16 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); blobDownload(lightbox.urls[lightbox.index], lightbox.names[lightbox.index]); }}
            title="다운로드"
          >
            <Download size={18} />
          </button>
          {lightbox.urls.length > 1 && (
            <button className="absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.urls.length) % prev.urls.length } : null); }}
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <img src={lightbox.urls[lightbox.index]} alt="확대 보기" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          {lightbox.urls.length > 1 && (
            <button className="absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.urls.length } : null); }}
            >
              <ChevronRight size={22} />
            </button>
          )}
          {lightbox.urls.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs font-bold px-3 py-1.5 rounded-full">
              {lightbox.index + 1} / {lightbox.urls.length}
            </div>
          )}
        </div>
      )}

    </div>

    {/* ── 인쇄 전용 보고서 (화면 hidden, 인쇄 시만 표시) ── */}
    <div className="hidden print:block text-black bg-white font-sans">
      <style>{`
        @media print {
          @page { margin: 18mm 15mm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* 보고서 헤더 */}
      <div className="flex items-start justify-between pb-4 mb-5 border-b-2 border-gray-300">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">클래스로그 AI · 수업 결과 보고서</p>
          <h1 className="text-xl font-black text-gray-900">
            {classInfo?.name}{classInfo?.subject ? ` · ${classInfo.subject}` : ''}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{filterLabel !== '전체' ? `${filterLabel} 기준` : '전체 주차'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400">출력일</p>
          <p className="text-xs font-black text-gray-700">{printToday}</p>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="flex gap-6 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        {[
          { label: '전체 학생', value: studentData.length, unit: '명', color: 'text-gray-900' },
          { label: '참여 학생', value: activeCount, unit: '명', color: 'text-indigo-600' },
          { label: '활동 기록', value: totalObs, unit: '건', color: 'text-violet-600' },
          { label: '결과물', value: totalResults, unit: '건', color: 'text-emerald-600' },
          { label: '갤러리', value: printImages.length, unit: '장', color: 'text-amber-600' },
        ].map(({ label, value, unit, color }) => (
          <div key={label} className="text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-500 font-bold">{label}<span className="ml-0.5">{unit}</span></p>
          </div>
        ))}
      </div>

      {/* 학생 결과물 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-4 bg-indigo-500 rounded-full" />
        <h2 className="text-xs font-black text-gray-800 uppercase tracking-widest">학생 결과물</h2>
      </div>
      <div className="space-y-3 mb-8">
        {filteredData.map(({ student, obs, results }) => {
          const hasActivity = obs.length > 0 || results.length > 0;
          return (
            <div key={student.id} className="break-inside-avoid border border-gray-200 rounded-xl overflow-hidden">
              <div className={`flex items-center gap-3 px-4 py-2.5 ${hasActivity ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                <span className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xs font-black text-gray-600 shrink-0">
                  {student.student_number ?? '—'}
                </span>
                <span className="font-black text-gray-900 text-sm">{student.full_name}</span>
                <div className="ml-auto flex items-center gap-3 text-[10px] font-bold">
                  {obs.length > 0 && <span className="text-violet-600">활동 기록 {obs.length}건</span>}
                  {results.length > 0 && <span className="text-emerald-600">결과물 {results.length}건</span>}
                  {!hasActivity && <span className="text-gray-400">미제출</span>}
                </div>
              </div>
              {hasActivity && (
                <div className="px-4 py-3 space-y-2.5">
                  {obs.map((o) => (
                    <div key={o.id} className="pl-3 border-l-2 border-violet-300">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[9px] font-black text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">📝 활동 기록</span>
                        {o.week_number && <span className="text-[9px] text-gray-400 font-bold">{o.week_number}주차</span>}
                        {o.activity_name && <span className="text-[9px] text-gray-500 font-semibold">{o.activity_name}</span>}
                        <span className="text-[9px] text-gray-400 ml-auto">{new Date(o.created_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{o.content}</p>
                    </div>
                  ))}
                  {results.map((r) => (
                    <div key={r.id} className="pl-3 border-l-2 border-emerald-300">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">📁 결과물</span>
                        {r.week_number && <span className="text-[9px] text-gray-400 font-bold">{r.week_number}주차</span>}
                        {r.title && <span className="text-[9px] text-gray-600 font-black">{r.title}</span>}
                        <span className="text-[9px] text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                      {r.text_content && <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{r.text_content}</p>}
                      {r.image_urls && r.image_urls.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {r.image_urls.map((u, i) => (
                            <img key={i} src={u} alt={`결과물 ${i + 1}`} className="max-h-44 rounded-lg object-contain border border-gray-100" />
                          ))}
                        </div>
                      )}
                      {r.link_url && <p className="text-[10px] text-indigo-500 mt-1 font-medium break-all">{r.link_url}</p>}
                      {r.file_url && <p className="text-[10px] text-emerald-600 mt-1 font-medium">첨부 파일 포함</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 수업 갤러리 */}
      {printImages.length > 0 && (
        <div className="break-before-page">
          <div className="flex items-center gap-2 mb-3 pt-2">
            <span className="w-1 h-4 bg-emerald-500 rounded-full" />
            <h2 className="text-xs font-black text-gray-800 uppercase tracking-widest">수업 갤러리 ({printImages.length}장)</h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {printImages.map((item) => (
              <div key={item.id} className="break-inside-avoid">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  <img src={item.file_url} alt={item.caption || ''} className="w-full h-full object-cover" />
                </div>
                {(item.caption || item.week_number) && (
                  <p className="text-[9px] text-gray-500 mt-0.5 truncate text-center">
                    {item.week_number ? `${item.week_number}주차` : ''}{item.caption ? ` ${item.caption}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 세특 현황 */}
      {Object.keys(evalMap).length > 0 && (() => {
        const printEvalRows = studentData.map((sd) => ({
          student: sd.student,
          ev: evalMap[sd.student.id] ?? null,
        }));
        const statusLabel = (s: string | null | undefined) => {
          if (s === 'done' || s === 'final') return '완료';
          if (s === 'draft') return '초안';
          return '미작성';
        };
        return (
          <div className="break-before-page">
            <div className="flex items-center gap-2 mb-3 pt-2">
              <span className="w-1 h-4 bg-amber-500 rounded-full" />
              <h2 className="text-xs font-black text-gray-800 uppercase tracking-widest">세특 현황</h2>
            </div>
            <div className="space-y-2">
              {printEvalRows.map(({ student, ev }) => {
                const content = ev?.setech_content || '';
                return (
                  <div key={student.id} className="break-inside-avoid border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50">
                      <span className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xs font-black text-gray-600 shrink-0">
                        {student.student_number ?? '—'}
                      </span>
                      <span className="font-black text-gray-900 text-sm">{student.full_name}</span>
                      <div className="ml-auto flex items-center gap-3 text-[10px] font-bold">
                        {ev?.achievement_level && <span className="text-blue-700">성취도 {ev.achievement_level}</span>}
                        <span className={ev?.status === 'done' || ev?.status === 'final' ? 'text-emerald-600' : 'text-gray-400'}>{statusLabel(ev?.status)}</span>
                        {content && <span className="text-gray-400">{content.length}자</span>}
                      </div>
                    </div>
                    {content && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 보고서 푸터 */}
      <div className="flex items-center justify-between mt-8 pt-3 border-t border-gray-200 text-[9px] text-gray-400">
        <span>클래스로그 AI — 수업 기록부터 세특까지</span>
        <span>{new Date().toLocaleString('ko-KR')}</span>
      </div>

    </div>
    </>
  );
};

// 갤러리 영상 카드 (16:9 / 9:16 원본 비율을 유지한 채 작은 크기로 표시)
function ShareGalleryVideo({ item }: { item: GalleryItem }) {
  const info = parseVideoUrl(item.file_url);
  const [directRatio, setDirectRatio] = useState<number | null>(null);
  const aspectStyle = !info || info.platform === 'direct'
    ? { aspectRatio: directRatio ?? 16 / 9 }
    : { aspectRatio: isVerticalVideoUrl(item.file_url) ? 9 / 16 : 16 / 9 };

  return (
    <div className="col-span-2 rounded-2xl overflow-hidden bg-gray-100 shadow-sm">
      {info && info.platform !== 'direct' ? (
        <iframe
          src={info.embedUrl}
          style={aspectStyle}
          className="w-full"
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture"
        />
      ) : (
        // aspect-ratio를 video 태그에 직접 주면 네이티브 컨트롤 바 높이 계산이 어긋나 하단이 잘리는
        // 브라우저 버그가 있어, 비율은 래퍼 div에 주고 video는 절대 위치로 100% 채움
        <div className="relative w-full bg-black" style={aspectStyle}>
          <video
            src={item.file_url}
            controls
            preload="metadata"
            className="absolute inset-0 w-full h-full"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setDirectRatio(v.videoWidth / v.videoHeight);
            }}
          />
        </div>
      )}
      {item.caption && <p className="text-xs font-semibold text-gray-600 px-3 py-2 truncate">{item.caption}</p>}
    </div>
  );
}

export default ShareClassView;
