import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import JSZip from 'jszip';
import { buildXlsxBlob } from '../lib/xlsxBuilder';
import type { XCell } from '../lib/xlsxBuilder';
import { supabase } from '../lib/supabase';
import { fetchPublicDriveFolderItems, driveItemToPublicGalleryItem, parseVideoUrl } from '../lib/gallery';
import { getResultImagePublicUrls } from '../components/common/ImageCarousel';
import { WeeklyTrendChart, type WeeklyTrendPoint } from '../components/share/ShareCharts';
import {
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
  ArrowRight,
  School,
  BookOpen,
  Sparkles,
} from 'lucide-react';

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
  teacher_eval_score?: number | null;
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

interface ClassData {
  id: string;
  name: string;
  subject: string;
  weekly_plan: any[];
  show_learning_journey: boolean;
  studentData: StudentData[];
  galleryItems: GalleryItem[];
  evalMap: Record<string, EvalRow>;
  loaded: boolean;
}

// 학생 개인 스코프로 주차별 참여도(관찰+결과 건수)/평가점수 평균 집계
function buildStudentWeeklyTrend(obs: ObsRow[], results: ResultRow[]): WeeklyTrendPoint[] {
  const weekMap: Record<number, { engagement: number; scoreSum: number; scoreCount: number }> = {};
  const ensure = (w: number) => {
    if (!weekMap[w]) weekMap[w] = { engagement: 0, scoreSum: 0, scoreCount: 0 };
    return weekMap[w];
  };
  obs.forEach(o => { if (o.week_number) ensure(o.week_number).engagement += 1; });
  results.forEach(r => {
    if (!r.week_number) return;
    const wk = ensure(r.week_number);
    wk.engagement += 1;
    if (typeof r.teacher_eval_score === 'number') { wk.scoreSum += r.teacher_eval_score; wk.scoreCount += 1; }
  });
  return Object.entries(weekMap)
    .map(([week, v]) => ({ week: Number(week), engagement: v.engagement, avgScore: v.scoreCount > 0 ? v.scoreSum / v.scoreCount : null }))
    .sort((a, b) => a.week - b.week);
}

const SchoolShareView = () => {
  const { schoolId } = useParams<{ schoolId: string }>();

  const sessionKey = `school_verified_${schoolId}`;
  const [verified, setVerified] = useState(() => sessionStorage.getItem(`school_verified_${schoolId}`) === 'true');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [classList, setClassList] = useState<{ id: string; name: string; subject: string; weekly_plan: any[]; show_learning_journey: boolean }[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [classDataMap, setClassDataMap] = useState<Record<string, ClassData>>({});
  const [loadingClassId, setLoadingClassId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'journey' | 'results' | 'gallery' | 'setech'>('journey');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [weekFilter, setWeekFilter] = useState<number | 'all'>('all');
  const [lightbox, setLightbox] = useState<{ urls: string[]; names: string[]; index: number } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Step 1: 학교 메타 + 클래스 목록 로드
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      setMetaLoading(true);
      const { data: school, error } = await supabase
        .from('schools')
        .select('id, name, entry_code, share_enabled')
        .eq('id', schoolId)
        .single();

      if (error || !school) {
        setMetaError('공유 링크가 유효하지 않거나 접근할 수 없습니다.');
        setMetaLoading(false);
        return;
      }
      if (school.share_enabled === false) {
        setMetaError('이 공유 링크는 현재 비활성화되어 있습니다.\n담당 선생님께 문의해주세요.');
        setMetaLoading(false);
        return;
      }

      setSchoolInfo(school);

      const { data: classes } = await supabase
        .from('classes')
        .select('id, name, subject, weekly_plan, show_learning_journey')
        .eq('school_id', schoolId)
        .eq('is_archived', false)
        .order('name', { ascending: true });

      const loadedClasses = classes || [];
      setClassList(loadedClasses);
      if (loadedClasses.length > 0) setActiveClassId(loadedClasses[0].id);

      setMetaLoading(false);
    })();
  }, [schoolId]);

  // Step 2: 선택된 클래스 데이터 로드
  const fetchClassData = useCallback(async (classId: string) => {
    const cls = classList.find(c => c.id === classId);
    if (!cls) return;

    setLoadingClassId(classId);

    try {
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
      const topicWeekMap: Record<string, number> = {};
      ((cls.weekly_plan as any[]) || []).forEach((p: any) => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_number, avatar_url')
        .eq('class_id', classId)
        .order('student_number', { ascending: true });

      const studentList = (students || []).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ko'));
      const studentIds = studentList.map(s => s.id);

      let studentData: StudentData[] = [];

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
            .select('id, student_id, week_number, title, text_content, result_type, created_at, link_url, storage_path, storage_paths, teacher_eval_score')
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

        studentData = studentList.map(student => ({
          student,
          obs: obsWithWeek.filter(o => o.student_id === student.id),
          results: resultsWithUrls.filter(r => r.student_id === student.id),
        }));
      }

      const [{ data: gallery }, driveResult] = await Promise.all([
        supabase
          .from('class_gallery_items')
          .select('id, file_url, file_type, file_name, caption, week_number, created_at')
          .eq('class_id', classId)
          .order('created_at', { ascending: false }),
        fetchPublicDriveFolderItems(classId).catch(() => ({ items: [], folders: [] })),
      ]);
      const driveItems = driveResult.items;

      // 세특(학급 기록) 데이터
      let evalMap: Record<string, EvalRow> = {};
      if (studentIds.length > 0) {
        const { data: evals } = await supabase
          .from('student_evaluations')
          .select('student_id, setech_content, achievement_level, status')
          .in('student_id', studentIds);
        (evals || []).forEach((e: any) => { evalMap[e.student_id] = e; });
      }

      setClassDataMap(prev => ({
        ...prev,
        [classId]: {
          id: classId,
          name: cls.name,
          subject: cls.subject,
          weekly_plan: cls.weekly_plan,
          show_learning_journey: cls.show_learning_journey ?? true,
          studentData,
          galleryItems: [...(gallery || []), ...driveItems.map(driveItemToPublicGalleryItem)],
          evalMap,
          loaded: true,
        },
      }));
    } finally {
      setLoadingClassId(null);
    }
  }, [classList]);

  // 탭 전환 시 미로드 클래스 자동 로드
  useEffect(() => {
    if (!verified || !activeClassId) return;
    if (!classDataMap[activeClassId]?.loaded) {
      fetchClassData(activeClassId);
    }
    // 탭/필터 초기화 (학습 여정이 꺼진 학급은 결과 확인 탭부터 시작)
    const cls = classList.find(c => c.id === activeClassId);
    setActiveTab((cls?.show_learning_journey ?? true) ? 'journey' : 'results');
    setWeekFilter('all');
    setExpandedIds(new Set());
  }, [activeClassId, verified, classList]);

  // 검증 후 첫 클래스 자동 로드
  useEffect(() => {
    if (verified && activeClassId && !classDataMap[activeClassId]?.loaded) {
      fetchClassData(activeClassId);
    }
  }, [verified]);

  const handleVerify = async () => {
    if (!schoolInfo) return;
    setVerifying(true);
    setCodeError('');
    await new Promise(r => setTimeout(r, 300));
    if (codeInput.trim().toUpperCase() === schoolInfo.entry_code) {
      sessionStorage.setItem(sessionKey, 'true');
      setVerified(true);
    } else {
      setCodeError('입장 코드가 올바르지 않습니다. 담당 선생님께 확인해 주세요.');
    }
    setVerifying(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const currentData = activeClassId ? classDataMap[activeClassId] : null;

  const allWeeks = useMemo(() => {
    if (!currentData) return [];
    return Array.from(new Set([
      ...currentData.studentData.flatMap(sd => sd.obs.map(o => o.week_number).filter(Boolean)),
      ...currentData.studentData.flatMap(sd => sd.results.map(r => r.week_number).filter(Boolean)),
    ] as number[])).sort((a, b) => a - b);
  }, [currentData]);

  // 주차별 학습 여정: weekly_plan(주제) + 활동기록/결과물/갤러리(week_number)를 주차 단위로 통합
  const weeklyJourney = useMemo(() => {
    if (!currentData) return [];
    type WeekEntry = {
      week: number;
      topic: string | null;
      participants: Set<string>;
      obsCount: number;
      resultCount: number;
      evalScoreSum: number;
      evalScoreCount: number;
      images: string[];
      sampleText: string | null;
    };
    const weekMap: Record<number, WeekEntry> = {};
    const ensure = (w: number) => {
      if (!weekMap[w]) {
        weekMap[w] = { week: w, topic: null, participants: new Set(), obsCount: 0, resultCount: 0, evalScoreSum: 0, evalScoreCount: 0, images: [], sampleText: null };
      }
      return weekMap[w];
    };

    (currentData.weekly_plan || []).forEach((p: any) => {
      const w = Number(p.week);
      if (!w) return;
      ensure(w).topic = p.topic || null;
    });

    currentData.studentData.forEach(({ student, obs, results }) => {
      obs.forEach(o => {
        if (!o.week_number) return;
        const wk = ensure(o.week_number);
        wk.participants.add(student.id);
        wk.obsCount += 1;
        if (!wk.sampleText && o.content) wk.sampleText = o.content.length > 120 ? `${o.content.slice(0, 120)}…` : o.content;
      });
      results.forEach(r => {
        if (!r.week_number) return;
        const wk = ensure(r.week_number);
        wk.participants.add(student.id);
        wk.resultCount += 1;
        if (typeof r.teacher_eval_score === 'number') { wk.evalScoreSum += r.teacher_eval_score; wk.evalScoreCount += 1; }
        (r.image_urls || []).forEach(u => { if (wk.images.length < 8 && !wk.images.includes(u)) wk.images.push(u); });
        if (!wk.sampleText && r.text_content) wk.sampleText = r.text_content.length > 120 ? `${r.text_content.slice(0, 120)}…` : r.text_content;
      });
    });

    currentData.galleryItems.forEach(g => {
      if (!g.week_number || g.file_type !== 'image') return;
      const wk = ensure(g.week_number);
      if (wk.images.length < 8 && !wk.images.includes(g.file_url)) wk.images.push(g.file_url);
    });

    return Object.values(weekMap)
      .map(wk => ({ ...wk, participantCount: wk.participants.size }))
      .sort((a, b) => a.week - b.week);
  }, [currentData]);

  const weeklyTrendData = useMemo((): WeeklyTrendPoint[] => weeklyJourney.map(wk => ({
    week: wk.week,
    engagement: wk.obsCount + wk.resultCount,
    avgScore: wk.evalScoreCount > 0 ? wk.evalScoreSum / wk.evalScoreCount : null,
  })), [weeklyJourney]);

  const studentTrendMap = useMemo(() => {
    const map: Record<string, WeeklyTrendPoint[]> = {};
    if (!currentData) return map;
    currentData.studentData.forEach(({ student, obs, results }) => {
      map[student.id] = buildStudentWeeklyTrend(obs, results);
    });
    return map;
  }, [currentData]);

  const filteredData = useMemo(() => {
    if (!currentData) return [];
    return currentData.studentData.map(sd => ({
      ...sd,
      obs: weekFilter === 'all' ? sd.obs : sd.obs.filter(o => o.week_number === weekFilter),
      results: weekFilter === 'all' ? sd.results : sd.results.filter(r => r.week_number === weekFilter),
    }));
  }, [currentData, weekFilter]);

  const filteredGallery = useMemo(() => {
    if (!currentData) return [];
    return weekFilter === 'all' ? currentData.galleryItems : currentData.galleryItems.filter(g => g.week_number === weekFilter);
  }, [currentData, weekFilter]);

  const totalObs = filteredData.reduce((a, sd) => a + sd.obs.length, 0);
  const totalResults = filteredData.reduce((a, sd) => a + sd.results.length, 0);
  const activeCount = filteredData.filter(sd => sd.obs.length > 0 || sd.results.length > 0).length;
  const allGalleryImgs = filteredGallery.filter(g => g.file_type === 'image');
  const allGalleryImgUrls = allGalleryImgs.map(g => g.file_url);
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
          const ext = item.file_url.split('.').pop()?.split('?')[0] || 'webp';
          const name = `${String(i + 1).padStart(3, '0')}_${item.file_name?.replace(/\.[^.]+$/, '') || `image_${i + 1}`}.${ext}`;
          zip.file(name, blob);
        })
      );
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const label = weekFilter === 'all' ? '전체' : `${weekFilter}주차`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${currentData?.name || '갤러리'}_${label}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setZipping(false);
    }
  };

  // ── CSV 다운로드 ──────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!currentData) return;
    const className = currentData.name || '클래스';
    const headers = ['번호', '이름', '활동기록 수', '결과물 수', '세특 상태', '성취도', '세특 글자수'];
    const rows = currentData.studentData.map(({ student, obs, results }) => {
      const ev = currentData.evalMap[student.id];
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
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const todayStr = new Date()
      .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\. /g, '').replace(/\.$/, '');
    a.download = `${schoolInfo?.name || ''}_${className}_전체학생_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── XLSX 다운로드 ──────────────────────────────────────────────────────────
  const downloadXLSX = async () => {
    if (!currentData) return;
    setDownloading(true);
    try {
      const className = currentData.name || '클래스';
      const sl = (s?: string | null) => (s === 'done' || s === 'final' ? '완료' : s === 'draft' ? '초안' : '미작성');

      // 시트 1: 전체학생
      const sheet1Rows: XCell[][] = [
        [
          { value: '번호', style: 'header' }, { value: '이름', style: 'header' },
          { value: '활동기록 수', style: 'header' }, { value: '결과물 수', style: 'header' },
          { value: '성취도', style: 'header' },
        ],
        ...currentData.studentData.map(({ student, obs, results }) => {
          const ev = currentData.evalMap[student.id];
          return [
            { value: student.student_number ?? null },
            { value: student.full_name },
            { value: obs.length },
            { value: results.length },
            { value: ev?.achievement_level ?? '' },
          ] as XCell[];
        }),
      ];

      // 시트 2~N: 학생별 개별 시트
      const studentSheets = currentData.studentData.map(({ student, obs, results }) => {
        const sheetName = `${student.student_number ?? '?'}. ${student.full_name}`
          .replace(/[/\\?*[\]:]/g, '_')
          .slice(0, 31);
        const label = `${student.student_number != null ? student.student_number + '번 ' : ''}${student.full_name}`;
        const rows: (XCell | null)[][] = [];

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
            obs.forEach(o => {
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
            results.forEach(r => {
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

      // 마지막 시트: 학급 기록 (세특)
      const sheet3Rows: XCell[][] = [
        [
          { value: '번호', style: 'header' }, { value: '이름', style: 'header' },
          { value: '성취도', style: 'header' }, { value: '상태', style: 'header' },
          { value: '세특 문장', style: 'header' }, { value: '글자수', style: 'header' },
        ],
        ...currentData.studentData.map(({ student }) => {
          const ev = currentData.evalMap[student.id];
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
        { name: '학급 기록', colWidths: [6, 14, 10, 10, 65, 10], rows: sheet3Rows },
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${schoolInfo?.name || ''}${schoolInfo?.name ? '_' : ''}${className}_학생기록_${todayStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('XLSX 다운로드 오류:', err);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  // ── 로딩 / 에러 상태 ──────────────────────────────────────────────────────
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

  // ── 입장 코드 화면 ─────────────────────────────────────────────────────────
  if (!verified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-7 text-center">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <School size={26} className="text-white" />
              </div>
              <h1 className="text-white font-black text-lg leading-tight">{schoolInfo?.name}</h1>
              <p className="text-indigo-200 text-xs font-semibold mt-1">학교 전체 공유 보기</p>
              {classList.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {classList.map(c => (
                    <span key={c.id} className="text-[10px] font-black bg-white/20 text-white px-2.5 py-1 rounded-full">
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
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
                  onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleVerify()}
                  placeholder="입장 코드 (예: AB1C2D)"
                  maxLength={10}
                  className={`w-full px-4 py-3.5 text-center text-xl font-black tracking-[0.3em] rounded-2xl border-2 outline-none transition-all ${
                    codeError
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-gray-200 focus:border-indigo-400 bg-gray-50 text-gray-900'
                  }`}
                />
                {codeError && <p className="text-xs text-red-500 font-semibold text-center">{codeError}</p>}
                <button
                  onClick={handleVerify}
                  disabled={!codeInput.trim() || verifying}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-40 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200"
                >
                  {verifying
                    ? <Loader2 size={18} className="animate-spin" />
                    : <><span>입장하기</span><ArrowRight size={16} /></>
                  }
                </button>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-gray-400 font-semibold">생기로그 AI — 수업 기록부터 세특까지</p>
        </div>
      </div>
    );
  }

  // ── 메인 뷰 ────────────────────────────────────────────────────────────────
  const isClassLoading = loadingClassId === activeClassId;

  return (
    <>
    <div className="min-h-screen bg-gray-50 font-sans print:hidden">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <School size={20} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-gray-900 truncate">{schoolInfo?.name}</h1>
                <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200">
                  학교 전체 공유 보기
                </span>
              </div>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{classList.length}개 학급</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {activeClassId && currentData?.loaded && (
              <button
                onClick={() => fetchClassData(activeClassId)}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all"
                title="새로고침"
              >
                <RefreshCw size={15} />
              </button>
            )}
            <button
              onClick={downloadCSV}
              disabled={!currentData?.loaded}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-xl text-sm font-black transition-all"
              title="CSV 다운로드"
            >
              <FileText size={15} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={downloadXLSX}
              disabled={!currentData?.loaded || downloading}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-black transition-all"
              title="XLSX 엑셀 다운로드"
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span className="hidden sm:inline">XLSX</span>
            </button>
          </div>
        </div>

        {/* 클래스 탭 (학교 내 반 선택) */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 border-b border-gray-100">
          <div className="flex gap-0 overflow-x-auto custom-scrollbar pb-0">
            {classList.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveClassId(c.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 text-sm font-black border-b-2 transition-all ${
                  activeClassId === c.id
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users size={13} />
                {c.name}
                {c.subject && c.subject !== '담임' && (
                  <span className="text-[10px] font-bold text-gray-400">· {c.subject}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 결과/갤러리/학급기록 탭 */}
        {currentData?.loaded && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 print:hidden">
            {[
              ...(currentData.show_learning_journey ? [{ key: 'journey', label: '학습 여정', icon: Sparkles }] : []),
              { key: 'results', label: '결과 확인', icon: FileText },
              {
                key: 'gallery',
                label: `갤러리${currentData.galleryItems.length > 0 ? ` (${currentData.galleryItems.length})` : ''}`,
                icon: Images,
              },
              { key: 'setech', label: '학급 기록', icon: BookOpen },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as 'journey' | 'results' | 'gallery' | 'setech')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-black border-b-2 transition-all ${
                  activeTab === key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* 본문 */}
      {isClassLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-sm font-semibold text-gray-400">데이터 불러오는 중...</p>
          </div>
        </div>
      ) : !currentData?.loaded ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
          </div>
        </div>
      ) : (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* ── 학습 여정 탭 ── */}
          {activeTab === 'journey' && currentData.show_learning_journey && (
            weeklyJourney.length === 0 ? (
              <div className="flex flex-col items-center py-24 space-y-3">
                <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
                  <Sparkles size={32} className="text-gray-300" />
                </div>
                <p className="font-black text-gray-400 text-sm">아직 등록된 주차별 활동이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-black text-gray-900 mb-3">주차별 성장 추이</h3>
                  <WeeklyTrendChart data={weeklyTrendData} />
                </div>
                <div className="relative">
                <div className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-200 via-indigo-100 to-transparent" />
                <div className="space-y-6">
                  {weeklyJourney.map(wk => (
                    <div key={wk.week} className="relative flex gap-4">
                      <div className="relative z-10 shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex flex-col items-center justify-center shadow-lg shadow-indigo-200">
                        <span className="text-[9px] font-bold opacity-80 leading-none">WEEK</span>
                        <span className="text-lg font-black leading-none">{wk.week}</span>
                      </div>
                      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{wk.week}주차</p>
                            <h3 className="text-base font-black text-gray-900">{wk.topic || `${wk.week}주차 활동`}</h3>
                          </div>
                          <button
                            onClick={() => { setWeekFilter(wk.week); setActiveTab('results'); }}
                            className="shrink-0 flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            자세히 보기 <ArrowRight size={12} />
                          </button>
                        </div>

                        <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px] font-bold text-gray-400">
                          <span className="flex items-center gap-1"><Users size={11} /> 참여 {wk.participantCount}명</span>
                          {wk.obsCount > 0 && <span className="text-violet-500">📝 활동기록 {wk.obsCount}건</span>}
                          {wk.resultCount > 0 && <span className="text-emerald-500">📁 결과물 {wk.resultCount}건</span>}
                        </div>

                        {wk.sampleText && (
                          <p className="mt-3 text-sm text-gray-600 leading-relaxed line-clamp-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                            “{wk.sampleText}”
                          </p>
                        )}

                        {wk.images.length > 0 && (
                          <div className="flex gap-2 mt-3 overflow-x-auto custom-scrollbar pb-1">
                            {wk.images.map((url, i) => (
                              <img
                                key={url}
                                src={url}
                                alt={`${wk.week}주차 사진 ${i + 1}`}
                                loading="lazy"
                                onClick={() => setLightbox({ urls: wk.images, names: wk.images.map((_, n) => `week${wk.week}_${n + 1}.webp`), index: i })}
                                className="w-20 h-20 rounded-xl object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            )
          )}

          {/* ── 결과 확인 탭 ── */}
          {activeTab === 'results' && (
            <>
              {/* 통계 카드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '전체 학생', value: currentData.studentData.length, unit: '명', icon: Users },
                  { label: '활동 참여', value: activeCount, unit: '명', icon: CheckCircle2 },
                  { label: '활동 기록', value: totalObs, unit: '건', icon: FileText },
                  { label: '결과물', value: totalResults, unit: '건', icon: FolderOpen },
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

              {/* 주차 필터 + 전체 열기/닫기 */}
              {allWeeks.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap print:hidden">
                  <span className="text-xs font-black text-gray-500 mr-1">주차:</span>
                  <button
                    onClick={() => setWeekFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'}`}
                  >
                    전체
                  </button>
                  {allWeeks.map(w => (
                    <button
                      key={w}
                      onClick={() => setWeekFilter(w)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === w ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'}`}
                    >
                      {w}주차
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandedIds(new Set(currentData.studentData.map(sd => sd.student.id)))}
                      className="text-xs font-black text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-all"
                    >
                      전체 열기
                    </button>
                    <button
                      onClick={() => setExpandedIds(new Set())}
                      className="text-xs font-black text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100 transition-all"
                    >
                      전체 닫기
                    </button>
                  </div>
                </div>
              )}

              {/* 학생 목록 */}
              <div className="space-y-2">
                {filteredData.map(({ student, obs, results }) => {
                  const isExpanded = expandedIds.has(student.id);
                  const hasActivity = obs.length > 0 || results.length > 0;
                  return (
                    <div
                      key={student.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${hasActivity ? 'border-gray-200' : 'border-gray-100'}`}
                    >
                      <button
                        onClick={() => hasActivity && toggleExpand(student.id)}
                        disabled={!hasActivity}
                        className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${hasActivity ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default opacity-50'}`}
                      >
                        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-gray-100">
                          <img src={getAvatarUrl(student)} alt={student.full_name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-900 text-sm">{student.full_name}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {obs.length > 0 && <span className="text-[10px] font-bold text-violet-600">📝 활동 기록 {obs.length}건</span>}
                            {results.length > 0 && <span className="text-[10px] font-bold text-emerald-600">📁 결과물 {results.length}건</span>}
                            {!hasActivity && <span className="text-[10px] font-bold text-gray-400">미제출</span>}
                          </div>
                        </div>
                        {hasActivity && (
                          <div className="shrink-0 text-gray-400">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50/50">
                          {(studentTrendMap[student.id]?.some(p => p.engagement > 0)) && (
                            <div className="bg-white rounded-xl border border-gray-100 p-4">
                              <p className="text-xs font-black text-gray-500 mb-2">주차별 성장 추이</p>
                              <WeeklyTrendChart data={studentTrendMap[student.id]} height={160} />
                            </div>
                          )}
                          {obs.map(o => (
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

                          {results.map(r => {
                            const allImgResults = results.filter(x => x.image_urls && x.image_urls.length > 0);
                            const allImgUrls = allImgResults.flatMap(x => x.image_urls as string[]);
                            const allImgNames = allImgResults.flatMap(x => (x.image_urls as string[]).map((_, i) => `${x.title || '결과물'}-${i + 1}.webp`));
                            return (
                              <div key={r.id} className="bg-white rounded-xl border border-emerald-100 p-4">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">📁 결과물</span>
                                  {r.week_number && <span className="text-[10px] font-bold text-gray-400">{r.week_number}주차</span>}
                                  <span className="text-[10px] font-bold text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
                                </div>
                                {r.title && <p className="text-sm font-black text-gray-800 mb-1.5">{r.title}</p>}
                                {r.text_content && r.result_type !== 'link' && r.result_type !== 'file' && (
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.text_content}</p>
                                )}
                                {r.image_urls && r.image_urls.length > 0 && (
                                  <div
                                    className="mt-2 relative group cursor-pointer"
                                    onClick={() => setLightbox({ urls: allImgUrls, names: allImgNames, index: allImgUrls.indexOf(r.image_urls![0]) })}
                                  >
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
                      )}
                    </div>
                  );
                })}
              </div>

              {filteredData.length === 0 && (
                <div className="flex flex-col items-center py-20 space-y-3">
                  <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
                    <StickyNote size={32} className="text-gray-300" />
                  </div>
                  <p className="font-black text-gray-400 text-sm">등록된 학생이 없습니다</p>
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
                    <button
                      onClick={() => setWeekFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${weekFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'}`}
                    >
                      전체
                    </button>
                    {allWeeks.map(w => (
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
              {filteredGallery.some(g => g.file_type === 'video') && (
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
                <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
                  {filteredGallery.map(item => (
                    <div key={item.id} className="break-inside-avoid">
                      {item.file_type === 'image' ? (
                        <div
                          className="relative group cursor-pointer rounded-2xl overflow-hidden bg-gray-100 shadow-sm hover:shadow-md transition-all"
                          onClick={() => setLightbox({ urls: allGalleryImgUrls, names: allGalleryImgNames, index: allGalleryImgUrls.indexOf(item.file_url) })}
                        >
                          <img src={item.file_url} alt={item.caption || item.file_name || '갤러리'} loading="lazy" className="w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <ZoomIn size={22} className="text-white" />
                          </div>
                          <button
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-indigo-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
                            onClick={e => { e.stopPropagation(); blobDownload(item.file_url, item.file_name || 'image.webp'); }}
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
                      ) : (
                        <div className="rounded-2xl overflow-hidden bg-gray-100 shadow-sm">
                          {(() => {
                            const info = parseVideoUrl(item.file_url);
                            return info && info.platform !== 'direct' ? (
                              <iframe
                                src={info.embedUrl}
                                className="w-full aspect-video"
                                loading="lazy"
                                allow="autoplay; fullscreen; picture-in-picture"
                              />
                            ) : (
                              <video src={item.file_url} controls preload="metadata" className="w-full" />
                            );
                          })()}
                          {item.caption && <p className="text-xs font-semibold text-gray-600 px-3 py-2 truncate">{item.caption}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── 학급 기록 탭 ── */}
          {activeTab === 'setech' && (() => {
            const setechRows = currentData.studentData.map(sd => ({
              student: sd.student,
              eval: currentData.evalMap[sd.student.id] ?? null,
            }));
            const doneCount = setechRows.filter(r => r.eval?.status === 'final' || r.eval?.status === 'done').length;
            const draftCount = setechRows.filter(r => r.eval?.status === 'draft').length;
            const emptyCount = setechRows.filter(r => !r.eval?.setech_content).length;
            const charCounts = setechRows.map(r => (r.eval?.setech_content || '').length);
            const avgChars = charCounts.length > 0 ? Math.round(charCounts.reduce((a, b) => a + b, 0) / charCounts.length) : 0;

            const statusLabel = (s: string | null | undefined) => {
              if (s === 'final' || s === 'done') return { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
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
                    { label: '전체 학생', value: currentData.studentData.length, unit: '명', icon: Users },
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
                            setExpandedIds(prev => {
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

          <div className="text-center pt-4 pb-8">
            <p className="text-[10px] text-gray-300 font-semibold">
              생기로그 AI — 학교 전체 공유 보기 · {new Date().getFullYear()}
            </p>
          </div>
        </main>
      )}

      {/* 라이트박스 */}
      {lightbox && (
        <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <button
            className="absolute top-4 right-16 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={e => { e.stopPropagation(); blobDownload(lightbox.urls[lightbox.index], lightbox.names[lightbox.index]); }}
            title="다운로드"
          >
            <Download size={18} />
          </button>
          {lightbox.urls.length > 1 && (
            <button className="absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.urls.length) % prev.urls.length } : null); }}
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <img src={lightbox.urls[lightbox.index]} alt="확대 보기" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          {lightbox.urls.length > 1 && (
            <button className="absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.urls.length } : null); }}
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

      {/* 생기로그 홍보 배너 */}
      <div className="max-w-4xl mx-auto px-4 pb-10 print:hidden">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-lg">🏫</span>
          </div>
          <div className="flex-1">
            <p className="font-black text-sm text-indigo-900">우리 학교도 생기로그 AI를 도입해보세요</p>
            <p className="text-xs text-indigo-600 mt-0.5">학교 그룹 · 교사 연동 · 학급 공유 URL까지 지원합니다</p>
          </div>
          <a
            href="/school-intro"
            className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all active:scale-95"
          >
            자세히 보기
          </a>
        </div>
      </div>
    </div>
    </>
  );
};

export default SchoolShareView;
