import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth, checkIsBasicOrAbove } from '../../lib/auth';
import { reorganizeMaterialContent, validateReorganizeInstruction, MATERIAL_REORG_PROMPTS, generateCoverPromptSuggestions, embedText } from '../../lib/gemini';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

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
import ReactMarkdown from 'react-markdown';
import {
  Save, Trash2, Copy, Plus,
  Loader2, ChevronDown, Globe, Lock,
  BookOpen, Pencil, ArrowLeft, Eye, EyeOff,
  Users, Presentation, ChevronRight, X as XIcon,
  Maximize2, Download, Sparkles, RotateCcw, AlertCircle, History, Check,
  Library, Link2, FileDown, Image as ImageIcon, Upload, Lightbulb, Wand2, GalleryHorizontal,
} from 'lucide-react';
import CodeBlock from '../../components/CodeBlock';
import RichEditor from '../../components/RichEditor';
import PresentationModal, { renderCallout } from '../../components/PresentationModal';
// Marp 렌더링 라이브러리가 무거워 슬라이드 보기 모드를 실제로 열 때만 불러오도록 지연 로딩한다
const SlideModeView = lazy(() => import('../../components/SlideModeView'));
import MaterialCoverPage from '../../components/MaterialCoverPage';
import MaterialTocPage, { type TocSection } from '../../components/MaterialTocPage';
import LimitToast, { useLimitToast } from '../../components/ui/LimitToast';
import IdeaPRDWizard from '../../components/idea/IdeaPRDWizard';
import type { LessonPRD } from '../../lib/gemini';

// PDF 목차 페이지용 — 본문 마크다운 소제목(#~###)을 순서대로 추출
const extractHeadingsForToc = (content: string): TocSection[] => {
  const sections: TocSection[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    sections.push({ level: m[1].length, text: m[2].trim() });
  }
  return sections;
};

// AI로 정리한 결과 히스토리 (학습가이드/발표자료 등 여러 버전을 보관)
interface AiVersion {
  id: string;
  mode: 'guide' | 'presentation';
  label: string;
  content: string;
  created_at: string;
}

interface Material {
  id: string;
  class_id: string | null;
  week_number: number;
  title: string;
  content: string;
  url: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  view_count?: number;
  ai_versions?: AiVersion[];
  teacher_id?: string | null;
  source_material_id?: string | null;
  cover_image_url?: string | null;
  cover_source?: 'template' | 'upload' | null;
}

const formatVersionDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
};

// 발표 모드 컴포넌트는 src/components/PresentationModal.tsx로 분리됨 (Classroom.tsx와 공유)

// ── 다른 클래스·공통 자료함에서 가져오기 모달 ─────────────────────────────────
const ImportFromClassModal = ({
  currentClassId,
  userId,
  onImport,
  onClose,
}: {
  currentClassId?: string;
  userId: string;
  onImport: (title: string, content: string, weekNumber: number) => void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<'class' | 'material'>('class');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [isLibrary, setIsLibrary] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let query = supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', userId)
      .eq('is_archived', false);
    if (currentClassId) query = query.neq('id', currentClassId);
    query
      .order('created_at', { ascending: false })
      .then(({ data }) => { setClasses(data || []); setLoading(false); });
  }, []);

  const handleSelectClass = async (cls: any) => {
    setSelectedClass(cls);
    setIsLibrary(false);
    setLoading(true);
    const { data, error } = await supabase
      .from('class_materials')
      .select('id, title, content, is_published, week_number, created_at')
      .eq('class_id', cls.id)
      .order('week_number', { ascending: true });
    if (error) console.error('[ImportModal] class_materials fetch error:', error);
    setMaterials((data || []) as Material[]);
    setLoading(false);
    setStep('material');
  };

  const handleSelectLibrary = async () => {
    setSelectedClass(null);
    setIsLibrary(true);
    setLoading(true);
    const { data, error } = await supabase
      .from('class_materials')
      .select('id, title, content, is_published, week_number, created_at')
      .is('class_id', null)
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.error('[ImportModal] library materials fetch error:', error);
    setMaterials((data || []) as Material[]);
    setLoading(false);
    setStep('material');
  };

  const handleSelectMaterial = (material: Material) => {
    if (!window.confirm(`"${material.title}" 내용을 현재 에디터에 복사하시겠습니까?\n현재 작성 중인 내용이 있다면 덮어씁니다.`)) return;
    onImport(material.title, material.content ?? '', material.week_number ?? 1);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          {step === 'material' && (
            <button
              onClick={() => { setStep('class'); setSelectedClass(null); setIsLibrary(false); setMaterials([]); }}
              className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">
              {step === 'class' ? '다른 자료에서 가져오기' : isLibrary ? '공통 자료함' : selectedClass?.name}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {step === 'class' ? '가져올 자료가 있는 클래스나 공통 자료함을 선택하세요' : '가져올 자료를 선택하세요'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : step === 'class' ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={handleSelectLibrary}
                className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-container-low transition-colors group"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Library size={15} />
                </div>
                <span className="font-bold text-sm flex-1 text-on-surface">공통 자료함</span>
                <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
              </button>
              {classes.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3 opacity-40">
                  <BookOpen size={36} />
                  <p className="font-black text-sm">다른 클래스가 없습니다</p>
                </div>
              ) : (
                classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleSelectClass(cls)}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-container-low transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <BookOpen size={15} />
                    </div>
                    <span className="font-bold text-sm flex-1 text-on-surface">{cls.name}</span>
                    <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
                  </button>
                ))
              )}
            </div>
          ) : (
            materials.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 opacity-40">
                <BookOpen size={36} />
                <p className="font-black text-sm">{isLibrary ? '공통 자료함에 자료가 없습니다' : '이 클래스에 자료가 없습니다'}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {materials.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMaterial(m)}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all group"
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      m.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      <BookOpen size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{m.title}</p>
                      {m.content && (
                        <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1 opacity-60">
                          {m.content.slice(0, 60)}…
                        </p>
                      )}
                    </div>
                    <Download size={14} className="text-on-surface-variant group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── 공통 자료함 → 클래스 연결 모달 ────────────────────────────────────────────
const LinkToClassModal = ({
  material,
  classes,
  userId,
  publishOnLink = false,
  isBasicOrAbove,
  onClose,
  onLinked,
}: {
  material: Material;
  classes: any[];
  userId: string;
  publishOnLink?: boolean;
  isBasicOrAbove: boolean;
  onClose: () => void;
  onLinked: () => void;
}) => {
  const [linkedClassIds, setLinkedClassIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { limitToastMessage, showLimitToast } = useLimitToast();

  useEffect(() => {
    supabase
      .from('class_materials')
      .select('class_id')
      .eq('source_material_id', material.id)
      .then(({ data }) => {
        setLinkedClassIds((data || []).map((d: any) => d.class_id));
        setLoading(false);
      });
  }, [material.id]);

  const toggle = (classId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId); else next.add(classId);
      return next;
    });
  };

  const handleLink = async () => {
    if (selected.size === 0) return;
    if (!isBasicOrAbove) {
      const { count } = await supabase
        .from('class_materials')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', userId);
      if ((count ?? 0) + selected.size > FREE_MATERIAL_LIMIT) {
        showLimitToast(`무료 플랜은 자료를 최대 ${FREE_MATERIAL_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
        return;
      }
    }
    setSaving(true);
    try {
      const rows = Array.from(selected).map(classId => ({
        class_id: classId,
        teacher_id: userId,
        week_number: 1,
        title: material.title,
        content: material.content ?? '',
        ai_versions: material.ai_versions ?? [],
        is_published: publishOnLink,
        source_material_id: material.id,
      }));
      const { error } = await supabase.from('class_materials').insert(rows);
      if (error) throw error;
      onLinked();
      onClose();
    } catch (err: any) {
      alert(`연결 중 오류가 발생했습니다.\n${err?.message || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface truncate">"{material.title}" {publishOnLink ? '공개하기' : '연결하기'}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {publishOnLink ? '공개할 클래스를 선택하세요 (여러 개 가능)' : '연결할 클래스를 선택하세요 (여러 개 가능)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : classes.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 opacity-40">
              <BookOpen size={36} />
              <p className="font-black text-sm">연결할 클래스가 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {classes.map(cls => {
                const isLinked = linkedClassIds.includes(cls.id);
                const isSelected = selected.has(cls.id);
                return (
                  <button
                    key={cls.id}
                    onClick={() => !isLinked && toggle(cls.id)}
                    disabled={isLinked}
                    className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                      isLinked
                        ? 'border-transparent opacity-40 cursor-not-allowed'
                        : isSelected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-transparent hover:bg-surface-container-low'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      <BookOpen size={15} />
                    </div>
                    <span className="font-bold text-sm flex-1 text-on-surface">{cls.name}</span>
                    {isLinked
                      ? <span className="text-[10px] font-black text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full shrink-0">연결됨</span>
                      : isSelected
                        ? <Check size={16} className="text-primary shrink-0" />
                        : null
                    }
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-surface-container shrink-0">
          <p className="flex-1 text-xs font-bold text-on-surface-variant">
            {selected.size > 0 ? `${selected.size}개 클래스 선택됨` : '클래스를 선택하세요'}
          </p>
          <button
            onClick={handleLink}
            disabled={selected.size === 0 || saving}
            className="flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : (publishOnLink ? <Globe size={14} /> : <Link2 size={14} />)}
            {publishOnLink ? '선택한 클래스에 공개' : '연결하기'}
          </button>
        </div>
      </div>
      <LimitToast message={limitToastMessage} />
    </div>,
    document.body
  );
};

// ── 미리보기 전체화면 모달 ────────────────────────────────────────────────────
const PreviewFullscreenModal = ({
  title,
  content,
  onClose,
}: {
  title: string;
  content: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.documentElement.style.overflow = prev;
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-white flex flex-col overflow-hidden">
      {/* 상단 헤더 */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-800 font-black text-sm hover:bg-slate-100 active:scale-95 transition-all shadow"
        >
          <ArrowLeft size={15} /> 나가기
        </button>
        <div className="flex items-center gap-2 ml-2">
          <Eye size={15} className="text-white/60" />
          <span className="font-black text-sm text-white/80 truncate max-w-xs">{title || '미리보기'}</span>
        </div>
      </div>
      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── 마크다운 컴포넌트 렌더러 ──────────────────────────────────────────────────
const mdComponents: any = {
  h1: ({ children }: any) => <h1 className="text-2xl font-black mb-4 mt-6 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-black mb-3 mt-5 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-black mb-2 mt-4 text-on-surface">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 leading-relaxed text-sm text-on-surface">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-on-surface">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-xl">
      {children}
    </blockquote>
  ),
  // 인라인 코드 (className 없는 경우)
  code: ({ children, className }: any) => {
    if (!className) {
      return <code className="bg-surface-container px-1.5 py-0.5 rounded text-sm font-mono text-primary">{children}</code>;
    }
    // 블록 코드는 pre에서 처리하므로 그대로 전달
    return <code className={className}>{children}</code>;
  },
  // 블록 코드 — CodeBlock 컴포넌트 사용
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const className = child?.props?.className || '';
    const lang = className.replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">
      {children}
    </a>
  ),
  img: ({ src, alt, title }: any) => {
    const wm = (title || '').match(/(?:^|,)width:(\d+)/);
    const style = wm ? { width: `${wm[1]}px`, maxWidth: '100%' } : undefined;
    return <img src={src} alt={alt} style={style} className="max-w-full rounded-xl my-3 shadow" />;
  },
  hr: () => <hr className="border-surface-container my-5" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-3">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-surface-container px-3 py-2">{children}</td>
  ),
  details: ({ children }: any) => (
    <details className="my-3 rounded-xl border border-surface-container overflow-hidden">
      {children}
    </details>
  ),
  summary: ({ children }: any) => (
    <summary className="px-4 py-2.5 bg-surface-container-low cursor-pointer font-black text-sm list-none flex items-center gap-2 select-none hover:bg-surface-container transition-colors">
      <span className="text-primary text-xs">▶</span> {children}
    </summary>
  ),
  div: (props: any) => renderCallout(props, false),
};

// ── AI 재구성 모달 (학습 가이드) ─────────────────────────────────
type ReorganizeStep = 'configure' | 'loading' | 'preview' | 'error';

const AiReorganizeModal = ({
  rawContent,
  classId,
  onApply,
  onClose,
}: {
  rawContent: string;
  classId?: string;
  onApply: (newContent: string, mode: 'guide' | 'presentation') => void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<ReorganizeStep>('configure');
  const [mode, setMode] = useState<'guide' | 'presentation'>('guide');
  const [userInstruction, setUserInstruction] = useState('');
  const [showBasePrompt, setShowBasePrompt] = useState(false);
  const [result, setResult] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationWarning, setValidationWarning] = useState<{ message: string; guide?: string } | null>(null);

  const runGenerate = async () => {
    setStep('loading');
    setFeedback(null);
    try {
      const generated = await reorganizeMaterialContent(rawContent, mode, userInstruction, classId);
      setResult(generated.content);
      setFeedback(generated.feedback);
      setStep('preview');
    } catch (err: any) {
      setErrorMessage(
        err?.message === 'AI_LIMIT_EXCEEDED'
          ? '이번 달 AI 사용 한도에 도달했습니다.'
          : (err?.message || 'AI 정리 중 오류가 발생했습니다.')
      );
      setStep('error');
    }
  };

  const handleGenerate = async () => {
    const trimmed = userInstruction.trim();
    if (!trimmed) {
      setValidationWarning(null);
      await runGenerate();
      return;
    }
    setValidating(true);
    setValidationWarning(null);
    const check = await validateReorganizeInstruction(trimmed, mode);
    setValidating(false);
    if (!check.feasible) {
      setValidationWarning({ message: check.message, guide: check.guide });
      return;
    }
    await runGenerate();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/40 px-4"
      onClick={step === 'loading' ? undefined : onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">AI로 정리</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {step === 'configure' && (mode === 'guide' ? '학습 가이드로 정리' : '발표 자료(슬라이드)로 정리')}
              {step === 'loading' && 'AI가 정리하는 중입니다...'}
              {step === 'preview' && '결과를 확인하세요'}
              {step === 'error' && '오류가 발생했습니다'}
            </p>
          </div>
          {step !== 'loading' && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'configure' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface-container-low">
                <button
                  onClick={() => { setMode('guide'); setValidationWarning(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all ${mode === 'guide' ? 'bg-white text-primary shadow' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  <BookOpen size={14} /> 학습 가이드
                </button>
                <button
                  onClick={() => { setMode('presentation'); setValidationWarning(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all ${mode === 'presentation' ? 'bg-white text-primary shadow' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  <Presentation size={14} /> 발표 자료(슬라이드)
                </button>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed px-0.5">
                {mode === 'guide'
                  ? '학생이 순서대로 따라가는 STEP 단계 구조로 정리합니다.'
                  : '16:9 슬라이드 화면 단위로 나눠 정리합니다. 정리 후 "슬라이드로 보기"에서 장면별로 넘겨볼 수 있어요.'}
              </p>
              <button
                onClick={() => setShowBasePrompt(s => !s)}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:opacity-70 transition-opacity"
              >
                {showBasePrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                AI에게 전달되는 기본 지침 보기
              </button>
              {showBasePrompt && (
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-on-surface-variant bg-surface-container-low rounded-2xl p-4 font-sans">
                  {MATERIAL_REORG_PROMPTS[mode]}
                </pre>
              )}
              <div>
                <p className="text-xs font-black text-on-surface-variant mb-1.5">추가로 반영하고 싶은 요청사항 (선택)</p>
                <textarea
                  value={userInstruction}
                  onChange={e => { setUserInstruction(e.target.value); setValidationWarning(null); }}
                  placeholder="예: 중학생 눈높이로 쉽게 풀어줘"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-white rounded-xl border border-surface-container text-sm focus:outline-none focus:border-primary/40 resize-none"
                />
              </div>
              {validationWarning && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed space-y-1">
                    <p>{validationWarning.message}</p>
                    {validationWarning.guide && (
                      <p className="text-amber-700">💡 {validationWarning.guide}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'loading' && (
            <div className="flex flex-col items-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm font-bold text-on-surface-variant">AI가 정리하는 중입니다...</p>
            </div>
          )}

          {step === 'preview' && (
            <>
              {feedback && (
                <div className="flex items-start gap-2 px-4 py-3 mb-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed whitespace-pre-line">{feedback}</div>
                </div>
              )}
              <div className="max-h-[50vh] overflow-auto">
                <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{result}</ReactMarkdown>
              </div>
            </>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <AlertCircle size={32} className="text-red-400" />
              <p className="text-sm font-bold text-on-surface-variant">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        {step !== 'loading' && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-surface-container bg-surface-container-low/50 shrink-0">
            {step === 'configure' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  취소
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleGenerate}
                  disabled={validating}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 transition-all"
                >
                  {validating
                    ? <><Loader2 size={15} className="animate-spin" /> 요청사항 확인 중...</>
                    : <><Sparkles size={15} /> 정리 시작</>}
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => { setFeedback(null); setStep('configure'); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <RotateCcw size={14} /> 다시 요청
                </button>
                <div className="flex-1" />
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => onApply(result, mode)}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <Save size={15} /> 적용
                </button>
              </>
            )}
            {step === 'error' && (
              <>
                <div className="flex-1" />
                <button
                  onClick={() => setStep('configure')}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  뒤로
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl font-black text-sm text-white bg-red-400 hover:bg-red-500 transition-colors"
                >
                  닫기
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ── PDF 표지 설정 모달 ────────────────────────────────────────────────────
const CoverPickerModal = ({
  title,
  subtitle,
  classId,
  coverImageUrl,
  coverSource,
  uploading,
  onUpload,
  onUseTemplate,
  onRemoveImage,
  onClose,
}: {
  title: string;
  subtitle?: string | null;
  classId?: string;
  coverImageUrl: string | null;
  coverSource: 'template' | 'upload';
  uploading: boolean;
  onUpload: (file: File) => void;
  onUseTemplate: () => void;
  onRemoveImage: () => void;
  onClose: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewImageUrl = coverSource === 'upload' ? coverImageUrl : null;

  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleGeneratePrompts = async () => {
    setGeneratingPrompts(true);
    setPromptError(null);
    try {
      const suggestions = await generateCoverPromptSuggestions(title, subtitle, classId);
      setPromptSuggestions(suggestions);
    } catch (err: any) {
      setPromptError(
        err?.message === 'AI_LIMIT_EXCEEDED'
          ? '이번 달 AI 사용 한도에 도달했습니다.'
          : (err?.message || 'AI 프롬프트 생성 중 오류가 발생했습니다.')
      );
    } finally {
      setGeneratingPrompts(false);
    }
  };

  const handleCopyPrompt = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(i => (i === index ? null : i)), 1500);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ImageIcon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">PDF 표지 설정</p>
            <p className="text-xs text-on-surface-variant mt-0.5">다운로드 시 맨 앞에 자동으로 붙습니다</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="w-full aspect-[210/297] max-h-72 mx-auto rounded-2xl overflow-hidden border border-surface-container">
            <MaterialCoverPage
              title={title || '(제목 없음)'}
              subtitle={subtitle}
              dateLabel={new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              imageUrl={previewImageUrl}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onUseTemplate}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-black text-xs transition-colors border ${
                coverSource === 'template'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-container text-on-surface-variant border-surface-container hover:bg-surface-container-low'
              }`}
            >
              <Sparkles size={12} /> 기본 템플릿
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-black text-xs transition-colors border disabled:opacity-50 ${
                coverSource === 'upload'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-container text-on-surface-variant border-surface-container hover:bg-surface-container-low'
              }`}
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? '업로드 중...' : '이미지 업로드'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
          {coverSource === 'upload' && coverImageUrl && (
            <button
              onClick={onRemoveImage}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={12} /> 업로드한 이미지 삭제하고 기본 템플릿으로
            </button>
          )}

          <div className="pt-1 border-t border-surface-container">
            <button
              onClick={handleGeneratePrompts}
              disabled={generatingPrompts}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 mt-3 rounded-xl font-black text-xs text-primary bg-primary/10 hover:bg-primary/15 transition-colors disabled:opacity-50"
            >
              {generatingPrompts ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generatingPrompts ? 'AI가 표지 프롬프트를 만드는 중...' : 'AI로 표지 이미지 프롬프트 제안받기'}
            </button>
            <p className="text-[11px] text-on-surface-variant mt-1.5 leading-relaxed">
              이미지를 바로 만들어주진 않아요. 아래 문구를 복사해 이미지 생성 도구에 붙여넣으세요.
            </p>

            {promptError && (
              <p className="text-xs font-bold text-red-500 mt-2">{promptError}</p>
            )}

            {promptSuggestions.length > 0 && (
              <div className="space-y-2 mt-3">
                {promptSuggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 bg-surface-container-low rounded-xl p-3">
                    <p className="flex-1 text-xs text-on-surface leading-relaxed">{s}</p>
                    <button
                      onClick={() => handleCopyPrompt(s, i)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant"
                      title="복사"
                    >
                      {copiedIndex === i ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const FREE_MATERIAL_LIMIT = 2;

const MaterialEditor = () => {
  const { user, profile } = useAuth();
  const { limitToastMessage, showLimitToast } = useLimitToast();
  const location = useLocation();
  const navigate = useNavigate();
  // 아이디어 기록(나의 노트)에서 "수업 자료로 만들기"로 넘어온 초안 — 첫 자동저장 완료 시 원본 노트에 연결 기록
  const pendingDraftNoteIdRef = useRef<string | null>(null);
  const draftHandledRef = useRef(false);
  const openMaterialHandledRef = useRef(false);
  // 아이디어 기록의 "참고할 만한 자료" 패널을 통해 이 자료로 넘어온 경우 — 에디터 상단에 돌아가기 링크를 보여준다
  const [cameFromIdeaRecord, setCameFromIdeaRecord] = useState(false);

  // 클래스
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  // 공통 자료함 — 클래스 선택 없이 만들어두고 나중에 원하는 클래스에 연결
  const [libraryMode, setLibraryMode] = useState(false);
  const [linkingMaterial, setLinkingMaterial] = useState<Material | null>(null);
  const [linkAsPublish, setLinkAsPublish] = useState(false);

  // 자료 목록
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);

  // 에디터 열림 여부
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  // 폼 필드
  const [title, setTitle] = useState('');
  const [weekNumber, setWeekNumber] = useState(1);
  const [content, setContent] = useState('');
  const [aiIdeaModalOpen, setAiIdeaModalOpen] = useState(false);
  const [aiIdeaText, setAiIdeaText] = useState('');
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverSource, setCoverSource] = useState<'template' | 'upload'>('template');
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  // UI 상태
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // 에디터를 열 때(신규/수정 진입) 폼 필드가 초기값으로 세팅되면서 발생하는 최초 1회 변경은
  // 자동저장 대상이 아니므로 건너뛰기 위한 플래그
  const autosaveSkipRef = useRef(true);

  const [presentingMaterial, setPresentingMaterial] = useState<Material | null>(null);
  // 발표 모드에서 "저장" 시 어디에 반영할지 (원본 draft / 특정 AI 버전 / DB 직접 저장 등 호출부마다 다름)
  const [presentingOnSave, setPresentingOnSave] = useState<((newContent: string) => void) | null>(null);
  const closePresenting = () => { setPresentingMaterial(null); setPresentingOnSave(null); };
  const [slideModeMaterial, setSlideModeMaterial] = useState<{ title: string; content: string; coverImageUrl: string | null } | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState<{ title: string; content: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAiReorganize, setShowAiReorganize] = useState(false);
  const [aiVersions, setAiVersions] = useState<AiVersion[]>([]);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  // 목록 화면에서 자료별로 "원본" 또는 AI 정리 버전 중 어떤 걸 보고 있는지 (null = 원본)
  const [selectedVersionId, setSelectedVersionId] = useState<Record<string, string | null>>({});
  const [versionMenuFor, setVersionMenuFor] = useState<string | null>(null);

  const getActiveVersion = (material: Material): { content: string; label: string } => {
    const selId = selectedVersionId[material.id];
    const v = selId ? material.ai_versions?.find(v => v.id === selId) : undefined;
    return v ? { content: v.content, label: v.label } : { content: material.content, label: '원본' };
  };

  useEffect(() => {
    if (user) fetchClasses();
  }, [user?.id]);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, class_type, weekly_plan')
      .eq('teacher_id', user!.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });
    if (data) setClasses(data);
  };

  const fetchMaterials = async (classId: string) => {
    setMaterialsLoading(true);
    try {
      const { data } = await supabase
        .from('class_materials')
        .select('*')
        .eq('class_id', classId)
        .order('week_number', { ascending: true });

      if (data && data.length > 0) {
        // 열람 수 집계
        const { data: viewData } = await supabase
          .from('student_material_views')
          .select('material_id')
          .in('material_id', data.map(m => m.id));

        const viewCounts: Record<string, number> = {};
        viewData?.forEach(v => {
          viewCounts[v.material_id] = (viewCounts[v.material_id] || 0) + 1;
        });

        setMaterials(data.map(m => ({ ...m, view_count: viewCounts[m.id] || 0 })));
      } else {
        setMaterials(data || []);
      }
    } finally {
      setMaterialsLoading(false);
    }
  };

  const fetchLibraryMaterials = async () => {
    setMaterialsLoading(true);
    try {
      const { data } = await supabase
        .from('class_materials')
        .select('*')
        .is('class_id', null)
        .eq('teacher_id', user!.id)
        .order('created_at', { ascending: false });
      setMaterials(data ?? []);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const resetForm = () => {
    setTitle(''); setWeekNumber(1); setContent(''); setIsPublished(false);
    setEditingMaterial(null); setViewMode('edit'); setAiVersions([]);
    setCoverImageUrl(null); setCoverSource('template');
  };

  // 아이디어 기록에서 "수업 자료로 만들기"로 넘어온 경우 — 공통 자료함에 초안을 프리필한 채 에디터를 바로 연다
  useEffect(() => {
    if (draftHandledRef.current) return;
    const draft = (location.state as { draftMaterial?: { noteId: string; title: string; content: string; classId?: string | null } } | null)?.draftMaterial;
    if (!draft) return;
    draftHandledRef.current = true;
    resetForm();
    setTitle(draft.title);
    setContent(draft.content);
    setLibraryMode(true);
    setSelectedClass(null);
    pendingDraftNoteIdRef.current = draft.noteId;
    autosaveSkipRef.current = true;
    setAutoSaveStatus('idle');
    setIsEditorOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNew = async () => {
    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('class_materials')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user!.id);
      if ((count ?? 0) >= FREE_MATERIAL_LIMIT) {
        showLimitToast(`무료 플랜은 자료를 최대 ${FREE_MATERIAL_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
        return;
      }
    }
    resetForm();
    autosaveSkipRef.current = true;
    setAutoSaveStatus('idle');
    setIsEditorOpen(true);
  };

  // "AI와 아이디어로 만들기" — 자유 텍스트 아이디어 입력 → 질문 위저드 → 승인 시 새 자료로 프리필해 연다
  const handleStartAiIdea = () => {
    if (!aiIdeaText.trim()) return;
    setAiIdeaModalOpen(false);
    setAiWizardOpen(true);
  };

  const handleAiWizardApprove = async (draftContent: string, prd: LessonPRD) => {
    setAiWizardOpen(false);
    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('class_materials')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user!.id);
      if ((count ?? 0) >= FREE_MATERIAL_LIMIT) {
        showLimitToast(`무료 플랜은 자료를 최대 ${FREE_MATERIAL_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
        return;
      }
    }
    resetForm();
    setTitle(prd.title || '제목 없는 자료');
    setContent(draftContent);
    autosaveSkipRef.current = true;
    setAutoSaveStatus('idle');
    setIsEditorOpen(true);
    setAiIdeaText('');
  };

  const handleEdit = (material: Material) => {
    setEditingMaterial(material);
    setTitle(material.title || '');
    setWeekNumber(material.week_number ?? 1);
    setContent(material.content || '');
    setIsPublished(material.is_published || false);
    setViewMode('edit');
    setAiVersions(material.ai_versions ?? []);
    setCoverImageUrl(material.cover_image_url ?? null);
    setCoverSource(material.cover_source ?? 'template');
    autosaveSkipRef.current = true;
    setAutoSaveStatus('idle');
    setIsEditorOpen(true);
  };

  // 아이디어 기록의 "참고할 만한 자료" 패널에서 특정 자료로 바로 이동한 경우 — id로 조회해 에디터를 연다
  useEffect(() => {
    if (openMaterialHandledRef.current) return;
    const state = location.state as { openMaterialId?: string; fromIdeaRecord?: boolean } | null;
    const openId = state?.openMaterialId;
    if (!openId) return;
    openMaterialHandledRef.current = true;
    if (state?.fromIdeaRecord) setCameFromIdeaRecord(true);
    (async () => {
      const { data } = await supabase.from('class_materials').select('*').eq('id', openId).single();
      if (!data) return;
      if (data.class_id) {
        const { data: cls } = await supabase.from('classes').select('*').eq('id', data.class_id).single();
        setSelectedClass(cls ?? null);
        setLibraryMode(false);
        fetchMaterials(data.class_id);
      } else {
        setSelectedClass(null);
        setLibraryMode(true);
        fetchLibraryMaterials();
      }
      handleEdit(data as Material);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 이미지 업로드 — WebP 변환 후 Supabase 저장 ───────────────────────────
  const handleUploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('로그인 필요');
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기가 너무 큽니다. 50MB 이하 이미지만 업로드 가능합니다.');
      throw new Error('파일 크기 초과');
    }
    setUploading(true);
    try {
      const compressed = await compressToWebP(file);
      if (compressed.size > 20 * 1024 * 1024) {
        alert('변환 후에도 20MB를 초과합니다. 더 작은 이미지를 사용해주세요.');
        throw new Error('파일 크기 초과');
      }
      const path = `materials/${user.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
      if (error) throw error;
      const { data } = supabase.storage.from('student-attachments').getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  };

  // ── 표지 이미지 업로드 — WebP 변환 후 Supabase 저장 ───────────────────────
  const handleUploadCoverImage = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기가 너무 큽니다. 50MB 이하 이미지만 업로드 가능합니다.');
      return;
    }
    setCoverUploading(true);
    try {
      const compressed = await compressToWebP(file, 1600);
      const path = `materials/covers/${user.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
      if (error) throw error;
      const { data } = supabase.storage.from('student-attachments').getPublicUrl(path);
      setCoverImageUrl(data.publicUrl);
      setCoverSource('upload');
    } catch (err: any) {
      console.error('[MaterialEditor] cover upload error:', err);
      alert(`표지 이미지 업로드 중 오류가 발생했습니다.\n${err?.message || JSON.stringify(err)}`);
    } finally {
      setCoverUploading(false);
    }
  };

  // ── 저장 ──────────────────────────────────────────────────────────────────
  // 저장된 자료의 임베딩을 백그라운드로 갱신 — 아이디어 기록에서 "참고할 만한 자료" 검색에 쓰인다.
  const syncMaterialEmbedding = (materialId: string, materialTitle: string, materialContent: string) => {
    embedText(`${materialTitle}\n${materialContent}`.trim())
      .then(vector => {
        if (vector.length === 0) return;
        return supabase.from('class_materials').update({ embedding: vector }).eq('id', materialId);
      })
      .catch(err => console.error('[MaterialEditor] 임베딩 갱신 오류:', err));
  };

  const handleSave = async () => {
    if (!libraryMode && !selectedClass) { alert('클래스를 선택해주세요.'); return; }
    if (!title.trim()) { alert('제목을 입력해주세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        class_id: libraryMode ? null : selectedClass.id,
        teacher_id: user!.id,
        week_number: weekNumber,
        title: title.trim(),
        content: (content ?? '').trim(),
        is_published: libraryMode ? false : isPublished,
        ai_versions: aiVersions,
        cover_image_url: coverSource === 'upload' ? coverImageUrl : null,
        cover_source: coverSource,
        updated_at: new Date().toISOString(),
      };
      if (editingMaterial) {
        const { error } = await supabase.from('class_materials').update(payload).eq('id', editingMaterial.id);
        if (error) throw error;
        syncMaterialEmbedding(editingMaterial.id, payload.title, payload.content);
        if (libraryMode) {
          // 공통 자료 원본 수정 시, 이미 연결된 클래스 자료들의 에디터 내용도 함께 반영
          const { error: syncError } = await supabase
            .from('class_materials')
            .update({ content: payload.content, ai_versions: payload.ai_versions, updated_at: payload.updated_at })
            .eq('source_material_id', editingMaterial.id);
          if (syncError) console.error('[MaterialEditor] linked materials sync error:', syncError);
        }
      } else {
        const { data: inserted, error } = await supabase.from('class_materials').insert(payload).select('id').single();
        if (error) throw error;
        if (inserted) syncMaterialEmbedding(inserted.id, payload.title, payload.content);
      }
      if (libraryMode) await fetchLibraryMaterials(); else await fetchMaterials(selectedClass.id);
      setIsEditorOpen(false);
      resetForm();
    } catch (err: any) {
      console.error('[MaterialEditor] save error:', err);
      alert(`저장 중 오류가 발생했습니다.\n${err?.message || JSON.stringify(err)}`);
    }
    finally { setSaving(false); }
  };

  // ── 자동 저장 ─────────────────────────────────────────────────────────────
  // 수동 저장(handleSave)과 달리 창을 닫거나 폼을 리셋하지 않고, 조용히 DB에만 반영한다.
  const doAutoSave = async () => {
    if (saving) return; // 수동 저장이 진행 중이면 충돌 방지를 위해 건너뜀
    if (!libraryMode && !selectedClass) return;
    if (!title.trim()) return;
    setAutoSaveStatus('saving');
    try {
      const payload = {
        class_id: libraryMode ? null : selectedClass.id,
        teacher_id: user!.id,
        week_number: weekNumber,
        title: title.trim(),
        content: (content ?? '').trim(),
        is_published: libraryMode ? false : isPublished,
        ai_versions: aiVersions,
        cover_image_url: coverSource === 'upload' ? coverImageUrl : null,
        cover_source: coverSource,
        updated_at: new Date().toISOString(),
      };
      if (editingMaterial) {
        const { error } = await supabase.from('class_materials').update(payload).eq('id', editingMaterial.id);
        if (error) throw error;
        syncMaterialEmbedding(editingMaterial.id, payload.title, payload.content);
        if (libraryMode) {
          const { error: syncError } = await supabase
            .from('class_materials')
            .update({ content: payload.content, ai_versions: payload.ai_versions, updated_at: payload.updated_at })
            .eq('source_material_id', editingMaterial.id);
          if (syncError) console.error('[MaterialEditor] linked materials sync error:', syncError);
        }
      } else {
        // 아직 한 번도 저장된 적 없는 새 자료 — 첫 자동저장 시 생성하고, 이후엔 위 update 경로를 탄다
        const { data, error } = await supabase.from('class_materials').insert(payload).select().single();
        if (error) throw error;
        if (data) {
          setEditingMaterial(data as Material);
          syncMaterialEmbedding((data as Material).id, payload.title, payload.content);
          if (pendingDraftNoteIdRef.current) {
            const noteId = pendingDraftNoteIdRef.current;
            pendingDraftNoteIdRef.current = null;
            supabase.from('teacher_notes').update({ linked_material_id: (data as Material).id }).eq('id', noteId)
              .then(({ error: linkError }) => { if (linkError) console.error('[MaterialEditor] linked_material_id 기록 오류:', linkError); });
          }
        }
      }
      setAutoSaveStatus('saved');
    } catch (err) {
      console.error('[MaterialEditor] autosave error:', err);
      setAutoSaveStatus('idle');
    }
  };

  // 제목/주차/내용/공개여부/표지 변경 시 1.5초 debounce 후 자동 저장
  useEffect(() => {
    if (!isEditorOpen) return;
    if (autosaveSkipRef.current) { autosaveSkipRef.current = false; return; }
    const timer = setTimeout(() => { doAutoSave(); }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, weekNumber, content, isPublished, coverImageUrl, coverSource]);

  // ── PDF 다운로드 (브라우저 인쇄 → PDF로 저장) ────────────────────────────────
  const handlePrintPdf = () => {
    if (!content.trim()) return;
    const prevDocTitle = document.title;
    document.title = title.trim() || '수업자료';
    const restoreTitle = () => {
      document.title = prevDocTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
  };

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('이 수업 자료를 삭제하시겠습니까?')) return;
    await supabase.from('class_materials').delete().eq('id', id);
    if (libraryMode) await fetchLibraryMaterials(); else await fetchMaterials(selectedClass.id);
  };

  // ── 복사 ──────────────────────────────────────────────────────────────────
  const handleCopy = async (material: Material) => {
    if (!confirm(`"${material.title}"을(를) 복사하시겠습니까?`)) return;
    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('class_materials')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user!.id);
      if ((count ?? 0) >= FREE_MATERIAL_LIMIT) {
        showLimitToast(`무료 플랜은 자료를 최대 ${FREE_MATERIAL_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
        return;
      }
    }
    const { error } = await supabase.from('class_materials').insert({
      class_id: selectedClass.id,
      week_number: material.week_number,
      title: `${material.title} (복사)`,
      content: material.content ?? '',
      is_published: false,
    });
    if (!error) await fetchMaterials(selectedClass.id);
  };

  // ── 공개/비공개 토글 ──────────────────────────────────────────────────────
  const handleTogglePublish = async (material: Material) => {
    const next = !material.is_published;
    const { error } = await supabase
      .from('class_materials')
      .update({ is_published: next, updated_at: new Date().toISOString() })
      .eq('id', material.id);
    if (!error) setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, is_published: next } : m));
  };

  // ── AI 정리 히스토리 개별 삭제 (편집 화면) ────────────────────────────────
  const handleDeleteAiVersion = async (v: AiVersion) => {
    if (!confirm(`"${v.label}" 버전을 삭제하시겠습니까?`)) return;
    const next = aiVersions.filter(x => x.id !== v.id);
    setAiVersions(next);
    if (editingMaterial?.id) {
      const { error } = await supabase
        .from('class_materials')
        .update({ ai_versions: next, updated_at: new Date().toISOString() })
        .eq('id', editingMaterial.id);
      if (!error) setMaterials(prev => prev.map(m => m.id === editingMaterial.id ? { ...m, ai_versions: next } : m));
    }
  };

  // ── AI 정리 히스토리 개별 삭제 (목록 화면) ────────────────────────────────
  const handleDeleteMaterialVersion = async (material: Material, v: AiVersion) => {
    if (!confirm(`"${v.label}" 버전을 삭제하시겠습니까?`)) return;
    const nextVersions = (material.ai_versions ?? []).filter(x => x.id !== v.id);
    const { error } = await supabase
      .from('class_materials')
      .update({ ai_versions: nextVersions, updated_at: new Date().toISOString() })
      .eq('id', material.id);
    if (!error) {
      setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, ai_versions: nextVersions } : m));
      if (selectedVersionId[material.id] === v.id) {
        setSelectedVersionId(prev => ({ ...prev, [material.id]: null }));
      }
    }
  };

  // ── 목록 화면 발표 모드에서 편집 저장 (원본 또는 특정 AI 버전) ────────────────
  const persistMaterialVersion = async (material: Material, versionId: string | null, newContent: string) => {
    if (versionId) {
      const nextVersions = (material.ai_versions ?? []).map(v => v.id === versionId ? { ...v, content: newContent } : v);
      const { error } = await supabase
        .from('class_materials')
        .update({ ai_versions: nextVersions, updated_at: new Date().toISOString() })
        .eq('id', material.id);
      if (!error) setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, ai_versions: nextVersions } : m));
    } else {
      const { error } = await supabase
        .from('class_materials')
        .update({ content: newContent, updated_at: new Date().toISOString() })
        .eq('id', material.id);
      if (!error) setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, content: newContent } : m));
    }
  };

  return (
    <>
    <LimitToast message={limitToastMessage} />
    {/* PDF 다운로드용 인쇄 전용 영역 — 화면엔 보이지 않고 인쇄(PDF 저장) 시에만 노출됨 */}
    {isEditorOpen && createPortal(
      <div className="print-only">
        <div className="cover-print-page">
          <MaterialCoverPage
            title={title.trim() || '(제목 없음)'}
            subtitle={libraryMode ? null : selectedClass?.name}
            dateLabel={new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            imageUrl={coverImageUrl}
          />
        </div>
        {(() => {
          const tocSections = extractHeadingsForToc(content);
          return tocSections.length >= 2 ? (
            <div className="toc-print-page">
              <MaterialTocPage title={title.trim() || '(제목 없음)'} sections={tocSections} />
            </div>
          ) : null;
        })()}
        <div className="px-8 py-6">
          <h1 className="text-2xl font-black mb-5 text-on-surface">{title.trim() || '(제목 없음)'}</h1>
          <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>,
      document.body
    )}
    {presentingMaterial && (
      <PresentationModal
        material={presentingMaterial}
        onClose={closePresenting}
        onSave={presentingOnSave ?? undefined}
      />
    )}
    {slideModeMaterial && (
      <Suspense fallback={null}>
        <SlideModeView
          material={slideModeMaterial}
          coverImageUrl={slideModeMaterial.coverImageUrl}
          onClose={() => setSlideModeMaterial(null)}
        />
      </Suspense>
    )}
    {showImportModal && user && (
      <ImportFromClassModal
        currentClassId={selectedClass?.id}
        userId={user.id}
        onImport={(importedTitle, importedContent, importedWeek) => {
          setTitle(importedTitle ?? '');
          setWeekNumber(importedWeek ?? 1);
          setContent(importedContent ?? '');
        }}
        onClose={() => setShowImportModal(false)}
      />
    )}
    {fullscreenPreview && (
      <PreviewFullscreenModal
        title={fullscreenPreview.title}
        content={fullscreenPreview.content}
        onClose={() => setFullscreenPreview(null)}
      />
    )}
    {showCoverModal && (
      <CoverPickerModal
        title={title.trim()}
        subtitle={libraryMode ? null : selectedClass?.name}
        classId={selectedClass?.id}
        coverImageUrl={coverImageUrl}
        coverSource={coverSource}
        uploading={coverUploading}
        onUpload={handleUploadCoverImage}
        onUseTemplate={() => setCoverSource('template')}
        onRemoveImage={() => { setCoverImageUrl(null); setCoverSource('template'); }}
        onClose={() => setShowCoverModal(false)}
      />
    )}
    {showAiReorganize && (
      <AiReorganizeModal
        rawContent={content}
        classId={selectedClass?.id}
        onApply={(newContent, mode) => {
          const newVersion: AiVersion = {
            id: crypto.randomUUID(),
            mode,
            label: mode === 'guide' ? '학습 가이드' : '발표 자료',
            content: newContent,
            created_at: new Date().toISOString(),
          };
          // 원본(content)은 절대 건드리지 않고, 결과는 히스토리에만 추가한다
          setAiVersions(prev => [newVersion, ...prev]);
          setShowAiReorganize(false);
          // 방금 만든 결과를 바로 발표 모드로 열어서 확인/편집할 수 있게 한다
          setPresentingMaterial({
            id: editingMaterial?.id ?? 'draft',
            class_id: selectedClass?.id ?? null,
            week_number: weekNumber,
            title: `${title.trim() || '(제목 없음)'} · ${newVersion.label}`,
            content: newVersion.content,
            url: '',
            is_published: isPublished,
            created_at: newVersion.created_at,
            updated_at: newVersion.created_at,
          });
          setPresentingOnSave(() => (updated: string) => {
            setAiVersions(prev => prev.map(v => v.id === newVersion.id ? { ...v, content: updated } : v));
          });
        }}
        onClose={() => setShowAiReorganize(false)}
      />
    )}
    {linkingMaterial && user && (
      <LinkToClassModal
        material={linkingMaterial}
        classes={classes}
        userId={user.id}
        publishOnLink={linkAsPublish}
        isBasicOrAbove={checkIsBasicOrAbove(profile)}
        onLinked={() => fetchLibraryMaterials()}
        onClose={() => setLinkingMaterial(null)}
      />
    )}
    <div className="space-y-5">
      {/* ── 상단: 클래스 선택 + 새 자료 버튼 ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {isEditorOpen && (
          <button
            onClick={() => { setIsEditorOpen(false); resetForm(); }}
            title={libraryMode ? '공통 자료 목록으로' : '자료 목록으로'}
            className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-black text-xs transition-colors shrink-0"
          >
            <ArrowLeft size={14} />
            {libraryMode ? '공통 자료 목록' : '자료 목록'}
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setClassDropdownOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container rounded-2xl border-2 border-transparent hover:border-primary/20 transition-all font-black text-sm"
          >
            {libraryMode ? '클래스 선택' : (selectedClass ? selectedClass.name : '클래스 선택')}
            <ChevronDown size={15} className="text-on-surface-variant" />
          </button>
          {classDropdownOpen && (
            <div className="absolute top-full mt-2 left-0 bg-white rounded-2xl shadow-xl border border-surface-container z-50 min-w-[200px] overflow-hidden">
              {classes.length === 0 ? (
                <p className="px-4 py-3 text-sm text-on-surface-variant font-bold">클래스 없음</p>
              ) : classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => { setSelectedClass(cls); setLibraryMode(false); setClassDropdownOpen(false); fetchMaterials(cls.id); setIsEditorOpen(false); resetForm(); }}
                  className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors text-sm font-bold"
                >
                  {cls.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => { setLibraryMode(true); setSelectedClass(null); setIsEditorOpen(false); resetForm(); fetchLibraryMaterials(); }}
          title="클래스 선택 없이 공통으로 쓸 자료를 만들고, 나중에 원하는 클래스에 연결할 수 있습니다"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 transition-all font-black text-sm ${
            libraryMode
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'bg-surface-container border-transparent hover:border-primary/20'
          }`}
        >
          <Library size={15} /> 공통 자료함
        </button>

        {(selectedClass || libraryMode) && !isEditorOpen && (
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2.5 btn-gradient rounded-2xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            <Plus size={15} /> 새 자료 작성
          </button>
        )}
        {(selectedClass || libraryMode) && !isEditorOpen && (
          <button
            onClick={() => setAiIdeaModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 border-primary/20 bg-primary-container/40 text-primary font-black text-sm hover:bg-primary-container/70 transition-all"
          >
            <Wand2 size={15} /> AI와 아이디어로 만들기
          </button>
        )}
      </div>

      {aiIdeaModalOpen && (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={() => setAiIdeaModalOpen(false)}>
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-on-surface flex items-center gap-2">
              <Wand2 size={18} className="text-primary" /> 아이디어로 자료 만들기
            </h3>
            <p className="text-xs font-bold text-on-surface-variant">
              떠오른 아이디어를 자유롭게 적어주시면, AI가 몇 가지 질문을 드리고 기획서(PRD)를 만들어 확인시켜드려요.
            </p>
            <textarea
              value={aiIdeaText}
              onChange={e => setAiIdeaText(e.target.value)}
              placeholder="예: 3단원 광합성 수업에 모둠 실험 활동을 넣고 싶어요"
              rows={5}
              className="w-full px-4 py-3 rounded-2xl border-2 border-surface-container focus:border-primary/40 outline-none text-sm resize-none"
            />
            <div className="flex gap-2.5">
              <button
                onClick={() => setAiIdeaModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container text-on-surface-variant font-black text-sm hover:bg-surface-container-high transition-all"
              >
                취소
              </button>
              <button
                onClick={handleStartAiIdea}
                disabled={!aiIdeaText.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl btn-gradient text-white font-black text-sm shadow-lg disabled:opacity-50 transition-all"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      )}

      {aiWizardOpen && (
        <IdeaPRDWizard
          ideaContent={aiIdeaText}
          format="material"
          relatedMaterials={[]}
          classId={libraryMode ? undefined : selectedClass?.id}
          onClose={() => setAiWizardOpen(false)}
          onApprove={handleAiWizardApprove}
        />
      )}

      {/* ── 에디터 패널 ── */}
      {isEditorOpen && (
        <div className="bg-white rounded-3xl border border-surface-container shadow-sm">

          {/* 에디터 헤더 */}
          <div className="border-b border-surface-container bg-surface-container-low rounded-t-3xl">
            {/* 1줄: 목록 이동 + 제목 + 뷰 모드 + 저장(가장 중요한 것만). 모바일은 폭이 부족하면 줄바꿈 */}
            <div className="flex items-center flex-wrap gap-2 px-3 sm:px-5 pt-3.5 pb-2">
              <span className="hidden sm:inline-block font-bold text-xs text-on-surface-variant truncate">
                {libraryMode
                  ? (editingMaterial ? '공통 자료 수정' : '새 공통 자료 작성')
                  : (editingMaterial ? '수업 자료 수정' : '새 수업 자료 작성')}
              </span>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                {/* 뷰 모드 토글 */}
                <div className="flex items-center gap-0.5 bg-surface-container rounded-xl p-1 shrink-0">
                  {(['edit', 'preview'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      title={mode === 'edit' ? '편집 모드' : '미리보기'}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-lg text-xs font-black transition-all ${
                        viewMode === mode
                          ? 'bg-white shadow text-primary'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {mode === 'edit' ? <Pencil size={12} /> : <Eye size={12} />}
                      <span className="hidden sm:inline">{mode === 'edit' ? '편집' : '미리보기'}</span>
                    </button>
                  ))}
                </div>
                {/* 저장 (가장 중요한 동작이므로 항상 눈에 띄게 우측 고정) */}
                <button
                  onClick={handleSave}
                  disabled={saving || uploading}
                  title={uploading ? '이미지 업로드 완료 후 저장 가능합니다' : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 btn-gradient rounded-xl font-black text-xs text-white shadow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 shrink-0"
                >
                  {(saving || uploading) ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {editingMaterial ? '수정 완료' : '저장'}
                </button>
              </div>
            </div>

            {/* 2줄: 부가 도구 — 작고 옅은 톤으로 눌러서 1줄과 위계를 구분 */}
            <div className="flex items-center flex-wrap gap-1.5 px-3 sm:px-5 pb-3">
              {cameFromIdeaRecord && (
                <button
                  onClick={() => navigate('/dashboard')}
                  title="아이디어 기록 페이지로 돌아갑니다"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-container text-primary hover:opacity-80 font-bold text-[11px] transition-opacity"
                >
                  <Lightbulb size={11} /> 아이디어 기록으로
                </button>
              )}
              {/* AI로 정리 */}
              <button
                onClick={() => setShowAiReorganize(true)}
                disabled={!content.trim()}
                title={content.trim() ? 'AI로 학습 가이드/발표 자료 정리' : '내용을 먼저 작성해주세요'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-bold text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles size={11} /> AI로 정리
              </button>
              {/* AI 정리 히스토리 */}
              {aiVersions.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowVersionMenu(o => !o)}
                    title="AI로 정리한 이전 결과 보기"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-bold text-[11px] transition-colors"
                  >
                    <History size={11} /> 정리 히스토리 ({aiVersions.length})
                  </button>
                  {showVersionMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowVersionMenu(false)} />
                      <div className="absolute top-full mt-2 right-0 bg-white rounded-2xl shadow-xl border border-surface-container z-50 w-72 overflow-hidden">
                        <p className="px-4 pt-3 pb-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                          AI 정리 결과 목록
                        </p>
                        <div className="max-h-64 overflow-y-auto">
                          {aiVersions.map(v => (
                            <div key={v.id} className="flex items-center group hover:bg-surface-container-low transition-colors">
                              <button
                                onClick={() => {
                                  setShowVersionMenu(false);
                                  // 원본(content)은 건드리지 않고, 이 버전만 발표 모드로 열어서 보기/편집한다
                                  setPresentingMaterial({
                                    id: editingMaterial?.id ?? 'draft',
                                    class_id: selectedClass?.id ?? null,
                                    week_number: weekNumber,
                                    title: `${title.trim() || '(제목 없음)'} · ${v.label}`,
                                    content: v.content,
                                    url: '',
                                    is_published: isPublished,
                                    created_at: v.created_at,
                                    updated_at: new Date().toISOString(),
                                  });
                                  setPresentingOnSave(() => (updated: string) => {
                                    setAiVersions(prev => prev.map(x => x.id === v.id ? { ...x, content: updated } : x));
                                  });
                                }}
                                className="flex-1 min-w-0 flex items-center gap-2 text-left pl-4 pr-2 py-2.5"
                              >
                                {v.mode === 'guide'
                                  ? <BookOpen size={13} className="text-primary shrink-0" />
                                  : <Presentation size={13} className="text-violet-600 shrink-0" />}
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs font-black truncate">{v.label}</span>
                                  <span className="block text-[10px] font-bold text-on-surface-variant">{formatVersionDate(v.created_at)}</span>
                                </span>
                              </button>
                              <button
                                onClick={() => handleDeleteAiVersion(v)}
                                title="이 버전 삭제"
                                className="shrink-0 p-1.5 mr-2 rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* 편집 중인 내용을 바로 발표 모드로 */}
              <button
                onClick={() => {
                  setPresentingMaterial({
                    id: editingMaterial?.id ?? 'draft',
                    class_id: selectedClass?.id ?? '',
                    week_number: weekNumber,
                    title: title.trim() || '(제목 없음)',
                    content,
                    url: '',
                    is_published: isPublished,
                    created_at: editingMaterial?.created_at ?? new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  });
                  // 발표 화면에서 슬라이드를 편집해도 원본(content)은 건드리지 않는다 — 편집은 발표 세션 내에서만 반영
                  setPresentingOnSave(() => () => {});
                }}
                disabled={!content.trim()}
                title={content.trim() ? '지금 편집 중인 내용을 바로 발표 모드로 보기' : '내용을 먼저 작성해주세요'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-bold text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Presentation size={11} /> 발표
              </button>

              <div className="w-px h-4 bg-surface-container mx-0.5" />

              {/* 다른 클래스에서 가져오기 */}
              <button
                onClick={() => setShowImportModal(true)}
                title="다른 클래스·공통 자료함에서 가져오기"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary font-bold text-[11px] transition-colors"
              >
                <Download size={11} /> 가져오기
              </button>
              {/* 표지 설정 — PDF 다운로드 시 맨 앞에 자동으로 붙는 표지 페이지 */}
              <button
                onClick={() => setShowCoverModal(true)}
                title="PDF 표지 설정"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary font-bold text-[11px] transition-colors"
              >
                <ImageIcon size={11} /> 표지
              </button>
              {/* PDF 다운로드 — 화면에 보이는 서식 그대로 브라우저 인쇄를 통해 PDF로 저장 */}
              <button
                onClick={handlePrintPdf}
                disabled={!content.trim()}
                title={content.trim() ? '지금 작성된 내용을 PDF로 다운로드 (인쇄창에서 "PDF로 저장" 선택)' : '내용을 먼저 작성해주세요'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary font-bold text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileDown size={11} /> PDF 다운로드
              </button>
            </div>
          </div>

          {/* 메타 정보 입력 */}
          <div className="flex flex-wrap gap-2.5 px-5 py-3 border-b border-surface-container bg-surface-container-low/50">
            {!libraryMode && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-black text-on-surface-variant whitespace-nowrap">주차</span>
                <input
                  type="number"
                  min={1}
                  value={weekNumber}
                  onChange={e => setWeekNumber(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 px-2 py-2 bg-white rounded-xl border border-surface-container font-black text-sm text-center focus:outline-none focus:border-primary/40"
                />
              </div>
            )}
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="자료 제목을 입력하세요 *"
              className="flex-1 min-w-[180px] px-4 py-2 bg-white rounded-xl border border-surface-container font-black text-sm focus:outline-none focus:border-primary/40"
            />
          </div>

          {/* 편집 / 미리보기 영역 */}
          {viewMode === 'edit' ? (
            <RichEditor
              value={content}
              onChange={setContent}
              onUploadImage={handleUploadImage}
              uploading={uploading}
              toolbarRoundedClassName=""
              contentRoundedClassName="rounded-b-3xl"
              classId={selectedClass?.id}
            />
          ) : (
            <div className="relative min-h-[440px] p-6 overflow-auto bg-white rounded-b-3xl">
              {content.trim() ? (
                <>
                  <button
                    onClick={() => setFullscreenPreview({ title, content })}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors z-10"
                    title="전체 화면으로 보기"
                  >
                    <Maximize2 size={15} />
                  </button>
                  <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
                  <EyeOff size={32} />
                  <p className="text-sm font-bold">편집창에 내용을 작성하면 미리보기가 표시됩니다</p>
                </div>
              )}
            </div>
          )}

          {/* 하단 액션 바. 설명 텍스트는 모바일에서 숨기고, 취소/저장 버튼은 항상 오른쪽 고정 */}
          <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-t border-surface-container bg-surface-container-low/50">
            {libraryMode ? (
              <p className="hidden sm:flex min-w-0 text-xs font-bold text-on-surface-variant opacity-60 items-center gap-1.5">
                <Library size={14} className="shrink-0" /> 공통 자료함에는 학생에게 공개되지 않습니다. 저장 후 원하는 클래스에 연결하면 그 클래스에서 공개 여부를 설정할 수 있습니다.
              </p>
            ) : (
              <>
                {/* 공개 토글 */}
                <button
                  onClick={() => setIsPublished(p => !p)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-black text-sm transition-all shrink-0 ${
                    isPublished
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-surface-container text-on-surface-variant hover:border-primary/20'
                  }`}
                >
                  {isPublished ? <><Globe size={14} /> 학생 공개 중</> : <><Lock size={14} /> 비공개</>}
                </button>
                <p className="hidden sm:block text-xs font-bold text-on-surface-variant opacity-60">
                  {isPublished ? '학생이 수업자료 탭에서 볼 수 있습니다' : '저장 후 공개 여부를 설정하세요'}
                </p>
              </>
            )}
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <button
                onClick={() => { setIsEditorOpen(false); resetForm(); }}
                className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || uploading}
                title={uploading ? '이미지 업로드 완료 후 저장 가능합니다' : undefined}
                className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : uploading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {uploading ? '이미지 업로드 중...' : editingMaterial ? '수정 완료' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 자동 저장 상태 — 본문을 스크롤해도 항상 보이도록 화면에 고정 */}
      {isEditorOpen && autoSaveStatus !== 'idle' && (
        <div className="fixed bottom-40 sm:bottom-24 right-4 sm:right-5 z-[60] flex items-center gap-1.5 px-3.5 py-2 rounded-full shadow-lg font-bold text-xs bg-white border border-surface-container">
          {autoSaveStatus === 'saving' ? (
            <span className="text-on-surface-variant flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> 자동 저장 중...
            </span>
          ) : (
            <span className="text-emerald-600 flex items-center gap-1.5">
              <Save size={12} /> 자동 저장됨
            </span>
          )}
        </div>
      )}

      {/* ── 자료 목록 ── */}
      {(selectedClass || libraryMode) && !isEditorOpen && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
              {libraryMode ? `공통 자료함 (${materials.length}개)` : `${selectedClass.name} 수업 자료 (${materials.length}개)`}
            </p>
          </div>

          {materialsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : materials.length === 0 ? (
            <div className="flex flex-col items-center py-16 space-y-3 opacity-30">
              <BookOpen size={48} />
              <p className="font-black">{libraryMode ? '아직 등록된 공통 자료가 없습니다.' : '아직 작성된 수업 자료가 없습니다.'}</p>
              <p className="text-sm font-bold">위의 '새 자료 작성' 버튼을 눌러 시작하세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {materials.map(material => (
                <div key={material.id} className="group bg-white rounded-2xl border border-surface-container transition-all hover:border-primary/30 hover:shadow-md flex flex-col">
                  {/* 표지 썸네일 */}
                  <div
                    onClick={() => handleEdit(material)}
                    role="button"
                    tabIndex={0}
                    title="열어서 수정"
                    className="relative w-full aspect-[210/297] rounded-t-2xl overflow-hidden cursor-pointer"
                  >
                    <MaterialCoverPage
                      title={material.title}
                      subtitle={libraryMode ? null : `${material.week_number}주차`}
                      imageUrl={material.cover_source === 'upload' ? (material.cover_image_url ?? null) : null}
                      thumbnail
                    />

                    {/* 상태 배지 */}
                    <div className="absolute top-2 inset-x-2 z-10 flex items-center justify-between gap-1">
                      <span className={`shrink-0 whitespace-nowrap text-[10px] font-black px-2 py-0.5 rounded-full backdrop-blur ${
                        material.is_published ? 'bg-emerald-500/90 text-white' : 'bg-black/45 text-white/85'
                      }`}>
                        {material.is_published ? '● 공개 중' : '● 비공개'}
                      </span>
                      {(material.view_count ?? 0) > 0 && (
                        <span className="shrink-0 whitespace-nowrap flex items-center gap-1 text-[10px] font-black text-white bg-black/45 backdrop-blur px-2 py-0.5 rounded-full">
                          <Users size={9} /> {material.view_count}
                        </span>
                      )}
                    </div>

                    {/* 호버 시 빠른 액션 */}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
                      {material.content && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const versionId = selectedVersionId[material.id] ?? null;
                            setPresentingMaterial({ ...material, content: getActiveVersion(material).content });
                            // AI 정리 버전 편집은 그대로 저장하되, 원본(versionId 없음)은 발표 화면 편집으로 덮어쓰지 않는다
                            setPresentingOnSave(() => (updated: string) => {
                              if (versionId) persistMaterialVersion(material, versionId, updated);
                            });
                          }}
                          title="전체화면 발표 모드"
                          className="p-2.5 rounded-xl bg-white/90 text-violet-700 hover:bg-white transition-colors"
                        >
                          <Presentation size={16} />
                        </button>
                      )}
                      {material.content && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSlideModeMaterial({
                              title: material.title,
                              content: getActiveVersion(material).content,
                              coverImageUrl: material.cover_source === 'upload' ? (material.cover_image_url ?? null) : null,
                            });
                          }}
                          title="슬라이드로 보기"
                          className="p-2.5 rounded-xl bg-white/90 text-sky-700 hover:bg-white transition-colors"
                        >
                          <GalleryHorizontal size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenPreview({ title: material.title, content: getActiveVersion(material).content });
                        }}
                        title="내용 미리보기"
                        className="p-2.5 rounded-xl bg-white/90 text-on-surface hover:bg-white transition-colors"
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 정보 + 액션 */}
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="font-black text-sm truncate" title={material.title}>{material.title}</p>

                    {material.content && (
                      <span className="self-start shrink-0 whitespace-nowrap text-[10px] font-bold text-primary/60 bg-primary/5 px-2 py-0.5 rounded-full">📝 내용 있음</span>
                    )}

                    <div className="flex items-center gap-1 flex-wrap mt-auto pt-2 border-t border-surface-container">
                      {/* 원본/AI 정리 버전 선택 — 목록 화면에서도 선택해서 볼 수 있게 */}
                      {(material.ai_versions?.length ?? 0) > 0 && (
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setVersionMenuFor(v => v === material.id ? null : material.id)}
                            title="보고 싶은 버전 선택 (원본 / AI 정리 결과)"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                          >
                            <History size={14} />
                          </button>
                          {versionMenuFor === material.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setVersionMenuFor(null)} />
                              <div className="absolute bottom-full mb-1 left-0 bg-white rounded-2xl shadow-xl border border-surface-container z-50 w-64 overflow-hidden">
                                <p className="px-4 pt-3 pb-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                                  어떤 버전을 볼까요?
                                </p>
                                <div className="max-h-64 overflow-y-auto">
                                  <button
                                    onClick={() => { setSelectedVersionId(prev => ({ ...prev, [material.id]: null })); setVersionMenuFor(null); }}
                                    className="w-full flex items-center gap-2 text-left px-4 py-2.5 hover:bg-surface-container-low transition-colors"
                                  >
                                    <span className="flex-1 min-w-0"><span className="block text-xs font-black">원본</span></span>
                                    {!selectedVersionId[material.id] && <Check size={13} className="text-emerald-500 shrink-0" />}
                                  </button>
                                  {material.ai_versions!.map(v => (
                                    <div key={v.id} className="flex items-center group hover:bg-surface-container-low transition-colors">
                                      <button
                                        onClick={() => { setSelectedVersionId(prev => ({ ...prev, [material.id]: v.id })); setVersionMenuFor(null); }}
                                        className="flex-1 min-w-0 flex items-center gap-2 text-left pl-4 pr-2 py-2.5"
                                      >
                                        {v.mode === 'guide'
                                          ? <BookOpen size={13} className="text-primary shrink-0" />
                                          : <Presentation size={13} className="text-violet-600 shrink-0" />}
                                        <span className="flex-1 min-w-0">
                                          <span className="block text-xs font-black truncate">{v.label}</span>
                                          <span className="block text-[10px] font-bold text-on-surface-variant">{formatVersionDate(v.created_at)}</span>
                                        </span>
                                        {selectedVersionId[material.id] === v.id && <Check size={13} className="text-emerald-500 shrink-0" />}
                                      </button>
                                      <button
                                        onClick={() => handleDeleteMaterialVersion(material, v)}
                                        title="이 버전 삭제"
                                        className="shrink-0 p-1.5 mr-2 rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {libraryMode ? (
                        <>
                          {/* 클래스 선택해서 바로 공개 */}
                          <button
                            onClick={() => { setLinkingMaterial(material); setLinkAsPublish(true); }}
                            title="클래스를 선택해 그 클래스 학생에게 바로 공개"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <Globe size={14} />
                          </button>
                          {/* 클래스에 연결(비공개) */}
                          <button
                            onClick={() => { setLinkingMaterial(material); setLinkAsPublish(false); }}
                            title="이 공통 자료를 원하는 클래스에 연결(복사, 비공개)"
                            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Link2 size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          {/* 공개/비공개 토글 */}
                          <button
                            onClick={() => handleTogglePublish(material)}
                            title={material.is_published ? '비공개로 전환' : '학생에게 공개'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              material.is_published
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-on-surface-variant hover:bg-surface-container'
                            }`}
                          >
                            {material.is_published ? <Globe size={14} /> : <Lock size={14} />}
                          </button>
                          {/* 복사 */}
                          <button
                            onClick={() => handleCopy(material)}
                            title="다른 주차로 복사"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                          >
                            <Copy size={14} />
                          </button>
                        </>
                      )}
                      {/* 수정 */}
                      <button
                        onClick={() => handleEdit(material)}
                        title="수정"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      {/* 삭제 */}
                      <button
                        onClick={() => handleDelete(material.id)}
                        title="삭제"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors ml-auto"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 클래스 미선택 안내 */}
      {!selectedClass && !libraryMode && !isEditorOpen && (
        <div className="flex flex-col items-center py-24 space-y-3 opacity-30">
          <BookOpen size={56} />
          <p className="font-black text-lg">클래스를 선택하세요</p>
          <p className="text-sm font-bold">위에서 클래스를 선택하거나, '공통 자료함'에서 클래스 구분 없이 자료를 관리할 수 있습니다.</p>
        </div>
      )}
    </div>
    </>
  );
};

export default MaterialEditor;
