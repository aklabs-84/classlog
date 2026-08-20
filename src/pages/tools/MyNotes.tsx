import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { StickyNote, Save, Loader2, Pencil, Trash2, Check, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import RichEditor from '../../components/RichEditor';

// ── WebP 변환 + 리사이즈 (최대 1280px) ───────────────────────────────────────
const compressToWebP = (file: File, maxWidth = 1280, quality = 0.85): Promise<File> =>
  new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' })
          : file);
      }, 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

// ── 노트 내용 마크다운 렌더러 (카드 안에서 컴팩트하게 표시) ─────────────────────
const noteMdComponents: any = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed text-xs font-medium text-on-surface/70">{children}</p>,
  h1: ({ children }: any) => <h1 className="text-sm font-black mb-1.5 mt-2 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-black mb-1.5 mt-2 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-black mb-1 mt-2 text-on-surface">{children}</h3>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-xs">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-xs">{children}</ol>,
  li: ({ children }: any) => <li className="text-xs text-on-surface/70">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-3 italic text-on-surface-variant my-2 bg-surface-container-low py-1.5 rounded-r-lg text-xs">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: any) => (
    <code className={className ? className : 'bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono text-primary'}>{children}</code>
  ),
  pre: ({ children }: any) => <pre className="bg-[#1e293b] text-[#e2e8f0] rounded-xl px-4 py-3 overflow-x-auto text-xs my-2">{children}</pre>,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">{children}</a>
  ),
  img: ({ src, alt }: any) => <img src={src} alt={alt} className="max-w-full rounded-xl my-2 shadow" />,
  hr: () => <hr className="border-surface-container my-3" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-auto mb-2"><table className="w-full border-collapse text-xs">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-surface-container px-2 py-1.5 bg-surface-container font-black text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-surface-container px-2 py-1.5">{children}</td>,
};

interface TeacherNote {
  id: string;
  class_id: string | null;
  title: string | null;
  content: string;
  created_at: string;
  classes?: { name: string } | null;
}

const NO_CLASS = '__none__';

export default function MyNotes() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [formClassId, setFormClassId] = useState<string>(NO_CLASS);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [filterClassId, setFilterClassId] = useState<string>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '' });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editUploading, setEditUploading] = useState(false);

  // ── 노트 본문 내 이미지 업로드 — WebP 변환 후 Supabase 저장 ─────────────────
  const handleUploadImage = async (file: File): Promise<string> => {
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
    const path = `notes/${user.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
    if (error) throw error;
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(path);
    return data.publicUrl;
  };

  useEffect(() => {
    if (user?.id) {
      fetchClasses();
      fetchNotes();
    }
  }, [user?.id]);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', user!.id)
      .eq('is_archived', false)
      .order('name');
    setClasses(data || []);
  };

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('teacher_notes')
        .select('*, classes(name)')
        .eq('teacher_id', user?.id)
        .order('created_at', { ascending: false });
      setNotes(data || []);
    } catch (err) {
      console.error('나의 노트 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('teacher_notes').insert({
        teacher_id: user?.id,
        class_id: formClassId === NO_CLASS ? null : formClassId,
        title: title.trim() || null,
        content: content.trim(),
      });
      if (error) throw error;
      setTitle('');
      setContent('');
      await fetchNotes();
    } catch (err: any) {
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (note: TeacherNote) => {
    setEditingId(note.id);
    setEditForm({ title: note.title || '', content: note.content });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editForm.content.trim()) return;
    setSavingEditId(id);
    try {
      const { error } = await supabase
        .from('teacher_notes')
        .update({
          title: editForm.title.trim() || null,
          content: editForm.content.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      setNotes(prev =>
        prev.map(n => (n.id === id ? { ...n, title: editForm.title.trim() || null, content: editForm.content.trim() } : n))
      );
      setEditingId(null);
    } catch (err) {
      console.error('수정 오류:', err);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 노트를 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('teacher_notes').delete().eq('id', id);
      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('삭제 오류:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredNotes = notes.filter(n => {
    if (filterClassId === 'all') return true;
    if (filterClassId === NO_CLASS) return !n.class_id;
    return n.class_id === filterClassId;
  });

  return (
    <div className="space-y-6">
      {/* 작성 폼 */}
      <div className="glass rounded-2xl p-5 md:p-6 border border-white/40 space-y-4">
        <h3 className="text-sm font-black text-on-surface flex items-center gap-2">
          <StickyNote size={16} className="text-primary" /> 새 노트 작성
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={formClassId}
            onChange={e => setFormClassId(e.target.value)}
            className="sm:w-56 px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold appearance-none focus:ring-2 focus:ring-primary/20"
          >
            <option value={NO_CLASS}>클래스 없음 (개인 메모)</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="flex-1 px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="rounded-2xl overflow-hidden border border-surface-container">
          <RichEditor
            value={content}
            onChange={setContent}
            onUploadImage={handleUploadImage}
            onUploadingChange={setUploading}
            uploading={uploading}
            minHeight="320px"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!content.trim() || saving || uploading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 btn-gradient rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={16} /> {saving ? '저장 중...' : uploading ? '이미지 업로드 중...' : '노트 저장'}
        </button>
      </div>

      {/* 클래스별 필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        {[{ id: 'all', label: '전체' }, { id: NO_CLASS, label: '미지정' }, ...classes.map(c => ({ id: c.id, label: c.name }))].map(f => (
          <button
            key={f.id}
            onClick={() => setFilterClassId(f.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterClassId === f.id ? 'bg-primary-container text-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-surface-container rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="p-10 text-center border-2 border-dashed border-neutral-200 rounded-3xl">
          <StickyNote size={28} className="mx-auto mb-3 text-neutral-300" />
          <p className="text-sm font-bold text-neutral-400">아직 작성된 노트가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredNotes.map(note => {
              const isEditing = editingId === note.id;
              const isDeleting = deletingId === note.id;
              return (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="surface-card p-5 shadow-soft group"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        value={editForm.title}
                        onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                        placeholder="제목 (선택)"
                        className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="rounded-xl overflow-hidden border border-surface-container">
                        <RichEditor
                          value={editForm.content}
                          onChange={v => setEditForm(p => ({ ...p, content: v }))}
                          onUploadImage={handleUploadImage}
                          onUploadingChange={setEditUploading}
                          uploading={editUploading}
                          minHeight="240px"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 text-xs font-black text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-lg transition-all"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={savingEditId === note.id || editUploading}
                          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-xs font-black disabled:opacity-50 hover:bg-primary/80 transition-all"
                        >
                          {savingEditId === note.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                        <StickyNote size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded border bg-surface-container text-on-surface-variant/60 border-neutral-200">
                            {note.classes?.name || '미지정'}
                          </span>
                        </div>
                        {note.title && <p className="text-sm font-black text-on-surface mb-1">{note.title}</p>}
                        <div className="[&>*:last-child]:mb-0">
                          <ReactMarkdown components={noteMdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {note.content}
                          </ReactMarkdown>
                        </div>
                        <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-on-surface-variant/40">
                          <Clock size={10} />
                          {new Date(note.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => handleStartEdit(note)}
                          title="수정"
                          className="w-8 h-8 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-all"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          disabled={isDeleting}
                          title="삭제"
                          className="w-8 h-8 rounded-lg bg-surface-container hover:bg-error/10 hover:text-error flex items-center justify-center text-on-surface-variant transition-all disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
