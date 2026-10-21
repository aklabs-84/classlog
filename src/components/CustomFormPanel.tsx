import { useMemo, useRef, useState } from 'react';
import { FileUp, Sparkles } from 'lucide-react';
import AiCreditCost from './common/AiCreditCost';
import { suggestFormMapping } from '../lib/gemini';
import { useFileDrop } from '../hooks/useFileDrop';
import type { LessonPlanSections } from '../lib/gemini';
import type { CoursePlanFormExtras } from '../lib/hwpxFormExport';
import {
  FormScanError, PLAN_ITEMS, buildCustomForm, mayOverflow, scanCustomForm, valueFor,
  type FormSlot, type PlanItemId, type ScanResult,
} from '../lib/hwpxCustomForm';

interface Props {
  plan: LessonPlanSections;
  extras: CoursePlanFormExtras;
  onExtrasChange: (e: CoursePlanFormExtras) => void;
  onBack: () => void;
  onBuilt: (result: { blob: Blob; fileName: string }) => void;
}

// 같은 서식(칸 이름표 구성이 같은 서식)을 다시 올리면 지난번 짝짓기를 불러오기 위한 기억. 이 기기의 브라우저에만 저장한다
function memoryKey(slots: FormSlot[]): string {
  const text = slots.map(s => `${s.id}=${s.label}`).join('|');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `customFormMapping:${(h >>> 0).toString(36)}`;
}

function loadMemory(slots: FormSlot[]): Record<string, PlanItemId | ''> | null {
  try {
    const raw = localStorage.getItem(memoryKey(slots));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Record<string, string>;
    const valid = new Set<string>(PLAN_ITEMS.map(i => i.id));
    const out: Record<string, PlanItemId | ''> = {};
    slots.forEach(sl => { const v = saved[sl.id]; if (v === '' || valid.has(v)) out[sl.id] = v as PlanItemId | ''; });
    return Object.keys(out).length > 0 ? out : null;
  } catch { return null; }
}

function saveMemory(slots: FormSlot[], mapping: Record<string, PlanItemId | ''>) {
  try { localStorage.setItem(memoryKey(slots), JSON.stringify(mapping)); } catch { /* 저장 못 해도 동작 */ }
}

const field = 'w-full px-3 py-2 rounded-xl border border-surface-container text-sm focus:outline-none focus:border-primary';

// 올린 서식의 칸마다 "어떤 내용을 넣을지" 고르게 하는 화면 (1단계: 사람이 직접 확인, 키워드로 미리 추천)
export default function CustomFormPanel({ plan, extras, onExtrasChange, onBack, onBuilt }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, PlanItemId | ''>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setAiNote('');
    setScan(null);
    setFile(null);
    try {
      const result = await scanCustomForm(f);
      setFile(f);
      setScan(result);
      const remembered = loadMemory(result.slots);
      setMapping({ ...Object.fromEntries(result.slots.map(s => [s.id, s.suggestion ?? ''])), ...remembered });
      if (remembered) setAiNote('이 서식은 전에 만든 적이 있어요. 지난번에 고른 대로 불러왔어요. 달라진 칸만 바꿔 주세요.');
    } catch (e) {
      setError(e instanceof FormScanError ? e.message : '서식을 읽지 못했어요. 한글에서 hwpx로 다시 저장해서 올려 주세요.');
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const { over, dropProps } = useFileDrop(files => pick(files[0]), { accept: '.hwpx,.hwp' });

  const rows = useMemo(() => (scan?.slots ?? []).map((slot: FormSlot) => {
    const itemId = mapping[slot.id];
    const lines = itemId ? valueFor(itemId, plan, extras) : [];
    return { slot, itemId, lines, empty: !!itemId && lines.length === 0, overflow: mayOverflow(slot, lines) };
  }), [scan, mapping, plan, extras]);

  const chosen = rows.filter(r => r.itemId).length;
  const warnings = rows.filter(r => r.overflow).length;
  const usesExtra = (id: PlanItemId) => rows.some(r => r.itemId === id);

  // 칸 이름표와 항목 이름만 AI에 보내 짝을 추천받는다 (계획서 내용은 보내지 않음). 실패하면 지금 선택을 그대로 둔다
  const askAi = async () => {
    if (!scan) return;
    setAiBusy(true);
    setAiNote('');
    try {
      const picked = await suggestFormMapping(
        scan.slots.map(s => ({ id: s.id, label: s.label })),
        PLAN_ITEMS.map(i => ({ id: i.id, label: i.label })),
      );
      const n = Object.keys(picked).length;
      setMapping(prev => ({ ...Object.fromEntries(scan.slots.map(s => [s.id, '' as const])), ...prev, ...picked } as Record<string, PlanItemId | ''>));
      setAiNote(n > 0 ? `AI가 ${n}칸을 짝지었어요. 틀린 칸은 직접 바꿔 주세요.` : 'AI도 짝지을 칸을 찾지 못했어요. 직접 골라 주세요.');
    } catch (e) {
      setAiNote(e instanceof Error && e.message === 'AI_LIMIT_EXCEEDED'
        ? '이번 달 AI 크레딧을 모두 사용했어요. 지금 추천된 칸은 그대로 쓸 수 있어요.'
        : 'AI 추천을 받지 못했어요. 지금 추천된 칸은 그대로 쓸 수 있어요.');
    }
    setAiBusy(false);
  };

  const submit = async () => {
    if (!file || !scan) return;
    setBusy(true);
    setError('');
    try {
      const built = await buildCustomForm(file, mapping, plan, extras, scan.slots);
      saveMemory(scan.slots, mapping);
      onBuilt(built);
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 만들지 못했어요.');
    }
    setBusy(false);
  };

  return (
    <div>
      <p className="text-sm text-on-surface-variant mb-3 leading-relaxed">
        학교에서 받은 한글 서식(<b>.hwpx</b>)을 올리면, 이름표 옆의 빈 칸을 찾아 보여 드려요. 칸마다 넣을 내용을 확인하고 파일을 만들 수 있어요.
        파일은 이 기기 안에서만 처리돼요. 'AI로 칸 짝짓기'를 누를 때만 칸 이름표가 전달돼요.
      </p>
      <input ref={inputRef} type="file" accept=".hwpx,.hwp" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <button
        onClick={() => inputRef.current?.click()}
        {...dropProps}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed text-sm font-bold transition-colors ${over ? 'border-primary bg-primary/5 text-primary' : 'border-surface-container hover:border-primary text-on-surface-variant'}`}
      >
        <FileUp size={16} /> {over ? '여기에 놓으세요' : file ? `${file.name} (다른 파일 고르기)` : '한글 서식 파일 고르기 · 또는 끌어다 놓기'}
      </button>
      <p className="mt-1.5 text-[11px] text-on-surface-variant">hwp 파일이면 한글에서 [다른 이름으로 저장] → "한글 문서(*.hwpx)"로 저장해 주세요.</p>

      {error && <p className="mt-3 text-sm text-red-600 leading-relaxed">{error}</p>}

      {scan && (
        <>
          <p className="mt-4 mb-2 text-sm font-bold text-on-surface">
            채울 수 있는 칸 {scan.slots.length}개를 찾았어요
            {scan.untouchedCount > 0 && <span className="font-normal text-on-surface-variant"> · 이미 내용이 있는 칸 {scan.untouchedCount}개는 그대로 둬요</span>}
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button onClick={askAi} disabled={aiBusy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-60">
              <Sparkles size={14} /> {aiBusy ? 'AI가 짝을 찾는 중…' : 'AI로 칸 짝짓기'}
            </button>
            <AiCreditCost feature="form_map" />
            <span className="text-[11px] text-on-surface-variant">칸 이름표만 AI에 보내요. 계획서 내용은 보내지 않아요.</span>
          </div>
          {aiNote && <p className="mb-2 text-xs font-bold text-primary">{aiNote}</p>}
          <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-surface-container divide-y divide-surface-container">
            {rows.map(({ slot, itemId, lines, empty, overflow }) => (
              <div key={slot.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="sm:w-2/5 text-sm font-bold text-on-surface break-words">{slot.label}</div>
                <div className="sm:w-3/5">
                  <select
                    className={field}
                    value={mapping[slot.id] ?? ''}
                    onChange={e => setMapping({ ...mapping, [slot.id]: e.target.value as PlanItemId | '' })}
                    aria-label={`${slot.label} 칸에 넣을 내용`}
                  >
                    <option value="">비워 두기 (직접 쓸래요)</option>
                    {PLAN_ITEMS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                  </select>
                  {itemId && (
                    <p className={`mt-1 text-[11px] leading-snug truncate ${empty ? 'text-amber-600' : 'text-on-surface-variant'}`}>
                      {empty ? '계획서에 이 내용이 없어서 빈칸으로 남아요' : lines.join(' / ')}
                    </p>
                  )}
                  {overflow && <p className="mt-0.5 text-[11px] text-amber-600">글이 많아 이 칸이 커지면서 서식이 다음 장으로 넘어갈 수 있어요</p>}
                </div>
              </div>
            ))}
          </div>

          {(usesExtra('place') || usesExtra('teacher') || usesExtra('school')) && (
            <div className="mt-3">
              <p className="text-xs text-on-surface-variant mb-1.5">계획서에 없는 내용은 여기에 적어 주세요. 비워 두면 그 칸은 빈칸으로 남아요.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {usesExtra('school') && <label className="block"><span className="text-xs font-bold text-on-surface-variant">학교 이름</span><input className={field} value={extras.school ?? ''} onChange={e => onExtrasChange({ ...extras, school: e.target.value })} placeholder="예: ○○중학교" /></label>}
                {usesExtra('place') && <label className="block"><span className="text-xs font-bold text-on-surface-variant">수업 장소</span><input className={field} value={extras.place} onChange={e => onExtrasChange({ ...extras, place: e.target.value })} placeholder="예: 3학년 2반 교실" /></label>}
                {usesExtra('teacher') && <label className="block"><span className="text-xs font-bold text-on-surface-variant">강사(교사) 이름</span><input className={field} value={extras.teacher} onChange={e => onExtrasChange({ ...extras, teacher: e.target.value })} placeholder="예: 홍길동" /></label>}
              </div>
            </div>
          )}
          {warnings > 0 && <p className="mt-2 text-xs text-amber-600">긴 글이 들어가는 칸 {warnings}개가 있어요. 받은 뒤 한글에서 쪽 수를 확인해 주세요.</p>}
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">← 서식 다시 고르기</button>
        <button onClick={submit} disabled={busy || !scan || chosen === 0} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-60">
          {busy ? '만드는 중…' : `한글 파일 만들기${chosen ? ` (${chosen}칸)` : ''}`}
        </button>
      </div>
    </div>
  );
}
