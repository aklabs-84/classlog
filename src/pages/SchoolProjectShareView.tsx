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
  School, Users, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink,
  FileText, Loader2, AlertCircle, Lock, Calendar,
  Images, Download, ZoomIn, X, BookOpen,
  AlignLeft, Link2, ImageIcon, File as FileIcon,
  Sparkles, ArrowRight, CheckCircle2, FolderOpen, RefreshCw, BarChart2,
} from 'lucide-react';
import FullScreenView from '../components/common/FullScreenView';
import PercentLoader from '../components/common/PercentLoader';
import { computeFinalMarks } from '../lib/finalSubmission';
import LinkSaveTip from '../components/common/LinkSaveTip';
import QuickOpenLink, { pickQuickOpen } from '../components/common/QuickOpenLink';
import ResultThumb, { pickThumb } from '../components/common/ResultThumb';
import ResultFileActions from '../components/common/ResultFileActions';
import { ShortTextChart } from './tools/SurveyTool';
import type { SurveyQuestion, SurveyAnswer } from './tools/SurveyTool';
import {
  AttendanceDonutChart, MultipleChoiceBarChart, YesNoPieChart, StarRatingBarChart, OpinionScaleBarChart, RankingBarChart,
} from '../components/share/ShareCharts';
import { appToast } from '../lib/appDialog';

// "[오늘 배운 것] … [한 줄 느낌] …" 형태의 글을 이름표별로 나눈다. 이름표가 없으면 빈 배열.
function parseQuoteSections(content: string): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const re = /\[([^\]]{1,20})\]\s*([^[]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const text = m[2].trim();
    if (text) out.push({ label: m[1].trim(), text });
  }
  return out;
}

type JourneyWeek = { week: number; topic: string | null; participantCount: number; obsCount: number; resultCount: number; images: string[]; samples: string[] };

// 주차별 학습 여정 집계 (화면과 PDF 인쇄 영역이 같이 씀)
function buildWeeklyJourney(weeklyPlan: any[], students: StudentWithData[], gallery: GalleryItem[]): JourneyWeek[] {
  type WeekEntry = { week: number; topic: string | null; participants: Set<string>; obsCount: number; resultCount: number; images: string[]; samples: string[] };
  const weekMap: Record<number, WeekEntry> = {};
  const ensureWeek = (w: number) => {
    if (!weekMap[w]) weekMap[w] = { week: w, topic: null, participants: new Set(), obsCount: 0, resultCount: 0, images: [], samples: [] };
    return weekMap[w];
  };
  // 대표 문장: 학생 한 명당 1개, 너무 짧은 말은 빼고 주차마다 최대 3개
  const studentNames = students.map(st => (st.full_name || '').replace(/\s+/g, '')).filter(n => n.length >= 2);
  const sampleOwners: Record<number, Set<string>> = {};
  const addSample = (wk: WeekEntry, studentId: string, text?: string | null) => {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const owners = (sampleOwners[wk.week] ||= new Set());
    if (t.length < 6 || wk.samples.length >= 3 || owners.has(studentId) || wk.samples.includes(t)) return;
    if (studentNames.some(n => t.includes(n))) return; // 학생 이름이 적힌 글은 대표 문장에서 제외
    owners.add(studentId);
    wk.samples.push(t.length > 120 ? `${t.slice(0, 120)}…` : t);
  };
  weeklyPlan.forEach((p: any) => {
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
      addSample(wk, student.id, o.content);
    });
    student.resultGroups.forEach(group => {
      if (!group.week_number) return;
      const wk = ensureWeek(group.week_number);
      wk.participants.add(student.id);
      wk.resultCount += 1;
      const imgItem = group.items.find(r => r.image_urls && r.image_urls.length > 0);
      (imgItem?.image_urls || []).forEach(u => { if (wk.images.length < 8 && !wk.images.includes(u)) wk.images.push(u); });
      const textItem = group.items.find(r => r.text_content);
      addSample(wk, student.id, textItem?.text_content);
    });
  });
  gallery.forEach(g => {
    if (!g.week_number || g.file_type !== 'image') return;
    const wk = ensureWeek(g.week_number);
    if (wk.images.length < 8 && !wk.images.includes(g.file_url)) wk.images.push(g.file_url);
  });
  return Object.values(weekMap)
    .map(({ participants, ...wk }) => ({ ...wk, participantCount: participants.size }))
    .sort((a, b) => a.week - b.week);
}

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

/** 카드용 소스·⭐ 표시 (조별 제출은 묶음 기준 ⭐ 최종) */
function markedSourcesFor(student: { resultGroups: ResultGroup[] }) {
  const gm = computeFinalMarks(student.resultGroups.filter(g => g.isGroupSubmission).map(g => ({
    id: g.items[0].id, week: g.week_number, title: g.title, created_at: g.created_at,
  })));
  const marks = new Map<string, 'final' | 'older'>();
  const sources = student.resultGroups.flatMap(g => g.items.map(it => {
    const m = gm.get(g.items[0].id);
    if (m) marks.set(it.id, m);
    return { id: it.id, created_at: g.created_at, file_url: it.file_url, link_url: it.link_url, display_name: it.display_name, storage_path: it.storage_path, image_urls: it.image_urls };
  }));
  return { sources, marks };
}

/** 카드에서 바로 열 결과 하나 고르기 (조별 제출이면 ⭐ 최종 우선) */
function quickOpenFor(student: { resultGroups: ResultGroup[] }) {
  const { sources, marks } = markedSourcesFor(student);
  return pickQuickOpen(sources, marks);
}

/** 카드 미리보기 (사진 또는 HTML 파일) */
function thumbFor(student: { resultGroups: ResultGroup[] }) {
  const { sources, marks } = markedSourcesFor(student);
  return pickThumb(sources, marks);
}

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
  display_name?: string | null;
  storage_path?: string | null;
  group_id?: string | null;
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
  group_id: string | null;
}

interface StudentWithData {
  id: string;
  full_name: string;
  student_number: number | null;
  avatar_url: string | null;
  observations: { id: string; activity_name: string; content: string; created_at: string; week_number: number | null }[];
  resultGroups: ResultGroup[];
  /** 조 묶음 카드일 때만: 조원 이름 */
  memberNames?: string[];
}

interface ClassGroupInfo {
  id: string;
  name: string;
  memberIds: string[];
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
  const [spotlightPaused, setSpotlightPaused] = useState(false);
  const [classQuoteMap, setClassQuoteMap] = useState<Record<string, string>>({});
  const [snapshotResult, setSnapshotResult] = useState<{ title: string | null; resultType: string; createdAt: string; studentName: string; className: string; url: string | null } | null>(null);
  const [openSchools, setOpenSchools] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [classStudents, setClassStudents] = useState<Record<string, StudentWithData[]>>({});
  const [classGallery, setClassGallery] = useState<Record<string, GalleryItem[]>>({});
  const [classGroupsMap, setClassGroupsMap] = useState<Record<string, ClassGroupInfo[]>>({});
  const [classGalleryHasMore, setClassGalleryHasMore] = useState<Record<string, boolean>>({});
  const [galleryLoadingMore, setGalleryLoadingMore] = useState<string | null>(null);
  const galleryOffsetRef = useRef<Record<string, number>>({});
  const [classEvalMap, setClassEvalMap] = useState<Record<string, Record<string, EvalRow>>>({});
  const [loadingClass, setLoadingClass] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  // 결과물 상세 모달
  const [detailGroup, setDetailGroup] = useState<{ group: ResultGroup; studentName: string; mark?: 'final' | 'older'; finalGroup?: ResultGroup } | null>(null);
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
    if (reduceMotion || spotlightPaused || spotlightQuotes.length <= 1) return;
    const timer = setInterval(() => {
      setSpotlightIndex((i) => (i + 1) % spotlightQuotes.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [reduceMotion, spotlightPaused, spotlightQuotes.length]);

  useEffect(() => {
    if (!shareToken) return;
    fetchProjectMeta();
  }, [shareToken]);

  const fetchProjectMeta = async () => {
    setLoading(true);
    try {
      // 공유 링크(토큰)를 서버 창구에 내밀고, 개요 묶음을 한 번에 받는다
      const { data: ov, error: projErr } = await supabase.rpc('share_project_overview', { p_token: shareToken });
      const proj = (ov as any)?.project;

      if (projErr || !ov || !proj) {
        setError('공유 링크가 유효하지 않거나 존재하지 않습니다.');
        return;
      }
      setProject(proj);

      const subClasses: any[] = (ov as any).classes || [];
      if (subClasses.length === 0) { setClassList([]); return; }

      setClassList(subClasses.map((c: any) => ({
        id: c.id, name: c.name, subject: c.subject || '',
        teacher_name: c.teacher_name || null,
        weekly_plan: c.weekly_plan || [],
        show_learning_journey: c.show_learning_journey ?? true,
        show_attendance_summary: c.show_attendance_summary ?? true,
        shared_survey_form_id: c.shared_survey_form_id || null,
        studentCount: Number(c.student_count) || 0,
        resultCount: Number(c.result_count) || 0,
        obsCount: Number(c.obs_count) || 0,
        galleryCount: Number(c.gallery_count) || 0,
        lastActivity: c.last_activity || null,
        weekResults: (c.week_results || {}) as Record<string, number>,
        schoolId: c.school_id || 'none',
        schoolName: c.school_name || proj.school_name || proj.name,
      })));
      // 학교가 하나뿐이면 처음부터 펼쳐서 보여준다
      const schoolIds = new Set(subClasses.map((c: any) => c.school_id || 'none'));
      if (schoolIds.size === 1) setOpenSchools(schoolIds as Set<string>);

      // 학급별 출석 요약 (학급 전체 통계만, 학생별 상세는 노출하지 않음)
      const attendanceByClass: Record<string, { total: number; byStatus: Record<string, number> }> = {};
      Object.entries((ov as any).attendance_by_class || {}).forEach(([classId, v]: [string, any]) => {
        attendanceByClass[classId] = { total: v.total, byStatus: v.by_status || {} };
      });
      setAttendanceByClass(attendanceByClass);

      // 학급별 공개 설문 결과 (교사가 지정한 설문 1개씩, 응답자 식별 없이 집계만)
      const surveyDataByForm: Record<string, { formTitle: string; questions: SurveyQuestion[]; answersByQuestion: Record<string, SurveyAnswer[]>; responseCount: number }> = {};
      ((ov as any).surveys || []).forEach((f: any) => {
        const answersByQuestion: Record<string, SurveyAnswer[]> = {};
        (f.answers || []).forEach((a: any) => {
          if (!answersByQuestion[a.question_id]) answersByQuestion[a.question_id] = [];
          answersByQuestion[a.question_id].push(a);
        });
        surveyDataByForm[f.form_id] = {
          formTitle: f.title || '설문',
          questions: (f.questions || []) as SurveyQuestion[],
          answersByQuestion,
          responseCount: f.response_count || 0,
        };
      });
      setSurveyDataByForm(surveyDataByForm);

      const stats = (ov as any).stats || {};
      setProjectStats({
        studentCount: stats.student_count || 0,
        obsCount: stats.obs_count || 0,
        resultCount: stats.result_count || 0,
        galleryCount: stats.gallery_count || 0,
        setechDoneCount: stats.setech_done_count || 0,
      });
      setHighlightGallery((ov as any).highlight_gallery || []);

      // 학급별 대표 한 줄: [한 줄 느낌] 우선, 없으면 가장 짧은 항목
      const cq: Record<string, string> = {};
      ((ov as any).spotlight_obs || []).forEach((o: any) => {
        if (!o.class_name || cq[o.class_name]) return;
        const secs = parseQuoteSections((o.content || '').trim());
        if (secs.length === 0) return;
        const pick = secs.find(x => x.label.includes('한 줄') || x.label.includes('느낌')) ?? secs.reduce((m, x) => (x.text.length < m.text.length ? x : m), secs[0]);
        cq[o.class_name] = pick.text;
      });
      setClassQuoteMap(cq);

      // 스포트라이트 인용구: 20~220자 관찰기록 중 학생별로 하나씩 골라 매번 랜덤 3개 선택
      const quoteByStudent = new Map<string, { content: string; studentName: string; className: string }[]>();
      ((ov as any).spotlight_obs || []).forEach((o: any) => {
        const text = (o.content || '').trim();
        if (text.length < 20 || text.length > 600) return;
        const arr = quoteByStudent.get(o.student_id) ?? [];
        arr.push({ content: text, studentName: o.student_name, className: o.class_name || '' });
        quoteByStudent.set(o.student_id, arr);
      });
      const perStudentQuotes = Array.from(quoteByStudent.values()).map(arr => arr[Math.floor(Math.random() * arr.length)]);
      for (let i = perStudentQuotes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perStudentQuotes[i], perStudentQuotes[j]] = [perStudentQuotes[j], perStudentQuotes[i]];
      }
      setSpotlightQuotes(perStudentQuotes.slice(0, 3));

      // 결과물 스냅샷: 가장 최근 결과물 1건
      const snapRow = (ov as any).snapshot as any;
      if (snapRow) {
        const snapUrl = snapRow.result_type === 'link'
          ? (snapRow.link_url || null)
          : (snapRow.result_type === 'image' || snapRow.result_type === 'file') && snapRow.storage_path
            ? supabase.storage.from('student-attachments').getPublicUrl(snapRow.storage_path).data?.publicUrl || null
            : null;
        setSnapshotResult({
          title: snapRow.title,
          resultType: snapRow.result_type,
          createdAt: snapRow.created_at,
          studentName: snapRow.student_name,
          className: snapRow.class_name || '',
          url: snapUrl,
        });
      } else {
        setSnapshotResult(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchClassData = async (classId: string, keepActive = false) => {
    setLoadingClass(classId);
    try {
      const cls = classList.find(c => c.id === classId);
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
      const topicWeekMap: Record<string, number> = {};
      ((cls?.weekly_plan as any[]) || []).forEach((p: any) => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      const { data: payload } = await supabase.rpc('share_project_class_data', {
        p_token: shareToken,
        p_class_id: classId,
        p_g_off: 0,
        p_g_lim: GALLERY_PAGE_SIZE,
      });
      const students: any[] = (payload as any)?.students || [];

      if (!payload || students.length === 0) {
        setClassStudents(prev => ({ ...prev, [classId]: [] }));
        setClassGallery(prev => ({ ...prev, [classId]: [] }));
        if (!keepActive) setActiveClassId(classId);
        return;
      }
      const obsRes = { data: (payload as any).observations || [] };
      const resultsRes = { data: (payload as any).results || [] };
      const galleryRes = { data: (payload as any).gallery || [] };
      const evalRes = { data: (payload as any).evaluations || [] };

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
            group_id: items.find(r => r.group_id)?.group_id || null,
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

      const memberIdsByGroup: Record<string, string[]> = {};
      ((payload as any).group_members || []).forEach((m: any) => {
        (memberIdsByGroup[m.group_id] ||= []).push(m.student_id);
      });
      setClassGroupsMap(prev => ({
        ...prev,
        [classId]: (((payload as any).groups || []) as any[])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(g => ({ id: g.id, name: g.name, memberIds: memberIdsByGroup[g.id] || [] })),
      }));

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

      if (!keepActive) setActiveClassId(classId);
    } finally {
      setLoadingClass(null);
    }
  };

  const handleLoadMoreGallery = async (classId: string) => {
    setGalleryLoadingMore(classId);
    try {
      const offset = galleryOffsetRef.current[classId] || 0;
      const { data } = await supabase.rpc('share_project_gallery_page', {
        p_token: shareToken,
        p_class_id: classId,
        p_off: offset,
        p_lim: GALLERY_PAGE_SIZE,
      });
      const page: any[] = Array.isArray(data) ? data : [];
      setClassGallery(prev => ({ ...prev, [classId]: [...(prev[classId] || []), ...page] }));
      galleryOffsetRef.current[classId] = offset + page.length;
      setClassGalleryHasMore(prev => ({ ...prev, [classId]: page.length === GALLERY_PAGE_SIZE }));
    } finally {
      setGalleryLoadingMore(null);
    }
  };

  // PDF 저장: 아직 안 펼친 학급 데이터까지 모두 불러온 뒤 인쇄
  const [preparingPdf, setPreparingPdf] = useState(false);
  const handlePrintPdf = async () => {
    setPreparingPdf(true);
    try {
      await Promise.all(classList.filter(c => !classStudents[c.id]).map(c => fetchClassData(c.id, true)));
      await new Promise(r => setTimeout(r, 400));
    } finally {
      setPreparingPdf(false);
    }
    window.print();
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <PercentLoader label="프로젝트 불러오는 중" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-3 max-w-sm">
        <AlertCircle size={40} className="mx-auto text-red-400" />
        <p className="font-black text-gray-700">{error}</p>
        <p className="text-base text-gray-400">URL을 확인하거나 담당 선생님에게 문의하세요.</p>
      </div>
    </div>
  );

  const isClosed = project?.status === 'closed' || project?.status === 'archived';
  const goToClass = (cls: any) => {
    setOpenSchools(prev => new Set(prev).add(cls.schoolId));
    if (activeClassId !== cls.id) handleToggleClass(cls.id);
    [150, 700].forEach(ms => setTimeout(() => document.getElementById(`cls-${cls.id}`)?.scrollIntoView({ behavior: 'auto', block: 'start' }), ms));
  };
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

  const schoolGroups = (() => {
    const m = new Map<string, { id: string; name: string; classes: any[] }>();
    classList.forEach((c: any) => {
      if (!m.has(c.schoolId)) m.set(c.schoolId, { id: c.schoolId, name: c.schoolName, classes: [] });
      m.get(c.schoolId)!.classes.push(c);
    });
    return Array.from(m.values());
  })();
  const allSchoolsOpen = schoolGroups.length > 0 && schoolGroups.every(g => openSchools.has(g.id));
  const theme = BANNER_THEMES.find(t => t.key === (project?.banner_color || 'violet')) ?? BANNER_THEMES[0];

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`@media print{@page{size:A4;margin:12mm}body{background:#fff!important}body *{visibility:visible!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.break-inside-avoid{break-inside:avoid}}`}</style>

      {/* ── 이미지 라이트박스 ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
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
          <p className="absolute bottom-4 text-white/50 text-base">{lightbox.index + 1} / {lightbox.urls.length}</p>
        </div>
      )}

      {/* ── 학생·조 결과 전체화면 ── */}
      {modalStudent && (
        <FullScreenView
          title={modalStudent.full_name}
          subtitle={modalStudent.memberNames && modalStudent.memberNames.length > 0 ? `조원: ${modalStudent.memberNames.join(', ')}` : undefined}
          icon={modalStudent.memberNames
            ? <span className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-xl">👥</span>
            : <img src={getAvatarUrl(modalStudent)} alt={modalStudent.full_name} className="w-10 h-10 rounded-full object-cover bg-gray-100" />}
          onClose={() => setModalStudent(null)}
        >
          {(() => {
            const marks = computeFinalMarks(modalStudent.resultGroups.filter(g => g.isGroupSubmission).map(g => ({
              id: g.items[0].id, week: g.week_number, title: g.title, created_at: g.created_at,
            })));
            const fmtTime = (d: string) => new Date(d).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const finalGroup = modalStudent.resultGroups.find(g => marks.get(g.items[0].id) === 'final');
            const orderedGroups = [...modalStudent.resultGroups].sort((a, b) => (marks.get(b.items[0].id) === 'final' ? 1 : 0) - (marks.get(a.items[0].id) === 'final' ? 1 : 0));
            return (
            <div className="grid gap-3 md:grid-cols-2 items-start">
              {finalGroup && (
                <div className="md:col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-base text-amber-900">
                  ⭐ <b>최종 제출</b>은 가장 마지막에 올린 <b>{fmtTime(finalGroup.created_at)}</b> 제출입니다. 맨 앞(왼쪽 위) 카드이고, 나머지는 「이전 제출」이에요.
                </div>
              )}
              {modalStudent.observations.map(obs => (
                <div key={obs.id} className="bg-white rounded-xl border border-violet-100 p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[13px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">📝 활동 기록</span>
                    {obs.week_number && <span className="text-[13px] font-bold text-gray-400">{obs.week_number}주차</span>}
                    <span className="text-[13px] text-gray-400 ml-auto">{new Date(obs.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  {obs.activity_name && <p className="text-[13px] font-semibold text-gray-500 mb-1.5">{obs.activity_name}</p>}
                  <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">{obs.content}</p>
                </div>
              ))}

              {orderedGroups.map(group => {
                const imageItem = group.items.find(r => r.image_urls && r.image_urls.length > 0);
                const textItem  = group.items.find(r => r.result_type === 'text');
                const linkItem  = group.items.find(r => r.result_type === 'link');
                const fileItem  = group.items.find(r => r.result_type === 'file');

                const mark = marks.get(group.items[0].id);
                return (
                  <div key={group.groupId}
                    onClick={() => setDetailGroup({ group, studentName: modalStudent.full_name, mark, finalGroup: mark === 'older' ? finalGroup : undefined })}
                    className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all group ${mark === 'final' ? 'border-amber-300 ring-2 ring-amber-200' : mark === 'older' ? 'border-gray-200 opacity-70' : 'border-emerald-100 hover:border-emerald-300'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {mark === 'final' && <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-white">⭐ 최종 제출</span>}
                      {mark === 'older' && <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">이전 제출</span>}
                      {group.isGroupSubmission && (
                        <span className="flex items-center gap-1 text-[13px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200">👥 조별 제출</span>
                      )}
                      {group.types.map(type => {
                        const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.file;
                        return (
                          <span key={type} className={`flex items-center gap-1 text-[13px] font-black px-2 py-0.5 rounded-full border ${cfg.color}`}>
                            {cfg.icon}{cfg.label}
                          </span>
                        );
                      })}
                      {group.week_number && (
                        <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 ml-auto">{group.week_number}주차</span>
                      )}
                    </div>
                    {group.title && <p className="font-black text-base text-gray-800 mb-2 group-hover:text-emerald-700 transition-colors">{group.title}</p>}
                    <div className="space-y-2">
                      {imageItem?.image_urls && imageItem.image_urls.length > 0 && (
                        <div className="relative">
                          <img src={imageItem.image_urls[0]} alt="" className="rounded-lg w-full max-h-36 object-cover" />
                          {imageItem.image_urls.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[13px] font-bold px-1.5 py-0.5 rounded-full">
                              1/{imageItem.image_urls.length}
                            </div>
                          )}
                        </div>
                      )}
                      {textItem?.text_content && <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">{textItem.text_content}</p>}
                      {linkItem?.link_url && <p className="text-sm text-indigo-500 truncate flex items-center gap-1"><Link2 size={10} />{linkItem.link_url}</p>}
                      {fileItem && <p className="text-sm text-amber-600 flex items-center gap-1"><FileIcon size={10} />첨부파일 있음</p>}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[13px] text-gray-500">{fmtTime(group.created_at)}</span>
                      <span className="text-[13px] text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">자세히 보기 →</span>
                    </div>
                  </div>
                );
              })}

              {!modalStudent.observations.length && !modalStudent.resultGroups.length && (
                <p className="text-sm font-bold text-gray-400 text-center py-8">기록이 없습니다</p>
              )}
            </div>
            );
          })()}
        </FullScreenView>
      )}

      {/* ── 결과물 상세 전체화면 ── */}
      {detailGroup && (
        <FullScreenView
          z={70}
          title={detailGroup.group.title || '결과물'}
          subtitle={`${detailGroup.studentName} · ${new Date(detailGroup.group.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`}
          onClose={() => setDetailGroup(null)}
          onBackToList={() => { setDetailGroup(null); setModalStudent(null); }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {detailGroup.mark === 'final' && <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-white">⭐ 최종 제출</span>}
            {detailGroup.mark === 'older' && <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">이전 제출</span>}
            {detailGroup.mark === 'older' && detailGroup.finalGroup && (
              <button type="button" onClick={() => setDetailGroup({ group: detailGroup.finalGroup!, studentName: detailGroup.studentName, mark: 'final' })}
                className="text-[13px] font-black px-3 py-1 rounded-full bg-amber-400 hover:bg-amber-500 text-white">⭐ 최종본 보러 가기</button>
            )}
            {detailGroup.group.isGroupSubmission && (
              <span className="flex items-center gap-1 text-[13px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200">👥 조별 제출</span>
            )}
            {detailGroup.group.types.map(type => {
              const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.file;
              return (
                <span key={type} className={`flex items-center gap-1 text-[13px] font-black px-2 py-0.5 rounded-full border ${cfg.color}`}>
                  {cfg.icon}{cfg.label}
                </span>
              );
            })}
            {detailGroup.group.week_number && (
              <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">{detailGroup.group.week_number}주차</span>
            )}
          </div>
          <div className="max-w-2xl space-y-4">
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
                        <img src={imageItem.image_urls[0]} alt="결과 이미지" className="w-full max-h-[70vh] object-contain bg-gray-100 group-hover:opacity-90 transition-opacity" />
                        {imageItem.image_urls.length > 1 && (
                          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[13px] font-bold px-1.5 py-0.5 rounded-full">
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
                        <p className="text-[13px] font-black text-blue-500 mb-2 flex items-center gap-1"><AlignLeft size={12} />텍스트</p>
                        <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">{textItem.text_content}</p>
                      </div>
                    )}
                    {/* 링크 */}
                    {linkItem?.link_url && (
                      <div>
                        <a href={linkItem.link_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 text-base font-black text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-3 rounded-2xl transition-colors shadow-sm">
                          <ExternalLink size={16} /> 링크 열기
                        </a>
                        <LinkSaveTip />
                      </div>
                    )}
                    {/* 파일 */}
                    {fileItem?.file_url && (
                      <ResultFileActions url={fileItem.file_url} displayName={fileItem.display_name} storagePath={fileItem.storage_path} tone="amber" />
                    )}
                  </>
                );
              })()}
          </div>
        </FullScreenView>
      )}

      {/* 헤더 */}
      <div style={{ background: '#0e1a33' }} className="text-white">
        <motion.div
          className="max-w-5xl mx-auto px-5 sm:px-6 pt-10 sm:pt-14 pb-10"
          initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-lg font-bold" style={{ color: '#ffb4a8' }}>
              {schoolGroups.length > 1 ? `학교 ${schoolGroups.length}곳 참여` : (schoolGroups[0]?.name || project?.school_name || '')}
            </p>
            <div className="flex items-center gap-2 shrink-0 print:hidden">
              <button onClick={handlePrintPdf} disabled={preparingPdf} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/25 hover:bg-white/10 transition-colors">
                <Download size={14} />
                <span className="text-base font-bold text-white/90">{preparingPdf ? '준비 중…' : 'PDF로 저장'}</span>
              </button>
              <a href="/" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/25 hover:bg-white/10 transition-colors">
                <Sparkles size={14} />
                <span className="text-base font-bold text-white/90">Powered by 클래스로그 AI</span>
              </a>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black leading-[1.25] tracking-tight mb-3" style={{ color: '#fff' }}>{project?.name}</h1>
          <div className="flex items-center gap-4 text-lg flex-wrap text-slate-300">
            {project?.end_date && (
              <span className="flex items-center gap-2"><Calendar size={18} /> {project.start_date
                ? `${new Date(project.start_date).toLocaleDateString('ko-KR')} ~ ${new Date(project.end_date).toLocaleDateString('ko-KR')}`
                : `종료일: ${new Date(project.end_date).toLocaleDateString('ko-KR')}`}</span>
            )}
            {isClosed && (
              <span className="flex items-center gap-1.5 text-base font-bold" style={{ color: '#ffb4a8' }}>
                <Lock size={15} /> 수업 종료됨
              </span>
            )}
          </div>
          {projectStats && (
            <div className="grid grid-cols-3 sm:grid-cols-6 mt-8 border-t border-white/20">
              {[
                { label: '학생', value: projectStats.studentCount, unit: '명' },
                { label: '참여 학급', value: classList.length, unit: '개' },
                { label: '학습 여정', value: projectStats.obsCount, unit: '건' },
                { label: '결과 확인', value: projectStats.resultCount, unit: '건' },
                { label: '갤러리', value: projectStats.galleryCount, unit: '장' },
                { label: '학급 기록', value: projectStats.setechDoneCount, unit: '건' },
              ].map(({ label, value, unit }) => (
                <button
                  key={label}
                  onClick={() => document.getElementById('class-list')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })}
                  className="text-left pt-5 pb-2 pr-2 hover:opacity-80 transition-opacity"
                >
                  <span className={`block text-4xl font-black tabular-nums leading-tight ${value > 0 ? 'text-white' : 'text-slate-500'}`}>
                    <CountUpNumber value={value} /><span className="text-lg font-bold ml-0.5">{unit}</span>
                  </span>
                  <span className="text-base text-slate-300">{label}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* 스포트라이트 인용구 (자동 슬라이드 캐러셀) */}
      {spotlightQuotes.length > 0 && (() => {
        const cur = spotlightQuotes[spotlightIndex] ?? spotlightQuotes[0];
        const sections = parseQuoteSections(cur.content);
        const heroIdx = sections.length === 0 ? -1
          : (() => {
            const i = sections.findIndex(x => x.label.includes('한 줄') || x.label.includes('느낌'));
            return i >= 0 ? i : sections.reduce((m, x, k) => (x.text.length < sections[m].text.length ? k : m), 0);
          })();
        const hero = heroIdx >= 0 ? sections[heroIdx] : null;
        const rest = sections.filter((_, i) => i !== heroIdx).slice(0, 3);
        const goTo = (n: number) => setSpotlightIndex((n + spotlightQuotes.length) % spotlightQuotes.length);
        return (
          <div
            className="bg-white border-b border-slate-200 overflow-hidden print:hidden"
            onMouseEnter={() => setSpotlightPaused(true)}
            onMouseLeave={() => setSpotlightPaused(false)}
            onFocus={() => setSpotlightPaused(true)}
            onBlur={() => setSpotlightPaused(false)}
          >
            <div className="max-w-5xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={spotlightIndex}
                  initial={reduceMotion ? undefined : { opacity: 0, x: 16 }}
                  animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  {hero ? (
                    <>
                      <p className="text-base font-bold mb-2" style={{ color: theme.from }}>{hero.label}</p>
                      <blockquote className="text-2xl sm:text-4xl font-black text-slate-900 leading-snug tracking-tight">
                        “{hero.text}”
                      </blockquote>
                      {rest.length > 0 && (
                        <div className={`grid gap-x-8 gap-y-5 mt-7 pt-6 border-t border-slate-200 ${rest.length === 1 ? 'sm:grid-cols-1' : rest.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                          {rest.map(x => (
                            <div key={x.label}>
                              <p className="text-base font-bold mb-1" style={{ color: theme.from }}>{x.label}</p>
                              <p className="text-lg text-slate-800 leading-relaxed line-clamp-4">{x.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <blockquote className="text-xl sm:text-3xl font-bold text-slate-900 leading-snug tracking-tight">
                      “{cur.content}”
                    </blockquote>
                  )}
                  <p className="text-lg text-slate-600 mt-6">
                    {cur.className} · <span className="font-bold text-slate-800">{cur.studentName}</span>
                  </p>
                </motion.div>
              </AnimatePresence>
              {spotlightQuotes.length > 1 && (
                <div className="flex items-center gap-3 mt-4 text-slate-600">
                  <button onClick={() => goTo(spotlightIndex - 1)} aria-label="이전 글" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronLeft size={22} />
                  </button>
                  <span className="text-base font-bold tabular-nums min-w-[4.5rem] text-center">{spotlightIndex + 1} / {spotlightQuotes.length}</span>
                  <button onClick={() => goTo(spotlightIndex + 1)} aria-label="다음 글" className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronRight size={22} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 인쇄(PDF) 전용: 학생 대표 글 */}
      {spotlightQuotes.length > 0 && (
        <div className="hidden print:block max-w-5xl mx-auto px-6 py-4 border-b border-slate-200">
          <p className="text-base font-bold mb-2" style={{ color: theme.from }}>학생 글 · 대표 {spotlightQuotes.length}편</p>
          <div className="grid grid-cols-3 gap-6">
            {spotlightQuotes.map((q, i) => {
              const secs = parseQuoteSections(q.content);
              const pick = secs.find(x => x.label.includes('한 줄') || x.label.includes('느낌')) ?? secs[0];
              return (
                <div key={i} className="break-inside-avoid">
                  <p className="text-sm text-slate-600">{q.className} · {q.studentName}</p>
                  <p className="text-base font-bold text-slate-900">“{pick ? pick.text : q.content}”</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 위치 이동 메뉴 */}
      {classList.length > 0 && (
        <nav className="sticky top-0 z-20 bg-white border-b border-slate-200 print:hidden" aria-label="보고서 구역 이동">
          <div className="max-w-5xl mx-auto px-5 sm:px-6 flex gap-6 overflow-x-auto">
            {[
              { id: 'class-overview', label: '학급 한눈에' },
              { id: 'week-matrix', label: '주차별 현황' },
              { id: 'class-list', label: '학급별 상세' },
            ].map(n => (
              <button key={n.id} onClick={() => scrollToId(n.id)} className="py-3.5 text-base font-bold text-slate-600 hover:text-slate-900 whitespace-nowrap border-b-[3px] border-transparent hover:border-slate-300 transition-colors">
                {n.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* 학급 한눈에 */}
      {classList.length > 0 && (
        <section id="class-overview" className="max-w-5xl mx-auto px-5 sm:px-6 pt-10 scroll-mt-14">
          <h2 className="text-2xl font-black text-slate-900">학급 한눈에</h2>
          <p className="text-lg text-slate-600 mb-5">학급을 누르면 아래 상세 내용으로 이동해요.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classList.map((c: any) => {
              const planLen = (c.weekly_plan || []).length;
              const doneWeeks = Object.values(c.weekResults || {}).filter((n: any) => n > 0).length;
              const pct = planLen > 0 ? Math.min(100, Math.round((doneWeeks / planLen) * 100)) : 0;
              const quote = classQuoteMap[c.name];
              const last = c.lastActivity ? new Date(c.lastActivity).toLocaleDateString('ko-KR') : null;
              const schoolLabel = schoolGroups.length > 1 ? c.schoolName : '';
              return (
                <button key={c.id} onClick={() => goToClass(c)} className="text-left bg-white rounded-xl border border-slate-200 hover:border-slate-900 p-5 sm:p-6 transition-colors break-inside-avoid">
                  <h3 className="text-xl font-black text-slate-900">{c.name}</h3>
                  <p className="text-base text-slate-600">{[schoolLabel, c.teacher_name ? `${c.teacher_name} 선생님` : ''].filter(Boolean).join(' · ') || c.subject}</p>
                  <div className="grid grid-cols-3 my-4 border-y border-slate-200">
                    {[{ v: c.studentCount, l: '학생' }, { v: c.resultCount, l: '결과물' }, { v: c.obsCount, l: '활동 기록' }].map((m, i) => (
                      <div key={m.l} className={`py-3 ${i > 0 ? 'pl-4 border-l border-slate-200' : ''}`}>
                        <p className="text-2xl font-black tabular-nums text-slate-900 leading-tight">{m.v}</p>
                        <p className="text-sm text-slate-600">{m.l}</p>
                      </div>
                    ))}
                  </div>
                  {planLen > 0 && (
                    <>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#e8412c' }} /></div>
                      <p className="text-sm text-slate-600 mt-1.5 mb-3">{doneWeeks}/{planLen}주차 활동{last ? ` · 최근 ${last}` : ''}</p>
                    </>
                  )}
                  {planLen === 0 && last && <p className="text-sm text-slate-600 mb-3">최근 활동 {last}</p>}
                  {quote && (
                    <p className="text-base text-slate-800 leading-relaxed line-clamp-2"><span className="block text-sm font-bold" style={{ color: '#e8412c' }}>대표 한 줄</span>“{quote}”</p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 주차별 현황 (학급 × 주차 결과물 수) */}
      {(() => {
        const maxWeek = Math.min(12, classList.reduce((m: number, c: any) => Math.max(m, (c.weekly_plan || []).length, ...Object.keys(c.weekResults || {}).map(Number)), 0));
        if (maxWeek === 0) return null;
        const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
        const peak = Math.max(1, ...classList.flatMap((c: any) => Object.values(c.weekResults || {}) as number[]));
        const shade = (n: number) => n === 0 ? { bg: 'transparent', fg: '#94a3b8' } : n >= peak * 0.66 ? { bg: '#e8412c', fg: '#fff' } : n >= peak * 0.33 ? { bg: '#f9b9ae', fg: '#0e1a33' } : { bg: '#fde7e3', fg: '#0e1a33' };
        return (
          <section id="week-matrix" className="max-w-5xl mx-auto px-5 sm:px-6 pt-10 scroll-mt-14">
            <h2 className="text-2xl font-black text-slate-900">주차별 현황</h2>
            <p className="text-lg text-slate-600 mb-5">칸의 숫자는 그 주에 학생들이 올린 파일 수예요. 진할수록 활동이 많았다는 뜻이에요. (학급별 상세의 ‘결과물 N건’은 모둠 제출을 1건으로 세어 숫자가 다를 수 있어요.)</p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left text-sm font-semibold text-slate-600 px-4 py-3">학급</th>
                    {weeks.map(w => <th key={w} className="text-center text-sm font-semibold text-slate-600 px-2 py-3">{w}주차</th>)}
                  </tr>
                </thead>
                <tbody>
                  {classList.map((c: any) => (
                    <tr key={c.id} className="border-t border-slate-200 break-inside-avoid">
                      <td className="px-4 py-3.5 text-base font-bold text-slate-900">{c.name}{schoolGroups.length > 1 && <span className="block text-sm font-normal text-slate-600">{c.schoolName}</span>}</td>
                      {weeks.map(w => {
                        const n = (c.weekResults || {})[String(w)] || 0;
                        const sh = shade(n);
                        return <td key={w} className="text-center text-base tabular-nums px-2 py-3.5 font-bold" style={{ background: sh.bg, color: sh.fg, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>{n === 0 ? '–' : n}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {/* 결과물 스냅샷 카드 */}
      {snapshotResult && (() => {
        const typeLabel = TYPE_CONFIG[snapshotResult.resultType]?.label;
        const cardInner = (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-slate-900 truncate">{snapshotResult.title || '제목 없음'}</p>
              <p className="text-base text-slate-600 truncate">
                {snapshotResult.className} · {snapshotResult.studentName} · {new Date(snapshotResult.createdAt).toLocaleDateString('ko-KR')}
              </p>
            </div>
            {typeLabel && <span className="shrink-0 text-base font-bold" style={{ color: '#e8412c' }}>{typeLabel}{snapshotResult.url ? ' 열기 →' : ''}</span>}
          </>
        );
        return (
          <section className="max-w-5xl mx-auto px-5 sm:px-6 pt-10 break-inside-avoid">
            <h2 className="text-2xl font-black text-slate-900">최근 올라온 결과물</h2>
            <p className="text-lg text-slate-600 mb-4">가장 최근에 올라온 학생 결과물이에요.</p>
            {snapshotResult.url ? (
              <a href={snapshotResult.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 hover:border-slate-900 px-5 sm:px-6 py-4 transition-colors">
                {cardInner}
              </a>
            ) : (
              <div className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 sm:px-6 py-4">{cardInner}</div>
            )}
          </section>
        );
      })()}

      {/* 하이라이트 갤러리 */}
      {highlightGallery.length > 0 && (
        <div className="max-w-5xl mx-auto px-5 sm:px-6 pt-10 break-inside-avoid">
          <h2 className="text-2xl font-black text-slate-900">수업 속 순간들</h2>
          <p className="text-lg text-slate-600 mb-4">사진을 누르면 크게 볼 수 있어요.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {highlightGallery.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setLightbox({ urls: highlightGallery.map(g => g.file_url), index: idx })}
                className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200"
              >
                <img src={item.file_url} alt={item.caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {(() => {
                  const clsName = classList.find(c => c.id === item.class_id)?.name;
                  return clsName ? (
                    <p className="absolute bottom-1.5 left-2 right-2 text-[13px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity truncate">{clsName}</p>
                  ) : null;
                })()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 학교별 목록 */}
      <div id="class-list" className="print:hidden scroll-mt-14 max-w-5xl mx-auto px-5 sm:px-6 pt-10 pb-12">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-2xl font-black text-slate-900">학급별 상세</h2>
          {schoolGroups.length > 1 && (
            <button
              onClick={() => setOpenSchools(allSchoolsOpen ? new Set() : new Set(schoolGroups.map(g => g.id)))}
              className="text-base font-bold underline underline-offset-4 hover:opacity-70 transition-opacity"
              style={{ color: theme.from }}
            >
              {allSchoolsOpen ? '모두 접기' : '모두 펼치기'}
            </button>
          )}
        </div>
        {classList.length > 0 && (
          <div className="mb-4 rounded-xl bg-white border border-slate-200 px-4 sm:px-5 py-4">
            <p className="text-base font-black text-slate-900 mb-2">결과는 이렇게 찾아보세요</p>
            <ol className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-base text-slate-700">
              {(schoolGroups.length > 1
                ? ['학교를 눌러 펼치기', '보고 싶은 학급의 「결과 보기」 누르기', '학생·조를 눌러 결과물 크게 보기']
                : ['보고 싶은 학급의 「결과 보기」 누르기', '학생·조를 눌러 결과물 크게 보기']
              ).map((t, i) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full text-white text-sm font-black flex items-center justify-center shrink-0" style={{ background: theme.from }}>{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {classList.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <School size={40} className="mx-auto mb-3" />
            <p className="font-bold text-lg">등록된 학급이 없습니다.</p>
          </div>
        ) : schoolGroups.map(g => {
          const schoolOpen = openSchools.has(g.id);
          const teacherNames = Array.from(new Set(g.classes.map((c: any) => c.teacher_name).filter(Boolean)));
          const schoolStudents = g.classes.reduce((s: number, c: any) => s + c.studentCount, 0);
          return (
            <div key={g.id} className="bg-white rounded-xl border border-slate-200 mb-3 overflow-hidden">
              <button
                onClick={() => setOpenSchools(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}
                aria-expanded={schoolOpen}
                className="w-full grid grid-cols-[1fr_auto_auto_24px] sm:grid-cols-[1fr_90px_90px_24px] gap-3 items-center px-5 sm:px-6 py-5 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-slate-900 truncate">{g.name}</h3>
                  {teacherNames.length > 0 && <p className="text-base text-slate-600 truncate">{teacherNames.join(', ')} 선생님</p>}
                  <p className="text-sm font-bold mt-0.5" style={{ color: theme.from }}>{schoolOpen ? '학급 목록을 보고 있어요' : '눌러서 학급 보기 →'}</p>
                </div>
                <p className="text-right text-2xl font-black tabular-nums text-slate-900">{g.classes.length}<span className="block text-base font-normal text-slate-600">학급</span></p>
                <p className="text-right text-2xl font-black tabular-nums text-slate-900">{schoolStudents}<span className="block text-base font-normal text-slate-600">학생</span></p>
                <ChevronDown size={20} className={`transition-transform duration-200 ${schoolOpen ? 'rotate-180' : ''}`} style={{ color: schoolOpen ? theme.from : '#64748b' }} />
              </button>
              {schoolOpen && (
              <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-3">
        {g.classes.map((cls: any) => {
          const isExpanded = activeClassId === cls.id;
          const students = classStudents[cls.id] || [];
          const gallery = classGallery[cls.id] || [];
          const isLoading = loadingClass === cls.id;
          const totalObs = students.reduce((s, st) => s + st.observations.length, 0);
          const totalResults = students.reduce((s, st) => s + st.resultGroups.length, 0);

          return (
            <motion.div key={cls.id} id={`cls-${cls.id}`} style={{ scrollMarginTop: 56 }}
              initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 ${isExpanded ? 'border-slate-300 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
              {/* 클래스 헤더 */}
              <button onClick={() => handleToggleClass(cls.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left">
                <div className="flex items-center gap-4 min-w-0">
                                    <div className="min-w-0">
                    <h3 className="font-black text-lg truncate text-slate-900">{cls.name}</h3>
                    <p className="text-base text-slate-600">
                      {cls.subject && <span className="mr-2">{cls.subject}</span>}
                      {cls.teacher_name && <span className="font-bold" style={{ color: theme.from }}>{cls.teacher_name} 선생님</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                  <span className="flex items-center gap-1.5 text-base font-bold text-slate-700">
                    <Users size={15} /> {cls.studentCount}명
                  </span>
                  {isExpanded && students.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5">
                      {totalObs > 0 && (
                        <span className="text-[13px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">📝 {totalObs}건</span>
                      )}
                      {totalResults > 0 && (
                        <span className="text-[13px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">📁 {totalResults}건</span>
                      )}
                      {gallery.length > 0 && (
                        <span className="text-[13px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100">🖼️ {gallery.length}장</span>
                      )}
                    </div>
                  )}
                  <span className="inline-flex items-center gap-1 text-sm font-black px-3 py-2 rounded-lg text-white whitespace-nowrap"
                    style={{ background: isExpanded ? '#64748b' : theme.from }}>
                    {isLoading ? <Loader2 size={15} className="animate-spin" /> : isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {isExpanded ? '접기' : '결과 보기'}
                  </span>
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
                  {isLoading && students.length === 0 ? (
                    <div className="py-10 flex justify-center"><PercentLoader label="학생 기록 불러오는 중" /></div>
                  ) : students.length === 0 && !isLoading ? (
                    <div className="py-8 text-center text-gray-300">
                      <Users size={24} className="mx-auto mb-2" />
                      <p className="text-sm">등록된 학생이 없습니다.</p>
                    </div>
                  ) : (() => {
                    const evalMap = classEvalMap[cls.id] || {};

                    const allWeeks = Array.from(new Set([
                      ...students.flatMap(s => s.observations.map(o => o.week_number).filter(Boolean)),
                      ...students.flatMap(s => s.resultGroups.map(g => g.week_number).filter(Boolean)),
                    ] as number[])).sort((a, b) => a - b);

                    const weeklyJourney = buildWeeklyJourney(cls.weekly_plan || [], students, gallery);

                    const filteredStudents = weekFilter === 'all' ? students : students.map(s => ({
                      ...s,
                      observations: s.observations.filter(o => o.week_number === weekFilter),
                      resultGroups: s.resultGroups.filter(g => g.week_number === weekFilter),
                    }));
                    // 조별 제출은 조원 수만큼 복제돼 있으므로 조 단위 한 묶음으로 보여 준다
                    const classGroups = classGroupsMap[cls.id] || [];
                    const bundledByGroup = new Map<string, Map<string, ResultGroup>>();
                    const isBundled = (sid: string, rg: ResultGroup) => {
                      if (!rg.isGroupSubmission) return null;
                      return rg.group_id || classGroups.find(g => g.memberIds.includes(sid))?.id || null;
                    };
                    filteredStudents.forEach(s => s.resultGroups.forEach(rg => {
                      const gid = isBundled(s.id, rg);
                      if (!gid || !classGroups.some(g => g.id === gid)) return;
                      const m = bundledByGroup.get(gid) || new Map<string, ResultGroup>();
                      const key = `${gid}|${rg.created_at}|${rg.types.join(',')}`;
                      if (!m.has(key)) m.set(key, rg);
                      bundledByGroup.set(gid, m);
                    }));
                    const groupCards: StudentWithData[] = classGroups
                      .filter(g => bundledByGroup.has(g.id))
                      .map(g => {
                        const names = g.memberIds.map(id => students.find(s => s.id === id)).filter(Boolean)
                          .sort((a, b) => (a!.student_number ?? 0) - (b!.student_number ?? 0)).map(s => s!.full_name);
                        return {
                          id: `group-${g.id}`, full_name: `${g.name} 결과`, student_number: null, avatar_url: null,
                          observations: [], memberNames: names,
                          resultGroups: [...bundledByGroup.get(g.id)!.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
                        };
                      });
                    const individualStudents = filteredStudents
                      .map(s => ({ ...s, resultGroups: s.resultGroups.filter(rg => { const gid = isBundled(s.id, rg); return !(gid && bundledByGroup.has(gid)); }) }))
                      .filter(s => s.observations.length > 0 || s.resultGroups.length > 0
                        || !filteredStudents.find(o => o.id === s.id)!.resultGroups.some(rg => { const gid = isBundled(s.id, rg); return gid && bundledByGroup.has(gid); }));
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
                        appToast('엑셀 파일 생성 중 오류가 발생했습니다.');
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
                                <p className="text-sm font-bold text-gray-400">아직 등록된 주차별 활동이 없습니다</p>
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="flex items-center gap-1.5 mb-3">
                                  <h4 className="text-lg font-black text-slate-900">학습 여정</h4>
                                </div>
                                <div className="absolute left-[23px] top-10 bottom-2 w-px bg-slate-200" />
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
                                      <div className="relative z-10 shrink-0 w-12 h-12 rounded-lg text-white flex flex-col items-center justify-center" style={{ background: '#0e1a33' }}>
                                        <span className="text-[10px] font-bold opacity-80 leading-none">WEEK</span>
                                        <span className="text-base font-black leading-none">{wk.week}</span>
                                      </div>
                                      <div className="flex-1 min-w-0 pb-5 border-b border-slate-200">
                                        <div className="flex items-start justify-between gap-2 flex-wrap">
                                          <div className="min-w-0">
                                                                                        <h4 className="text-lg font-black text-slate-900">{wk.topic || `${wk.week}주차 활동`}</h4>
                                          </div>
                                          {wk.resultCount > 0 ? (
                                            <button
                                              onClick={() => {
                                                setWeekFilter(wk.week);
                                                setActiveTab('results');
                                                setTimeout(() => document.getElementById(`results-${cls.id}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }), 80);
                                              }}
                                              className="shrink-0 flex items-center gap-1 text-base font-black hover:underline transition-colors" style={{ color: '#e8412c' }}
                                            >
                                              {wk.week}주차 결과물 {wk.resultCount}건 보기 <ArrowRight size={11} />
                                            </button>
                                          ) : (
                                            <span className="shrink-0 text-base font-bold text-slate-400">아직 올라온 결과물이 없어요</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2.5 mt-2 flex-wrap text-base font-bold text-slate-500">
                                          <span className="flex items-center gap-1"><Users size={10} /> 참여 {wk.participantCount}명</span>
                                          {wk.obsCount > 0 && <span>활동기록 {wk.obsCount}건</span>}
                                          {wk.resultCount > 0 && <span>결과물 {wk.resultCount}건</span>}
                                        </div>
                                        {wk.samples.length > 0 && (
                                          <div className="mt-3 space-y-2">
                                            {wk.samples.map((t, i) => (
                                              <p key={i} className="text-[17px] text-slate-700 leading-relaxed line-clamp-2 pl-3 border-l-2" style={{ borderColor: '#e8412c' }}>“{t}”</p>
                                            ))}
                                          </div>
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
                        <div id={`results-${cls.id}`} style={{ scrollMarginTop: 56 }} className="px-6 pt-4 flex items-center gap-2 flex-wrap border-b border-slate-200">
                          <div className="flex items-center gap-5 flex-wrap">
                            {[
                              { key: 'results', label: '결과 확인', icon: FileText },
                              { key: 'gallery', label: `갤러리${gallery.length > 0 ? ` (${gallery.length})` : ''}`, icon: Images },
                              { key: 'setech', label: '학급 기록', icon: BookOpen },
                              ...(cls.shared_survey_form_id && surveyDataByForm[cls.shared_survey_form_id] ? [{ key: 'survey', label: '설문 결과', icon: BarChart2 }] : []),
                            ].map(({ key, label, icon: Icon }) => (
                              <button
                                key={key}
                                onClick={() => setActiveTab(key as 'results' | 'gallery' | 'setech' | 'survey')}
                                className={`flex items-center gap-1.5 pb-3 -mb-px border-b-2 text-base font-black transition-all ${activeTab === key ? 'text-slate-900 border-[#e8412c]' : 'text-slate-400 border-transparent hover:text-slate-700'}`}
                              >
                                <Icon size={15} />{label}
                              </button>
                            ))}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 pb-2">
                            <button onClick={() => handleRefreshClass(cls.id)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all" title="새로고침">
                              <RefreshCw size={13} />
                            </button>
                            <button onClick={downloadCSV} className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-black transition-all" title="CSV 다운로드">
                              <FileText size={13} /><span className="hidden sm:inline">CSV</span>
                            </button>
                            <button onClick={downloadXLSX} disabled={downloading} className="flex items-center gap-1.5 px-3 py-2 hover:opacity-90 disabled:opacity-40 text-white rounded-lg text-sm font-black transition-all" style={{ background: '#0e1a33' }} title="XLSX 엑셀 다운로드">
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
                                  <div key={label} className="bg-white rounded-xl p-4 border border-slate-200">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Icon size={12} className="text-gray-400" />
                                      <p className="text-base font-bold text-slate-600">{label}</p>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-2xl font-black text-slate-900">{value}</span>
                                      <span className="text-base font-bold text-slate-500">{unit}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 출석 요약 카드 (학급 전체 통계만, 학생별 상세 없음) */}
                              {cls.show_attendance_summary && attendanceByClass[cls.id] && attendanceByClass[cls.id].total > 0 && (
                                <div className="bg-white rounded-xl border border-slate-200 p-4">
                                  <p className="text-lg font-black text-slate-900 mb-3">출석 요약</p>
                                  <AttendanceDonutChart total={attendanceByClass[cls.id].total} byStatus={attendanceByClass[cls.id].byStatus} />
                                </div>
                              )}

                              {allWeeks.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-base font-black text-slate-600 mr-1">주차:</span>
                                  <button onClick={() => setWeekFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all ${weekFilter === 'all' ? 'bg-[#0e1a33] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-900'}`}>전체</button>
                                  {allWeeks.map(w => (
                                    <button key={w} onClick={() => setWeekFilter(w)} className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all ${weekFilter === w ? 'bg-[#0e1a33] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-900'}`}>{w}주차</button>
                                  ))}
                                </div>
                              )}

                              {groupCards.length > 0 && (
                                <p className="flex items-center gap-2 text-lg font-black text-slate-900">
                                  <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200">👥 조별 제출</span>
                                  <span>{groupCards.length}개 조</span>
                                </p>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {groupCards.map(card => (
                                  <div key={card.id} className="flex flex-col gap-1.5">
                                  <button
                                    onClick={() => setModalStudent(card)}
                                    className="text-left flex-1 bg-white rounded-xl border border-violet-200 hover:border-violet-500 p-3.5 transition-all cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200">👥 조별 제출</span>
                                      <span className="text-base font-bold text-slate-700">결과물 {card.resultGroups.length}건</span>
                                    </div>
                                    <ResultThumb target={thumbFor(card)} className="mb-2.5" />
                                    <p className="font-bold text-base text-slate-900 mb-1">{card.full_name}</p>
                                    {card.memberNames && card.memberNames.length > 0 && (
                                      <p className="text-sm text-slate-500 leading-relaxed">조원: {card.memberNames.join(', ')}</p>
                                    )}
                                  </button>
                                  <QuickOpenLink target={quickOpenFor(card)} />
                                  </div>
                                ))}
                              </div>
                              {groupCards.length > 0 && individualStudents.length > 0 && (
                                <p className="flex items-center gap-2 text-lg font-black text-slate-900 pt-2">
                                  <span className="text-[13px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">🙋 개인 제출</span>
                                  <span>{individualStudents.length}명</span>
                                </p>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {individualStudents.map(student => {
                                  const hasData = student.observations.length > 0 || student.resultGroups.length > 0;
                                  return (
                                    <div key={student.id} className="flex flex-col gap-1.5">
                                    <button
                                      onClick={() => hasData && setModalStudent(student)}
                                      disabled={!hasData}
                                      className={`text-left flex-1 bg-white rounded-xl border p-3.5 transition-all ${hasData ? 'border-slate-200 hover:border-slate-900 cursor-pointer' : 'border-slate-200 opacity-50 cursor-default'}`}
                                    >
                                      <div className="w-8 h-8 rounded-full overflow-hidden mb-2.5 bg-gray-100">
                                        <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                                      </div>
                                      <ResultThumb target={thumbFor(student)} className="mb-2.5" />
                                      <p className="font-bold text-base truncate mb-1">{student.full_name}</p>
                                      <div className="flex flex-col gap-1">
                                        {student.observations.length > 0 && <span className="text-base font-bold text-slate-700">활동기록 {student.observations.length}건</span>}
                                        {student.resultGroups.length > 0 && <span className="text-base font-bold text-slate-700">결과물 {student.resultGroups.length}건</span>}
                                        {!hasData && <span className="text-base text-slate-400">기록 없음</span>}
                                      </div>
                                    </button>
                                    <QuickOpenLink target={quickOpenFor(student)} />
                                    </div>
                                  );
                                })}
                              </div>

                              {filteredStudents.length === 0 && (
                                <div className="flex flex-col items-center py-16 space-y-2">
                                  <Users size={28} className="text-gray-300" />
                                  <p className="text-sm font-bold text-gray-400">등록된 학생이 없습니다</p>
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
                                    <span className="text-base font-black text-slate-600 mr-1">주차:</span>
                                    <button onClick={() => setWeekFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all ${weekFilter === 'all' ? 'bg-[#0e1a33] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-900'}`}>전체</button>
                                    {allWeeks.map(w => (
                                      <button key={w} onClick={() => setWeekFilter(w)} className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all ${weekFilter === w ? 'bg-[#0e1a33] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-900'}`}>{w}주차</button>
                                    ))}
                                  </>
                                )}
                                {galleryImgs.length > 0 && (
                                  <button onClick={handleZipDownload} disabled={zipping} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e1a33] hover:opacity-90 disabled:opacity-50 text-white text-sm font-black transition-all shadow-sm">
                                    {zipping ? <><Loader2 size={13} className="animate-spin" /> ZIP 생성 중...</> : <><Download size={13} /> 전체 ZIP 다운로드 ({galleryImgs.length}장)</>}
                                  </button>
                                )}
                              </div>
                              {filteredGallery.some((g) => g.file_type === 'video') && (
                                <p className="flex items-center gap-1 text-[13px] text-gray-400 mt-2">
                                  <AlertCircle size={11} className="shrink-0" />
                                  영상은 이 버튼으로 받아지지 않습니다. 영상을 눌러 재생 화면에서 개별적으로 다운로드해 주세요.
                                </p>
                              )}

                              {filteredGallery.length === 0 ? (
                                <div className="flex flex-col items-center py-16 space-y-2">
                                  <Images size={28} className="text-gray-300" />
                                  <p className="text-sm font-bold text-gray-400">등록된 갤러리 항목이 없습니다</p>
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
                                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 hover:bg-[#0e1a33] flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
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
                                          <p className="text-[13px] font-bold px-2 text-center truncate w-full">{item.file_name || '파일'}</p>
                                        </div>
                                      )}
                                      {item.caption && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 pointer-events-none">
                                          <p className="text-[13px] text-white truncate">{item.caption}</p>
                                        </div>
                                      )}
                                      {item.week_number && (
                                        <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[13px] font-black px-1.5 py-0.5 rounded-md pointer-events-none">
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
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-900 disabled:opacity-50 text-slate-900 text-sm font-black transition-all"
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
                                    <div key={label} className="bg-white rounded-xl p-4 border border-slate-200">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Icon size={12} className="text-gray-400" />
                                        <p className="text-[13px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                                      </div>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-gray-900">{value}</span>
                                        <span className="text-sm font-bold text-gray-400">{unit}</span>
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
                                            <p className="font-bold text-base text-gray-900">{student.full_name}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                              {ev?.achievement_level && (
                                                <span className={`text-[13px] font-black px-2 py-0.5 rounded-full ${achLabel(ev.achievement_level)}`}>성취도 {ev.achievement_level}</span>
                                              )}
                                              {hasContent && <span className="text-[13px] font-bold text-gray-400">{content.length}자</span>}
                                            </div>
                                          </div>
                                          <span className={`shrink-0 text-[13px] font-black px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                                          {hasContent && <div className="shrink-0 text-gray-400">{isExpandedSetech ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>}
                                        </button>
                                        {isExpandedSetech && (
                                          <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                                            <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {setechRows.length === 0 && (
                                  <div className="flex flex-col items-center py-16 space-y-2">
                                    <BookOpen size={28} className="text-gray-300" />
                                    <p className="text-sm font-bold text-gray-400">등록된 학생이 없습니다</p>
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
                                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                                  <p className="font-black text-gray-900">{surveyResult.formTitle}</p>
                                  <p className="text-sm font-bold text-gray-400">총 {surveyResult.responseCount}명 응답</p>
                                </div>
                                {surveyResult.questions.map((q, i) => {
                                  const answers = surveyResult.answersByQuestion[q.id] || [];
                                  return (
                                    <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5">
                                      <p className="font-black text-gray-900 text-base mb-3">{i + 1}. {q.text}</p>
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
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <BookOpen size={12} />
                            <span>총 {students.length}명 · 기록 {students.reduce((s, st) => s + st.observations.length + st.resultGroups.length, 0)}건</span>
                          </div>
                          <a href={`/share/${cls.id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition-all">
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
              )}
            </div>
          );
        })}
      </div>

      {/* 인쇄(PDF) 전용: 학급별 상세 (학생 이름 없이 학습 여정 중심) */}
      <section className="hidden print:block max-w-5xl mx-auto px-6 pt-6">
        <h2 className="text-2xl font-black text-slate-900 mb-3">학급별 상세</h2>
        {classList.map((cls: any) => {
          const st = classStudents[cls.id] || [];
          const jr = cls.show_learning_journey ? buildWeeklyJourney(cls.weekly_plan || [], st, classGallery[cls.id] || []) : [];
          const teachers = cls.teacher_name ? [cls.teacher_name] : [];
          return (
            <div key={cls.id} className="mb-6 pt-3 border-t-2 border-slate-900">
              <div className="break-inside-avoid">
                <p className="text-xl font-black text-slate-900">{cls.name}</p>
                <p className="text-base text-slate-600">
                  {[cls.schoolName, teachers.length > 0 ? `${teachers.join(', ')} 선생님` : ''].filter(Boolean).join(' · ')}
                </p>
                <p className="text-base font-bold text-slate-800 mt-1">
                  학생 {st.length || cls.studentCount || 0}명 · 결과물 {cls.resultCount ?? 0}건 · 활동 기록 {cls.obsCount ?? 0}건
                </p>
              </div>
              {jr.length === 0 ? (
                <p className="text-base text-slate-500 mt-2">등록된 주차별 활동이 없어요.</p>
              ) : jr.map(wk => (
                <div key={wk.week} className="break-inside-avoid flex gap-3 py-2 border-b border-slate-200">
                  <span className="shrink-0 w-14 text-base font-black" style={{ color: '#e8412c' }}>{wk.week}주차</span>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-900">{wk.topic || `${wk.week}주차 활동`}</p>
                    <p className="text-sm text-slate-600">참여 {wk.participantCount}명 · 결과물 {wk.resultCount}건{wk.obsCount > 0 ? ` · 활동기록 ${wk.obsCount}건` : ''}</p>
                    {wk.samples.map((t, i) => <p key={i} className="text-sm text-slate-700 mt-1 pl-2 border-l-2" style={{ borderColor: '#e8412c' }}>“{t}”</p>)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </section>

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
              <span className="text-[13px] font-black" style={{ color: theme.from }}>클래스로그 AI</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black mb-2 tracking-tight text-white">
              이런 학급 공유 페이지, 우리 학교도 만들어볼까요?
            </h2>
            <p className="text-base mb-6 text-gray-400">
              학급 관리부터 학생 결과 공유, AI 세특 작성까지 — 클래스로그 AI 하나로 끝냅니다
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-7">
              {['학교·학급 그룹 관리', '학생 활동 기록 자동 정리', 'AI 세특 초안 생성'].map(item => (
                <span key={item} className="flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full bg-white/5 text-gray-300">
                  <CheckCircle2 size={13} style={{ color: theme.from }} /> {item}
                </span>
              ))}
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-base font-black text-white transition-all active:scale-95 shadow-lg hover:brightness-110"
              style={{ background: theme.from }}
            >
              무료로 시작하기 <ArrowRight size={16} />
            </a>
          </div>
        </motion.div>
      </div>

      <footer className="text-center py-4 text-sm text-gray-300">
        클래스로그 · 학교 프로젝트 공유 페이지
      </footer>
    </div>
  );
};

export default SchoolProjectShareView;
