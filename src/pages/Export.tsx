import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  Database,
  Info,
  Settings2,
  Users,
  Loader2,
  ClipboardList,
  Check,
} from 'lucide-react';
import { useAuth, checkIsPro } from '../lib/auth';
import { isDemoTeacher, getDemoClassId } from '../lib/demo';
import DemoModeBanner from '../components/DemoModeBanner';
import NaissWorkstation from '../components/export/NaissWorkstation';

type Scope = 'all' | 'specific';
type Format = 'csv' | 'xlsx';
type ExportMode = 'simple' | 'structured';

const EXPORT_COLUMNS = [
  { key: '학생번호', label: '학생번호' },
  { key: '학생이름', label: '학생이름' },
  { key: '활동명',   label: '활동명' },
  { key: '활동내용', label: '활동내용' },
  { key: '상태',     label: '상태' },
  { key: '기록일시', label: '기록일시' },
];

const Export = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
  const [obsCount, setObsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [scope, setScope] = useState<Scope>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>('xlsx');
  const [startDate, setStartDate] = useState('2025-03-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState<'export' | 'naiss'>('naiss');

  const [selectedColumns, setSelectedColumns] = useState<string[]>(EXPORT_COLUMNS.map(c => c.key));
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('structured');

  useEffect(() => { fetchClasses(); }, []);

  // 날짜 또는 학급 변경 시 기록 수 업데이트
  useEffect(() => {
    if (!selectedClassId) return;
    const cls = classes.find(c => c.id === selectedClassId);
    const targetId = cls?.linked_class_id || selectedClassId;
    (async () => {
      const { data: allStuds } = await supabase.from('students').select('id').eq('class_id', targetId);
      const ids = allStuds?.map(s => s.id) || [];
      if (!ids.length) { setObsCount(0); return; }
      const { count } = await supabase
        .from('observations')
        .select('*', { count: 'exact', head: true })
        .in('student_id', ids)
        .gte('created_at', new Date(startDate).toISOString())
        .lte('created_at', new Date(endDate + 'T23:59:59').toISOString());
      setObsCount(count || 0);
    })();
  }, [startDate, endDate, selectedClassId]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('classes').select('*').eq('teacher_id', user?.id);
      if (data) {
        // 데모 교사 계정은 여러 방문자가 공유하므로, URL의 ?id= 또는(상단 내비게이션처럼
        // id가 없는 링크로 진입한 경우) 방문자가 마지막으로 보던 학급만 노출한다.
        const urlClassId = searchParams.get('id') || getDemoClassId();
        const filtered = isDemoTeacher(user) && urlClassId
          ? data.filter(c => c.id === urlClassId)
          : data;
        setClasses(filtered);
        if (filtered.length > 0) {
          setSelectedClassId(filtered[0].id);
          fetchPreviewDataForClass(filtered[0].id, filtered[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviewDataForClass = async (classId: string, cls: any) => {
    try {
      const targetId = cls?.linked_class_id || classId;
      const { data: studs } = await supabase
        .from('students')
        .select('id, full_name, student_number')
        .eq('class_id', targetId);

      if (!studs || studs.length === 0) {
        setStudents([]);
        setPreviewData([]);
        setObsCount(0);
        return;
      }

      setStudents(studs);
      const studentMap: Record<string, any> = {};
      studs.forEach(s => { studentMap[s.id] = s; });
      const ids = studs.map(s => s.id);

      // 날짜 필터 기준 건수
      const { count } = await supabase
        .from('observations')
        .select('*', { count: 'exact', head: true })
        .in('student_id', ids)
        .gte('created_at', new Date(startDate).toISOString())
        .lte('created_at', new Date(endDate + 'T23:59:59').toISOString());
      setObsCount(count || 0);

      // 미리보기: 최근 5건 (날짜 필터 없음 — 형식 확인용)
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, activity_name, content, status, created_at')
        .in('student_id', ids)
        .order('created_at', { ascending: false })
        .limit(5);

      setPreviewData((obs || []).map(o => ({
        '학생번호': studentMap[o.student_id]?.student_number || '-',
        '학생이름': studentMap[o.student_id]?.full_name || '-',
        '활동명':   o.activity_name || '-',
        '활동내용': (o.content || '').length > 28
          ? o.content.slice(0, 28) + '…'
          : (o.content || '-'),
        '상태':     o.status === 'approved' ? '승인'
                  : o.status === 'pending'  ? '대기'
                  : (o.status || '-'),
        '기록일시': new Date(o.created_at).toLocaleDateString('ko-KR'),
      })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleClassChange = (id: string) => {
    setSelectedClassId(id);
    setSelectedStudentIds([]);
    const cls = classes.find(c => c.id === id);
    fetchPreviewDataForClass(id, cls);
  };

  const toggleStudentSelect = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter(k => k !== key) : prev;
      }
      // 원래 열 순서 유지
      return EXPORT_COLUMNS.map(c => c.key).filter(k => prev.includes(k) || k === key);
    });
  };

  const handleExport = async () => {
    if (!selectedClassId) return;
    setExporting(true);
    try {
      const cls = classes.find(c => c.id === selectedClassId);
      const targetId = cls?.linked_class_id || selectedClassId;

      const { data: allStuds } = await supabase.from('students').select('id, full_name, student_number').eq('class_id', targetId);
      if (!allStuds || allStuds.length === 0) { alert('학급에 학생이 없습니다.'); return; }

      const studentIds = scope === 'specific' && selectedStudentIds.length > 0
        ? selectedStudentIds
        : allStuds.map(s => s.id);

      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, activity_name, content, status, created_at')
        .in('student_id', studentIds)
        .gte('created_at', new Date(startDate).toISOString())
        .lte('created_at', new Date(endDate + 'T23:59:59').toISOString())
        .order('created_at', { ascending: true });

      const studentMap: Record<string, { full_name: string; student_number: string }> = {};
      allStuds.forEach(s => { studentMap[s.id] = s; });

      const rows = (obs || []).map(o => {
        const full: Record<string, string> = {
          '학생번호': studentMap[o.student_id]?.student_number || '',
          '학생이름': studentMap[o.student_id]?.full_name || '',
          '활동명':   o.activity_name || '',
          '활동내용': o.content || '',
          '상태':     o.status === 'approved' ? '승인' : o.status === 'pending' ? '대기' : (o.status || ''),
          '기록일시': new Date(o.created_at).toLocaleString('ko-KR'),
        };
        return Object.fromEntries(selectedColumns.map(col => [col, full[col] ?? '']));
      });

      if (rows.length === 0) { alert('해당 기간에 활동 기록이 없습니다.'); return; }

      const className = cls?.name?.replace(/[/\\?%*:|"<>]/g, '-') || 'export';
      const fileName = `${className}_활동기록_${startDate}~${endDate}`;

      if (format === 'csv') {
        const headers = Object.keys(rows[0]);
        const csvContent = [
          headers.join(','),
          ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileName}.csv`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 15) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '활동기록');
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      }
    } catch (err) {
      console.error(err);
      alert('내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const handleStructuredExport = async () => {
    if (!selectedClassId) return;
    setExporting(true);
    try {
      const cls = classes.find(c => c.id === selectedClassId);
      const targetId = cls?.linked_class_id || selectedClassId;

      const { data: allStuds } = await supabase.from('students').select('id, full_name, student_number').eq('class_id', targetId);
      if (!allStuds || allStuds.length === 0) { alert('학급에 학생이 없습니다.'); return; }

      const studentIds = scope === 'specific' && selectedStudentIds.length > 0
        ? selectedStudentIds
        : allStuds.map(s => s.id);

      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, activity_name, content, status, created_at')
        .in('student_id', studentIds)
        .gte('created_at', new Date(startDate).toISOString())
        .lte('created_at', new Date(endDate + 'T23:59:59').toISOString())
        .order('created_at', { ascending: true });

      if (!obs || obs.length === 0) { alert('해당 기간에 활동 기록이 없습니다.'); return; }

      const studentMap: Record<string, { full_name: string; student_number: string }> = {};
      allStuds.forEach(s => { studentMap[s.id] = s; });

      // 클래스의 weekly_plan에서 topic → week 번호 매핑
      const { data: classInfo } = await supabase
        .from('classes')
        .select('weekly_plan')
        .eq('id', targetId)
        .single();
      const weeklyPlan: Array<{ week: number; topic: string }> = classInfo?.weekly_plan || [];
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      const topicWeekMap: Record<string, number> = {};
      weeklyPlan.forEach(p => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      const allRows = obs.map(o => {
        const weekNum = topicWeekMap[norm(o.activity_name || '')] ?? null;
        return {
          _weekNum: weekNum as number | null,
          _studentId: o.student_id,
          '학생번호': studentMap[o.student_id]?.student_number || '',
          '학생이름': studentMap[o.student_id]?.full_name || '',
          '주차': weekNum != null ? `${weekNum}주차` : '미분류',
          '활동명': o.activity_name || '',
          '활동내용': o.content || '',
          '상태': o.status === 'approved' ? '승인' : o.status === 'pending' ? '대기' : (o.status || ''),
          '기록일시': new Date(o.created_at).toLocaleString('ko-KR'),
        };
      });

      const toRow = (r: typeof allRows[0]) => {
        const { _weekNum, _studentId, ...rest } = r;
        return rest;
      };

      const weeks = [...new Set(
        allRows.map(r => r._weekNum).filter((w): w is number => w !== null)
      )].sort((a, b) => a - b);
      const hasUnclassified = allRows.some(r => r._weekNum === null);
      const studentIdsInData = [...new Set(allRows.map(r => r._studentId))];

      const className = cls?.name?.replace(/[/\\?%*:|"<>]/g, '-') || 'export';
      const fileName = `${className}_구조화활동기록_${startDate}~${endDate}`;

      if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();

        const appendSheet = (rows: Record<string, string>[], name: string) => {
          const ws = XLSX.utils.json_to_sheet(rows);
          ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 16) }));
          XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
        };

        appendSheet(allRows.map(toRow), '전체');
        for (const wk of weeks) {
          appendSheet(allRows.filter(r => r._weekNum === wk).map(toRow), `${wk}주차`);
        }
        if (hasUnclassified) {
          appendSheet(allRows.filter(r => r._weekNum === null).map(toRow), '미분류');
        }
        for (const sid of studentIdsInData) {
          const name = studentMap[sid]?.full_name?.replace(/[/\\?%*:|"<>[\]]/g, '') || sid;
          appendSheet(allRows.filter(r => r._studentId === sid).map(toRow), name);
        }

        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } else {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        const toCsv = (rows: Record<string, string>[]) => {
          if (!rows.length) return '';
          const headers = Object.keys(rows[0]);
          return '﻿' + [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
          ].join('\n');
        };

        zip.file('전체.csv', toCsv(allRows.map(toRow)));

        const weekFolder = zip.folder('주차별')!;
        for (const wk of weeks) {
          weekFolder.file(`${wk}주차.csv`, toCsv(allRows.filter(r => r._weekNum === wk).map(toRow)));
        }
        if (hasUnclassified) {
          weekFolder.file('미분류.csv', toCsv(allRows.filter(r => r._weekNum === null).map(toRow)));
        }

        const studFolder = zip.folder('학생별')!;
        for (const sid of studentIdsInData) {
          const name = (studentMap[sid]?.full_name || sid).replace(/[/\\?%*:|"<>]/g, '-');
          studFolder.file(`${name}.csv`, toCsv(allRows.filter(r => r._studentId === sid).map(toRow)));
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileName}.zip`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert('내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-10"
    >
      {isDemoTeacher(user) && selectedClassId && (
        <DemoModeBanner
          classId={selectedClassId}
          extraAction={{
            label: '학급 화면으로 돌아가기',
            onClick: () => navigate(`/classroom?id=${selectedClassId}`),
          }}
        />
      )}
      <div className="px-2">
        <p className="text-primary font-bold text-xs uppercase tracking-widest mb-3">Workspace Utility</p>
        <h1 className="text-2xl md:text-4xl font-extrabold font-manrope mb-4">데이터 내보내기 센터</h1>
        <p className="text-on-surface-variant text-base leading-relaxed max-w-2xl">
          나이스 세특 제출 준비부터 활동기록 내보내기까지 관리합니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 p-1.5 bg-surface-container/60 rounded-2xl w-fit border border-white/40 shadow-soft">
        <button
          onClick={() => {
            if (!checkIsPro(profile)) {
              alert('나이스 제출 준비는 Pro 플랜 전용 기능입니다.\naklabs84@naver.com으로 업그레이드 문의해 주세요.');
              return;
            }
            setActiveTab('naiss');
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all ${activeTab === 'naiss' ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
        >
          <ClipboardList size={16} />
          나이스 제출 준비
          {!checkIsPro(profile) && (
            <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-black">PRO</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all ${activeTab === 'export' ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
        >
          <Download size={16} />
          활동기록 내보내기
        </button>
      </div>

      {/* 나이스 제출 준비 탭 */}
      {activeTab === 'naiss' && <NaissWorkstation classes={classes} />}

      {/* 활동기록 내보내기 탭 */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 items-start">

          {/* 왼쪽: 설정 패널 */}
          <div className="col-span-12 lg:col-span-5 space-y-8">
            <div className="surface-card p-5 md:p-10 shadow-ambient border-l-4 border-primary">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-3">
                <Database size={24} className="text-primary" />
                내보내기 설정
              </h2>

              <div className="space-y-8">
                {/* 학급 선택 */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">학급 선택</label>
                  <select
                    value={selectedClassId}
                    onChange={e => handleClassChange(e.target.value)}
                    className="w-full pl-4 pr-10 py-4 bg-surface-container rounded-xl text-sm font-bold appearance-none focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                  >
                    {loading
                      ? <option>로딩 중...</option>
                      : classes.map(c => <option key={c.id} value={c.id}>{c.name} - {c.subject}</option>)
                    }
                  </select>
                </div>

                {/* 학생 범위 */}
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">학생 범위 선택</label>
                  <div className="flex bg-surface-container p-1 rounded-xl">
                    {(['all', 'specific'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setScope(v)}
                        className={`flex-1 py-3 px-4 font-bold text-[13px] rounded-lg transition-all ${scope === v ? 'bg-primary-container text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                      >
                        {v === 'all' ? '전체 학생' : '특정 학생 선택'}
                      </button>
                    ))}
                  </div>

                  {scope === 'specific' && (
                    <div className="bg-surface-container-low rounded-xl border border-surface-container max-h-40 overflow-y-auto">
                      {students.length > 0 ? students.map(s => (
                        <button
                          key={s.id}
                          onClick={() => toggleStudentSelect(s.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold border-b border-surface-container/50 last:border-0 transition-all ${selectedStudentIds.includes(s.id) ? 'bg-primary/5 text-primary' : 'hover:bg-surface-container'}`}
                        >
                          <span className="flex items-center gap-2"><Users size={14} />{s.full_name}</span>
                          {selectedStudentIds.includes(s.id) && <Check size={14} className="text-primary" />}
                        </button>
                      )) : <p className="px-4 py-3 text-xs text-on-surface-variant">학생이 없습니다.</p>}
                    </div>
                  )}
                </div>

                {/* 날짜 범위 */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: '시작일', val: startDate, set: setStartDate },
                    { label: '종료일', val: endDate,   set: setEndDate },
                  ].map(({ label, val, set }) => (
                    <div key={label} className="space-y-2">
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">{label}</label>
                      <div className="relative">
                        <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                        <input
                          type="date"
                          value={val}
                          onChange={e => set(e.target.value)}
                          className="w-full pl-11 pr-4 py-4 bg-surface-container rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 파일 형식 */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">파일 형식</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setFormat('csv')}
                      className={`p-6 text-center rounded-xl border-2 transition-all ${format === 'csv' ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent bg-surface-container hover:border-surface-container-high'}`}
                    >
                      <FileText size={36} className={`mx-auto mb-3 ${format === 'csv' ? 'text-primary' : 'text-on-surface-variant/40'}`} />
                      <p className={`text-sm font-bold ${format === 'csv' ? 'text-primary' : ''}`}>CSV 형식</p>
                      <p className="text-[10px] text-on-surface-variant mt-1">범용 호환성</p>
                    </button>
                    <button
                      onClick={() => setFormat('xlsx')}
                      className={`p-6 text-center rounded-xl border-2 transition-all ${format === 'xlsx' ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent bg-surface-container hover:border-surface-container-high'}`}
                    >
                      <FileSpreadsheet size={36} className={`mx-auto mb-3 ${format === 'xlsx' ? 'text-primary' : 'text-on-surface-variant/40'}`} />
                      <p className={`text-sm font-bold ${format === 'xlsx' ? 'text-primary' : ''}`}>XLSX 파일</p>
                      <p className="text-[10px] text-on-surface-variant mt-1 uppercase font-black">서식 포함</p>
                    </button>
                  </div>
                </div>

                {/* 내보내기 방식 */}
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">내보내기 방식</label>
                  <div className="flex bg-surface-container p-1 rounded-xl">
                    {(['simple', 'structured'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setExportMode(v)}
                        className={`flex-1 py-3 px-4 font-bold text-[13px] rounded-lg transition-all ${exportMode === v ? 'bg-primary-container text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                      >
                        {v === 'simple' ? '단순 내보내기' : '주차별 + 학생별'}
                      </button>
                    ))}
                  </div>
                  {exportMode === 'structured' && (
                    <p className="text-[11px] text-on-surface-variant/70 px-1 leading-relaxed">
                      {format === 'xlsx'
                        ? '전체·주차별·학생별 시트가 포함된 XLSX 파일로 저장됩니다.'
                        : '전체/주차별/학생별 CSV가 담긴 ZIP 파일로 저장됩니다.'}
                    </p>
                  )}
                </div>

                {/* 기록 현황 */}
                <div className="p-4 bg-surface-container-low rounded-2xl flex items-start gap-3 border border-surface-container">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary mt-0.5 shrink-0">
                    <Info size={16} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-black tracking-widest text-on-surface-variant">
                      {obsCount}개의 기록 발견 (선택 기간 기준)
                    </p>
                    <p className="text-[11px] text-on-surface-variant/60 font-medium">
                      {selectedColumns.length}개 열이 포함됩니다: {selectedColumns.join(' · ')}
                    </p>
                  </div>
                </div>

                {/* 내보내기 버튼 */}
                <button
                  onClick={exportMode === 'structured' ? handleStructuredExport : handleExport}
                  disabled={exporting || obsCount === 0}
                  className="w-full btn-gradient py-5 rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting
                    ? <><Loader2 size={22} className="animate-spin" />내보내는 중...</>
                    : exportMode === 'structured'
                      ? <><Download size={22} />{format === 'xlsx' ? '구조화 XLSX 다운로드' : '구조화 ZIP 다운로드'}<span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse ml-2" /></>
                      : <><Download size={22} />{format.toUpperCase()}로 내보내기<span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse ml-2" /></>
                  }
                </button>
                {obsCount === 0 && (
                  <p className="text-center text-xs text-on-surface-variant/60">해당 기간에 활동 기록이 없습니다.</p>
                )}
              </div>
            </div>
          </div>

          {/* 오른쪽: 미리보기 */}
          <div className="col-span-12 lg:col-span-7">
            <div className="surface-card p-5 md:p-10 shadow-ambient">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold font-manrope">데이터 미리보기</h2>
                  <p className="text-[11px] text-on-surface-variant font-medium mt-1">
                    최근 관찰 기록 최대 5건 샘플 · 실제 내보내기는 설정 기간 기준
                  </p>
                </div>
                <span className="px-3 py-1 bg-surface-container text-on-surface-variant font-black text-[10px] rounded-lg tracking-widest uppercase">미리보기</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-surface-container">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-surface-container-low">
                    <tr className="text-on-surface-variant border-b border-surface-container">
                      {selectedColumns.map(col => (
                        <th key={col} className="px-3 py-3 font-black whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-medium text-on-surface divide-y divide-surface-container/50">
                    {loading ? (
                      [1, 2, 3].map(i => (
                        <tr key={i} className="animate-pulse">
                          {selectedColumns.map(col => (
                            <td key={col} className="px-3 py-4">
                              <div className="h-3 bg-surface-container rounded w-16" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : previewData.length > 0 ? (
                      previewData.map((row, i) => (
                        <tr key={i} className="hover:bg-surface-container-low transition-colors">
                          {selectedColumns.map(col => (
                            <td key={col} className="px-3 py-3.5 whitespace-nowrap">
                              {col === '상태' ? (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                  row[col] === '승인' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  row[col] === '대기' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                  'bg-surface-container text-on-surface-variant'
                                }`}>
                                  {row[col]}
                                </span>
                              ) : col === '학생이름' ? (
                                <span className="font-bold">{row[col]}</span>
                              ) : (
                                <span className="text-on-surface-variant">{row[col] || '-'}</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={selectedColumns.length} className="py-16 text-center text-on-surface-variant text-xs">
                          관찰 기록이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 하단 통계 + 열 관리 */}
              <div className="mt-6 pt-5 border-t border-surface-container flex items-center justify-between">
                <div className="flex gap-6 md:gap-10">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase">포함 열</p>
                    <p className="text-sm font-black">{selectedColumns.length}개 선택됨</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase">총 기록 (기간 내)</p>
                    <p className="text-sm font-black">{obsCount}건</p>
                  </div>
                </div>

                {/* 열 관리 버튼 + 패널 */}
                <div className="relative">
                  {showColumnManager && (
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowColumnManager(false)}
                    />
                  )}
                  <button
                    onClick={() => setShowColumnManager(v => !v)}
                    className={`relative z-50 flex items-center gap-1.5 text-[11px] font-bold transition-all ${showColumnManager ? 'text-primary' : 'text-primary hover:underline'}`}
                  >
                    열 관리
                    <Settings2 size={12} className={`transition-transform duration-200 ${showColumnManager ? 'rotate-45' : ''}`} />
                  </button>

                  {showColumnManager && (
                    <div className="absolute right-0 bottom-full mb-2 w-52 rounded-2xl border border-surface-container-highest bg-surface-container-lowest shadow-[0_8px_30px_rgba(0,0,0,0.15)] p-3 z-50">
                      <div className="flex items-center justify-between px-1 mb-2">
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">포함할 열</p>
                        <button
                          onClick={() => setSelectedColumns(EXPORT_COLUMNS.map(c => c.key))}
                          className="text-[10px] font-black text-primary hover:underline"
                        >
                          전체 선택
                        </button>
                      </div>
                      {EXPORT_COLUMNS.map(col => {
                        const isSelected = selectedColumns.includes(col.key);
                        return (
                          <button
                            key={col.key}
                            onClick={() => toggleColumn(col.key)}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-container text-left transition-all"
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-primary border-primary' : 'border-surface-container-highest'}`}>
                              {isSelected && <Check size={9} className="text-white" strokeWidth={3} />}
                            </div>
                            <span className={`text-xs font-bold ${isSelected ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                              {col.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default Export;
