import { useState, useEffect } from 'react';
import { File, Loader2, ExternalLink, Download, Inbox } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { downloadFile } from '../../lib/fileUtils';
import SubmissionViewerModal, { getViewerKind } from '../../components/classroom/SubmissionViewerModal';

interface FileResult {
  id: string;
  student_id: string;
  display_name: string | null;
  storage_path: string;
  file_size: number | null;
  created_at: string;
  student_name: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const kindLabel: Record<string, string> = {
  'web-html': '웹',
  'web-zip': '웹(zip)',
  python: 'Python',
  pdf: 'PDF',
  docx: '문서',
  sheet: '표',
};

export default function SubmissionViewer() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [items, setItems] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (user?.id) fetchClasses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedClassId) fetchSubmissions(selectedClassId);
    else setItems([]);
  }, [selectedClassId]);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', user!.id)
      .eq('is_archived', false)
      .order('name');
    setClasses(data || []);
    if (data && data.length > 0) setSelectedClassId(data[0].id);
  };

  const fetchSubmissions = async (classId: string) => {
    setLoading(true);
    try {
      const { data: students } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', classId);
      const nameMap: Record<string, string> = {};
      (students || []).forEach(s => { nameMap[s.id] = s.full_name; });

      const { data: results } = await supabase
        .from('student_results')
        .select('id, student_id, display_name, storage_path, file_size, created_at')
        .eq('class_id', classId)
        .eq('result_type', 'file')
        .order('created_at', { ascending: false });

      setItems((results || []).map(r => ({ ...r, student_name: nameMap[r.student_id] || '알 수 없음' })));
    } catch (err) {
      console.error('제출물 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPublicUrl = (path: string) => supabase.storage.from('student-attachments').getPublicUrl(path).data.publicUrl;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-black text-on-surface flex items-center gap-2">
          <Inbox size={20} className="text-primary" />제출물 뷰어
        </h2>
        <p className="text-xs font-medium text-on-surface-variant mt-1">
          학생이 제출한 파일을 다운로드 없이 바로 열어볼 수 있습니다. (웹 결과물 · Python · PDF · 문서 · 표 지원)
        </p>
      </div>

      <select
        value={selectedClassId}
        onChange={e => setSelectedClassId(e.target.value)}
        className="w-full md:w-64 px-3 py-2 rounded-xl border border-neutral-200 text-sm font-bold bg-white focus:outline-none focus:border-primary mb-4"
      >
        {classes.length === 0 && <option value="">클래스가 없습니다</option>}
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <File size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-bold">아직 제출된 파일이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const kind = getViewerKind(item.display_name || '');
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3.5 bg-white rounded-xl border border-neutral-100 hover:border-primary/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-xs font-black text-on-surface">{item.student_name}</span>
                    {kind !== 'unsupported' && (
                      <span className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {kindLabel[kind]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-amber-600 flex items-center gap-1 truncate">
                    <File size={10} className="shrink-0" />
                    <span className="truncate">{item.display_name}</span>
                    {item.file_size ? <span className="shrink-0">({formatFileSize(item.file_size)})</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {kind !== 'unsupported' && (
                    <button
                      onClick={() => setViewerFile({ url: getPublicUrl(item.storage_path), name: item.display_name || 'file' })}
                      title="미리보기"
                      className="w-8 h-8 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-colors"
                    >
                      <ExternalLink size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => downloadFile(getPublicUrl(item.storage_path), item.display_name || 'download')}
                    title="다운로드"
                    className="w-8 h-8 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-colors"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SubmissionViewerModal
        isOpen={!!viewerFile}
        onClose={() => setViewerFile(null)}
        fileUrl={viewerFile?.url || ''}
        fileName={viewerFile?.name || ''}
      />
    </div>
  );
}
