import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Trash2, Save, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { quizGeneratorAI } from '../../lib/gemini';
import SendQuizTab from './SendQuizTab';

interface Props {
  projectId: string;
  schools: { id: string; name: string }[];
  teacherNames: Record<string, string>;
  /** 학교 페이지에서는 그 학교의 자료만 고를 수 있게 한다 */
  schoolId?: string;
}

interface Material { id: string; title: string; content: string | null; week_number: number | null; scope: string; recap: string[]; }
interface Draft { type: 'multiple_choice' | 'short_answer'; text: string; option_1: string; option_2: string; option_3: string; option_4: string; correct_answer: number; correct_answers: string[]; }

const stripHtml = (h: string | null) => (h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** 수업 가이드(주차별 자료)로 AI 퀴즈를 만들어 저장하고, 아래에서 학교·반에 보내는 탭 */
export default function ProjectQuizTab({ projectId, schools, teacherNames, schoolId }: Props) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMat, setLoadingMat] = useState(true);
  const [planScope, setPlanScope] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // "주차별 계획"에 주차마다 연결된 가이드(자료)를 가져온다: 공통 계획 + (학교 고정 계획)
  useEffect(() => {
    let alive = true;
    (async () => {
      type Item = { week: number; topic: string; material_id?: string; recap?: string[] };
      const plans: { scope: string; items: Item[] }[] = [];
      const { data: common } = await supabase.from('classes').select('weekly_plan')
        .eq('school_project_id', projectId).is('parent_class_id', null).maybeSingle();
      const commonItems = ((common?.weekly_plan || []) as Item[]);
      const targetSchools = schoolId ? schools.filter(sc => sc.id === schoolId) : schools;
      plans.push({ scope: '공통 계획', items: commonItems });
      if (targetSchools.length > 0) {
        // 학교 단위 또는 반 단위로 따로 고친 계획도 함께 보여 준다
        const { data: cls } = await supabase.from('classes').select('school_project_id, name, parent_class_id, weekly_plan, weekly_plan_custom')
          .in('school_project_id', targetSchools.map(sc => sc.id)).eq('weekly_plan_custom', true).order('created_at', { ascending: true });
        ((cls || []) as any[]).forEach(c => {
          const items = (c.weekly_plan || []) as Item[];
          if (!items.some(i => i.topic || i.material_id)) return;
          const sName = targetSchools.find(sc => sc.id === c.school_project_id)?.name || '학교';
          plans.push({ scope: c.parent_class_id === null ? `${sName} 전용 계획` : `${c.name || '반'} 전용 계획`, items });
        });
      }
      const ids = [...new Set(plans.flatMap(pl => pl.items.map(i => i.material_id)).filter((x): x is string => !!x))];
      const contents = new Map<string, string | null>();
      if (ids.length) {
        const { data: ms } = await supabase.from('class_materials').select('id, content').in('id', ids);
        ((ms || []) as any[]).forEach(m => contents.set(m.id, m.content));
      }
      if (!alive) return;
      setMaterials(plans.flatMap((pl, pi) => pl.items.filter(i => i.topic || i.material_id).map((i, k): Material => ({
        id: `${pi}-${k}`, title: i.topic || '(제목 없음)', content: i.material_id ? (contents.get(i.material_id) ?? null) : null,
        week_number: i.week ?? null, scope: pl.scope, recap: i.recap || [],
      }))));
      setLoadingMat(false);
    })();
    return () => { alive = false; };
  }, [projectId, schoolId, schools.map(sc => sc.id).join(',')]);

  const scopes = [...new Set(materials.map(m => m.scope))];
  const planMats = materials.filter(m => m.scope === planScope);
  const picked = planMats.filter(m => checked.includes(m.id));
  const perLimit = picked.length ? Math.floor(12000 / picked.length) : 12000;
  const text = picked.map(m => {
    const t = [stripHtml(m.content), m.recap.join(' / ')].filter(Boolean).join('\n');
    return t ? `[${m.week_number ? `${m.week_number}주차 ` : ''}${m.title}]\n${t.slice(0, perLimit)}` : '';
  }).filter(Boolean).join('\n\n');
  const hasText = text.length > 0;
  const canGenerate = picked.length > 0 && (hasText || topic.trim().length > 0);
  const choosePlan = (sc: string) => {
    setPlanScope(sc); setError(''); setSavedMsg('');
    setChecked(materials.filter(m => m.scope === sc).map(m => m.id));
  };
  const toggleWeek = (id: string) => setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const weekRange = () => {
    const w = picked.map(m => m.week_number).filter((x): x is number => !!x).sort((a, b) => a - b);
    if (w.length === 0) return '';
    return w.length === 1 ? `${w[0]}주차` : `${w[0]}~${w[w.length - 1]}주차`;
  };

  const generate = async () => {
    if (!canGenerate) return;
    setGenerating(true); setError(''); setSavedMsg('');
    try {
      const diff = difficulty === 'easy' ? '쉬운' : difficulty === 'medium' ? '보통' : '어려운';
      const body = hasText ? text : '';
      const prompt = `다음 수업 자료를 바탕으로 퀴즈 문제를 ${count}개 만들어주세요.
난이도: ${diff}
수업 자료 제목: ${picked.map(m => m.title).join(', ')}
${body ? `수업 자료(여러 주차면 주차마다 골고루 출제):\n${body}` : ''}${topic.trim() ? `\n추가로 다룰 주제: ${topic.trim()}` : ''}

문제는 4지선다형(multiple_choice)과 주관식/단답형(short_answer)을 적절히 섞어서 만들어주세요.
- multiple_choice: option_1~4와 correct_answer(0~3, 0=option_1이 정답)를 채워주세요.
- short_answer: option_1~4는 빈 문자열("")로 두고, correct_answers 배열에 정답으로 인정할 답을 1개 이상(표기법이 다른 동의어 포함) 넣어주세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{
  "questions": [
    { "type": "multiple_choice", "text": "문제 내용", "option_1": "선택지1", "option_2": "선택지2", "option_3": "선택지3", "option_4": "선택지4", "correct_answer": 0 },
    { "type": "short_answer", "text": "문제 내용", "correct_answers": ["정답1", "정답1의 동의어"] }
  ]
}`;
      const result = await quizGeneratorAI.generateContent(prompt);
      const m = result.response.text().match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
      const parsed = JSON.parse(m[0]);
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) throw new Error('문제가 만들어지지 않았어요. 다시 시도해 주세요.');
      setDrafts(parsed.questions.map((q: any): Draft => {
        const sa = q.type === 'short_answer';
        return {
          type: sa ? 'short_answer' : 'multiple_choice', text: q.text || '',
          option_1: sa ? '' : (q.option_1 || ''), option_2: sa ? '' : (q.option_2 || ''),
          option_3: sa ? '' : (q.option_3 || ''), option_4: sa ? '' : (q.option_4 || ''),
          correct_answer: sa ? 0 : Math.min(3, Math.max(0, Number(q.correct_answer) || 0)),
          correct_answers: sa && Array.isArray(q.correct_answers) ? q.correct_answers.filter(Boolean) : [],
        };
      }));
      setTitle(`${planScope.replace(/ 전용 계획$/, '').replace(/ 계획$/, '')} ${weekRange()} 퀴즈`.replace(/\s+/g, ' ').trim());
    } catch (e: any) {
      setError(e?.message || 'AI 문제 생성 중 오류가 발생했어요.');
    } finally {
      setGenerating(false);
    }
  };

  const updateDraft = (i: number, patch: Partial<Draft>) => setDrafts(prev => prev.map((d, k) => k === i ? { ...d, ...patch } : d));

  const save = async () => {
    if (!user || drafts.length === 0 || !title.trim()) return;
    setSaving(true); setError('');
    const { data: qs, error: e1 } = await supabase.from('quiz_sets').insert({ teacher_id: user.id, class_id: null, title: title.trim() }).select('id').single();
    if (e1 || !qs) { setSaving(false); setError('저장하지 못했어요. 다시 시도해 주세요.'); return; }
    const rows = drafts.map((d, i) => ({
      quiz_set_id: qs.id, order_index: i, question_type: d.type, text: d.text,
      option_1: d.option_1, option_2: d.option_2, option_3: d.option_3, option_4: d.option_4,
      correct_answer: d.correct_answer, correct_answers: d.type === 'short_answer' ? d.correct_answers : null, time_limit: 20,
    }));
    const { error: e2 } = await supabase.from('quiz_questions').insert(rows);
    setSaving(false);
    if (e2) { await supabase.from('quiz_sets').delete().eq('id', qs.id); setError('문제를 저장하지 못했어요. 다시 시도해 주세요.'); return; }
    setSavedMsg(`"${title.trim()}" 퀴즈를 저장했어요. 아래에서 학교·반에 보내 주세요.`);
    setDrafts([]); setPlanScope(''); setChecked([]); setTopic('');
    setRefreshKey(k => k + 1);
  };

  const fieldCls = 'w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-sm bg-surface-container-lowest';

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-black text-lg flex items-center gap-2"><Sparkles size={18} className="text-primary" /> 수업 가이드로 퀴즈 만들기</h3>
          <p className="text-sm text-on-surface-variant mt-1">주차별 계획에 연결된 가이드 글을 AI가 읽고 문제를 만들어요. 훑어보고 고친 뒤 저장하면 아래에서 보낼 수 있어요.</p>
        </div>

        {loadingMat ? <Loader2 className="animate-spin text-primary" size={20} /> : materials.length === 0 ? (
          <p className="text-sm font-bold text-on-surface-variant">주차별 계획에 연결된 가이드가 아직 없어요. "주차별 계획"에서 주차별 자료를 먼저 연결해 주세요.</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-black text-on-surface-variant mb-1.5">1. 어느 반(계획)으로 만들까요?</p>
              <select value={planScope} onChange={e => choosePlan(e.target.value)} className={fieldCls}>
                <option value="">계획을 선택하세요</option>
                {scopes.map(sc => <option key={sc} value={sc}>{sc}</option>)}
              </select>
            </div>
            {planScope && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-black text-on-surface-variant">2. 퀴즈에 넣을 주차 고르기 (여러 개 가능)</p>
                  <button type="button" onClick={() => setChecked(checked.length === planMats.length ? [] : planMats.map(m => m.id))} className="text-xs font-bold text-primary">
                    {checked.length === planMats.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {planMats.map(m => {
                    const empty = !stripHtml(m.content) && m.recap.length === 0;
                    return (
                      <label key={m.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${checked.includes(m.id) ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700'}`}>
                        <input type="checkbox" checked={checked.includes(m.id)} onChange={() => toggleWeek(m.id)} className="mt-1" />
                        <span className="min-w-0 flex-1 font-bold">{m.week_number ? `${m.week_number}주차 · ` : ''}{m.title}{empty && <span className="text-xs text-amber-600"> — 가이드 내용 없음</span>}</span>
                      </label>
                    );
                  })}
                </div>
                {picked.length > 0 && !hasText && <p className="text-xs font-bold text-amber-600 mt-1.5">고른 주차에 연결된 가이드 글이 없어요. 아래에 주제를 직접 적어 주세요.</p>}
              </div>
            )}

            {picked.length > 0 && (
              <>
                <div>
                  <p className="text-xs font-black text-on-surface-variant mb-1.5">3. {hasText ? '추가로 다룰 주제 (선택)' : '퀴즈로 만들 주제 (필수)'}</p>
                  <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2} placeholder="예: 프롬프트에 역할을 주는 방법" className={fieldCls} />
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <div>
                    <p className="text-xs font-black text-on-surface-variant mb-1.5">문제 수</p>
                    <select value={count} onChange={e => setCount(Number(e.target.value))} className={fieldCls}>
                      {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n}개</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-black text-on-surface-variant mb-1.5">난이도</p>
                    <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className={fieldCls}>
                      <option value="easy">쉬움</option><option value="medium">보통</option><option value="hard">어려움</option>
                    </select>
                  </div>
                </div>
                <button onClick={generate} disabled={!canGenerate || generating}
                  className="px-5 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40 inline-flex items-center gap-1.5">
                  {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {generating ? 'AI가 만드는 중…' : drafts.length ? '다시 만들기' : 'AI로 문제 만들기'}
                </button>
              </>
            )}
          </>
        )}

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        {savedMsg && <p className="text-sm font-bold text-emerald-600 flex items-center gap-1"><Check size={15} /> {savedMsg}</p>}

        {drafts.length > 0 && (
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs font-black text-on-surface-variant mb-1.5">퀴즈 이름</p>
              <input value={title} onChange={e => setTitle(e.target.value)} className={fieldCls} />
            </div>
            {drafts.map((d, i) => (
              <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-black px-2 py-1 rounded-lg bg-primary/10 text-primary shrink-0">{i + 1}</span>
                  <textarea value={d.text} onChange={e => updateDraft(i, { text: e.target.value })} rows={2} className={`${fieldCls} flex-1`} />
                  <button onClick={() => setDrafts(prev => prev.filter((_, k) => k !== i))} aria-label="문제 삭제" className="p-2 text-on-surface-variant hover:text-red-600 shrink-0"><Trash2 size={15} /></button>
                </div>
                {d.type === 'multiple_choice' ? (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {(['option_1', 'option_2', 'option_3', 'option_4'] as const).map((k, idx) => (
                      <label key={k} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${d.correct_answer === idx ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
                        <input type="radio" name={`ans-${i}`} checked={d.correct_answer === idx} onChange={() => updateDraft(i, { correct_answer: idx })} title="정답으로 지정" />
                        <input value={d[k]} onChange={e => updateDraft(i, { [k]: e.target.value } as any)} className="flex-1 min-w-0 bg-transparent outline-none" />
                      </label>
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] font-black text-on-surface-variant mb-1">주관식 · 정답으로 인정할 답 (쉼표로 구분)</p>
                    <input value={d.correct_answers.join(', ')} onChange={e => updateDraft(i, { correct_answers: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} className={fieldCls} />
                  </div>
                )}
              </div>
            ))}
            <button onClick={save} disabled={saving || !title.trim()}
              className="px-5 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40 inline-flex items-center gap-1.5">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 이 퀴즈 저장하기
            </button>
          </div>
        )}
      </div>

      <SendQuizTab key={refreshKey} schools={schools} teacherNames={teacherNames} />
    </div>
  );
}
