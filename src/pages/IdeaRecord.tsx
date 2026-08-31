import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { StickyNote, Save, Loader2, Pencil, Trash2, Check, Clock, Sparkles, X, Tag, RefreshCw, FileText, Presentation, Link2, Lightbulb, PenLine, List, Wand2, BookOpen, ArrowRight, ArrowLeft, HelpCircle, Globe, ExternalLink, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import RichEditor from '../components/RichEditor';
import CodeBlock from '../components/CodeBlock';
import { analyzeIdea, generateLessonPlanDraft, embedText, webSearchForIdea, type IdeaAnalysisResult, type RelatedMaterialRef, type LessonPRD, type WebSearchResult } from '../lib/gemini';
import type { DeckSlide } from '../components/slidedeck/types';
import IdeaPRDWizard from '../components/idea/IdeaPRDWizard';
import IdeaRecordGuideModal from '../components/idea/IdeaRecordGuideModal';

const GUIDE_SEEN_KEY = 'idea_record_guide_seen';

// DeckSlide.objects[]의 텍스트류 값만 이어붙여 미리보기용 텍스트로 사용 (SlideDeckEditor.tsx의 extractSlideDeckText와 동일 로직)
const extractSlideDeckPreviewText = (slides: DeckSlide[]): string =>
  slides
    .flatMap(slide => slide.objects.map(obj => obj.text))
    .filter((text): text is string => !!text && text.trim().length > 0)
    .join('\n');

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

// ── 노트 원문 전체보기 모달용 마크다운 렌더러 (카드보다 큰 폰트) ─────────────────
const noteDetailMdComponents: any = {
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed text-sm text-on-surface/80">{children}</p>,
  h1: ({ children }: any) => <h1 className="text-lg font-black mb-2 mt-3 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-black mb-2 mt-3 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-black mb-1.5 mt-3 text-on-surface">{children}</h3>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-on-surface/80">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-lg text-sm">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) {
      return <code className="bg-surface-container px-1.5 py-0.5 rounded text-sm font-mono text-primary">{children}</code>;
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
  img: ({ src, alt }: any) => <img src={src} alt={alt} className="max-w-full rounded-xl my-3 shadow" />,
  hr: () => <hr className="border-surface-container my-4" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-auto mb-3"><table className="w-full border-collapse text-sm">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-surface-container px-3 py-2">{children}</td>,
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

// 6단계: match_my_content RPC 반환 행 — 내 노트/자료/슬라이드 중 임베딩 유사도가 높은 것들
interface MatchedContent {
  source_type: 'note' | 'material' | 'slide';
  id: string;
  title: string;
  snippet: string;
  similarity: number;
}

const SOURCE_TYPE_LABEL: Record<MatchedContent['source_type'], string> = {
  note: '아이디어 기록',
  material: '수업 자료',
  slide: '슬라이드',
};

const FORMAT_LABEL: Record<IdeaAnalysisResult['suggestedFormat'], string> = {
  guide: '수업 가이드',
  material: '수업 자료',
  slide: '슬라이드',
};

const NO_CLASS = '__none__';

// 아이디어 카드 상단 배너 + 아이콘 색 — 클래스별로 고정된 색을 갖도록 id를 해싱
const CARD_ACCENTS = [
  { banner: 'bg-gradient-to-r from-primary to-primary/60', iconBg: 'bg-primary/10', iconText: 'text-primary' },
  { banner: 'bg-gradient-to-r from-secondary to-secondary/60', iconBg: 'bg-secondary/10', iconText: 'text-secondary' },
  { banner: 'bg-gradient-to-r from-accent to-accent/60', iconBg: 'bg-accent/10', iconText: 'text-accent' },
];
const NO_CLASS_ACCENT = { banner: 'bg-gradient-to-r from-slate-600 to-slate-500', iconBg: 'bg-surface-container', iconText: 'text-on-surface-variant/50' };
const getCardAccent = (classId: string | null) => {
  if (!classId) return NO_CLASS_ACCENT;
  let hash = 0;
  for (let i = 0; i < classId.length; i++) hash = (hash * 31 + classId.charCodeAt(i)) % CARD_ACCENTS.length;
  return CARD_ACCENTS[hash];
};

export default function IdeaRecord() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const openNoteHandledRef = useRef(false);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [formClassId, setFormClassId] = useState<string>(NO_CLASS);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // 자동저장으로 아직 한 번도 insert되지 않은 새 아이디어인지 추적 — insert 이후엔 이 id로 update만 수행
  const draftNoteIdRef = useRef<string | null>(null);

  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'write' | 'list'>('write');

  // 첫 방문 시 자동 오픈 + 상시 버튼으로 재오픈 가능한 사용법 가이드 모달
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(GUIDE_SEEN_KEY)) setGuideOpen(true);
  }, []);
  const closeGuide = () => {
    localStorage.setItem(GUIDE_SEEN_KEY, '1');
    setGuideOpen(false);
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '' });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editUploading, setEditUploading] = useState(false);

  // 카드 클릭 시 뜨는 "원문 전체보기" 모달용
  const [viewingNote, setViewingNote] = useState<TeacherNote | null>(null);
  // "비슷한 자료 있음" 배지 클릭 시 매칭된 항목을 보여주는 팝업용
  const [similarItemsNote, setSimilarItemsNote] = useState<TeacherNote | null>(null);

  const [analysisNote, setAnalysisNote] = useState<TeacherNote | null>(null);
  const [analysisResult, setAnalysisResult] = useState<IdeaAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSaving, setAnalysisSaving] = useState(false);
  // 분석 시점에 함께 조회한 관련 기존 수업 자료 — "수업 자료로 만들기" 생성 시 재사용
  const [analysisRelatedMaterials, setAnalysisRelatedMaterials] = useState<RelatedMaterialRef[]>([]);
  // 위와 같은 조회 결과를 화면에 카드 목록으로 보여주기 위한 원본(타입 불문, 클릭 가능한 형태)
  const [analysisRelatedContent, setAnalysisRelatedContent] = useState<MatchedContent[]>([]);
  const [analysisRelatedOpen, setAnalysisRelatedOpen] = useState(true);
  const [creatingMaterialLength, setCreatingMaterialLength] = useState<'simple' | 'detailed' | null>(null);
  const [wizardFormat, setWizardFormat] = useState<'material' | 'slide' | null>(null);
  // "다시 생성" 시 원하는 방향을 지정할 수 있는 추가 지침 입력용
  const [showRegenerateInput, setShowRegenerateInput] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');

  // 5단계: 태그 매칭용 — 카드에 "비슷한 자료 있음" 힌트를 보여주기 위해 한 번만 가져와둠
  const [libraryMaterials, setLibraryMaterials] = useState<{ id: string; title: string; content: string }[]>([]);
  const [librarySlides, setLibrarySlides] = useState<{ id: string; title: string }[]>([]);

  // 6단계: 작성 중인 내용과 의미적으로 유사한 내 자료/노트/슬라이드를 실시간 검색해 보여주는 패널
  const [relatedSuggestions, setRelatedSuggestions] = useState<MatchedContent[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const [previewItem, setPreviewItem] = useState<MatchedContent | null>(null);
  const [previewFullContent, setPreviewFullContent] = useState<string | null>(null);
  const [previewFullLoading, setPreviewFullLoading] = useState(false);

  // 6단계 후속: "웹에서 더 찾아보기" — 클릭했을 때만 호출(자동 호출 금지, 그라운딩 정액 비용 발생)
  // 초안 노트 id별로 캐시해 같은 아이디어를 다시 열어도 중복 호출하지 않는다
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
  const [webSearchLoading, setWebSearchLoading] = useState(false);
  const [webSearchError, setWebSearchError] = useState<string | null>(null);
  const webSearchCacheRef = useRef<Map<string, WebSearchResult>>(new Map());

  // 6단계 후속: 미리보기 모달을 열면 스니펫(200자) 대신 전체 원문을 불러와 보여준다
  useEffect(() => {
    if (!previewItem) { setPreviewFullContent(null); return; }
    let cancelled = false;
    setPreviewFullContent(null);
    setPreviewFullLoading(true);
    (async () => {
      try {
        if (previewItem.source_type === 'note') {
          const target = notes.find(n => n.id === previewItem.id);
          if (!cancelled) setPreviewFullContent(target?.content ?? '');
        } else if (previewItem.source_type === 'material') {
          const { data } = await supabase.from('class_materials').select('content').eq('id', previewItem.id).single();
          if (!cancelled) setPreviewFullContent(data?.content ?? '');
        } else {
          const { data } = await supabase.from('slide_decks').select('slides').eq('id', previewItem.id).single();
          if (!cancelled) setPreviewFullContent(data?.slides ? extractSlideDeckPreviewText(data.slides as DeckSlide[]) : '');
        }
      } catch (err) {
        console.error('[IdeaRecord] 미리보기 원문 로드 오류:', err);
        if (!cancelled) setPreviewFullContent('');
      } finally {
        if (!cancelled) setPreviewFullLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewItem, notes]);

  // 전체화면/팝업 모달이 떠 있는 동안 뒤쪽 페이지 스크롤을 잠가 이중 스크롤바가 겹쳐 보이지 않게 한다
  useEffect(() => {
    const anyModalOpen = viewingNote || analysisNote || similarItemsNote || previewItem || wizardFormat;
    document.body.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [viewingNote, analysisNote, similarItemsNote, previewItem, wizardFormat]);

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

  // AI 코파일럿 "아이디어 기획" 탭에서 방금 기록한 노트로 딥링크 진입 시, 분석 화면을 자동으로 연다
  useEffect(() => {
    if (openNoteHandledRef.current) return;
    const state = location.state as { openNoteId?: string } | null;
    const openId = state?.openNoteId;
    if (!openId || !user?.id) return;
    openNoteHandledRef.current = true;
    (async () => {
      const { data: note } = await supabase.from('teacher_notes').select('*, classes(name)').eq('id', openId).single();
      if (note) handleOpenAnalysis(note);
    })();
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
      supabase.from('class_materials').select('id, title, content').eq('teacher_id', user!.id).limit(300),
      supabase.from('slide_decks').select('id, title').eq('teacher_id', user!.id).limit(300),
    ]);
    setLibraryMaterials(materials || []);
    setLibrarySlides(slides || []);
  };

  // 5단계: 태그가 붙은(=AI 분석 완료된) 노트마다 다른 노트/자료/슬라이드에 같은 태그 키워드가 있는지 클라이언트에서 계산
  // — 배지 클릭 시 어떤 항목이 매칭됐는지 바로 보여줄 수 있도록 매칭된 항목 자체를 함께 들고 있는다
  const similarResourceDetails = useMemo(() => {
    const map = new Map<string, { notes: TeacherNote[]; materials: { id: string; title: string }[]; slides: { id: string; title: string }[] }>();
    notes.forEach(note => {
      if (!note.tags || note.tags.length === 0) return;
      const tagsLower = note.tags.map(t => t.toLowerCase());
      const similarNotes = notes.filter(other =>
        other.id !== note.id && other.tags?.some(t => tagsLower.includes(t.toLowerCase()))
      );
      const similarMaterials = libraryMaterials.filter(m =>
        tagsLower.some(t => `${m.title} ${m.content}`.toLowerCase().includes(t))
      );
      const similarSlides = librarySlides.filter(s =>
        tagsLower.some(t => s.title.toLowerCase().includes(t))
      );
      if (similarNotes.length > 0 || similarMaterials.length > 0 || similarSlides.length > 0) {
        map.set(note.id, { notes: similarNotes, materials: similarMaterials, slides: similarSlides });
      }
    });
    return map;
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

  // ── 새 아이디어 자동 저장 ────────────────────────────────────────────────
  // 자료 에디터(MaterialEditor)와 동일한 패턴: 첫 자동저장 때 insert, 이후엔 같은 행을 update
  const doAutoSave = async (): Promise<boolean> => {
    if (!content.trim()) return false;
    setAutoSaveStatus('saving');
    try {
      const payload = {
        teacher_id: user?.id,
        class_id: formClassId === NO_CLASS ? null : formClassId,
        title: title.trim() || null,
        content: content.trim(),
      };
      if (draftNoteIdRef.current) {
        const { error } = await supabase
          .from('teacher_notes')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', draftNoteIdRef.current);
        if (error) throw error;
        const noteId = draftNoteIdRef.current;
        setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, title: payload.title, content: payload.content, class_id: payload.class_id } : n)));
      } else {
        const { data, error } = await supabase.from('teacher_notes').insert(payload).select().single();
        if (error) throw error;
        if (data) {
          draftNoteIdRef.current = data.id;
          const className = classes.find(c => c.id === payload.class_id)?.name ?? null;
          setNotes(prev => [{ ...(data as TeacherNote), classes: className ? { name: className } : null }, ...prev]);
        }
      }
      setAutoSaveStatus('saved');
      return true;
    } catch (err) {
      console.error('아이디어 자동저장 오류:', err);
      setAutoSaveStatus('idle');
      return false;
    }
  };

  // 제목/내용/클래스 변경 시 1.5초 debounce 후 자동 저장
  useEffect(() => {
    if (activeTab !== 'write') return;
    if (!content.trim()) return;
    const timer = setTimeout(() => { doAutoSave(); }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, formClassId, activeTab]);

  // 6단계: 작성 중인 내용과 유사한 내 자료를 실시간 검색 — 하나의 임베딩을 검색 쿼리와
  // 초안 노트의 embedding 갱신에 함께 사용해 Gemini 호출을 중복시키지 않는다.
  useEffect(() => {
    if (activeTab !== 'write') { setRelatedSuggestions([]); setSuggestLoading(false); return; }
    const trimmed = content.replace(/<[^>]+>/g, ' ').trim();
    if (trimmed.length < 20) { setRelatedSuggestions([]); setSuggestLoading(false); return; }
    let cancelled = false;
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const vector = await embedText(`${title}\n${trimmed}`.trim());
        if (cancelled || vector.length === 0) return;
        const { data, error } = await supabase.rpc('match_my_content', {
          query_embedding: vector,
          match_count: 5,
          exclude_note_id: draftNoteIdRef.current,
        });
        if (error) throw error;
        if (!cancelled) setRelatedSuggestions(((data ?? []) as MatchedContent[]).filter(r => r.similarity > 0.55));
        if (draftNoteIdRef.current) {
          supabase.from('teacher_notes').update({ embedding: vector }).eq('id', draftNoteIdRef.current)
            .then(({ error: embedError }) => { if (embedError) console.error('[IdeaRecord] 노트 임베딩 갱신 오류:', embedError); });
        }
      } catch (err) {
        if (!cancelled) console.error('[IdeaRecord] 참고 자료 검색 오류:', err);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    }, 1800);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, activeTab]);

  // 6단계 후속: "웹에서 더 찾아보기" 클릭 핸들러 — 내 자료 임베딩 검색만으로 부족할 때
  // 사용자가 직접 눌렀을 때만 Google Search 그라운딩을 호출한다 (자동 호출 금지)
  // 작성 중인 초안(write 탭)과 이미 저장된 아이디어(AI 분석 모달) 양쪽에서 공용으로 사용
  const handleWebSearch = async (queryText: string, cacheKey: string, classId?: string) => {
    if (!queryText.trim()) return;
    const cached = webSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setWebSearchResult(cached);
      setWebSearchError(null);
      return;
    }
    setWebSearchLoading(true);
    setWebSearchError(null);
    try {
      const searchResult = await webSearchForIdea(queryText, classId);
      webSearchCacheRef.current.set(cacheKey, searchResult);
      setWebSearchResult(searchResult);
    } catch (err: any) {
      setWebSearchError(err?.message === 'AI_LIMIT_EXCEEDED'
        ? '이번 달 AI 사용 한도에 도달했습니다.'
        : '웹 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setWebSearchLoading(false);
    }
  };

  // 위 핸들러와 짝을 이루는 UI — 작성 중인 초안 화면과 저장된 아이디어의 AI 분석 화면에서 공용으로 렌더
  const renderWebSearchBox = (queryText: string, cacheKey: string, classId?: string) => {
    if (!queryText.replace(/\s/g, '')) return null;
    return (
      <div className="rounded-2xl border border-surface-container bg-surface-container/40 p-4 space-y-2.5">
        {!webSearchResult && !webSearchLoading && (
          <button
            onClick={() => handleWebSearch(queryText, cacheKey, classId)}
            className="flex items-center gap-1.5 text-xs font-black text-on-surface-variant/70 hover:text-primary transition-colors"
          >
            <Globe size={13} /> 웹에서 더 찾아보기
          </button>
        )}
        {webSearchLoading && (
          <div className="flex items-center gap-1.5 text-xs font-black text-on-surface-variant/60">
            <Loader2 size={13} className="animate-spin" /> 웹에서 관련 자료를 찾는 중...
          </div>
        )}
        {webSearchError && (
          <p className="text-[11px] font-bold text-red-500">{webSearchError}</p>
        )}
        {webSearchResult && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-on-surface-variant/70">
                <Globe size={13} /> 웹 검색 결과
              </div>
              <button
                onClick={() => handleWebSearch(queryText, cacheKey, classId)}
                className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant/50 hover:text-primary transition-colors"
              >
                <RefreshCw size={11} /> 다시 찾기
              </button>
            </div>
            {webSearchResult.summary && (
              <p className="text-[12px] font-medium text-on-surface-variant/80 leading-relaxed">{webSearchResult.summary}</p>
            )}
            {webSearchResult.sources.length > 0 && (
              <div className="space-y-1.5">
                {webSearchResult.sources.map((source, i) => (
                  <a
                    key={`${source.uri}-${i}`}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-surface-container-lowest rounded-xl hover:bg-surface-container transition-colors group"
                  >
                    <ExternalLink size={12} className="shrink-0 text-on-surface-variant/40" />
                    <span className="text-[11px] font-bold text-on-surface truncate group-hover:text-primary">{source.title || source.uri}</span>
                  </a>
                ))}
              </div>
            )}
            {!webSearchResult.summary && webSearchResult.sources.length === 0 && (
              <p className="text-[11px] font-bold text-on-surface-variant/50">관련 웹 자료를 찾지 못했습니다.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  // "완료" 버튼 — 디바운스를 기다리지 않고 즉시 저장을 보장한 뒤 폼을 비우고 목록으로 이동
  const handleFinishWriting = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const ok = await doAutoSave();
      if (!ok) throw new Error('저장에 실패했습니다.');
      setTitle('');
      setContent('');
      draftNoteIdRef.current = null;
      setAutoSaveStatus('idle');
      setRelatedSuggestions([]);
      setWebSearchResult(null);
      setWebSearchError(null);
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
      embedText(`${editForm.title.trim()}\n${editForm.content.trim()}`.trim())
        .then(vector => {
          if (vector.length === 0) return;
          return supabase.from('teacher_notes').update({ embedding: vector }).eq('id', id);
        })
        .catch(err => console.error('[IdeaRecord] 노트 임베딩 갱신 오류:', err));
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
      setViewingNote(prev => (prev?.id === id ? null : prev));
    } catch (err) {
      console.error('삭제 오류:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // 6단계: 이 노트와 의미적으로 유사한 내 수업 자료를 임베딩 검색으로 찾아 AI 제안/생성의 참고 맥락으로 사용
  // (같은 클래스로 한정하지 않고 내 자료 전체에서 실제 내용이 비슷한 것을 찾는다)
  const fetchRelatedMaterials = async (note: TeacherNote): Promise<RelatedMaterialRef[]> => {
    if (!user) return [];
    try {
      const vector = await embedText(`${note.title ?? ''}\n${note.content}`.trim());
      if (vector.length === 0) { setAnalysisRelatedContent([]); return []; }
      const { data, error } = await supabase.rpc('match_my_content', {
        query_embedding: vector,
        match_count: 8,
        exclude_note_id: note.id,
      });
      if (error) throw error;
      const matched = (data ?? []) as MatchedContent[];
      // 화면에 보여줄 카드 목록: 작성 중 화면(relatedSuggestions)과 동일한 기준(유사도 0.55 이상, 타입 불문)
      setAnalysisRelatedContent(matched.filter(r => r.similarity > 0.55).slice(0, 5));
      return matched
        .filter(r => r.source_type === 'material')
        .slice(0, 5)
        .map(r => ({ title: r.title, snippet: r.snippet }));
    } catch (err) {
      console.error('관련 자료 조회 오류:', err);
      setAnalysisRelatedContent([]);
      return [];
    }
  };

  const runAnalysis = async (note: TeacherNote, customInstruction?: string) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const relatedMaterials = await fetchRelatedMaterials(note);
      setAnalysisRelatedMaterials(relatedMaterials);
      const result = await analyzeIdea(note.content, note.class_id ?? undefined, relatedMaterials, customInstruction);
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
    setAnalysisRelatedOpen(true);
    setWebSearchResult(webSearchCacheRef.current.get(note.id) ?? null);
    setWebSearchError(null);
    if (note.ai_summary) {
      setAnalysisResult(note.ai_summary);
      setAnalysisError(null);
      // 저장된 분석 결과를 재사용하는 경우에도 "수업 자료로 만들기" 생성 시 쓸 관련 자료는 새로 조회
      fetchRelatedMaterials(note).then(setAnalysisRelatedMaterials);
    } else {
      setAnalysisResult(null);
      setAnalysisRelatedMaterials([]);
      setAnalysisRelatedContent([]);
      runAnalysis(note);
    }
  };

  const handleCloseAnalysis = () => {
    setAnalysisNote(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setShowRegenerateInput(false);
    setRegenerateInstruction('');
    setAnalysisRelatedContent([]);
    setWebSearchResult(null);
    setWebSearchError(null);
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

  // 위저드(질문 3단계 → PRD → 승인)로 만든 초안을 기존 "자료로 만들기"/"슬라이드로 만들기" 이동 경로에 그대로 태움
  const handleWizardApprove = (content: string, _prd: LessonPRD) => {
    if (!analysisNote || !analysisResult) return;
    const format = wizardFormat;
    setWizardFormat(null);
    persistAnalysis(analysisNote, analysisResult).catch(err => console.error('AI 분석 저장 오류:', err));
    if (format === 'slide') {
      navigate('/teaching-tools', {
        state: {
          activeToolId: 'slide-deck',
          draftSlide: {
            noteId: analysisNote.id,
            title: analysisNote.title || '제목 없는 아이디어',
            content,
            classId: analysisNote.class_id,
          },
        },
      });
      return;
    }
    navigate('/teaching-tools', {
      state: {
        activeToolId: 'material-editor',
        draftMaterial: {
          noteId: analysisNote.id,
          title: analysisNote.title || '제목 없는 아이디어',
          content,
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

  // 6단계: "참고할 만한 자료" 카드에서 "자료로 이동" 클릭 시 — 종류별 상세 화면으로 이동
  const handleGoToReference = (item: MatchedContent) => {
    setPreviewItem(null);
    if (item.source_type === 'note') {
      const target = notes.find(n => n.id === item.id);
      if (!target) { alert('해당 아이디어 기록을 찾을 수 없습니다. 목록을 새로고침해주세요.'); return; }
      setViewingNote(target);
      return;
    }
    if (item.source_type === 'material') {
      navigate('/teaching-tools', { state: { activeToolId: 'material-editor', openMaterialId: item.id, fromIdeaRecord: true } });
      return;
    }
    navigate('/teaching-tools', { state: { activeToolId: 'slide-deck', openSlideId: item.id, fromIdeaRecord: true } });
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
      <div className="relative overflow-hidden pb-6">
        <div className="absolute -top-24 -right-20 -z-10 w-96 h-96 rounded-full bg-gradient-to-br from-primary to-secondary opacity-[0.10] blur-[80px] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-16 bg-gradient-to-b from-transparent to-surface/60 pointer-events-none" />
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
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
            <button
              onClick={() => setGuideOpen(true)}
              className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-[11px] font-black text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <HelpCircle size={13} /> 가이드 보기
            </button>
          </div>
          <div className="text-right shrink-0 pr-3">
            <p className="text-3xl font-black text-primary leading-none tabular-nums">{thisMonthCount}</p>
            <p className="text-[11px] font-black text-on-surface-variant/50 mt-1">이번 달 기록</p>
          </div>
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
        {activeTab === 'write' && (
          <button
            onClick={() => navigate('/teaching-tools', { state: { activeToolId: 'material-editor' } })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
          >
            <BookOpen size={14} /> 수업 자료 에디터로 이동 <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* 작성 폼 */}
      {activeTab === 'write' && (
      <div className="bg-surface-container-lowest rounded-3xl p-5 md:p-6 border border-primary/10 shadow-elevated space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-black text-on-surface flex items-center gap-2">
            <StickyNote size={15} className="text-primary" /> 새 아이디어
          </h3>
          <div className="flex items-center gap-2">
            {autoSaveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant/60">
                <Loader2 size={11} className="animate-spin" /> 자동 저장 중...
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                <Save size={11} /> 자동 저장됨
              </span>
            )}
            <span className="text-[11px] font-bold text-on-surface-variant/50">가볍게 적어두세요 — 나중에 AI가 다듬어드려요</span>
          </div>
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
        <div className="rounded-2xl border border-surface-container">
          <RichEditor
            value={content}
            onChange={setContent}
            onUploadImage={handleUploadImage}
            onUploadingChange={setUploading}
            uploading={uploading}
            minHeight="220px"
          />
        </div>

        {/* 6단계: 작성 중인 내용과 유사한 내 자료 실시간 검색 결과 */}
        {(suggestLoading || relatedSuggestions.length > 0) && (
          <div className="rounded-2xl border border-primary/10 bg-primary/[0.03] p-4 space-y-2.5">
            <button
              type="button"
              onClick={() => setSuggestOpen(v => !v)}
              className="w-full flex items-center justify-between gap-1.5 text-xs font-black text-primary"
            >
              <span className="flex items-center gap-1.5">
                {suggestLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                참고할 만한 자료{relatedSuggestions.length > 0 && ` (${relatedSuggestions.length})`}
              </span>
              <ChevronDown size={14} className={`transition-transform ${suggestOpen ? 'rotate-180' : ''}`} />
            </button>
            {suggestOpen && (
              <>
                {relatedSuggestions.length === 0 && suggestLoading && (
                  <p className="text-[11px] font-bold text-on-surface-variant/50">비슷한 내용을 찾는 중...</p>
                )}
                <div className="space-y-2">
                  {relatedSuggestions.map(item => (
                    <div
                      key={`${item.source_type}-${item.id}`}
                      onClick={() => setPreviewItem(item)}
                      className="flex items-start gap-2.5 px-3 py-2.5 bg-surface-container-lowest rounded-xl cursor-pointer hover:bg-surface-container transition-colors"
                    >
                      <span className="mt-0.5 shrink-0 text-on-surface-variant/50">
                        {item.source_type === 'material' ? <FileText size={14} /> : item.source_type === 'slide' ? <Presentation size={14} /> : <Lightbulb size={14} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-wide">{SOURCE_TYPE_LABEL[item.source_type]}</span>
                          <span className="text-xs font-black text-on-surface truncate">{item.title}</span>
                        </div>
                        {item.snippet && (
                          <p className="text-[11px] font-medium text-on-surface-variant/60 line-clamp-2 mt-0.5">{item.snippet}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 6단계 후속: 웹에서 더 찾아보기 — 내 자료 검색만으로 부족할 때 클릭 시에만 호출 */}
        {renderWebSearchBox(`${title}\n${content}`, draftNoteIdRef.current ?? content, formClassId === NO_CLASS ? undefined : formClassId)}

        <div className="flex justify-end">
          <button
            onClick={handleFinishWriting}
            disabled={!content.trim() || saving || uploading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 btn-gradient rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <Check size={16} /> {saving ? '저장 중...' : uploading ? '이미지 업로드 중...' : '완료'}
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
                  className={`bg-surface-container-lowest rounded-2xl shadow-soft hover:shadow-elevated transition-all hover:-translate-y-0.5 border border-on-surface/[0.06] group ${isEditing ? 'md:col-span-2' : 'overflow-hidden'}`}
                >
                  {isEditing ? (
                    <div className="p-5 space-y-3">
                      <input
                        value={editForm.title}
                        onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                        placeholder="제목 (선택)"
                        className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="rounded-xl border border-surface-container">
                        <RichEditor
                          value={editForm.content}
                          onChange={v => setEditForm(p => ({ ...p, content: v }))}
                          onUploadImage={handleUploadImage}
                          onUploadingChange={setEditUploading}
                          uploading={editUploading}
                          minHeight="200px"
                          toolbarRoundedClassName="rounded-t-xl"
                          contentRoundedClassName="rounded-b-xl"
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
                    <div className="cursor-pointer" onClick={() => setViewingNote(note)}>
                      {/* 상단 컬러 배너 */}
                      <div className={`h-2.5 ${accent.banner}`} />
                      <div className="flex flex-col h-full p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className={`w-10 h-10 rounded-xl ${accent.iconBg} ${accent.iconText} flex items-center justify-center shrink-0`}>
                            <StickyNote size={17} />
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={e => { e.stopPropagation(); handleStartEdit(note); }}
                                title="수정"
                                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-all"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(note.id); }}
                                disabled={isDeleting}
                                title="삭제"
                                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-error/10 hover:text-error flex items-center justify-center text-on-surface-variant transition-all disabled:opacity-50"
                              >
                                {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant/60 whitespace-nowrap">
                              {note.classes?.name || '미지정'}
                            </span>
                          </div>
                        </div>

                        {(note.status === 'developed' || similarResourceDetails.has(note.id)) && (
                          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                            {note.status === 'developed' && (
                              <button
                                onClick={e => { e.stopPropagation(); handleOpenAnalysis(note); }}
                                title="AI 분석 결과 바로 보기"
                                className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-primary-container text-primary hover:bg-primary/20 transition-colors"
                              >
                                <Sparkles size={9} /> AI 분석 완료
                              </button>
                            )}
                            {similarResourceDetails.has(note.id) && (
                              <button
                                onClick={e => { e.stopPropagation(); setSimilarItemsNote(note); }}
                                title="비슷한 자료 보기"
                                className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                              >
                                <Link2 size={9} /> 비슷한 자료 있음
                              </button>
                            )}
                          </div>
                        )}

                        {note.title && <p className="text-sm font-black text-on-surface mb-1 tracking-tight">{note.title}</p>}
                        <div className="[&>*:last-child]:mb-0 line-clamp-3 overflow-hidden flex-1">
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
                          <span className="text-[10px] font-black text-on-surface-variant/30 group-hover:text-primary transition-colors">
                            자세히 보기 →
                          </span>
                        </div>
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

      {/* 노트 원문 전체보기 모달 — AnimatePresence는 Portal을 직접 자식으로 받으면 element로 인식하지 못하므로, Portal 내부에 AnimatePresence를 둔다 */}
      {createPortal(
        <AnimatePresence>
          {viewingNote && (() => {
            const accent = getCardAccent(viewingNote.class_id);
            return (
          <motion.div
            key="idea-detail-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-surface-container-lowest flex flex-col"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="w-full h-full overflow-hidden flex flex-col"
            >
              <div className={`relative px-6 md:px-10 py-6 shrink-0 ${accent.banner}`}>
                <div className="max-w-3xl mx-auto w-full">
                  <button
                    onClick={() => setViewingNote(null)}
                    className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-black text-white transition-all"
                  >
                    <ArrowLeft size={14} /> 목록으로
                  </button>
                  <button
                    onClick={() => setViewingNote(null)}
                    className="absolute top-4 right-4 md:right-8 w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all"
                  >
                    <X size={17} />
                  </button>
                  <span className="inline-block text-[10px] font-black px-2.5 py-1 rounded-full bg-white/20 text-white mb-2">
                    {viewingNote.classes?.name || '미지정'}
                  </span>
                  <h3 className="text-xl md:text-2xl font-black text-white tracking-tight pr-10">
                    {viewingNote.title || '제목 없는 아이디어'}
                  </h3>
                  <div className="flex items-center gap-1 text-[11px] font-bold text-white/70 mt-1.5">
                    <Clock size={11} />
                    {new Date(viewingNote.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto p-6 md:px-10 flex-1">
                <div className="max-w-3xl mx-auto w-full">
                  <ReactMarkdown components={noteDetailMdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {viewingNote.content}
                  </ReactMarkdown>
                  {(viewingNote.tags?.length > 0 || similarResourceDetails.has(viewingNote.id)) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-4 pt-4 border-t border-on-surface/[0.05]">
                      {viewingNote.tags?.map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant/70">
                          <Tag size={10} /> {tag}
                        </span>
                      ))}
                      {similarResourceDetails.has(viewingNote.id) && (
                        <button
                          onClick={() => setSimilarItemsNote(viewingNote)}
                          className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          <Link2 size={10} /> 비슷한 자료 보기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 md:px-10 py-4 border-t border-on-surface/[0.06] shrink-0">
                <div className="max-w-3xl mx-auto w-full flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const n = viewingNote; setViewingNote(null); handleStartEdit(n); }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-all"
                    >
                      <Pencil size={13} /> 수정
                    </button>
                    <button
                      onClick={() => handleDelete(viewingNote.id)}
                      disabled={deletingId === viewingNote.id}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black bg-surface-container hover:bg-error/10 hover:text-error text-on-surface-variant transition-all disabled:opacity-50"
                    >
                      {deletingId === viewingNote.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} 삭제
                    </button>
                  </div>
                  <button
                    onClick={() => { const n = viewingNote; setViewingNote(null); handleOpenAnalysis(n); }}
                    className="flex items-center gap-1.5 px-4 py-2 btn-gradient rounded-xl font-bold text-xs shadow-lg shadow-primary/20"
                  >
                    <Sparkles size={13} /> {viewingNote.ai_summary ? 'AI 분석 보기' : 'AI로 발전시키기'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}

      {/* "비슷한 자료 있음" 배지 클릭 시 매칭된 항목을 보여주는 팝업 */}
      {createPortal(
        <AnimatePresence>
          {similarItemsNote && (() => {
            const details = similarResourceDetails.get(similarItemsNote.id);
            return (
              <motion.div
                key="similar-items-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
                onClick={() => setSimilarItemsNote(null)}
              >
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  onClick={e => e.stopPropagation()}
                  className="w-full max-w-md max-h-[80vh] overflow-hidden bg-surface-container-lowest rounded-3xl shadow-2xl flex flex-col"
                >
                  <div className="flex items-center justify-between px-6 py-4 bg-amber-50 shrink-0">
                    <h3 className="text-sm font-black text-amber-700 flex items-center gap-2">
                      <Link2 size={15} /> 비슷한 자료
                    </h3>
                    <button onClick={() => setSimilarItemsNote(null)} className="w-8 h-8 rounded-lg hover:bg-white/60 flex items-center justify-center text-amber-700/70">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="overflow-y-auto p-5 space-y-4">
                    <p className="text-xs font-bold text-on-surface-variant/60 line-clamp-1">
                      "{similarItemsNote.title || '제목 없는 아이디어'}"와(과) 태그가 겹치는 자료예요.
                    </p>
                    {details && details.notes.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">다른 아이디어 기록</p>
                        <div className="space-y-1.5">
                          {details.notes.map(n => (
                            <button
                              key={n.id}
                              onClick={() => { setSimilarItemsNote(null); setViewingNote(n); }}
                              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                            >
                              <StickyNote size={12} className="text-primary shrink-0" />
                              <span className="truncate">{n.title || '제목 없는 아이디어'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {details && details.materials.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">수업 자료</p>
                        <div className="space-y-1.5">
                          {details.materials.map(m => (
                            <button
                              key={m.id}
                              onClick={() => { setSimilarItemsNote(null); handleGoToReference({ source_type: 'material', id: m.id, title: m.title, snippet: '', similarity: 0 }); }}
                              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                            >
                              <FileText size={12} className="text-secondary shrink-0" />
                              <span className="truncate">{m.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {details && details.slides.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">슬라이드</p>
                        <div className="space-y-1.5">
                          {details.slides.map(s => (
                            <button
                              key={s.id}
                              onClick={() => { setSimilarItemsNote(null); handleGoToReference({ source_type: 'slide', id: s.id, title: s.title, snippet: '', similarity: 0 }); }}
                              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                            >
                              <Presentation size={12} className="text-secondary shrink-0" />
                              <span className="truncate">{s.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {(!details || (details.notes.length === 0 && details.materials.length === 0 && details.slides.length === 0)) && (
                      <p className="text-xs text-on-surface-variant/50 text-center py-4">매칭된 자료가 없습니다.</p>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {analysisNote && (
            <motion.div
              key="idea-analysis-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-surface-container-lowest flex flex-col"
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="w-full h-full overflow-hidden flex flex-col"
              >
                <div className="relative px-6 md:px-10 py-6 shrink-0 bg-gradient-to-r from-primary-container to-secondary-container/50">
                  <div className="max-w-3xl mx-auto w-full">
                    <button
                      onClick={handleCloseAnalysis}
                      className="absolute top-4 right-4 md:right-8 w-9 h-9 rounded-lg bg-white/40 hover:bg-white/60 flex items-center justify-center text-primary transition-all"
                    >
                      <X size={17} />
                    </button>
                    <h3 className="text-xl md:text-2xl font-black text-primary tracking-tight flex items-center gap-2 pr-10">
                      <Sparkles size={20} /> AI로 발전시키기
                    </h3>
                    <p className="text-xs font-bold text-primary/70 mt-1.5 line-clamp-1">
                      {analysisNote.title || '제목 없는 아이디어'}
                    </p>
                  </div>
                </div>

                <div className="overflow-y-auto p-6 md:px-10 flex-1">
                  <div className="max-w-3xl mx-auto w-full">
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
                    <div className="space-y-9">
                      {/* 요약 — 연한 primary 틴트 배경 */}
                      <div className="flex items-start justify-between gap-3 bg-primary-container/35 rounded-2xl p-5">
                        <p className="text-lg font-black text-on-surface leading-snug">{analysisResult.summary}</p>
                        <span className="shrink-0 mt-1 text-[11px] font-black px-2.5 py-1 rounded-lg bg-white/60 text-primary whitespace-nowrap">
                          {FORMAT_LABEL[analysisResult.suggestedFormat]}
                        </span>
                      </div>

                      {/* 수업 가이드 초안 — 중립톤 배경 + 세로 타임라인 */}
                      <div className="bg-surface-container/50 rounded-2xl p-5">
                        <p className="text-sm font-black text-on-surface mb-3.5 flex items-center gap-1.5">
                          <List size={14} className="text-on-surface-variant/50" /> 수업 가이드 초안
                        </p>
                        <ol className="relative pl-5 space-y-4">
                          <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-on-surface/10" />
                          {analysisResult.guideOutline.map((step, i) => (
                            <li key={i} className="relative">
                              <span className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-surface-container" />
                              <p className="text-sm text-on-surface leading-relaxed">{step}</p>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* AI가 제안하는 발전 방향 — 연한 primary 틴트 배경으로 2열 구분 */}
                      {analysisResult.aiSuggestions && (
                        analysisResult.aiSuggestions.direction ||
                        analysisResult.aiSuggestions.introActivities.length > 0 ||
                        analysisResult.aiSuggestions.practiceIdeas.length > 0
                      ) && (
                        <div className="bg-primary-container/25 rounded-2xl p-5">
                          <p className="text-sm font-black text-on-surface mb-2.5 flex items-center gap-1.5">
                            <Lightbulb size={14} className="text-primary" /> AI가 제안하는 발전 방향
                          </p>
                          {analysisResult.aiSuggestions.direction && (
                            <p className="text-sm text-on-surface leading-relaxed mb-4">{analysisResult.aiSuggestions.direction}</p>
                          )}
                          <div className="grid sm:grid-cols-2 gap-4">
                            {analysisResult.aiSuggestions.introActivities.length > 0 && (
                              <div className="bg-white/70 rounded-xl p-3.5">
                                <p className="text-xs font-black text-on-surface-variant/60 mb-2 flex items-center gap-1">
                                  <PenLine size={12} className="text-primary" /> 도입 활동 제안
                                </p>
                                <ul>
                                  {analysisResult.aiSuggestions.introActivities.map((item, i) => (
                                    <li key={i} className="text-sm text-on-surface leading-relaxed py-2 border-b border-on-surface/[0.06] last:border-0">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {analysisResult.aiSuggestions.practiceIdeas.length > 0 && (
                              <div className="bg-white/70 rounded-xl p-3.5">
                                <p className="text-xs font-black text-on-surface-variant/60 mb-2 flex items-center gap-1">
                                  <List size={12} className="text-primary" /> 실습·연계 아이디어
                                </p>
                                <ul>
                                  {analysisResult.aiSuggestions.practiceIdeas.map((item, i) => (
                                    <li key={i} className="text-sm text-on-surface leading-relaxed py-2 border-b border-on-surface/[0.06] last:border-0">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 참고 자료 — 관련 자료 반영 제안 / 참고할 만한 자료 / 웹 검색 (중립톤 배경으로 한 구역임을 표시) */}
                      <div className="bg-surface-container/50 rounded-2xl p-5 space-y-4">
                        <p className="text-sm font-black text-on-surface flex items-center gap-1.5">
                          <BookOpen size={14} className="text-on-surface-variant/50" /> 참고 자료
                        </p>

                        {analysisResult.relatedMaterialsNote && (
                          <div className="flex gap-2.5">
                            <Link2 size={15} className="text-secondary shrink-0 mt-0.5" />
                            <p className="text-sm text-on-surface leading-relaxed">{analysisResult.relatedMaterialsNote}</p>
                          </div>
                        )}

                        {/* 이미 작성 완료된 아이디어에서도 참고할 만한 내 자료 목록을 볼 수 있게 (작성 중 화면과 동일한 카드) */}
                        {analysisRelatedContent.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setAnalysisRelatedOpen(v => !v)}
                              className="w-full flex items-center justify-between gap-1 text-xs font-black text-on-surface-variant/60"
                            >
                              <span className="flex items-center gap-1"><Sparkles size={13} /> 참고할 만한 자료 ({analysisRelatedContent.length})</span>
                              <ChevronDown size={14} className={`transition-transform ${analysisRelatedOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {analysisRelatedOpen && (
                              <div className="divide-y divide-on-surface/[0.06] mt-2">
                                {analysisRelatedContent.map(item => (
                                  <div
                                    key={`${item.source_type}-${item.id}`}
                                    onClick={() => setPreviewItem(item)}
                                    className="flex items-center gap-2.5 py-2.5 cursor-pointer hover:bg-white/60 -mx-2 px-2 rounded-lg transition-colors"
                                  >
                                    <span className="shrink-0 text-on-surface-variant/50">
                                      {item.source_type === 'material' ? <FileText size={15} /> : item.source_type === 'slide' ? <Presentation size={15} /> : <Lightbulb size={15} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-on-surface-variant/45 uppercase tracking-wide">{SOURCE_TYPE_LABEL[item.source_type]}</span>
                                        <span className="text-sm font-bold text-on-surface truncate">{item.title}</span>
                                      </div>
                                      {item.snippet && (
                                        <p className="text-xs text-on-surface-variant/60 line-clamp-1 mt-0.5">{item.snippet}</p>
                                      )}
                                    </div>
                                    <ArrowRight size={13} className="shrink-0 text-on-surface-variant/30" />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {renderWebSearchBox(
                          `${analysisNote.title ?? ''}\n${analysisNote.content}`,
                          analysisNote.id,
                          analysisNote.class_id ?? undefined
                        )}
                      </div>

                      {/* 태그 */}
                      {analysisResult.relatedTags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {analysisResult.relatedTags.map(tag => (
                            <span key={tag} className="text-xs font-bold text-on-surface-variant/50">#{tag}</span>
                          ))}
                        </div>
                      )}

                      {/* 이 아이디어로 만들기 — 성격별 그룹 분리 */}
                      <div className="space-y-3.5">
                        <p className="text-sm font-black text-on-surface">이 아이디어로 만들기</p>

                        {/* 그룹 A: 바로 만들기 (즉시 자동 생성) */}
                        <div className="space-y-2.5">
                          <div className="rounded-2xl border border-on-surface/[0.08] bg-surface-container/30 p-3.5">
                            <div className="flex items-center gap-1.5 mb-2.5">
                              <FileText size={13} className="text-on-surface-variant/50" />
                              <span className="text-xs font-bold text-on-surface-variant/70">수업 자료로 만들기</span>
                              {analysisResult.suggestedFormat !== 'slide' && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary text-white">AI 추천</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleCreateMaterial('simple')}
                                disabled={creatingMaterialLength !== null}
                                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
                                  analysisResult.suggestedFormat !== 'slide'
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-white text-on-surface-variant border border-on-surface/10 hover:bg-surface-container'
                                }`}
                              >
                                {creatingMaterialLength === 'simple' ? <Loader2 size={14} className="animate-spin" /> : null}
                                간단히
                              </button>
                              <button
                                onClick={() => handleCreateMaterial('detailed')}
                                disabled={creatingMaterialLength !== null}
                                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
                                  analysisResult.suggestedFormat !== 'slide'
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-white text-on-surface-variant border border-on-surface/10 hover:bg-surface-container'
                                }`}
                              >
                                {creatingMaterialLength === 'detailed' ? <Loader2 size={14} className="animate-spin" /> : null}
                                자세히
                              </button>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-on-surface/[0.08] bg-surface-container/30 p-3.5">
                            <div className="flex items-center gap-1.5 mb-2.5">
                              <Presentation size={13} className="text-on-surface-variant/50" />
                              <span className="text-xs font-bold text-on-surface-variant/70">슬라이드로 만들기</span>
                              {analysisResult.suggestedFormat === 'slide' && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary text-white">AI 추천</span>
                              )}
                            </div>
                            <button
                              onClick={handleCreateSlide}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                analysisResult.suggestedFormat === 'slide'
                                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                                  : 'bg-white text-on-surface-variant border border-on-surface/10 hover:bg-surface-container'
                              }`}
                            >
                              <Presentation size={14} /> 슬라이드 생성
                            </button>
                          </div>
                        </div>

                        {/* 그룹 B: AI와 대화하며 구체화 (다른 성격의 흐름) */}
                        <button
                          onClick={() => setWizardFormat(analysisResult.suggestedFormat === 'slide' ? 'slide' : 'material')}
                          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/25 hover:shadow-xl transition-all"
                        >
                          <Wand2 size={18} className="shrink-0" />
                          <span className="text-left">
                            <span className="block text-sm font-black">AI와 질문하며 구체화하기</span>
                            <span className="block text-[11px] font-medium text-white/80">질문에 답하며 더 정교한 계획을 만들어요</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </div>

                {analysisResult && !analysisLoading && !analysisError && (
                  <div className="px-6 md:px-10 py-4 border-t border-on-surface/[0.06] shrink-0">
                    <div className="max-w-3xl mx-auto w-full">
                      {showRegenerateInput && (
                        <div className="mb-3 space-y-2">
                          <textarea
                            value={regenerateInstruction}
                            onChange={e => setRegenerateInstruction(e.target.value)}
                            placeholder="원하는 방향을 알려주세요 (예: 좀 더 실습 위주로 / 저학년 눈높이에 맞게 / 협동학습 요소를 강조해줘)"
                            rows={2}
                            autoFocus
                            className="w-full px-3 py-2 bg-surface-container/60 rounded-xl border border-on-surface/10 text-xs resize-none focus:outline-none focus:border-primary/40"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setShowRegenerateInput(false); setRegenerateInstruction(''); }}
                              className="px-3 py-1.5 text-xs font-black text-on-surface-variant hover:bg-surface-container rounded-lg transition-all"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => {
                                if (!analysisNote) return;
                                runAnalysis(analysisNote, regenerateInstruction);
                                setShowRegenerateInput(false);
                              }}
                              className="flex items-center gap-1.5 px-4 py-1.5 btn-gradient rounded-lg font-black text-xs shadow-lg shadow-primary/20"
                            >
                              <RefreshCw size={12} /> 지침 반영해서 재생성
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => setShowRegenerateInput(v => !v)}
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
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {wizardFormat && analysisNote && (
        <IdeaPRDWizard
          ideaContent={analysisNote.content}
          format={wizardFormat}
          relatedMaterials={analysisRelatedMaterials}
          classId={analysisNote.class_id ?? undefined}
          onClose={() => setWizardFormat(null)}
          onApprove={handleWizardApprove}
        />
      )}

      {/* 6단계: 참고 자료 카드 클릭 시 미리보기 모달 */}
      <AnimatePresence>
        {previewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4"
            onClick={() => setPreviewItem(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md max-h-[80vh] overflow-hidden bg-surface-container-lowest rounded-3xl shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary-container to-secondary-container/50 shrink-0">
                <span className="flex items-center gap-1.5 text-xs font-black text-primary">
                  {previewItem.source_type === 'material' ? <FileText size={15} /> : previewItem.source_type === 'slide' ? <Presentation size={15} /> : <Lightbulb size={15} />}
                  {SOURCE_TYPE_LABEL[previewItem.source_type]}
                </span>
                <button onClick={() => setPreviewItem(null)} className="w-8 h-8 rounded-lg hover:bg-white/50 flex items-center justify-center text-primary/70">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto p-6 space-y-3">
                <h3 className="text-base font-black text-on-surface">{previewItem.title}</h3>
                {previewFullLoading ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant/50 py-6 justify-center">
                    <Loader2 size={14} className="animate-spin" /> 불러오는 중...
                  </div>
                ) : previewFullContent ? (
                  previewItem.source_type === 'slide' ? (
                    <p className="text-xs font-medium text-on-surface-variant/70 whitespace-pre-line leading-relaxed">{previewFullContent}</p>
                  ) : (
                    <ReactMarkdown components={noteMdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {previewFullContent}
                    </ReactMarkdown>
                  )
                ) : (
                  <p className="text-xs font-bold text-on-surface-variant/40">미리보기 내용이 없습니다. 자료로 이동해서 전체 내용을 확인해주세요.</p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-on-surface/[0.06] shrink-0 flex justify-end">
                <button
                  onClick={() => handleGoToReference(previewItem)}
                  className="flex items-center gap-1.5 px-4 py-2 btn-gradient rounded-xl font-bold text-xs shadow-lg shadow-primary/20"
                >
                  <Link2 size={13} /> 자료로 이동
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {guideOpen && <IdeaRecordGuideModal onClose={closeGuide} />}
    </div>
  );
}
