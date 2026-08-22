import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { StickyNote, Save, Loader2, Pencil, Trash2, Check, Clock, Sparkles, X, Tag, RefreshCw, FileText, Presentation, Link2, Lightbulb, PenLine, List } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import RichEditor from '../components/RichEditor';
import CodeBlock from '../components/CodeBlock';
import { analyzeIdea, generateLessonPlanDraft, type IdeaAnalysisResult, type RelatedMaterialRef } from '../lib/gemini';

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
  code: ({ children, className }: any) => {
    if (!className) {
      return <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>;
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const className = child?.props?.className || '';
    const lang = className.replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
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
  status: string;
  ai_summary: IdeaAnalysisResult | null;
  tags: string[];
  classes?: { name: string } | null;
}

const FORMAT_LABEL: Record<IdeaAnalysisResult['suggestedFormat'], string> = {
  guide: '수업 가이드',
  material: '수업 자료',
  slide: '슬라이드',
};

const NO_CLASS = '__none__';

// 아이디어 카드 왼쪽 액션 스트라이프 + 아이콘 색 — 클래스별로 고정된 색을 갖도록 id를 해싱
const CARD_ACCENTS = [
  { border: 'border-l-primary', iconBg: 'bg-primary/10', iconText: 'text-primary' },
  { border: 'border-l-secondary', iconBg: 'bg-secondary/10', iconText: 'text-secondary' },
  { border: 'border-l-accent', iconBg: 'bg-accent/10', iconText: 'text-accent' },
];
const NO_CLASS_ACCENT = { border: 'border-l-on-surface/10', iconBg: 'bg-surface-container', iconText: 'text-on-surface-variant/50' };
const getCardAccent = (classId: string | null) => {
  if (!classId) return NO_CLASS_ACCENT;
  let hash = 0;
  for (let i = 0; i < classId.length; i++) hash = (hash * 31 + classId.charCodeAt(i)) % CARD_ACCENTS.length;
  return CARD_ACCENTS[hash];
};

export default function IdeaRecord() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [formClassId, setFormClassId] = useState<string>(NO_CLASS);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'write' | 'list'>('write');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '' });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editUploading, setEditUploading] = useState(false);

  const [analysisNote, setAnalysisNote] = useState<TeacherNote | null>(null);
  const [analysisResult, setAnalysisResult] = useState<IdeaAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSaving, setAnalysisSaving] = useState(false);
  // 분석 시점에 함께 조회한 관련 기존 수업 자료 — "수업 자료로 만들기" 생성 시 재사용
  const [analysisRelatedMaterials, setAnalysisRelatedMaterials] = useState<RelatedMaterialRef[]>([]);
  const [creatingMaterialLength, setCreatingMaterialLength] = useState<'simple' | 'detailed' | null>(null);

  // 5단계: 태그 매칭용 — 카드에 "비슷한 자료 있음" 힌트를 보여주기 위해 한 번만 가져와둠
  const [libraryMaterials, setLibraryMaterials] = useState<{ title: string; content: string }[]>([]);
  const [librarySlides, setLibrarySlides] = useState<{ title: string }[]>([]);

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
      fetchLibraryResources();
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

  // 5단계: "비슷한 자료 있음" 힌트 계산용 — 자료함 전체를 한 번만 가져와 클라이언트에서 태그 키워드 매칭
  const fetchLibraryResources = async () => {
    const [{ data: materials }, { data: slides }] = await Promise.all([
      supabase.from('class_materials').select('title, content').eq('teacher_id', user!.id).limit(300),
      supabase.from('slide_decks').select('title').eq('teacher_id', user!.id).limit(300),
    ]);
    setLibraryMaterials(materials || []);
    setLibrarySlides(slides || []);
  };

  // 5단계: 태그가 붙은(=AI 분석 완료된) 노트마다 다른 노트/자료/슬라이드에 같은 태그 키워드가 있는지 클라이언트에서 계산
  const similarResourceNoteIds = useMemo(() => {
    const ids = new Set<string>();
    notes.forEach(note => {
      if (!note.tags || note.tags.length === 0) return;
      const tagsLower = note.tags.map(t => t.toLowerCase());
      const hasSimilarNote = notes.some(other =>
        other.id !== note.id && other.tags?.some(t => tagsLower.includes(t.toLowerCase()))
      );
      const hasSimilarMaterial = libraryMaterials.some(m =>
        tagsLower.some(t => `${m.title} ${m.content}`.toLowerCase().includes(t))
      );
      const hasSimilarSlide = librarySlides.some(s =>
        tagsLower.some(t => s.title.toLowerCase().includes(t))
      );
      if (hasSimilarNote || hasSimilarMaterial || hasSimilarSlide) ids.add(note.id);
    });
    return ids;
  }, [notes, libraryMaterials, librarySlides]);

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return notes.filter(n => {
      const d = new Date(n.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [notes]);

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
      console.error('아이디어 기록 조회 오류:', err);
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
      setActiveTab('list');
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
    if (!confirm('이 아이디어를 삭제하시겠습니까?')) return;
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

  // 같은 클래스(없으면 내 최근 자료 전체)에서 최근 수업 자료 몇 개를 가져와 AI 제안/생성의 참고 맥락으로 사용
  const fetchRelatedMaterials = async (note: TeacherNote): Promise<RelatedMaterialRef[]> => {
    if (!user) return [];
    let query = supabase
      .from('class_materials')
      .select('title, content')
      .order('updated_at', { ascending: false })
      .limit(5);
    query = note.class_id ? query.eq('class_id', note.class_id) : query.eq('teacher_id', user.id);
    const { data } = await query;
    return (data ?? []).map((m: any) => ({
      title: (m.title as string) || '제목 없음',
      snippet: ((m.content as string) || '').slice(0, 300),
    }));
  };

  const runAnalysis = async (note: TeacherNote) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const relatedMaterials = await fetchRelatedMaterials(note);
      setAnalysisRelatedMaterials(relatedMaterials);
      const result = await analyzeIdea(note.content, note.class_id ?? undefined, relatedMaterials);
      setAnalysisResult(result);
    } catch (err: any) {
      setAnalysisError(err?.message === 'AI_LIMIT_EXCEEDED'
        ? '이번 달 AI 사용 한도에 도달했습니다.'
        : '분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleOpenAnalysis = (note: TeacherNote) => {
    setAnalysisNote(note);
    if (note.ai_summary) {
      setAnalysisResult(note.ai_summary);
      setAnalysisError(null);
      // 저장된 분석 결과를 재사용하는 경우에도 "수업 자료로 만들기" 생성 시 쓸 관련 자료는 새로 조회
      fetchRelatedMaterials(note).then(setAnalysisRelatedMaterials);
    } else {
      setAnalysisResult(null);
      setAnalysisRelatedMaterials([]);
      runAnalysis(note);
    }
  };

  const handleCloseAnalysis = () => {
    setAnalysisNote(null);
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  // AI 초안(수업 진행 순서)을 노트 본문 뒤에 이어붙여 에디터로 넘길 초안 콘텐츠 생성
  const buildDraftContent = (note: TeacherNote, result: IdeaAnalysisResult) => {
    const outline = result.guideOutline.length > 0
      ? `\n\n## 수업 진행 순서\n${result.guideOutline.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
      : '';
    return `${note.content}${outline}`;
  };

  // 분석 결과(ai_summary/tags/status)를 노트에 반영 — "저장" 버튼뿐 아니라 자료/슬라이드 생성 시에도 함께 호출해
  // 사용자가 "저장"을 따로 누르지 않고 바로 자료를 만들어도 태그가 비어있지 않도록 보장
  const persistAnalysis = async (note: TeacherNote, result: IdeaAnalysisResult) => {
    const { error } = await supabase
      .from('teacher_notes')
      .update({ ai_summary: result, tags: result.relatedTags, status: 'developed' })
      .eq('id', note.id);
    if (error) throw error;
    setNotes(prev =>
      prev.map(n => (n.id === note.id
        ? { ...n, ai_summary: result, tags: result.relatedTags, status: 'developed' }
        : n))
    );
  };

  // "수업 자료로 만들기" — 원문을 그대로 옮기지 않고 AI가 실제 수업 계획안을 새로 작성해 전달
  const handleCreateMaterial = async (length: 'simple' | 'detailed') => {
    if (!analysisNote || !analysisResult) return;
    setCreatingMaterialLength(length);
    try {
      const [draftContent] = await Promise.all([
        generateLessonPlanDraft(
          analysisNote.content,
          analysisResult.guideOutline,
          analysisRelatedMaterials,
          length,
          analysisNote.class_id ?? undefined
        ),
        persistAnalysis(analysisNote, analysisResult).catch(err => {
          console.error('AI 분석 저장 오류:', err);
        }),
      ]);
      navigate('/teaching-tools', {
        state: {
          activeToolId: 'material-editor',
          draftMaterial: {
            noteId: analysisNote.id,
            title: analysisNote.title || '제목 없는 아이디어',
            content: draftContent,
            classId: analysisNote.class_id,
          },
        },
      });
    } catch (err: any) {
      alert(err?.message === 'AI_LIMIT_EXCEEDED'
        ? '이번 달 AI 사용 한도에 도달했습니다.'
        : '수업 계획안 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setCreatingMaterialLength(null);
    }
  };

  const handleCreateSlide = () => {
    if (!analysisNote || !analysisResult) return;
    persistAnalysis(analysisNote, analysisResult).catch(err => console.error('AI 분석 저장 오류:', err));
    navigate('/teaching-tools', {
      state: {
        activeToolId: 'slide-deck',
        draftSlide: {
          noteId: analysisNote.id,
          title: analysisNote.title || '제목 없는 아이디어',
          content: buildDraftContent(analysisNote, analysisResult),
          classId: analysisNote.class_id,
        },
      },
    });
  };

  const handleSaveAnalysis = async () => {
    if (!analysisNote || !analysisResult) return;
    setAnalysisSaving(true);
    try {
      await persistAnalysis(analysisNote, analysisResult);
      handleCloseAnalysis();
    } catch (err) {
      console.error('AI 분석 저장 오류:', err);
    } finally {
      setAnalysisSaving(false);
    }
  };

  const filteredNotes = notes.filter(n => {
    if (filterClassId === 'all') return true;
    if (filterClassId === NO_CLASS) return !n.class_id;
    return n.class_id === filterClassId;
  });

  const displayName = profile?.full_name ? `${profile.full_name} 선생님` : '선생님';

  return (
    <div className="space-y-6">
      {/* 히어로 인사 */}
      <div className="relative">
        <div className="absolute -top-20 -right-16 -z-10 w-72 h-72 rounded-full bg-gradient-to-br from-primary to-secondary opacity-[0.12] blur-[64px] pointer-events-none" />
        <div className="relative flex items-end justify-between gap-6 flex-wrap pb-5 border-b border-on-surface/[0.06]">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-black tracking-wide text-primary mb-2">
              <Lightbulb size={13} /> 오늘의 아이디어 기록
            </div>
            <h1 className="text-2xl md:text-[28px] font-black text-on-surface tracking-tightest leading-tight">
              {displayName}, <span className="gradient-text">오늘은 어떤 수업</span>이 떠오르셨나요?
            </h1>
            <p className="text-sm text-on-surface-variant mt-2 max-w-md">
              떠오른 생각을 가볍게 적어두면, AI가 기존 자료를 살펴보고 수업으로 발전시킬 방법을 함께 찾아드려요.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-black text-primary leading-none tabular-nums">{thisMonthCount}</p>
            <p className="text-[11px] font-black text-on-surface-variant/50 mt-1">이번 달 기록</p>
          </div>
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="flex items-center gap-1 bg-surface-container/70 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('write')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeTab === 'write' ? 'bg-surface-container-lowest text-primary shadow-soft' : 'text-on-surface-variant/60 hover:text-on-surface'
          }`}
        >
          <PenLine size={14} /> 입력
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeTab === 'list' ? 'bg-surface-container-lowest text-primary shadow-soft' : 'text-on-surface-variant/60 hover:text-on-surface'
          }`}
        >
          <List size={14} /> 목록
          {notes.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
              activeTab === 'list' ? 'bg-primary/10 text-primary' : 'bg-on-surface/5 text-on-surface-variant/50'
            }`}>
              {notes.length}
            </span>
          )}
        </button>
      </div>

      {/* 작성 폼 */}
      {activeTab === 'write' && (
      <div className="bg-surface-container-lowest rounded-3xl p-5 md:p-6 border border-primary/10 shadow-elevated space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-black text-on-surface flex items-center gap-2">
            <StickyNote size={15} className="text-primary" /> 새 아이디어
          </h3>
          <span className="text-[11px] font-bold text-on-surface-variant/50">가볍게 적어두세요 — 나중에 AI가 다듬어드려요</span>
        </div>
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
            minHeight="220px"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving || uploading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 btn-gradient rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save size={16} /> {saving ? '저장 중...' : uploading ? '이미지 업로드 중...' : '아이디어 저장'}
          </button>
        </div>
      </div>
      )}

      {/* 목록 */}
      {activeTab === 'list' && (
      <div className="space-y-4">
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

        {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-surface-container rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="p-10 text-center border-2 border-dashed border-on-surface/10 rounded-3xl">
          <StickyNote size={28} className="mx-auto mb-3 text-on-surface-variant/25" />
          <p className="text-sm font-bold text-on-surface-variant/50">
            {filterClassId === 'all' ? '아직 기록한 아이디어가 없습니다.' : '이 필터에 해당하는 아이디어가 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {filteredNotes.map(note => {
              const isEditing = editingId === note.id;
              const isDeleting = deletingId === note.id;
              const accent = getCardAccent(note.class_id);
              return (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`bg-surface-container-lowest rounded-2xl p-5 shadow-soft hover:shadow-elevated transition-all hover:-translate-y-0.5 border-y border-r border-on-surface/[0.05] border-l-4 ${accent.border} group ${isEditing ? 'md:col-span-2' : ''}`}
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
                          minHeight="200px"
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
                    <div className="flex flex-col h-full">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className={`w-9 h-9 rounded-xl ${accent.iconBg} ${accent.iconText} flex items-center justify-center shrink-0`}>
                          <StickyNote size={16} />
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

                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant/60">
                          {note.classes?.name || '미지정'}
                        </span>
                        {note.status === 'developed' && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-primary-container text-primary">
                            <Sparkles size={9} /> AI 분석 완료
                          </span>
                        )}
                        {similarResourceNoteIds.has(note.id) && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            <Link2 size={9} /> 비슷한 자료 있음
                          </span>
                        )}
                      </div>

                      {note.title && <p className="text-sm font-black text-on-surface mb-1 tracking-tight">{note.title}</p>}
                      <div className="[&>*:last-child]:mb-0 line-clamp-4 overflow-hidden flex-1">
                        <ReactMarkdown components={noteMdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {note.content}
                        </ReactMarkdown>
                      </div>

                      {note.tags?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {note.tags.map(tag => (
                            <span key={tag} className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant/70">
                              <Tag size={9} /> {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-on-surface/[0.05]">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant/40">
                          <Clock size={10} />
                          {new Date(note.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                        <button
                          onClick={() => handleOpenAnalysis(note)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary-container text-primary hover:bg-primary/20 transition-all shrink-0"
                        >
                          <Sparkles size={12} /> {note.ai_summary ? 'AI 분석 보기' : 'AI로 발전시키기'}
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
      )}

      <AnimatePresence>
        {analysisNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={handleCloseAnalysis}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg max-h-[85vh] overflow-hidden bg-surface-container-lowest rounded-3xl shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary-container to-secondary-container/50 shrink-0">
                <h3 className="text-base font-black text-primary flex items-center gap-2">
                  <Sparkles size={17} /> AI로 발전시키기
                </h3>
                <button onClick={handleCloseAnalysis} className="w-8 h-8 rounded-lg hover:bg-white/50 flex items-center justify-center text-primary/70">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto p-6">
              {analysisLoading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-on-surface-variant">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <p className="text-xs font-bold">아이디어를 분석하고 있습니다...</p>
                </div>
              ) : analysisError ? (
                <div className="py-8 text-center space-y-3">
                  <p className="text-xs font-bold text-error">{analysisError}</p>
                  <button
                    onClick={() => runAnalysis(analysisNote)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-container rounded-lg text-xs font-black hover:bg-surface-container-high"
                  >
                    <RefreshCw size={12} /> 다시 시도
                  </button>
                </div>
              ) : analysisResult ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant/50 mb-1">한 줄 요약</p>
                    <p className="text-sm font-bold text-on-surface leading-relaxed">{analysisResult.summary}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant/50 mb-1">추천 형태</p>
                    <span className="inline-block text-xs font-black px-2.5 py-1 rounded-lg bg-primary-container text-primary">
                      {FORMAT_LABEL[analysisResult.suggestedFormat]}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">수업 가이드 초안</p>
                    <ol className="space-y-1.5">
                      {analysisResult.guideOutline.map((step, i) => (
                        <li key={i} className="flex gap-2 text-xs text-on-surface leading-relaxed">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-surface-container text-on-surface-variant/60 text-[9px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {analysisResult.relatedMaterialsNote && (
                    <div>
                      <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">관련 자료 반영 제안</p>
                      <div className="flex gap-2.5 bg-secondary-container/40 border border-secondary/20 rounded-xl px-3.5 py-3">
                        <Link2 size={14} className="text-secondary shrink-0 mt-0.5" />
                        <p className="text-xs text-on-surface leading-relaxed">{analysisResult.relatedMaterialsNote}</p>
                      </div>
                    </div>
                  )}
                  {analysisResult.relatedTags.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">관련 태그</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {analysisResult.relatedTags.map(tag => (
                          <span key={tag} className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant/70">
                            <Tag size={9} /> {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2.5 bg-surface-container/50 rounded-2xl p-4 border border-on-surface/[0.05]">
                    <p className="text-[10px] font-black text-on-surface-variant/50">이 아이디어로 만들기</p>
                    <div>
                      <p className="text-[10px] font-bold text-on-surface-variant/60 mb-1 flex items-center gap-1">
                        <FileText size={11} /> 수업 자료로 만들기 — AI가 계획안을 새로 작성합니다
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleCreateMaterial('simple')}
                          disabled={creatingMaterialLength !== null}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-60 ${
                            analysisResult.suggestedFormat !== 'slide'
                              ? 'bg-primary text-white shadow-lg shadow-primary/20'
                              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          {creatingMaterialLength === 'simple' ? <Loader2 size={13} className="animate-spin" /> : null}
                          간단히
                        </button>
                        <button
                          onClick={() => handleCreateMaterial('detailed')}
                          disabled={creatingMaterialLength !== null}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-60 ${
                            analysisResult.suggestedFormat !== 'slide'
                              ? 'bg-primary text-white shadow-lg shadow-primary/20'
                              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          {creatingMaterialLength === 'detailed' ? <Loader2 size={13} className="animate-spin" /> : null}
                          자세히
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleCreateSlide}
                      className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition-all ${
                        analysisResult.suggestedFormat === 'slide'
                          ? 'bg-primary text-white shadow-lg shadow-primary/20'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      <Presentation size={13} /> 슬라이드로 만들기
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      onClick={() => runAnalysis(analysisNote)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-on-surface-variant hover:bg-surface-container rounded-lg transition-all"
                    >
                      <RefreshCw size={12} /> 다시 생성
                    </button>
                    <button
                      onClick={handleSaveAnalysis}
                      disabled={analysisSaving}
                      className="flex items-center gap-1.5 px-5 py-2.5 btn-gradient rounded-xl font-bold text-xs shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {analysisSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} 저장
                    </button>
                  </div>
                </div>
              ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
