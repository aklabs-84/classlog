import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, FileUp, Sparkles } from 'lucide-react';
import type { SlideTemplate, DeckSlide } from './types';
import SlideStage from './SlideStage';
import AiCreditCost from '../common/AiCreditCost';
import { recommendSlidePlanDesign } from '../../lib/gemini';
import type { SlideOutlinePlan } from '../../lib/gemini';
import OutlineModePicker from './OutlineModePicker';
import type { SlideOutlineMode } from '../../lib/gemini';

// 슬라이드 기획서 — 앱 안에서 슬라이드를 만들지 않고, 장마다 내용·배치·그림 스타일을 카드로 고른 뒤
// 다른 AI(Gemini·NotebookLM 등)에 붙여넣을 문장으로 복사하는 화면. AI 호출 없음(개요는 이미 승인된 것을 재사용).

const LAYOUTS = [
  { key: 'text', label: '글만', desc: '이미지 없이 글 중심', hint: '글 중심 화면(이미지 없음)' },
  { key: 'img-left', label: '이미지 왼쪽', desc: '왼쪽 그림 + 오른쪽 글', hint: '왼쪽에 이미지, 오른쪽에 글' },
  { key: 'img-right', label: '이미지 오른쪽', desc: '왼쪽 글 + 오른쪽 그림', hint: '왼쪽에 글, 오른쪽에 이미지' },
  { key: 'screenshot', label: '스크린샷 크게', desc: '화면 캡처를 크게', hint: '화면 캡처(스크린샷)를 크게 넣고 짧은 설명을 곁들임' },
] as const;

const STYLES = [
  { key: 'flat', label: '단순 일러스트', prompt: 'flat vector illustration, simple shapes, clean lines, friendly colors' },
  { key: '3d', label: '말랑한 3D', prompt: 'soft 3D render, rounded clay-like shapes, pastel colors, gentle lighting' },
  { key: 'watercolor', label: '수채화', prompt: 'soft watercolor painting, light washes, gentle edges, warm paper texture' },
  { key: 'pixel', label: '픽셀 게임', prompt: 'retro pixel art, 16-bit game style, bright limited palette' },
  { key: 'photo', label: '실제 사진처럼', prompt: 'realistic photograph, natural light, shallow depth of field, high quality' },
  { key: 'doodle', label: '손그림 낙서', prompt: 'hand-drawn doodle sketch, marker lines, white background, playful' },
] as const;


// 그림 스타일 느낌을 보여주는 작은 예시(전구 그림) — 실제 생성 결과가 아니라 분위기 참고용
function StyleSample({ k }: { k: string }) {
  const bulb = (fill: string, stroke = 'none', sw = 0) => (
    <>
      <circle cx="40" cy="30" r="15" fill={fill} stroke={stroke} strokeWidth={sw} />
      <rect x="33" y="43" width="14" height="9" rx="2" fill={fill} stroke={stroke} strokeWidth={sw} />
    </>
  );
  let body: React.ReactNode;
  switch (k) {
    case '3d':
      body = (<>
        <defs><radialGradient id="g3" cx="35%" cy="30%"><stop offset="0" stopColor="#fff7c2" /><stop offset="1" stopColor="#f5b942" /></radialGradient></defs>
        <rect width="80" height="60" fill="#e8f0ff" />
        <ellipse cx="40" cy="54" rx="16" ry="3" fill="#b8c4e0" />
        <circle cx="40" cy="30" r="16" fill="url(#g3)" /><rect x="33" y="43" width="14" height="9" rx="4" fill="#c7cfe6" />
      </>); break;
    case 'watercolor':
      body = (<>
        <defs><filter id="wc"><feGaussianBlur stdDeviation="2.2" /></filter></defs>
        <rect width="80" height="60" fill="#fbf6ec" />
        <g filter="url(#wc)" opacity="0.8"><circle cx="34" cy="28" r="15" fill="#f6c453" /><circle cx="48" cy="32" r="12" fill="#f0897a" opacity="0.7" /><rect x="30" y="42" width="18" height="9" fill="#7aa7d9" /></g>
      </>); break;
    case 'pixel':
      body = (<g shapeRendering="crispEdges">
        <rect width="80" height="60" fill="#1f2a44" />
        <rect x="32" y="12" width="16" height="4" fill="#ffd84d" /><rect x="28" y="16" width="24" height="16" fill="#ffd84d" /><rect x="32" y="32" width="16" height="4" fill="#ffd84d" />
        <rect x="32" y="40" width="16" height="4" fill="#9aa5c4" /><rect x="34" y="44" width="12" height="4" fill="#6b7699" />
      </g>);break;
    case 'photo':
      body = (<>
        <defs><filter id="bk"><feGaussianBlur stdDeviation="3" /></filter><radialGradient id="vg"><stop offset="0.6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.45" /></radialGradient></defs>
        <rect width="80" height="60" fill="#3b4a5e" />
        <g filter="url(#bk)"><circle cx="12" cy="14" r="8" fill="#ffd89a" /><circle cx="66" cy="12" r="6" fill="#9ad0ff" /><circle cx="70" cy="46" r="9" fill="#ffb38a" /></g>
        {bulb('#ffe9a8')}
        <rect width="80" height="60" fill="url(#vg)" />
      </>); break;
    case 'doodle':
      body = (<>
        <rect width="80" height="60" fill="#fff" />
        <path d="M26 30 C26 14 54 14 54 30 C54 36 48 38 47 43 L33 43 C32 38 26 36 26 30 Z" fill="none" stroke="#222" strokeWidth="2" strokeLinecap="round" />
        <path d="M34 47 L46 47 M35 51 L45 51" stroke="#222" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 4 L40 9 M18 12 L22 16 M62 12 L58 16" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" />
      </>); break;
    default:
      body = (<>
        <rect width="80" height="60" fill="#eaf4ff" />
        {bulb('#ffc83d')}
        <rect x="35" y="53" width="10" height="3" rx="1.5" fill="#6b7280" />
      </>);
  }
  return <svg viewBox="0 0 80 60" width="100%" style={{ display: 'block', borderRadius: 6, marginBottom: 6 }} aria-hidden="true">{body}</svg>;
}

// 화면 배치 미니 도해
function LayoutSample({ k }: { k: string }) {
  const txt = (x: number, w: number) => (<>{[12, 20, 28].map(y => <rect key={y} x={x} y={y} width={w} height="4" rx="2" fill="#9ca3af" />)}</>);
  const img = (x: number, w: number) => <rect x={x} y="8" width={w} height="34" rx="3" fill="#93c5fd" />;
  let body: React.ReactNode;
  if (k === 'img-left') body = (<>{img(6, 30)}{txt(42, 32)}</>);
  else if (k === 'img-right') body = (<>{txt(6, 32)}{img(44, 30)}</>);
  else if (k === 'screenshot') body = (<><rect x="6" y="6" width="68" height="30" rx="3" fill="#93c5fd" />{[40].map(y => <rect key={y} x="6" y={y} width="40" height="4" rx="2" fill="#9ca3af" />)}</>);
  else body = (<><rect x="6" y="8" width="40" height="5" rx="2.5" fill="#6b7280" />{txt(6, 66)}</>);
  return <svg viewBox="0 0 80 50" width="100%" style={{ display: 'block', background: '#f3f4f6', borderRadius: 6, marginBottom: 6 }} aria-hidden="true">{body}</svg>;
}

type LayoutKey = typeof LAYOUTS[number]['key'];
type StyleKey = typeof STYLES[number]['key'];

interface PlanSlide {
  imgIdx: number[];     // 원문에서 이 장에 속한 그림 번호
  codeIdx: number[];    // 원문에서 이 장에 속한 코드 번호
  title: string;
  points: string;       // 줄바꿈으로 구분한 핵심 문장
  layout: LayoutKey;
  composition: string;  // 템플릿 구성 이름(선택)
  imageNote: string;    // 이미지에 담을 것
  style: StyleKey;
}

const card = (selected: boolean): React.CSSProperties => ({
  textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '10px 12px',
  border: selected ? '2px solid #3B82F6' : '1px solid #e5e7eb',
  background: selected ? '#EFF6FF' : '#fff', color: '#111827', fontSize: 13, lineHeight: 1.5,
});

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.6,
};

function usesImage(layout: LayoutKey) { return layout !== 'text'; }

function imagePrompt(s: PlanSlide): string {
  const style = STYLES.find(x => x.key === s.style)!;
  const what = s.imageNote.trim() || s.title;
  return `${what}, ${style.prompt}, no text, no letters, 16:9 composition, safe margins`;
}

function slideBlock(s: PlanSlide, i: number, media?: SlideOutlinePlan['media']): string {
  const layout = LAYOUTS.find(l => l.key === s.layout)!;
  const lines = [`[슬라이드 ${i + 1}] ${s.title}`];
  const pts = s.points.split('\n').map(x => x.trim()).filter(Boolean);
  if (pts.length) lines.push(...pts.map(p => `- ${p}`));
  lines.push(`배치: ${layout.hint}${s.composition ? ` (템플릿 구성: ${s.composition})` : ''}`);
  if (s.imgIdx.length) lines.push(`원본 그림 ${s.imgIdx.length}장 포함: 이 장에는 선생님이 가져온 원본 그림이 들어갑니다. 그림 자리를 비워 두세요(나중에 직접 넣습니다).`);
  (s.codeIdx ?? []).forEach(ci => {
    const b = media?.codeBlocks[ci];
    if (b) lines.push(`코드(글자 그대로 넣기${b.lang ? `, ${b.lang}` : ''}):\n${b.code}`);
  });
  if (usesImage(s.layout)) {
    lines.push(`이미지: ${s.imageNote.trim() || '(제목에 어울리는 그림)'} / 스타일: ${STYLES.find(x => x.key === s.style)!.label}`);
    lines.push(`이미지 생성 문장: ${imagePrompt(s)}`);
  }
  return lines.join('\n');
}

export default function SlidePlanner({ template, outline, onBack, onImport, outlineMode, onOutlineModeChange }: {
  template: SlideTemplate;
  outline: SlideOutlinePlan;
  onBack: () => void;
  onImport?: () => void;
  outlineMode?: SlideOutlineMode;
  onOutlineModeChange?: (m: SlideOutlineMode) => void;
}) {
  // 구성 미리보기용: 템플릿에 준비된 구성을 작은 슬라이드로 만들어 둔다
  const compPreviews = useMemo(() => (template.showcase ?? []).map(sc => ({
    key: sc.key, label: sc.label,
    slide: { id: sc.key, bg: template.bg, textColor: template.textColor, objects: sc.objects.map((o, i) => ({ ...o, id: `${sc.key}-${i}` })) } as DeckSlide,
  })), [template]);
  const [globalStyle, setGlobalStyle] = useState<StyleKey>('flat');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [deckTitle, setDeckTitle] = useState(outline.title);
  const [slides, setSlides] = useState<PlanSlide[]>(() =>
    outline.slides.map(s => ({
      imgIdx: s.images ?? [], codeIdx: s.code ?? [],
      // 그림이 있으면 그림 배치, 코드만 있으면 화면 크게 보이는 배치를 처음 값으로 제안
      layout: ((s.images?.length ?? 0) > 0 ? 'img-right' : (s.code?.length ?? 0) > 0 ? 'screenshot' : 'text') as LayoutKey,
      title: s.subtitle, points: s.content.join('\n'),
      composition: '', imageNote: '', style: 'flat' as StyleKey,
    })),
  );
  const [cur, setCur] = useState(0);
  const addSlide = () => setSlides(prev => [...prev, { imgIdx: [], codeIdx: [], title: `슬라이드 ${prev.length + 1}`, points: '', layout: 'text', composition: '', imageNote: '', style: 'flat' }]);
  const removeSlide = (i: number) => { setSlides(prev => prev.filter((_, idx) => idx !== i)); setCur(c => Math.max(0, Math.min(c, slides.length - 2))); };
  const moveSlide = (i: number, d: -1 | 1) => setSlides(prev => {
    const j = i + d; if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const [copied, setCopied] = useState<string | null>(null);

  const applyGlobalStyle = (k: StyleKey) => { setGlobalStyle(k); setSlides(prev => prev.map(s => ({ ...s, style: k }))); };

  const askAi = async () => {
    setAiBusy(true); setAiMsg('');
    try {
      const recs = await recommendSlidePlanDesign(
        slides.map(x => ({ title: x.title, points: x.points })),
        compPreviews.map(c => ({ key: c.key, label: c.label })),
      );
      setSlides(prev => prev.map((sl, i) => {
        const r = recs[i]; if (!r) return sl;
        const label = compPreviews.find(c => c.key === r.compositionKey)?.label ?? sl.composition;
        return { ...sl, layout: r.layout, composition: label, imageNote: r.layout === 'text' ? sl.imageNote : (r.imageNote || sl.imageNote) };
      }));
      setAiMsg('AI가 골라 줬어요. 마음에 안 드는 장은 아래에서 직접 바꿀 수 있어요.');
    } catch (e: any) {
      setAiMsg(e?.message === 'AI_LIMIT_EXCEEDED' ? 'AI 크레딧이 부족해요. 직접 골라 주세요.' : 'AI 추천에 실패했어요. 잠시 뒤 다시 눌러 보세요.');
    } finally { setAiBusy(false); }
  };

  const update = (i: number, patch: Partial<PlanSlide>) =>
    setSlides(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* 복사 실패 시 아래 표시만 생략 */ }
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(prev => (prev === key ? null : prev)), 1800);
  };

  const themeLine = `템플릿: ${template.name}${template.themeName ? ` · ${template.themeName}` : ''} (배경 ${template.bg.includes('gradient') ? '그라데이션' : template.bg}, 글자색 ${template.textColor}, 강조색 ${template.accentColor})`;

  const allText = useMemo(() => {
    const styled = slides.filter(x => usesImage(x.layout));
    const styleLabel = (k: StyleKey) => STYLES.find(x => x.key === k)!.label;
    const common = styled.length ? styled.reduce<Record<string, number>>((m, x) => ({ ...m, [x.style]: (m[x.style] ?? 0) + 1 }), {}) : {};
    const main = (Object.keys(common).sort((a, b) => common[b] - common[a])[0] ?? globalStyle) as StyleKey;
    const odd = styled.filter(x => x.style !== main).map(x => `"${x.title}" 장은 ${styleLabel(x.style)}`);
    const head = [
      `아래 기획서대로 발표용 슬라이드 ${slides.length}장을 만들어 주세요.`,
      `제목: ${deckTitle}`,
      themeLine,
      styled.length ? `그림은 모든 장을 같은 스타일(${styleLabel(main)})로 통일해 주세요.${odd.length ? ` 단, ${odd.join(', ')} 스타일로 해 주세요.` : ''}` : '',
      '각 장의 글은 그대로 쓰고, 이미지 자리는 아래 "이미지 생성 문장"으로 그림을 만들어 넣어 주세요. 슬라이드 안 글자는 한 장당 짧게 유지해 주세요.',
      '',
    ].filter((l, i, a) => l !== '' || i === a.length - 1).join('\n');
    return head + slides.map((x, i) => slideBlock(x, i, outline.media)).join('\n\n');
  }, [slides, deckTitle, themeLine, globalStyle, outline.media]);

  const tableText = useMemo(() => {
    const row = (s: PlanSlide, i: number) =>
      `${i + 1} | ${s.title} | ${s.points.split('\n').filter(Boolean).join(' / ')} | ${LAYOUTS.find(l => l.key === s.layout)!.label} | ${usesImage(s.layout) ? `${s.imageNote.trim() || '-'} (${STYLES.find(x => x.key === s.style)!.label})` : '-'}`;
    return `번호 | 제목 | 내용 | 배치 | 이미지\n${slides.map(row).join('\n')}`;
  }, [slides]);

  const totalMedia = (outline.media?.imageUrls.length ?? 0) + (outline.media?.codeBlocks.length ?? 0);
  const unassignedMedia = totalMedia - outline.slides.reduce((n, x) => n + (x.images?.length ?? 0) + (x.code?.length ?? 0), 0);
  const emptySlides = slides.map((x, i) => (x.points.trim() ? -1 : i)).filter(i => i >= 0);
  const steps = ['구성 확인', '슬라이드별 설계', '복사해서 쓰기'];
  const s = slides[cur];

  return (
    <div style={{ maxWidth: 760 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
        <ArrowLeft size={16} /> 템플릿 다시 고르기
      </button>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>슬라이드 기획서</h2>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14, lineHeight: 1.6 }}>
        장마다 내용·배치·그림 스타일을 골라 기획서를 만들고, 복사해서 Gemini·NotebookLM 같은 다른 AI에 붙여넣으세요. 이 화면은 AI 크레딧을 쓰지 않아요.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {steps.map((label, i) => (
          <button key={label} onClick={() => setStep((i + 1) as 1 | 2 | 3)}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: step === i + 1 ? '#3B82F6' : '#f3f4f6', color: step === i + 1 ? '#fff' : '#4b5563' }}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{themeLine}</div>
          {onImport && (
            <button onClick={onImport} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 14, textAlign: 'left' }}>
              <FileUp size={16} /> 내 수업 가이드·자료 불러와서 구성 채우기 (AI 크레딧 사용)
            </button>
          )}
          {onImport && outlineMode && onOutlineModeChange && (
            <div style={{ marginBottom: 14 }}>
              <OutlineModePicker value={outlineMode} onChange={onOutlineModeChange} />
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: -6 }}>위에서 고른 방식은 다음에 자료를 불러올 때부터 적용돼요.</div>
            </div>
          )}
          <label style={{ fontSize: 13, fontWeight: 600 }}>전체 제목</label>
          <input value={deckTitle} onChange={e => setDeckTitle(e.target.value)} style={{ ...inputStyle, margin: '4px 0 14px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slides.map((sl, i) => (
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>슬라이드 {i + 1}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button aria-label="위로" disabled={i === 0} onClick={() => moveSlide(i, -1)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 4, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.4 : 1, display: 'flex' }}><ArrowUp size={14} /></button>
                    <button aria-label="아래로" disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 4, cursor: i === slides.length - 1 ? 'default' : 'pointer', opacity: i === slides.length - 1 ? 0.4 : 1, display: 'flex' }}><ArrowDown size={14} /></button>
                    <button aria-label="삭제" disabled={slides.length <= 1} onClick={() => removeSlide(i)} style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: 4, cursor: slides.length <= 1 ? 'default' : 'pointer', opacity: slides.length <= 1 ? 0.4 : 1, display: 'flex', color: '#dc2626' }}><Trash2 size={14} /></button>
                  </span>
                </div>
                <input value={sl.title} onChange={e => update(i, { title: e.target.value })} style={{ ...inputStyle, fontWeight: 600, marginBottom: 6 }} />
                {(sl.imgIdx.length > 0 || sl.codeIdx.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    {sl.imgIdx.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', borderRadius: 6, padding: '2px 8px' }}>그림 {sl.imgIdx.length}장</span>}
                    {sl.codeIdx.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 6, padding: '2px 8px' }}>코드 {sl.codeIdx.length}개</span>}
                    {sl.imgIdx.slice(0, 3).map(ii => outline.media?.imageUrls[ii] && (
                      <img key={ii} src={outline.media.imageUrls[ii]} alt="" style={{ height: 40, width: 64, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }} />
                    ))}
                  </div>
                )}
                <textarea value={sl.points} onChange={e => update(i, { points: e.target.value })} rows={Math.max(2, sl.points.split('\n').length)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="핵심 문장 (한 줄에 하나)" />
              </div>
            ))}
          </div>
          {unassignedMedia > 0 && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 10px', marginTop: 10, lineHeight: 1.6 }}>
              원본에 있던 그림·코드 {unassignedMedia}개는 어느 장에도 붙이지 못했어요. 필요하면 해당하는 장을 직접 만들어 주세요.
            </div>
          )}
          <button onClick={addSlide} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, background: '#fff', color: '#3B82F6', border: '1px dashed #93C5FD', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, width: '100%', justifyContent: 'center' }}>
            <Plus size={15} /> 슬라이드 추가
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setCur(0); setStep(2); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              다음: 슬라이드별 설계 <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && s && (
        <div>
          <div style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <button onClick={askAi} disabled={aiBusy} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: aiBusy ? 'default' : 'pointer', opacity: aiBusy ? 0.7 : 1, fontSize: 14, fontWeight: 600 }}>
              <Sparkles size={15} /> {aiBusy ? 'AI가 고르는 중…' : 'AI가 전체 슬라이드에 어울리는 배치·구성 골라주기'}
            </button>
            <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6, lineHeight: 1.6 }}>
              장마다 내용에 맞는 화면 배치와 템플릿 구성을 한 번에 채워 줘요. <AiCreditCost feature="slidedeck_ai_draft" />
            </div>
            {aiMsg && <div style={{ fontSize: 12, color: '#1D4ED8', marginTop: 4 }}>{aiMsg}</div>}
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>전체 그림 스타일 (한 번에 통일)</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>모든 슬라이드의 그림 스타일이 한꺼번에 바뀌어요. 특정 장만 다르게 하고 싶으면 그 장에서 따로 고르세요.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {STYLES.map(st => (
                <button key={st.key} onClick={() => applyGlobalStyle(st.key)} style={card(globalStyle === st.key)}>
                  <StyleSample k={st.key} /><b>{st.label}</b>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {slides.map((sl, i) => (
              <button key={i} onClick={() => setCur(i)} title={sl.title}
                style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600,
                  border: cur === i ? '2px solid #3B82F6' : '1px solid #e5e7eb', background: cur === i ? '#EFF6FF' : '#fff', color: '#111827' }}>
                {i + 1}<span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>{sl.title.length > 8 ? sl.title.slice(0, 8) + '…' : sl.title}</span>
              </button>
            ))}
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{cur + 1}. {s.title}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, whiteSpace: 'pre-line' }}>{s.points}</div>

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>화면 배치</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
              {LAYOUTS.map(l => (
                <button key={l.key} onClick={() => update(cur, { layout: l.key })} style={card(s.layout === l.key)}>
                  <LayoutSample k={l.key} /><div style={{ fontWeight: 700 }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{l.desc}</div>
                </button>
              ))}
            </div>

            {compPreviews.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>이 템플릿의 구성 중 어울리는 것 (선택)</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{template.name}에 준비된 {compPreviews.length}가지 구성이에요. 눌러서 고르면 복사 문장에 함께 적혀요. (다시 누르면 선택 해제)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: 340, overflowY: 'auto', padding: 2 }}>
                  {compPreviews.map(c => (
                    <button key={c.key} onClick={() => update(cur, { composition: s.composition === c.label ? '' : c.label })} style={{ ...card(s.composition === c.label), padding: 6 }}>
                      <div style={{ pointerEvents: 'none', borderRadius: 4, overflow: 'hidden', border: '1px solid #e5e7eb' }}><SlideStage slide={c.slide} editable={false} /></div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{c.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!usesImage(s.layout) && (
              <div style={{ fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 8, padding: '8px 10px', marginBottom: 4, lineHeight: 1.6 }}>
                💡 그림을 넣고 싶다면 위에서 "이미지 왼쪽·오른쪽·스크린샷 크게" 중 하나를 고르세요. 그러면 그림 스타일과 이미지 AI용 문장이 나타나요.
              </div>
            )}
            {usesImage(s.layout) && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>이미지에 담을 것</div>
                <input value={s.imageNote} onChange={e => update(cur, { imageNote: e.target.value })} placeholder="예: 학생이 노트북으로 코드를 짜는 교실 장면" style={{ ...inputStyle, marginBottom: 12 }} />
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>이 장의 그림 스타일{s.style !== globalStyle && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 8px' }}>이 장만 다름</span>}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>작은 그림은 분위기를 보여주는 예시예요. 실제 그림은 복사한 문장으로 다른 AI에서 만들어져요.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {STYLES.map(st => (
                    <button key={st.key} onClick={() => update(cur, { style: st.key })} style={card(s.style === st.key)}>
                      <StyleSample k={st.key} /><b>{st.label}</b>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>이미지 AI에 붙여넣을 문장</div>
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>{imagePrompt(s)}</div>
                <button onClick={() => copy(`img-${cur}`, imagePrompt(s))} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {copied === `img-${cur}` ? <Check size={15} color="#16a34a" /> : <Copy size={15} />} {copied === `img-${cur}` ? '복사됐어요' : '문장 복사'}
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {cur > 0 && <button onClick={() => setCur(cur - 1)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>이전 장</button>}
            {cur < slides.length - 1
              ? <button onClick={() => setCur(cur + 1)} style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>다음 장</button>
              : <button onClick={() => setStep(3)} style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>복사 화면으로</button>}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          {emptySlides.length > 0 && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              ⚠️ 내용이 비어 있는 장이 있어요: {emptySlides.map(i => `${i + 1}번`).join(', ')}. 그대로 복사해도 되지만, AI가 내용을 지어낼 수 있어요.
            </div>
          )}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>이렇게 이어서 만들어요</div>
            <ol style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: '#374151' }}>
              <li>아래 <b>전체 복사</b>를 누릅니다.</li>
              <li>아래 추천 AI 중 하나에 붙여넣습니다.</li>
              <li>나온 슬라이드에서 글·그림이 마음에 안 드는 장만 "이 장 그림 바꿔 줘"처럼 말로 고칩니다.</li>
            </ol>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <div style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.6 }}>
                <b>추천 ① NotebookLM</b> <span style={{ fontSize: 11, color: '#1D4ED8' }}>(글 중심 발표에 좋아요)</span>
                <div style={{ color: '#374151', marginTop: 4 }}>새 노트북 만들기 → 소스 추가 → <b>복사한 텍스트</b> 붙여넣기 → 오른쪽 Studio에서 <b>슬라이드 자료</b> 만들기를 눌러요. 내용이 소스 안에서만 만들어져 지어내기가 적어요.</div>
              </div>
              <div style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.6 }}>
                <b>추천 ② Gemini</b> <span style={{ fontSize: 11, color: '#1D4ED8' }}>(그림을 함께 만들 때 좋아요)</span>
                <div style={{ color: '#374151', marginTop: 4 }}>Gemini 대화창에 붙여넣고 "이 기획서대로 슬라이드(Canvas)로 만들어 줘"라고 덧붙여요. 장별 "이미지 생성 문장"은 따로 이미지 만들기에 넣어도 돼요.</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>※ 각 서비스의 메뉴 이름은 업데이트로 조금 달라질 수 있어요.</div>
          </div>
          <div style={{ border: '2px solid #3B82F6', borderRadius: 12, padding: 14, background: '#fff', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>전체 한 번에 복사</div>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>슬라이드 {slides.length}장의 내용·배치·그림 스타일이 한 문장 묶음으로 들어 있어요.</p>
            <button onClick={() => copy('all', allText)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 22px', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
              {copied === 'all' ? <Check size={17} /> : <Copy size={17} />} {copied === 'all' ? '복사됐어요' : '전체 복사'}
            </button>
            <pre style={{ marginTop: 10, maxHeight: 220, overflow: 'auto', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{allText}</pre>
          </div>
          <details style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', background: '#fff', marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>다른 방법: 사람이 보고 따라 만드는 표</summary>
            <button onClick={() => copy('table', tableText)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, margin: '10px 0 8px' }}>
              {copied === 'table' ? <Check size={15} color="#16a34a" /> : <Copy size={15} />} {copied === 'table' ? '복사됐어요' : '표 복사'}
            </button>
            <pre style={{ maxHeight: 180, overflow: 'auto', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{tableText}</pre>
          </details>
          <details style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', background: '#fff', marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>한 장씩 복사하기</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {slides.map((sl, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {sl.title}</span>
                  <button onClick={() => copy(`s${i}`, slideBlock(sl, i))} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    {copied === `s${i}` ? <Check size={14} color="#16a34a" /> : <Copy size={14} />} {copied === `s${i}` ? '복사됨' : '복사'}
                  </button>
                </div>
              ))}
            </div>
          </details>
          <button onClick={() => { setCur(0); setStep(2); }} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            ← 설계 화면으로 돌아가 고치기
          </button>
        </div>
      )}
    </div>
  );
}
