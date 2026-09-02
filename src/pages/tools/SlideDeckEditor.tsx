import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Type, Image as ImageIcon, Link2, Smile, Code2, SquarePlay, Play, Trash2, Loader2, LayoutGrid, Sparkles, ImagePlus, X as XIcon, FileDown, FileText, FileUp, Palette, ExternalLink, Lightbulb, Check, ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, Bookmark, GripVertical, Wand2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, checkIsBasicOrAbove } from '../../lib/auth';
import type { SlideDeck, DeckSlide, SlideObject, SlideObjectType, SlideLayoutKind, SlideSnippet } from '../../components/slidedeck/types';
import { SLIDE_TEMPLATES, getTemplate, instantiateSlide, getLayoutSlotSpec, buildDraftDeckSlides, applyTemplateToDeck } from '../../components/slidedeck/templates';
import TemplateGallery from '../../components/slidedeck/TemplateGallery';
import SlideThumbnailRail from '../../components/slidedeck/SlideThumbnailRail';
import SlideSnippetLibrary from '../../components/slidedeck/SlideSnippetLibrary';
import SlideStage from '../../components/slidedeck/SlideStage';
import PresentationView from '../../components/slidedeck/PresentationView';
import EmojiPickerPopover from '../../components/slidedeck/EmojiPickerPopover';
import ImportMaterialModal, { type ImportableMaterial, resolveSourceContent } from '../../components/slidedeck/ImportMaterialModal';
import { generateSlideDeckDraft, generateSlideOutline, reviseSlideOutlineSlide, reviseSlideOutlinePlan, embedText, type SlideOutlinePlan } from '../../lib/gemini';
import { uploadSlideImage } from '../../components/slidedeck/utils/imageUpload';
import { exportDeckToPptx } from '../../components/slidedeck/utils/exportPptx';
import { exportDeckToPdf } from '../../components/slidedeck/utils/exportPdf';
import { parsePptxFile } from '../../components/slidedeck/utils/importPptx';
import LimitToast, { useLimitToast } from '../../components/ui/LimitToast';

type View = 'list' | 'template' | 'planning' | 'editor';

const ALL_LAYOUT_KINDS: SlideLayoutKind[] = ['title', 'textOnly', 'textImage1', 'textImagesMany'];

// DeckSlide.objects[]의 텍스트류(text/link 라벨/code) 값만 이어붙여 임베딩 입력 텍스트로 사용
const extractSlideDeckText = (slides: DeckSlide[]): string =>
  slides
    .flatMap(slide => slide.objects.map(obj => obj.text))
    .filter((text): text is string => !!text && text.trim().length > 0)
    .join('\n');

// 저장된 슬라이드덱의 임베딩을 백그라운드로 갱신 — 아이디어 기록의 "참고할 만한 자료" 검색에 쓰인다.
const syncSlideDeckEmbedding = (deckId: string, title: string, slides: DeckSlide[]) => {
  embedText(`${title}\n${extractSlideDeckText(slides)}`.trim())
    .then(vector => {
      if (vector.length === 0) return;
      return supabase.from('slide_decks').update({ embedding: vector }).eq('id', deckId);
    })
    .catch(err => console.error('[SlideDeckEditor] 임베딩 갱신 오류:', err));
};

interface DeckListRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  updated_at: string;
}

const FREE_SLIDE_DECK_LIMIT = 1;

export default function SlideDeckEditor() {
  const { user, profile } = useAuth();
  const { limitToastMessage, showLimitToast } = useLimitToast();
  const [snippetToast, setSnippetToast] = useState<{ text: string; ok: boolean } | null>(null);
  const snippetToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSnippetToast = useCallback((text: string, ok: boolean) => {
    if (snippetToastTimerRef.current) clearTimeout(snippetToastTimerRef.current);
    setSnippetToast({ text, ok });
    snippetToastTimerRef.current = setTimeout(() => setSnippetToast(null), 2500);
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  // 아이디어 기록(나의 노트)에서 "슬라이드로 만들기"로 넘어온 초안 — 덱 생성 완료 시 원본 노트에 연결 기록
  const pendingDraftNoteIdRef = useRef<string | null>(null);
  const draftHandledRef = useRef(false);
  const openDeckHandledRef = useRef(false);
  // 아이디어 기록의 "참고할 만한 자료" 패널을 통해 이 슬라이드로 넘어온 경우 — 에디터 상단에 돌아가기 링크를 보여준다
  const [cameFromIdeaRecord, setCameFromIdeaRecord] = useState(false);
  const [view, setView] = useState<View>('list');
  const [decks, setDecks] = useState<DeckListRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeDeck, setActiveDeck] = useState<SlideDeck | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(SLIDE_TEMPLATES[0].id);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  // 편집 캔버스 확대/축소 — null이면 화면에 자동으로 맞춤(기본값), 숫자면 사용자가 지정한 배율
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [renderedScale, setRenderedScale] = useState(1);
  const stageRowRef = useRef<HTMLDivElement>(null);
  const [stageAreaHeight, setStageAreaHeight] = useState(560);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSnippetLibrary, setShowSnippetLibrary] = useState(false);
  const [importedMaterial, setImportedMaterial] = useState<ImportableMaterial | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  // 자료 가져오기 → 템플릿 선택 후, 실제 생성 전에 보여주는 "계획(개요) 확인" 단계
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [planOutline, setPlanOutline] = useState<SlideOutlinePlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const dragSlideIndexRef = useRef<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  // 계획(개요) 화면 — 슬라이드별/전체 "AI로 수정" 요청
  const [openReviseIndex, setOpenReviseIndex] = useState<number | null>(null);
  const [slideRevisePrompt, setSlideRevisePrompt] = useState('');
  const [revisingSlideIndex, setRevisingSlideIndex] = useState<number | null>(null);
  const [showGlobalRevise, setShowGlobalRevise] = useState(false);
  const [globalRevisePrompt, setGlobalRevisePrompt] = useState('');
  const [revisingAllSlides, setRevisingAllSlides] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [exporting, setExporting] = useState<'pptx' | 'pdf' | null>(null);
  const [importingPptx, setImportingPptx] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const pptxFileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── 되돌리기/다시하기 히스토리 ──────────────────────────────────────────
  // 짧은 시간(500ms) 안에 연속으로 들어오는 변경(드래그 중 pointermove 연속 호출 등)은 한 단계로 묶는다.
  const HISTORY_LIMIT = 50;
  const historyRef = useRef<{ past: DeckSlide[][]; future: DeckSlide[][] }>({ past: [], future: [] });
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slidesRef = useRef<DeckSlide[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => { slidesRef.current = activeDeck?.slides ?? []; }, [activeDeck]);

  const resetHistory = () => {
    historyRef.current = { past: [], future: [] };
    if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
    setHistoryVersion(v => v + 1);
  };

  const loadDecks = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    const { data } = await supabase
      .from('slide_decks')
      .select('id, title, thumbnail_url, updated_at')
      .eq('teacher_id', user.id)
      .order('updated_at', { ascending: false });
    setDecks(data ?? []);
    setLoadingList(false);
  }, [user]);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  // 아이디어 기록에서 "슬라이드로 만들기"로 넘어온 경우 — 기존 "자료 가져와서 AI 초안 생성" 흐름을 그대로 태워 템플릿 선택 화면으로 바로 진입
  useEffect(() => {
    if (draftHandledRef.current) return;
    const draft = (location.state as { draftSlide?: { noteId: string; title: string; content: string; classId?: string | null } } | null)?.draftSlide;
    if (!draft) return;
    draftHandledRef.current = true;
    pendingDraftNoteIdRef.current = draft.noteId;
    setImportedMaterial({ id: 'idea-draft', class_id: draft.classId ?? null, title: draft.title, content: draft.content, ai_versions: [] });
    setView('template');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 아이디어 기록의 "참고할 만한 자료" 패널에서 특정 슬라이드로 바로 이동한 경우
  useEffect(() => {
    if (openDeckHandledRef.current) return;
    const state = location.state as { openSlideId?: string; fromIdeaRecord?: boolean } | null;
    const openId = state?.openSlideId;
    if (!openId) return;
    openDeckHandledRef.current = true;
    if (state?.fromIdeaRecord) setCameFromIdeaRecord(true);
    handleOpenDeck(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 자동 저장 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeDeck) return;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase
        .from('slide_decks')
        .update({ title: activeDeck.title, slides: activeDeck.slides, updated_at: new Date().toISOString() })
        .eq('id', activeDeck.id);
      syncSlideDeckEmbedding(activeDeck.id, activeDeck.title, activeDeck.slides);
      setSaveState('saved');
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeck?.title, activeDeck?.slides]);

  // ── 편집 캔버스 영역이 뷰포트 남은 세로 공간에 항상 꽉 차도록 실시간으로 높이를 계산 ──────────
  useEffect(() => {
    if (view !== 'editor') return;
    const el = stageRowRef.current;
    if (!el) return;
    const recompute = () => {
      const top = el.getBoundingClientRect().top;
      // <main>의 padding-bottom(글자 크기 배율에 따라 rem 기준으로 달라짐)만큼만 하단 여백으로 남겨둔다
      const mainEl = el.closest('main');
      const bottomReserve = mainEl ? parseFloat(getComputedStyle(mainEl).paddingBottom) || 24 : 24;
      setStageAreaHeight(Math.max(360, window.innerHeight - top - bottomReserve));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    // 공지 배너 등 캔버스 영역 "위쪽" 형제 요소가 늦게 나타나거나 높이가 바뀌면
    // el 자신의 크기는 그대로여도 el.top 위치가 바뀌어 stageAreaHeight가 어긋난다 —
    // document.body 전체 크기 변화도 함께 감시해서 그런 경우까지 다시 계산한다.
    ro.observe(document.body);
    window.addEventListener('resize', recompute);
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedObjectId, activeDeck?.slides[activeSlideIndex]?.bgImage]);

  // ── 덱 생성 ────────────────────────────────────────────────────────────
  const canCreateDeck = () => {
    if (checkIsBasicOrAbove(profile)) return true;
    if (decks.length >= FREE_SLIDE_DECK_LIMIT) {
      showLimitToast(`무료 플랜은 슬라이드덱을 최대 ${FREE_SLIDE_DECK_LIMIT}개까지 만들 수 있습니다. Pro 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
      return false;
    }
    return true;
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    if (!user) return;
    if (!canCreateDeck()) return;
    const template = getTemplate(templateId);
    const starterSlides = ALL_LAYOUT_KINDS.map(kind => instantiateSlide(template, kind));
    const { data, error } = await supabase
      .from('slide_decks')
      .insert({ teacher_id: user.id, title: '제목 없는 슬라이드', slides: starterSlides })
      .select()
      .single();
    if (error || !data) return;
    syncSlideDeckEmbedding((data as SlideDeck).id, (data as SlideDeck).title, (data as SlideDeck).slides);
    setActiveTemplateId(templateId);
    setActiveDeck(data as SlideDeck);
    resetHistory();
    setActiveSlideIndex(0);
    setSelectedObjectId(null);
    setView('editor');
    loadDecks();
  };

  // ── 계획(개요) 확인 — 템플릿을 고르면 바로 생성하지 않고, 먼저 AI가 슬라이드 구성 개요를 만들어 보여준다 ──
  const handlePickTemplateForMaterial = async (templateId: string) => {
    if (!importedMaterial) return;
    setPendingTemplateId(templateId);
    setPlanOutline(null);
    setPlanLoading(true);
    setView('planning');
    try {
      const sourceContent = resolveSourceContent(importedMaterial);
      const outline = await generateSlideOutline(sourceContent, importedMaterial.class_id ?? undefined);
      setPlanOutline(outline);
    } catch (err: any) {
      alert(err?.message === 'AI_LIMIT_EXCEEDED' ? '이번 달 AI 사용 한도에 도달했습니다.' : (err?.message || '슬라이드 구성 개요를 만드는 중 오류가 발생했습니다.'));
      setView('template');
      setPendingTemplateId(null);
    } finally {
      setPlanLoading(false);
    }
  };

  // ── 계획(개요) 화면에서 직접 수정 — 제목/소제목/내용/순서/개수를 승인 전에 편집 ──────────
  const updatePlanTitle = (title: string) => {
    setPlanOutline(prev => (prev ? { ...prev, title } : prev));
  };
  const updatePlanSlideSubtitle = (index: number, subtitle: string) => {
    setPlanOutline(prev => {
      if (!prev) return prev;
      const slides = prev.slides.map((s, i) => (i === index ? { ...s, subtitle } : s));
      return { ...prev, slides };
    });
  };
  const updatePlanSlideContent = (index: number, contentText: string) => {
    setPlanOutline(prev => {
      if (!prev) return prev;
      const slides = prev.slides.map((s, i) => (i === index ? { ...s, content: contentText.split('\n') } : s));
      return { ...prev, slides };
    });
  };
  const removePlanSlide = (index: number) => {
    setPlanOutline(prev => (prev ? { ...prev, slides: prev.slides.filter((_, i) => i !== index) } : prev));
  };
  const addPlanSlide = () => {
    setPlanOutline(prev => (prev ? { ...prev, slides: [...prev.slides, { subtitle: '새 슬라이드', content: [] }] } : prev));
  };
  const movePlanSlide = (fromIndex: number, toIndex: number) => {
    setPlanOutline(prev => {
      if (!prev || fromIndex === toIndex) return prev;
      const slides = [...prev.slides];
      const [moved] = slides.splice(fromIndex, 1);
      slides.splice(toIndex, 0, moved);
      return { ...prev, slides };
    });
  };
  const handlePlanSlideDrop = (dropIndex: number) => {
    const fromIndex = dragSlideIndexRef.current;
    dragSlideIndexRef.current = null;
    setDragOverSlideIndex(null);
    if (fromIndex === null || fromIndex === dropIndex) return;
    movePlanSlide(fromIndex, dropIndex);
  };

  // ── 계획(개요) 화면 — 슬라이드 한 장을 AI로 다시 쓰기 ──────────────────────────
  const toggleSlideReviseInput = (index: number) => {
    setOpenReviseIndex(prev => (prev === index ? null : index));
    setSlideRevisePrompt('');
  };
  const handleReviseSlide = async (index: number) => {
    if (!planOutline || !importedMaterial || !slideRevisePrompt.trim()) return;
    setRevisingSlideIndex(index);
    try {
      const sourceContent = resolveSourceContent(importedMaterial);
      const revised = await reviseSlideOutlineSlide(
        sourceContent,
        planOutline.slides[index],
        slideRevisePrompt.trim(),
        importedMaterial.class_id ?? undefined
      );
      setPlanOutline(prev => {
        if (!prev) return prev;
        const slides = prev.slides.map((s, i) => (i === index ? revised : s));
        return { ...prev, slides };
      });
      setOpenReviseIndex(null);
      setSlideRevisePrompt('');
    } catch (err: any) {
      alert(err?.message === 'AI_LIMIT_EXCEEDED' ? '이번 달 AI 사용 한도에 도달했습니다.' : (err?.message || '슬라이드를 다시 쓰는 중 오류가 발생했습니다.'));
    } finally {
      setRevisingSlideIndex(null);
    }
  };

  // ── 계획(개요) 화면 — 전체 슬라이드를 AI로 한 번에 다시 쓰기 ────────────────────
  const handleReviseAllSlides = async () => {
    if (!planOutline || !importedMaterial || !globalRevisePrompt.trim()) return;
    setRevisingAllSlides(true);
    try {
      const sourceContent = resolveSourceContent(importedMaterial);
      const revised = await reviseSlideOutlinePlan(
        sourceContent,
        planOutline,
        globalRevisePrompt.trim(),
        importedMaterial.class_id ?? undefined
      );
      setPlanOutline(revised);
      setShowGlobalRevise(false);
      setGlobalRevisePrompt('');
    } catch (err: any) {
      alert(err?.message === 'AI_LIMIT_EXCEEDED' ? '이번 달 AI 사용 한도에 도달했습니다.' : (err?.message || '전체 슬라이드를 다시 쓰는 중 오류가 발생했습니다.'));
    } finally {
      setRevisingAllSlides(false);
    }
  };

  // ── AI 초안 생성 (자료 에디터에서 가져오기, 계획 승인 후 실행) ────────────────────
  const handleCreateDraftFromMaterial = async (templateId: string, approvedOutline?: SlideOutlinePlan) => {
    if (!user || !importedMaterial) return;
    if (!canCreateDeck()) return;
    setAiGenerating(true);
    try {
      const template = getTemplate(templateId);
      const layoutSpecs = ALL_LAYOUT_KINDS.map(kind => getLayoutSlotSpec(template, kind));
      const sourceContent = resolveSourceContent(importedMaterial);
      const { slides: aiSlides, imageUrls, codeBlocks } = await generateSlideDeckDraft(
        sourceContent,
        layoutSpecs,
        importedMaterial.class_id ?? undefined,
        approvedOutline
      );
      const draftSlides = buildDraftDeckSlides(template, aiSlides, imageUrls, codeBlocks);
      const { data, error } = await supabase
        .from('slide_decks')
        .insert({ teacher_id: user.id, title: importedMaterial.title || '제목 없는 슬라이드', slides: draftSlides })
        .select()
        .single();
      if (error || !data) return;
      syncSlideDeckEmbedding((data as SlideDeck).id, (data as SlideDeck).title, (data as SlideDeck).slides);
      setActiveTemplateId(templateId);
      setActiveDeck(data as SlideDeck);
      resetHistory();
      setActiveSlideIndex(0);
      setSelectedObjectId(null);
      setView('editor');
      loadDecks();
      if (pendingDraftNoteIdRef.current) {
        const noteId = pendingDraftNoteIdRef.current;
        pendingDraftNoteIdRef.current = null;
        supabase.from('teacher_notes').update({ linked_slide_id: (data as SlideDeck).id }).eq('id', noteId)
          .then(({ error: linkError }) => { if (linkError) console.error('[SlideDeckEditor] linked_slide_id 기록 오류:', linkError); });
      }
    } catch (err: any) {
      alert(err?.message === 'AI_LIMIT_EXCEEDED' ? '이번 달 AI 사용 한도에 도달했습니다.' : (err?.message || 'AI 초안 생성 중 오류가 발생했습니다.'));
    } finally {
      setAiGenerating(false);
      setImportedMaterial(null);
      setPendingTemplateId(null);
      setPlanOutline(null);
    }
  };

  // ── 파워포인트(.pptx) 파일 불러오기 ────────────────────────────────────────
  const handleImportPptxFile = async (file: File) => {
    if (!user) return;
    if (!canCreateDeck()) return;
    const proceed = confirm(
      '파워포인트 파일을 불러오면 텍스트와 이미지 위주로 우리 도구 형식으로 변환됩니다.\n' +
      '텍스트/이미지에 걸린 하이퍼링크와 웹 동영상(유튜브 등) 링크는 가능한 가져오지만, 표·차트·스마트아트·애니메이션·' +
      '내장된 동영상 파일 자체(재생은 지원하지 않아 정지 이미지만 가져옴) 등은 지원되지 않아 일부 내용이 생략될 수 있습니다.\n' +
      '또한 이미지 위치, 글꼴(폰트), 도형 배치 등 레이아웃이 원본 파일과 다르게 나타날 수 있으니 불러온 후 확인 및 수정이 필요할 수 있습니다.\n' +
      '계속할까요?'
    );
    if (!proceed) return;
    setImportingPptx(true);
    try {
      const { slides, skippedOther, skippedImages, skippedVectorImages } = await parsePptxFile(file);
      if (slides.length === 0) {
        alert('슬라이드를 찾을 수 없습니다. 올바른 pptx 파일인지 확인해주세요.');
        return;
      }
      const title = file.name.replace(/\.pptx$/i, '') || '제목 없는 슬라이드';
      const { data, error } = await supabase
        .from('slide_decks')
        .insert({ teacher_id: user.id, title, slides })
        .select()
        .single();
      if (error || !data) { alert('슬라이드를 저장하는 중 오류가 발생했습니다.'); return; }
      syncSlideDeckEmbedding((data as SlideDeck).id, (data as SlideDeck).title, (data as SlideDeck).slides);
      setActiveDeck(data as SlideDeck);
      resetHistory();
      setActiveSlideIndex(0);
      setSelectedObjectId(null);
      setView('editor');
      loadDecks();
      const notes: string[] = [];
      if (skippedOther > 0) notes.push(`표/차트/그룹 도형 등 ${skippedOther}개`);
      if (skippedImages > 0) notes.push(`가져오지 못한 이미지 ${skippedImages}개(외부 링크 이미지 등 접근 실패 포함)`);
      if (skippedVectorImages > 0) notes.push(`지원되지 않는 이미지 형식(EMF/WMF/TIFF) ${skippedVectorImages}개`);
      const skippedLine = notes.length > 0 ? ` ${notes.join(', ')}는 생략되었습니다.` : '';
      alert(`가져오기를 완료했습니다.${skippedLine} 이미지 위치, 글꼴, 레이아웃이 원본과 다를 수 있으니 슬라이드를 확인하고 필요한 부분을 수정해주세요.`);
    } catch {
      alert('pptx 파일을 읽는 중 오류가 발생했습니다. 올바른 파워포인트 파일인지 확인해주세요.');
    } finally {
      setImportingPptx(false);
    }
  };

  const handleOpenDeck = async (id: string) => {
    const { data } = await supabase.from('slide_decks').select('*').eq('id', id).single();
    if (!data) return;
    setActiveDeck(data as SlideDeck);
    resetHistory();
    setActiveSlideIndex(0);
    setSelectedObjectId(null);
    setView('editor');
  };

  const handleDeleteDeck = async (id: string) => {
    if (!confirm('이 슬라이드를 삭제할까요? 되돌릴 수 없습니다.')) return;
    await supabase.from('slide_decks').delete().eq('id', id);
    loadDecks();
  };

  const handleBackToList = () => {
    setActiveDeck(null);
    resetHistory();
    setView('list');
    loadDecks();
  };

  // ── 슬라이드 조작 ──────────────────────────────────────────────────────
  const updateSlides = (updater: (slides: DeckSlide[]) => DeckSlide[]) => {
    if (!historyTimerRef.current) {
      historyRef.current.past = [...historyRef.current.past, slidesRef.current].slice(-HISTORY_LIMIT);
      historyRef.current.future = [];
    }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => { historyTimerRef.current = null; }, 500);
    setHistoryVersion(v => v + 1);
    setActiveDeck(prev => prev ? { ...prev, slides: updater(prev.slides) } : prev);
  };

  const handleUndo = () => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const previous = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [slidesRef.current, ...h.future].slice(0, HISTORY_LIMIT);
    if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
    setActiveDeck(prev => prev ? { ...prev, slides: previous } : prev);
    setSelectedObjectId(null);
    setHistoryVersion(v => v + 1);
  };

  const handleRedo = () => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, slidesRef.current].slice(-HISTORY_LIMIT);
    if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
    setActiveDeck(prev => prev ? { ...prev, slides: next } : prev);
    setSelectedObjectId(null);
    setHistoryVersion(v => v + 1);
  };

  const canUndo = useMemo(() => historyRef.current.past.length > 0, [historyVersion]);
  const canRedo = useMemo(() => historyRef.current.future.length > 0, [historyVersion]);

  // Cmd/Ctrl+Z 되돌리기, Cmd/Ctrl+Shift+Z(또는 Ctrl+Y) 다시하기 — 입력창/텍스트편집 중에는 브라우저 기본 되돌리기에 맡긴다
  useEffect(() => {
    if (view !== 'editor') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isUndoKey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
      const isRedoKey = (e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey));
      if (!isUndoKey && !isRedoKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      e.preventDefault();
      if (isRedoKey) handleRedo();
      else handleUndo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view]);

  const handleAddSlide = (afterIndex?: number) => {
    const template = getTemplate(activeTemplateId);
    const newSlide = instantiateSlide(template, 'textOnly');
    if (afterIndex === undefined) {
      updateSlides(slides => [...slides, newSlide]);
      setActiveSlideIndex(prev => (activeDeck?.slides.length ?? prev + 1));
    } else {
      updateSlides(slides => {
        const next = [...slides];
        next.splice(afterIndex + 1, 0, newSlide);
        return next;
      });
      setActiveSlideIndex(afterIndex + 1);
    }
    setSelectedObjectId(null);
  };

  const handleReorderSlides = (fromIndex: number, toIndex: number) => {
    updateSlides(slides => {
      const activeId = slides[activeSlideIndex]?.id;
      const next = [...slides];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const newActiveIndex = next.findIndex(s => s.id === activeId);
      if (newActiveIndex !== -1) setActiveSlideIndex(newActiveIndex);
      return next;
    });
  };

  const handleDuplicateSlide = (index: number) => {
    updateSlides(slides => {
      const src = slides[index];
      const clone: DeckSlide = {
        ...src,
        id: crypto.randomUUID(),
        objects: src.objects.map(o => ({ ...o, id: crypto.randomUUID() })),
      };
      const next = [...slides];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const handleDeleteSlide = (index: number) => {
    updateSlides(slides => slides.filter((_, i) => i !== index));
    setActiveSlideIndex(prev => Math.max(0, prev >= index ? prev - 1 : prev));
    setSelectedObjectId(null);
  };

  // 슬라이드 1장을 개인 저장함(slide_snippets)에 담는다 — 다른 덱을 만들 때 재사용하기 위함.
  const handleSaveSnippet = async (index: number) => {
    if (!user) return;
    const slide = activeDeck?.slides[index];
    if (!slide) return;
    const firstText = slide.objects.find(o => o.type === 'text' && o.text)?.text;
    const title = (firstText ?? '저장된 슬라이드').slice(0, 24);
    const { error } = await supabase.from('slide_snippets').insert({ teacher_id: user.id, title, slide });
    if (error) {
      console.error('[SlideDeckEditor] 저장함 담기 오류:', error);
      showSnippetToast('보관함에 담지 못했습니다. 다시 시도해주세요.', false);
    } else {
      showSnippetToast('보관함에 담았습니다', true);
    }
  };

  // 저장함에서 고른 슬라이드를 현재 활성 슬라이드 뒤에 삽입(id는 새로 발급).
  const handleInsertSnippet = (snippet: SlideSnippet) => {
    updateSlides(slides => {
      const clone: DeckSlide = {
        ...snippet.slide,
        id: crypto.randomUUID(),
        objects: snippet.slide.objects.map(o => ({ ...o, id: crypto.randomUUID() })),
      };
      const next = [...slides];
      next.splice(activeSlideIndex + 1, 0, clone);
      return next;
    });
    setActiveSlideIndex(prev => prev + 1);
    setSelectedObjectId(null);
  };

  const currentSlide = activeDeck?.slides[activeSlideIndex];

  const handleUpdateObject = (id: string, changes: Partial<SlideObject>) => {
    updateSlides(slides => slides.map((s, i) => i !== activeSlideIndex ? s : {
      ...s, objects: s.objects.map(o => o.id === id ? { ...o, ...changes } : o),
    }));
  };

  const handleDeleteObject = (id: string) => {
    updateSlides(slides => slides.map((s, i) => i !== activeSlideIndex ? s : {
      ...s, objects: s.objects.filter(o => o.id !== id),
    }));
    setSelectedObjectId(null);
  };

  const handleUpdateSlide = (changes: Partial<DeckSlide>) => {
    updateSlides(slides => slides.map((s, i) => i !== activeSlideIndex ? s : { ...s, ...changes }));
  };

  const handleBgImageFile = async (file: File) => {
    setBgUploading(true);
    const publicUrl = await uploadSlideImage(file);
    setBgUploading(false);
    if (publicUrl) handleUpdateSlide({ bgImage: publicUrl, bgImageOpacity: currentSlide?.bgImageOpacity ?? 1 });
  };

  const addObject = (type: SlideObjectType, emoji?: string) => {
    if (!currentSlide) return;
    const maxZ = currentSlide.objects.reduce((m, o) => Math.max(m, o.zIndex), 0);
    const base = { id: crypto.randomUUID(), zIndex: maxZ + 1 };
    const obj: SlideObject =
      type === 'text' ? { ...base, type: 'text', x: 380, y: 300, width: 520, height: 140, text: '텍스트를 입력하세요', style: { fontSize: 26, align: 'left' } } :
      type === 'image' ? { ...base, type: 'image', x: 400, y: 260, width: 480, height: 320 } :
      type === 'link' ? { ...base, type: 'link', x: 420, y: 320, width: 380, height: 90, text: '링크 제목', href: 'https://' } :
      type === 'code' ? { ...base, type: 'code', x: 340, y: 240, width: 600, height: 280, text: '', codeLang: 'Python', style: { fontSize: 18 } } :
      type === 'youtube' ? { ...base, type: 'youtube', x: 320, y: 180, width: 640, height: 360, src: '' } :
      { ...base, type: 'emoji', x: 500, y: 260, width: 160, height: 160, text: emoji ?? '🙂' };
    updateSlides(slides => slides.map((s, i) => i !== activeSlideIndex ? s : { ...s, objects: [...s.objects, obj] }));
    setSelectedObjectId(obj.id);
  };

  // ── 템플릿 디자인 적용(기존 슬라이드 전체에 배색만 교체) ────────────────────────
  const handleApplyTemplate = (templateId: string) => {
    if (activeDeck) updateSlides(slides => applyTemplateToDeck({ ...activeDeck, slides }, templateId).slides);
    setActiveTemplateId(templateId);
    setShowApplyTemplateModal(false);
  };

  const handleExportPptx = async () => {
    if (!activeDeck || exporting) return;
    setExporting('pptx');
    try {
      await exportDeckToPptx(activeDeck);
    } catch {
      alert('PPT 파일을 만드는 중 오류가 발생했습니다.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!activeDeck || exporting) return;
    setExporting('pdf');
    try {
      await exportDeckToPdf(activeDeck);
    } catch {
      alert('PDF 파일을 만드는 중 오류가 발생했습니다.');
    } finally {
      setExporting(null);
    }
  };

  const selectedObject = currentSlide?.objects.find(o => o.id === selectedObjectId) ?? null;

  const updateSelectedStyle = (changes: Partial<NonNullable<SlideObject['style']>>) => {
    if (!selectedObject) return;
    handleUpdateObject(selectedObject.id, { style: { ...selectedObject.style, ...changes } });
  };

  // ── 렌더 ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ padding: '4px 2px' }}>
        <LimitToast message={limitToastMessage} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>슬라이드 만들기</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={pptxFileRef}
              type="file"
              accept=".pptx"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleImportPptxFile(f);
              }}
            />
            <button
              onClick={() => pptxFileRef.current?.click()}
              disabled={importingPptx}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', cursor: importingPptx ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: importingPptx ? 0.6 : 1 }}
            >
              {importingPptx ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} PPT 불러오기
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              <Sparkles size={16} /> AI로 자료 가져오기
            </button>
            <button
              onClick={() => setView('template')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              <Plus size={16} /> 새 슬라이드
            </button>
          </div>
        </div>
        {loadingList ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: '#9CA3AF' }}><Loader2 className="animate-spin" size={24} /></div>
        ) : decks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
            <LayoutGrid size={36} style={{ margin: '0 auto 12px' }} />
            <p>아직 만든 슬라이드가 없습니다. 새 슬라이드로 시작해보세요.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {decks.map(d => (
              <div key={d.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <div onClick={() => handleOpenDeck(d.id)} style={{ height: 110, background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                  {d.thumbnail_url ? <img src={d.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LayoutGrid size={28} />}
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <button onClick={() => handleDeleteDeck(d.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {importingPptx && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)', zIndex: 9995,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <Loader2 className="animate-spin" size={32} color="#3B82F6" />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>파워포인트 파일을 변환하고 있어요...</p>
          </div>
        )}
        {showImportModal && (
          <ImportMaterialModal
            userId={user?.id ?? ''}
            onSelect={material => { setImportedMaterial(material); setView('template'); }}
            onClose={() => setShowImportModal(false)}
          />
        )}
      </div>
    );
  }

  if (view === 'template') {
    return (
      <div style={{ padding: '4px 2px', position: 'relative' }}>
        <LimitToast message={limitToastMessage} />
        <button
          onClick={() => { setView('list'); setImportedMaterial(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, marginBottom: 16 }}
        >
          <ArrowLeft size={16} /> 목록으로
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>템플릿을 선택하세요</h2>
        {importedMaterial && (
          <p style={{ fontSize: 13, color: '#3B82F6', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> '{importedMaterial.title}' 자료로 AI 초안을 만듭니다
          </p>
        )}
        <TemplateGallery onSelect={importedMaterial ? handlePickTemplateForMaterial : handleCreateFromTemplate} />
      </div>
    );
  }

  if (view === 'planning') {
    return (
      <div style={{ padding: '4px 2px', position: 'relative' }}>
        <LimitToast message={limitToastMessage} />
        <button
          onClick={() => { setView('template'); setPlanOutline(null); setPendingTemplateId(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, marginBottom: 16 }}
        >
          <ArrowLeft size={16} /> 다른 템플릿 선택
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>슬라이드 구성을 확인하세요</h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          AI가 만든 구성안을 자유롭게 수정한 뒤 승인하면, 이 순서대로 실제 슬라이드가 만들어집니다. 카드를 드래그해서 순서를 바꿀 수 있어요.
        </p>
        {planLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 0', color: '#6b7280' }}>
            <Loader2 className="animate-spin" size={28} color="#3B82F6" />
            <p style={{ fontSize: 13, fontWeight: 600 }}>AI가 슬라이드 구성안을 만들고 있어요...</p>
          </div>
        ) : planOutline && (
          <>
            <div style={{ maxWidth: 640 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <input
                  value={planOutline.title}
                  onChange={e => updatePlanTitle(e.target.value)}
                  placeholder="슬라이드 전체 제목"
                  style={{ flex: 1, fontSize: 16, fontWeight: 700, border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', color: '#111827' }}
                />
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#3B82F6', background: '#EFF6FF', borderRadius: 999, padding: '6px 12px' }}>
                  총 {planOutline.slides.length}장
                </span>
              </div>
              <button
                onClick={() => { setShowGlobalRevise(v => !v); setGlobalRevisePrompt(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: showGlobalRevise ? '#EFF6FF' : '#fff', color: '#3B82F6', border: '1px solid #93C5FD', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}
              >
                <Wand2 size={13} /> 전체 슬라이드 AI로 다시쓰기
              </button>
              {showGlobalRevise && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, marginTop: -6 }}>
                  <input
                    value={globalRevisePrompt}
                    onChange={e => setGlobalRevisePrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !revisingAllSlides) handleReviseAllSlides(); }}
                    placeholder="예: 더 쉬운 말로 풀어써줘 / 문장을 짧게 줄여줘 / 예시를 추가해줘"
                    autoFocus
                    disabled={revisingAllSlides}
                    style={{ flex: 1, fontSize: 13, border: '1px solid #93C5FD', borderRadius: 8, padding: '8px 12px', color: '#111827' }}
                  />
                  <button
                    onClick={handleReviseAllSlides}
                    disabled={revisingAllSlides || !globalRevisePrompt.trim()}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: revisingAllSlides || !globalRevisePrompt.trim() ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: revisingAllSlides || !globalRevisePrompt.trim() ? 0.6 : 1 }}
                  >
                    {revisingAllSlides ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 적용
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {planOutline.slides.map((slide, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={() => { dragSlideIndexRef.current = i; }}
                    onDragOver={e => { e.preventDefault(); if (dragOverSlideIndex !== i) setDragOverSlideIndex(i); }}
                    onDragLeave={() => setDragOverSlideIndex(prev => (prev === i ? null : prev))}
                    onDrop={e => { e.preventDefault(); handlePlanSlideDrop(i); }}
                    onDragEnd={() => { dragSlideIndexRef.current = null; setDragOverSlideIndex(null); }}
                    style={{
                      display: 'flex', gap: 10, border: dragOverSlideIndex === i ? '1.5px dashed #3B82F6' : '1px solid #e5e7eb',
                      borderRadius: 12, background: '#fff', padding: '14px 14px 14px 8px',
                      opacity: dragSlideIndexRef.current === i ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2, cursor: 'grab', color: '#cbd5e1', flexShrink: 0 }}>
                      <GripVertical size={16} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF' }}>{i + 1}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        value={slide.subtitle}
                        onChange={e => updatePlanSlideSubtitle(i, e.target.value)}
                        placeholder="소제목"
                        style={{ width: '100%', fontSize: 14, fontWeight: 600, border: '1px solid #e5e7eb', borderRadius: 6, padding: '7px 10px', marginBottom: 6, color: '#111827' }}
                      />
                      <textarea
                        value={slide.content.join('\n')}
                        onChange={e => updatePlanSlideContent(i, e.target.value)}
                        placeholder="이 슬라이드에 들어갈 핵심 내용을 한 줄에 하나씩 적으세요"
                        rows={Math.max(2, slide.content.length)}
                        style={{ width: '100%', fontSize: 13, color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, padding: '7px 10px', resize: 'vertical', lineHeight: 1.6 }}
                      />
                      <button
                        onClick={() => toggleSlideReviseInput(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', padding: '2px 0', fontSize: 12, fontWeight: 600 }}
                      >
                        <Wand2 size={12} /> AI로 수정
                      </button>
                      {openReviseIndex === i && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input
                            value={slideRevisePrompt}
                            onChange={e => setSlideRevisePrompt(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && revisingSlideIndex === null) handleReviseSlide(i); }}
                            placeholder="예: 실험 순서를 단계별로 나눠줘"
                            autoFocus
                            disabled={revisingSlideIndex === i}
                            style={{ flex: 1, fontSize: 12.5, border: '1px solid #93C5FD', borderRadius: 6, padding: '6px 10px', color: '#111827' }}
                          />
                          <button
                            onClick={() => handleReviseSlide(i)}
                            disabled={revisingSlideIndex === i || !slideRevisePrompt.trim()}
                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: revisingSlideIndex === i || !slideRevisePrompt.trim() ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, opacity: revisingSlideIndex === i || !slideRevisePrompt.trim() ? 0.6 : 1 }}
                          >
                            {revisingSlideIndex === i ? <Loader2 size={12} className="animate-spin" /> : '적용'}
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removePlanSlide(i)}
                      title="이 슬라이드 삭제"
                      style={{ flexShrink: 0, alignSelf: 'flex-start', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 4 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addPlanSlide}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, background: '#fff', color: '#3B82F6', border: '1px dashed #93C5FD', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, width: '100%', justifyContent: 'center' }}
              >
                <Plus size={15} /> 슬라이드 추가
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                onClick={() => pendingTemplateId && handleCreateDraftFromMaterial(pendingTemplateId, planOutline)}
                disabled={planOutline.slides.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: planOutline.slides.length === 0 ? '#93C5FD' : '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: planOutline.slides.length === 0 ? 'default' : 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                <Check size={16} /> 이 구성대로 만들기
              </button>
              <button
                onClick={() => { setView('template'); setPlanOutline(null); setPendingTemplateId(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                다른 템플릿 선택
              </button>
            </div>
          </>
        )}
        {aiGenerating && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)', zIndex: 9995,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <Loader2 className="animate-spin" size={32} color="#3B82F6" />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>AI가 슬라이드 초안을 만들고 있어요...</p>
          </div>
        )}
      </div>
    );
  }

  if (view === 'editor' && activeDeck && currentSlide) {
    return (
      <div className="@container" style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
        {snippetToast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: snippetToast.ok ? '#1E293B' : '#B91C1C', color: '#fff', borderRadius: 12, padding: '12px 20px',
            fontSize: 13, fontWeight: 600, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)', maxWidth: '90vw', textAlign: 'center',
          }}>
            <span>{snippetToast.ok ? '✅' : '⚠️'}</span>
            {snippetToast.text}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <button
              onClick={handleBackToList}
              title="슬라이드 목록으로"
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: 999, cursor: 'pointer', color: '#475569', padding: '6px 10px', fontSize: 12, fontWeight: 600 }}
            >
              <ArrowLeft size={14} /> <span className="hidden @[1180px]:inline">목록</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                title="되돌리기 (Cmd/Ctrl+Z)"
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', borderRadius: 6, padding: 6, cursor: canUndo ? 'pointer' : 'default', color: canUndo ? '#475569' : '#d1d5db' }}
              >
                <Undo2 size={16} />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                title="다시하기 (Cmd/Ctrl+Shift+Z)"
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', borderRadius: 6, padding: 6, cursor: canRedo ? 'pointer' : 'default', color: canRedo ? '#475569' : '#d1d5db' }}
              >
                <Redo2 size={16} />
              </button>
            </div>
            <input
              value={activeDeck.title}
              onChange={e => setActiveDeck(prev => prev ? { ...prev, title: e.target.value } : prev)}
              style={{ fontSize: 16, fontWeight: 700, border: 'none', outline: 'none', flex: 1, minWidth: 0 }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            {saveState === 'saving' ? '저장 중...' : saveState === 'saved' ? '저장됨' : ''}
          </span>
          {cameFromIdeaRecord && (
            <button
              onClick={() => navigate('/dashboard')}
              title="아이디어 기록 페이지로 돌아갑니다"
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              <Lightbulb size={14} /> <span className="hidden @[1180px]:inline">아이디어 기록으로</span>
            </button>
          )}
          <button
            onClick={() => setShowSnippetLibrary(true)}
            title="슬라이드 보관함"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Bookmark size={14} /> <span className="hidden @[1180px]:inline">슬라이드 보관함</span>
          </button>
          <button
            onClick={() => setShowApplyTemplateModal(true)}
            title="템플릿 디자인 적용"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Palette size={14} /> <span className="hidden @[1180px]:inline">템플릿 디자인 적용</span>
          </button>
          <button
            onClick={handleExportPptx}
            disabled={!!exporting}
            title="PPT 다운로드"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: exporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: exporting && exporting !== 'pptx' ? 0.5 : 1 }}
          >
            {exporting === 'pptx' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={14} />}
            <span className="hidden @[1180px]:inline">PPT 다운로드</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={!!exporting}
            title="PDF 다운로드"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: exporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: exporting && exporting !== 'pdf' ? 0.5 : 1 }}
          >
            {exporting === 'pdf' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={14} />}
            <span className="hidden @[1180px]:inline">PDF 다운로드</span>
          </button>
          <button
            onClick={() => setPresenting(true)}
            title="발표 시작"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Play size={14} /> <span className="hidden @[1180px]:inline">발표 시작</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button onClick={() => addObject('text')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <Type size={14} /> 텍스트 추가
          </button>
          <button onClick={() => addObject('image')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <ImageIcon size={14} /> 이미지 추가
          </button>
          <button onClick={() => addObject('link')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <Link2 size={14} /> 링크 추가
          </button>
          <button onClick={() => addObject('code')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <Code2 size={14} /> 코드 추가
          </button>
          <button onClick={() => addObject('youtube')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <SquarePlay size={14} /> 유튜브 추가
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setEmojiPickerOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
              <Smile size={14} /> 이모지 추가
            </button>
            {emojiPickerOpen && (
              <EmojiPickerPopover
                onSelect={e => addObject('emoji', e)}
                onClose={() => setEmojiPickerOpen(false)}
              />
            )}
          </div>
          <input
            ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleBgImageFile(f); e.target.value = ''; }}
          />
          <button
            onClick={() => bgFileRef.current?.click()}
            disabled={bgUploading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', background: '#fff', cursor: bgUploading ? 'default' : 'pointer', fontSize: 13 }}
          >
            {bgUploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ImagePlus size={14} />}
            {currentSlide?.bgImage ? '배경 이미지 변경' : '배경 이미지'}
          </button>
          {currentSlide?.bgImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>배경 밝기</span>
              <input
                type="range" min={0} max={100}
                value={Math.round((currentSlide.bgImageOpacity ?? 1) * 100)}
                onChange={e => handleUpdateSlide({ bgImageOpacity: Number(e.target.value) / 100 })}
                style={{ width: 100 }}
              />
              <span style={{ fontSize: 12, color: '#6b7280', width: 32 }}>{Math.round((currentSlide.bgImageOpacity ?? 1) * 100)}%</span>
              <button
                onClick={() => handleUpdateSlide({ bgImage: undefined, bgImageOpacity: undefined })}
                title="배경 이미지 제거"
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}
              >
                <XIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'image' || selectedObject.type === 'emoji') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          {selectedObject?.type === 'text' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min={12} max={120}
                value={selectedObject.style?.fontSize ?? 24}
                onChange={e => updateSelectedStyle({ fontSize: Number(e.target.value) })}
                style={{ width: 56, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
              />
              <button onClick={() => updateSelectedStyle({ bold: !selectedObject.style?.bold })}
                style={{ fontWeight: 700, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', background: selectedObject.style?.bold ? '#111' : '#fff', color: selectedObject.style?.bold ? '#fff' : '#111', cursor: 'pointer' }}>
                B
              </button>
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} onClick={() => updateSelectedStyle({ align: a })}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, background: selectedObject.style?.align === a ? '#111' : '#fff', color: selectedObject.style?.align === a ? '#fff' : '#111', cursor: 'pointer' }}>
                  {a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'}
                </button>
              ))}
              <input
                type="color"
                value={selectedObject.style?.color ?? '#ffffff'}
                onChange={e => updateSelectedStyle({ color: e.target.value })}
                style={{ width: 32, height: 30, border: '1px solid #e5e7eb', borderRadius: 6, padding: 0, cursor: 'pointer' }}
              />
            </div>
          )}
          {selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'image' || selectedObject.type === 'emoji') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: selectedObject.type === 'text' ? 8 : 0, borderLeft: selectedObject.type === 'text' ? '1px solid #e5e7eb' : 'none' }}>
              <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>투명도</span>
              <input
                type="range" min={0} max={100}
                value={Math.round((selectedObject.style?.opacity ?? 1) * 100)}
                onChange={e => updateSelectedStyle({ opacity: Number(e.target.value) / 100 })}
                style={{ width: 100 }}
              />
              <span style={{ fontSize: 12, color: '#6b7280', width: 32 }}>{Math.round((selectedObject.style?.opacity ?? 1) * 100)}%</span>
            </div>
          )}
          {selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'image' || selectedObject.type === 'emoji') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid #e5e7eb' }}>
              <Link2 size={14} color="#6b7280" />
              <input
                type="text"
                placeholder="링크 주소(https://...)"
                value={selectedObject.href ?? ''}
                onChange={e => handleUpdateObject(selectedObject.id, { href: e.target.value || undefined })}
                style={{ width: 200, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
              />
              {selectedObject.href && (
                <>
                  <button
                    onClick={() => window.open(selectedObject.href, '_blank', 'noopener,noreferrer')}
                    title="새 탭에서 열기"
                    style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#3B82F6' }}
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() => handleUpdateObject(selectedObject.id, { href: undefined })}
                    title="링크 제거"
                    style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}
                  >
                    <XIcon size={14} />
                  </button>
                </>
              )}
            </div>
          )}
          </div>
        )}
        </div>

        <div ref={stageRowRef} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', height: stageAreaHeight }}>
          <SlideThumbnailRail
            slides={activeDeck.slides}
            activeIndex={activeSlideIndex}
            onSelect={i => { setActiveSlideIndex(i); setSelectedObjectId(null); }}
            onAdd={handleAddSlide}
            onDuplicate={handleDuplicateSlide}
            onDelete={handleDeleteSlide}
            onReorder={handleReorderSlides}
            onSaveToLibrary={handleSaveSnippet}
          />
          <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
            <SlideStage
              slide={currentSlide}
              editable
              selectedId={selectedObjectId}
              onSelect={setSelectedObjectId}
              onUpdateObject={handleUpdateObject}
              onDeleteObject={handleDeleteObject}
              fitContainer
              zoom={manualZoom}
              onScaleChange={setRenderedScale}
            />
            <div style={{
              position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 2,
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, padding: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <button
                onClick={() => setManualZoom(Math.max(0.3, Number((renderedScale - 0.1).toFixed(2))))}
                title="축소"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'none', borderRadius: 999, cursor: 'pointer', color: '#374151' }}
              >
                <ZoomOut size={15} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 42, textAlign: 'center' }}>
                {Math.round(renderedScale * 100)}%
              </span>
              <button
                onClick={() => setManualZoom(Math.min(2.5, Number((renderedScale + 0.1).toFixed(2))))}
                title="확대"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'none', borderRadius: 999, cursor: 'pointer', color: '#374151' }}
              >
                <ZoomIn size={15} />
              </button>
              <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />
              <button
                onClick={() => setManualZoom(null)}
                disabled={manualZoom === null}
                title="화면에 맞춤"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'none', borderRadius: 999, cursor: manualZoom === null ? 'default' : 'pointer', color: manualZoom === null ? '#c7cdd6' : '#374151' }}
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {presenting && (
          <PresentationView
            slides={activeDeck.slides}
            startIndex={activeSlideIndex}
            onClose={() => setPresenting(false)}
          />
        )}

        {showApplyTemplateModal && (
          <div
            onClick={() => setShowApplyTemplateModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9996, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 900, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>템플릿 디자인 적용</h3>
                <button onClick={() => setShowApplyTemplateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><XIcon size={18} /></button>
              </div>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                선택한 템플릿의 배경과 글자 색상이 이 슬라이드 전체({activeDeck.slides.length}장)에 적용됩니다.
                오브젝트의 위치·크기·내용은 그대로 유지되고, 배경 이미지는 제거됩니다.
              </p>
              <TemplateGallery onSelect={handleApplyTemplate} />
            </div>
          </div>
        )}

        {showSnippetLibrary && (
          <SlideSnippetLibrary
            userId={user?.id ?? ''}
            onInsert={handleInsertSnippet}
            onClose={() => setShowSnippetLibrary(false)}
          />
        )}
      </div>
    );
  }

  return null;
}
