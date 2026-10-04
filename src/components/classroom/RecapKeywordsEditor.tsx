import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { generateLessonRecap } from '../../lib/gemini';

// 주차별 "오늘 수업 키워드" 편집기 — 학생 기록 화면에 "오늘 뭘 했지?" 힌트로 보여요.
// 연결된 에디터 자료가 있으면 AI가 3~5개 초안을 만들고, 교사가 고치고 저장합니다.
interface Props {
  recap?: string[];
  materialId?: string;
  topic?: string;
  classId?: string;
  onChange: (recap: string[]) => void;
}

export default function RecapKeywordsEditor({ recap = [], materialId, topic, classId, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const generate = async () => {
    if (!materialId) return;
    if (recap.length > 0 && !window.confirm('이미 만들어 둔 키워드가 있어요.\nAI가 새로 만든 키워드로 바꿀까요?')) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase.from('class_materials').select('content').eq('id', materialId).single();
      if (err || !data?.content?.trim()) throw new Error('연결된 자료의 내용을 불러오지 못했어요.');
      const keywords = await generateLessonRecap(topic || '', data.content, classId);
      if (keywords.length === 0) throw new Error('키워드를 만들지 못했어요. 다시 시도해 주세요.');
      onChange(keywords);
    } catch (e: any) {
      setError(e?.message || '키워드를 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-black text-neutral-700 ml-1">
          💡 오늘 수업 키워드 <span className="font-bold text-neutral-500">(학생 기록 화면에 힌트로 보여요)</span>
        </label>
        <button
          type="button"
          disabled={!materialId || busy}
          onClick={generate}
          title={materialId ? '' : '수업자료 에디터 자료를 연결하면 AI가 키워드 초안을 만들어 줘요'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-primary/30 text-xs font-black text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {busy ? '만드는 중...' : 'AI로 초안 만들기'}
        </button>
      </div>
      {!materialId && (
        <p className="text-[11px] font-bold text-neutral-500 ml-1">에디터 자료를 연결하면 AI 초안을 만들 수 있어요. 직접 입력도 가능해요.</p>
      )}
      {error && <p className="text-[11px] font-bold text-red-500 ml-1">{error}</p>}
      {recap.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recap.map((kw, ki) => (
            <span key={ki} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 bg-white border border-amber-300 rounded-full text-xs font-bold text-neutral-800">
              {kw}
              <button
                type="button"
                onClick={() => onChange(recap.filter((_, i) => i !== ki))}
                className="p-0.5 text-neutral-400 hover:text-red-500 transition-colors"
                aria-label="키워드 삭제"
              ><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        maxLength={40}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          const v = draft.trim();
          if (!v || recap.length >= 5) return;
          onChange([...recap, v]);
          setDraft('');
        }}
        placeholder={recap.length >= 5 ? '키워드는 최대 5개까지예요' : '직접 추가 (입력 후 Enter) 예: 코드 진행 만들기'}
        disabled={recap.length >= 5}
        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold focus:border-primary/40 outline-none disabled:bg-neutral-50"
      />
    </div>
  );
}
