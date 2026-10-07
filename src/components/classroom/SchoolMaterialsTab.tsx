import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import RichEditor from '../RichEditor';
import ImportableMaterialPicker, { type ImportableMaterial } from './ImportableMaterialPicker';
import { BookOpen, ChevronDown, Download, ExternalLink, Eye, EyeOff, FileText, Link2, Loader2, Paperclip, Pencil, Plus, Trash2, X, AlertTriangle } from 'lucide-react';

const MAX_FILE_MB = 20;
const formatSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

interface Material {
  id: string;
  title: string;
  content: string | null;
  week_number: number | null;
  is_published: boolean;
  updated_at: string;
  school_id: string | null;
  links: { label: string; url: string }[];
  files: { name: string; path: string; url: string; size: number }[];
}

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

type LinkItem = { label: string; url: string };
type FileItem = { name: string; path: string; url: string; size: number };

const normalizeUrl = (u: string) => {
  const t = u.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

// 수업 자료 "보관함": 링크·파일이 주인공, 상세 설명(메모)은 접어 둔 선택 항목
// schoolId 가 있으면 학교 페이지용(공통은 읽기 전용, 이 학교 전용 편집),
// null 이면 프로젝트 전체 화면용(공통 편집, 학교 전용은 학교 이름 배지로 표시만)
export default function SchoolMaterialsTab({ projectId, schoolId, schoolName = '', schools = [] }: {
  projectId: string;
  schoolId: string | null;
  schoolName?: string;
  schools?: { id: string; name: string }[];
}) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [title, setTitle] = useState('');
  const [week, setWeek] = useState('');
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [memo, setMemo] = useState('');
  const [memoOpen, setMemoOpen] = useState(false);
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [newPaths, setNewPaths] = useState<string[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all'); // 'all' | 'common' | 학교 id (프로젝트 화면 전용)

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('program_materials')
        .select('id, title, content, week_number, is_published, updated_at, school_id, links, files')
        .eq('program_project_id', projectId);
      if (schoolId) q = q.or(`school_id.is.null,school_id.eq.${schoolId}`);
      const { data } = await q
        .order('week_number', { ascending: true, nullsFirst: true })
        .order('updated_at', { ascending: false });
      setMaterials(((data || []) as any[]).map(m => ({ ...m, links: m.links || [], files: m.files || [] })) as Material[]);
    } finally {
      setLoading(false);
    }
  }, [projectId, schoolId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const resetForm = () => {
    setTitle(''); setWeek(''); setLinks([]); setFiles([]); setMemo(''); setMemoOpen(false);
    setPublished(true); setFileError(''); setNewPaths([]); setRemovedPaths([]);
  };

  const openAdd = () => { setEditing(null); resetForm(); setModalOpen(true); };

  const openEdit = (m: Material) => {
    resetForm();
    setEditing(m); setTitle(m.title); setWeek(m.week_number != null ? String(m.week_number) : '');
    setLinks(m.links); setFiles(m.files); setMemo(m.content || ''); setMemoOpen(!!m.content);
    setPublished(m.is_published);
    setModalOpen(true);
  };

  const closeModal = async () => {
    // 저장하지 않고 닫으면 이번에 올린 파일은 정리
    if (newPaths.length > 0) await supabase.storage.from('student-attachments').remove(newPaths);
    setModalOpen(false);
  };

  const handleImport = (m: ImportableMaterial) => {
    setTitle(m.title);
    setMemo(m.content || '');
    setMemoOpen(!!m.content);
    setWeek(m.week_number ? String(m.week_number) : '');
    const imported = (m.activity_urls || []).filter(a => a.url).map(a => ({ label: a.label || '', url: a.url }));
    if (imported.length > 0) setLinks(prev => [...prev, ...imported]);
    setImportOpen(false);
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('로그인 필요');
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기가 너무 큽니다. 50MB 이하 이미지만 업로드 가능합니다.');
      throw new Error('파일 크기 초과');
    }
    const compressed = await compressToWebP(file);
    if (compressed.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`변환 후에도 ${MAX_FILE_MB}MB를 초과합니다. 더 작은 이미지를 사용해주세요.`);
      throw new Error('파일 크기 초과');
    }
    const path = `program-materials/${user.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
    if (error) throw error;
    return supabase.storage.from('student-attachments').getPublicUrl(path).data.publicUrl;
  };

  const handlePickFiles = async (list: FileList | null) => {
    if (!list || !user) return;
    setFileError('');
    const picked = Array.from(list);
    const tooBig = picked.filter(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length > 0) {
      setFileError(`${tooBig.map(f => `"${f.name}"(${formatSize(f.size)})`).join(', ')} 은(는) ${MAX_FILE_MB}MB를 넘어 올릴 수 없습니다. 구글 드라이브·네이버 MYBOX 같은 곳에 올린 뒤 "공유 링크"를 만들어 위의 '링크' 칸에 붙여 넣어 주세요.`);
    }
    const ok = picked.filter(f => f.size <= MAX_FILE_MB * 1024 * 1024);
    if (ok.length === 0) return;
    setUploadingFile(true);
    try {
      for (const f of ok) {
        const ext = (f.name.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin';
        const path = `program-materials/${user.id}/files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('student-attachments').upload(path, f);
        if (error) { setFileError(`"${f.name}" 업로드에 실패했습니다: ${error.message}`); continue; }
        const url = supabase.storage.from('student-attachments').getPublicUrl(path).data.publicUrl;
        setFiles(prev => [...prev, { name: f.name, path, url, size: f.size }]);
        setNewPaths(prev => [...prev, path]);
      }
    } finally {
      setUploadingFile(false);
    }
  };

  const removeFile = async (f: FileItem) => {
    setFiles(prev => prev.filter(x => x.path !== f.path));
    if (newPaths.includes(f.path)) {
      setNewPaths(prev => prev.filter(x => x !== f.path));
      await supabase.storage.from('student-attachments').remove([f.path]);
    } else {
      setRemovedPaths(prev => [...prev, f.path]);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    try {
      const cleanLinks = links
        .map(l => ({ label: l.label.trim(), url: normalizeUrl(l.url) }))
        .filter(l => l.url);
      const payload = {
        title: title.trim(),
        content: memo.replace(/<p>\s*<\/p>/g, '').trim() || null,
        week_number: week.trim() ? Number(week.trim()) : null,
        is_published: published,
        links: cleanLinks,
        files,
      };
      const { error } = editing
        ? await supabase.from('program_materials').update(payload).eq('id', editing.id)
        : await supabase.from('program_materials').insert({
            ...payload,
            program_project_id: projectId,
            school_id: schoolId,
            admin_id: user.id,
          });
      if (error) { alert('저장에 실패했습니다: ' + error.message); return; }
      if (removedPaths.length > 0) await supabase.storage.from('student-attachments').remove(removedPaths);
      setNewPaths([]); setRemovedPaths([]);
      setModalOpen(false);
      fetchMaterials();
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (m: Material) => {
    await supabase.from('program_materials').update({ is_published: !m.is_published }).eq('id', m.id);
    setMaterials(prev => prev.map(x => x.id === m.id ? { ...x, is_published: !x.is_published } : x));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('program_materials').delete().eq('id', deleteTarget.id);
    if (deleteTarget.files.length > 0) {
      await supabase.storage.from('student-attachments').remove(deleteTarget.files.map(f => f.path));
    }
    setMaterials(prev => prev.filter(x => x.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  // 이 화면에서 편집할 수 있는 자료인지
  const editable = (m: Material) => (schoolId ? m.school_id === schoolId : !m.school_id);
  const schoolNameOf = (id: string | null) => (id ? (schools.find(s => s.id === id)?.name || '학교') : '');
  const stripHtml = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const renderRow = (m: Material) => {
    const canEdit = editable(m);
    const memoText = m.content ? stripHtml(m.content) : '';
    return (
      <div key={m.id} className="px-4 py-3.5 space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {m.week_number != null && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{m.week_number}주차</span>
              )}
              <span className="font-bold text-sm truncate">{m.title}</span>
              {m.school_id ? (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 bg-amber-100 text-amber-700">
                  {schoolId ? '이 학교 전용' : `${schoolNameOf(m.school_id)} 전용`}
                </span>
              ) : (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 bg-surface-container-high text-on-surface-variant">공통</span>
              )}
              <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${m.is_published ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                {m.is_published ? <Eye size={10} /> : <EyeOff size={10} />}
                {m.is_published ? '공개' : '비공개'}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => handleTogglePublish(m)} className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-primary hover:bg-surface-container-high transition-all" title={m.is_published ? '비공개로 전환' : '공개로 전환'}>
                {m.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high transition-all">
                <Pencil size={14} />
              </button>
              <button onClick={() => setDeleteTarget(m)} className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-all">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
        {(m.links.length > 0 || m.files.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {m.links.map((l, i) => (
              <a key={`l${i}`} href={l.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-all max-w-full">
                <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{l.label || l.url}</span>
              </a>
            ))}
            {m.files.map((f, i) => (
              <a key={`f${i}`} href={f.url} target="_blank" rel="noopener noreferrer" download={f.name}
                className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high px-2.5 py-1 rounded-lg transition-all max-w-full">
                <FileText size={11} className="shrink-0" /> <span className="truncate">{f.name}</span>
                <span className="text-on-surface-variant/50 shrink-0">{formatSize(f.size)}</span>
              </a>
            ))}
          </div>
        )}
        {memoText && <p className="text-xs text-on-surface-variant/70 line-clamp-1">메모: {memoText}</p>}
      </div>
    );
  };

  const groups: { key: string; label: string; items: Material[]; emptyHint?: string }[] = schoolId
    ? [
        { key: 'own', label: `이 학교 전용 자료`, items: materials.filter(m => m.school_id === schoolId) },
        { key: 'common', label: '공통 자료', items: materials.filter(m => !m.school_id) },
      ]
    : [
        ...(filter === 'all' || filter === 'common'
          ? [{ key: 'common', label: '공통 자료', items: materials.filter(m => !m.school_id) }] : []),
        ...(filter === 'all'
          ? [{ key: 'schools', label: '학교 전용 자료', items: materials.filter(m => !!m.school_id) }]
          : filter !== 'common'
            ? [{ key: 'schools', label: `${schools.find(sc => sc.id === filter)?.name ?? '학교'} 전용 자료`, items: materials.filter(m => m.school_id === filter) }]
            : []),
      ];

  const filterChips = !schoolId && schools.length > 0 && (
    <div className="flex items-center gap-1.5 flex-wrap">
      {[{ id: 'all', label: '전체' }, { id: 'common', label: '공통만' }, ...schools.map(sc => ({ id: sc.id, label: sc.name }))].map(c => (
        <button key={c.id} onClick={() => setFilter(c.id)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all ${filter === c.id ? 'bg-primary text-white border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-high hover:border-primary/40'}`}>
          {c.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-on-surface-variant">
          {schoolId ? (
            <><span className="font-bold text-primary">공통</span> 자료는 프로젝트 전체 화면에서 관리합니다. 여기서 추가한 자료는 <span className="font-bold text-primary">{schoolName}</span>에만 적용됩니다.</>
          ) : (
            <>여기서 추가하는 자료는 <span className="font-bold text-primary">모든 학교에 공통</span>으로 적용됩니다. 학교별 자료는 각 학교 페이지의 '수업 자료' 탭에서 추가하세요.</>
          )}
        </p>
        <button onClick={openAdd} className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dim px-4 py-2.5 rounded-xl transition-all shrink-0">
          <Plus size={16} /> 자료 추가
        </button>
      </div>

      {filterChips}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : (
        groups.map((g, gi) => (
          <div key={g.key}>
            <p className="text-xs font-black text-on-surface-variant mb-2">{g.label} ({g.items.length})</p>
            {g.items.length === 0 ? (
              gi === 0 ? (
                <button onClick={openAdd} className="w-full surface-card p-8 border-2 border-dashed border-surface-container-high hover:border-primary/40 text-center text-on-surface-variant/60 hover:text-primary transition-all">
                  <BookOpen size={28} className="mx-auto mb-2" />
                  <p className="text-sm font-bold">{schoolId ? '이 학교 전용 자료가 아직 없습니다' : '등록된 공통 자료가 없습니다'}</p>
                  <p className="text-xs mt-1 opacity-70">수업 페이지 링크, 실습 파일, PPT 같은 문서를 모아 두는 곳입니다</p>
                </button>
              ) : (
                <p className="text-xs text-on-surface-variant/60 px-1">등록된 자료가 없습니다.</p>
              )
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {g.items.map(renderRow)}
              </div>
            )}
          </div>
        ))
      )}

      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-container-high shrink-0">
              <h2 className="font-black text-base">{editing ? '자료 수정' : schoolId ? `자료 추가 · ${schoolName} 전용` : '자료 추가 · 공통'}</h2>
              <div className="flex items-center gap-2">
                {!editing && (
                  <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-all">
                    <Download size={13} /> 수업 도구에서 가져오기
                  </button>
                )}
                <button onClick={closeModal} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant"><X size={18} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold text-on-surface-variant">제목</label>
                  <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 1주차 실습 자료"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="w-28">
                  <label className="text-xs font-bold text-on-surface-variant">주차 (선택)</label>
                  <input type="number" min={1} value={week} onChange={e => setWeek(e.target.value)} placeholder="예: 1"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>

              {/* 링크 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant mb-1.5"><Link2 size={13} /> 링크</label>
                <div className="space-y-2">
                  {links.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={l.label} onChange={e => setLinks(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="이름 (선택)"
                        className="w-28 shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-surface-container outline-none focus:ring-2 focus:ring-primary/20" />
                      <input type="text" value={l.url} onChange={e => setLinks(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://..."
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-bold bg-surface-container outline-none focus:ring-2 focus:ring-primary/20" />
                      <button onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setLinks(prev => [...prev, { label: '', url: '' }])} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dim">
                    <Plus size={13} /> 링크 추가
                  </button>
                </div>
              </div>

              {/* 파일 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant mb-1.5"><Paperclip size={13} /> 파일 (실습 파일, PPT, PDF 등)</label>
                <div className="space-y-2">
                  {files.map(f => (
                    <div key={f.path} className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-lg">
                      <FileText size={14} className="text-on-surface-variant shrink-0" />
                      <span className="text-xs font-bold truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-on-surface-variant/60 shrink-0">{formatSize(f.size)}</span>
                      <button onClick={() => removeFile(f)} className="p-1 rounded text-on-surface-variant/50 hover:text-red-500 shrink-0"><X size={13} /></button>
                    </div>
                  ))}
                  <label className={`flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-dashed text-xs font-bold cursor-pointer transition-all ${uploadingFile ? 'opacity-60 pointer-events-none' : 'border-surface-container-high hover:border-primary/40 text-on-surface-variant/70 hover:text-primary'}`}>
                    {uploadingFile ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {uploadingFile ? '올리는 중...' : `파일 선택 (파일당 ${MAX_FILE_MB}MB 이하)`}
                    <input type="file" multiple className="hidden" onChange={e => { handlePickFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                  {fileError && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span>{fileError}</span>
                    </div>
                  )}
                  <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-on-surface leading-relaxed space-y-1.5">
                    <p className="font-bold">📌 파일이 {MAX_FILE_MB}MB보다 크다면?</p>
                    <p className="text-[13px]">구글 드라이브 등에 올린 뒤 <b>'공유 링크'</b>를 만들어 위쪽 <b>링크 칸</b>에 붙여 넣어 주세요.</p>
                    <p className="text-[13px] text-red-600 font-bold">⚠️ 올린 파일은 링크를 아는 사람이 열 수 있습니다. 학생 개인정보가 담긴 파일은 올리지 마세요.</p>
                  </div>
                </div>
              </div>

              {/* 메모 (선택) */}
              <div>
                <button type="button" onClick={() => setMemoOpen(o => !o)} className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary">
                  <ChevronDown size={14} className={`transition-transform ${memoOpen ? '' : '-rotate-90'}`} />
                  메모 / 상세 설명 (선택){memo && !memoOpen ? ' · 작성됨' : ''}
                </button>
                {memoOpen && (
                  <div className="mt-2 rounded-xl border border-surface-container-high">
                    <RichEditor value={memo} onChange={setMemo} onUploadImage={handleUploadImage} onUploadingChange={setUploading} uploading={uploading}
                      minHeight="220px" stickyToolbar={false} toolbarRoundedClassName="rounded-t-xl" contentRoundedClassName="rounded-b-xl" />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                <span className="text-xs font-bold text-on-surface-variant">강사에게 바로 공개</span>
              </label>
            </div>

            <div className="shrink-0 border-t border-surface-container-high px-5 py-3.5 flex gap-2">
              <button onClick={closeModal} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all">취소</button>
              <button onClick={handleSave} disabled={saving || uploading || uploadingFile || !title.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all">
                {saving ? '저장 중...' : uploadingFile ? '파일 올리는 중...' : uploading ? '이미지 업로드 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {importOpen && user && (
        <ImportableMaterialPicker userId={user.id} onPick={handleImport} onClose={() => setImportOpen(false)} />
      )}

      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm bg-surface-container-lowest rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold">"{deleteTarget.title}" 자료를 삭제할까요? 올린 파일도 함께 지워지며 되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container">취소</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500">삭제</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
