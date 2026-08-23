import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Type, Image as ImageIcon, Link2, Smile, Code2, SquarePlay, Play, Trash2, Loader2, LayoutGrid, Sparkles, ImagePlus, X as XIcon, FileDown, FileText, FileUp, Palette, ExternalLink, Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, checkIsBasicOrAbove } from '../../lib/auth';
import type { SlideDeck, DeckSlide, SlideObject, SlideObjectType, SlideLayoutKind } from '../../components/slidedeck/types';
import { SLIDE_TEMPLATES, getTemplate, instantiateSlide, getLayoutSlotSpec, buildDraftDeckSlides, applyTemplateToDeck } from '../../components/slidedeck/templates';
import TemplateGallery from '../../components/slidedeck/TemplateGallery';
import SlideThumbnailRail from '../../components/slidedeck/SlideThumbnailRail';
import SlideStage from '../../components/slidedeck/SlideStage';
import PresentationView from '../../components/slidedeck/PresentationView';
import EmojiPickerPopover from '../../components/slidedeck/EmojiPickerPopover';
import ImportMaterialModal, { type ImportableMaterial } from '../../components/slidedeck/ImportMaterialModal';
import { generateSlideDeckDraft, embedText } from '../../lib/gemini';
import { uploadSlideImage } from '../../components/slidedeck/utils/imageUpload';
import { exportDeckToPptx } from '../../components/slidedeck/utils/exportPptx';
import { exportDeckToPdf } from '../../components/slidedeck/utils/exportPdf';
import { parsePptxFile } from '../../components/slidedeck/utils/importPptx';
import LimitToast, { useLimitToast } from '../../components/ui/LimitToast';

type View = 'list' | 'template' | 'editor';

const ALL_LAYOUT_KINDS: SlideLayoutKind[] = ['title', 'textOnly', 'textImage1', 'textImagesMany'];

// class_materials.ai_versions 중 mode:'presentation' 최신본이 있으면 그걸, 없으면 원문(content)을 초안 원본으로 사용
const resolveSourceContent = (material: ImportableMaterial): string => {
  const presentationVersions = (material.ai_versions ?? []).filter(v => v.mode === 'presentation');
  if (presentationVersions.length > 0) {
    const latest = [...presentationVersions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return latest.content;
  }
  return material.content ?? '';
};

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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedMaterial, setImportedMaterial] = useState<ImportableMaterial | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [exporting, setExporting] = useState<'pptx' | 'pdf' | null>(null);
  const [importingPptx, setImportingPptx] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const pptxFileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── 덱 생성 ────────────────────────────────────────────────────────────
  const canCreateDeck = () => {
    if (checkIsBasicOrAbove(profile)) return true;
    if (decks.length >= FREE_SLIDE_DECK_LIMIT) {
      showLimitToast(`무료 플랜은 슬라이드덱을 최대 ${FREE_SLIDE_DECK_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
      return false;
    }
    return true;
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    if (!user) return;
    if (!canCreateDeck()) return;
    const template = getTemplate(templateId);
    const firstSlide = instantiateSlide(template, 'title');
    const { data, error } = await supabase
      .from('slide_decks')
      .insert({ teacher_id: user.id, title: '제목 없는 슬라이드', slides: [firstSlide] })
      .select()
      .single();
    if (error || !data) return;
    syncSlideDeckEmbedding((data as SlideDeck).id, (data as SlideDeck).title, (data as SlideDeck).slides);
    setActiveTemplateId(templateId);
    setActiveDeck(data as SlideDeck);
    setActiveSlideIndex(0);
    setSelectedObjectId(null);
    setView('editor');
    loadDecks();
  };

  // ── AI 초안 생성 (자료 에디터에서 가져오기) ────────────────────────────────
  const handleCreateDraftFromMaterial = async (templateId: string) => {
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
        importedMaterial.class_id ?? undefined
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
    setView('list');
    loadDecks();
  };

  // ── 슬라이드 조작 ──────────────────────────────────────────────────────
  const updateSlides = (updater: (slides: DeckSlide[]) => DeckSlide[]) => {
    setActiveDeck(prev => prev ? { ...prev, slides: updater(prev.slides) } : prev);
  };

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
    setActiveDeck(prev => prev ? applyTemplateToDeck(prev, templateId) : prev);
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
        <TemplateGallery onSelect={importedMaterial ? handleCreateDraftFromMaterial : handleCreateFromTemplate} />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <button
              onClick={handleBackToList}
              title="슬라이드 목록으로"
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: 999, cursor: 'pointer', color: '#475569', padding: '6px 10px', fontSize: 12, fontWeight: 600 }}
            >
              <ArrowLeft size={14} /> 목록
            </button>
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
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              <Lightbulb size={14} /> 아이디어 기록으로
            </button>
          )}
          <button
            onClick={() => setShowApplyTemplateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Palette size={14} /> 템플릿 디자인 적용
          </button>
          <button
            onClick={handleExportPptx}
            disabled={!!exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: exporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: exporting && exporting !== 'pptx' ? 0.5 : 1 }}
          >
            {exporting === 'pptx' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={14} />}
            PPT 다운로드
          </button>
          <button
            onClick={handleExportPdf}
            disabled={!!exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: exporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: exporting && exporting !== 'pdf' ? 0.5 : 1 }}
          >
            {exporting === 'pdf' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={14} />}
            PDF 다운로드
          </button>
          <button
            onClick={() => setPresenting(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Play size={14} /> 발표 시작
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

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <SlideThumbnailRail
            slides={activeDeck.slides}
            activeIndex={activeSlideIndex}
            onSelect={i => { setActiveSlideIndex(i); setSelectedObjectId(null); }}
            onAdd={handleAddSlide}
            onDuplicate={handleDuplicateSlide}
            onDelete={handleDeleteSlide}
            onReorder={handleReorderSlides}
          />
          <div style={{ flex: 1, maxWidth: 960 }}>
            <SlideStage
              slide={currentSlide}
              editable
              selectedId={selectedObjectId}
              onSelect={setSelectedObjectId}
              onUpdateObject={handleUpdateObject}
              onDeleteObject={handleDeleteObject}
            />
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
      </div>
    );
  }

  return null;
}
