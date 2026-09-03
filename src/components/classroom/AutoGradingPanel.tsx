import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Loader2, AlignLeft, Link2, Image as ImageIcon, File, ExternalLink,
  Check, X, AlertTriangle, Wand2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchRemainingAiQuota } from '../../lib/auth';
import { autoGradeResult, buildGradingContent, isResultGroupGradable, getLastRubric, setLastRubric } from '../../lib/gemini';
import { getResultImagePublicUrls } from '../common/ImageCarousel';
import LimitToastView, { useLimitToast } from '../ui/LimitToast';

const EVAL_TAGS = ['자기주도', '논리적사고', '표현력', '창의성', '협력', '성실성', '탐구력', '문제해결'];

interface ResultRow {
  id: string;
  student_id: string;
  week_number: number | null;
  title: string | null;
  text_content: string | null;
  storage_path: string | null;
  storage_paths: string[] | null;
  display_name: string | null;
  link_url: string | null;
  result_type: string;
  file_type: string | null;
  submission_group: string | null;
  created_at: string;
  teacher_eval_score: number | null;
  teacher_eval_tags: string[] | null;
  teacher_eval_note: string | null;
}

interface GroupEntry {
  key: string;
  items: ResultRow[];
  studentId: string;
  studentName: string;
  gradable: boolean;
  alreadyEvaluated: boolean;
}

interface EvalFormValue {
  tags: string[];
  score: number;
  comment: string;
  aiSuggested: boolean;
}

interface AutoGradingPanelProps {
  classId: string;
  teacherId: string;
  weeklyPlan: { week: number; topic: string }[];
  students: { id: string; name: string; number: string }[];
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let idx = 0;
  async function next(): Promise<void> {
    while (idx < items.length) {
      const item = items[idx++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

const AutoGradingPanel = ({ classId, teacherId, weeklyPlan, students }: AutoGradingPanelProps) => {
  const sortedWeeks = useMemo(() => [...weeklyPlan].sort((a, b) => a.week - b.week), [weeklyPlan]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(sortedWeeks[0]?.week ?? null);
  const [rubric, setRubric] = useState(() => getLastRubric(classId));
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [evalForms, setEvalForms] = useState<Record<string, EvalFormValue>>({});
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeProgress, setGradeProgress] = useState({ done: 0, total: 0 });
  const [checkingLimit, setCheckingLimit] = useState(false);
  const [confirmState, setConfirmState] = useState<{ n: number; m: number; targets: GroupEntry[] } | null>(null);
  const [singleGradingKey, setSingleGradingKey] = useState<string | null>(null);
  const { limitToastMessage, showLimitToast } = useLimitToast();
  // 주차 선택 가로 스크롤 칩을 화면 진입 시 1회만 현재 선택 주차 위치로 스크롤하기 위한 플래그
  const weekScrolledRef = useRef(false);

  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  useEffect(() => {
    if (selectedWeek === null) { setGroups([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailedIds(new Set());
      setSkippedIds(new Set());
      setEvalForms({});
      const studentIds = students.map(s => s.id);
      if (studentIds.length === 0) { setGroups([]); setLoading(false); return; }
      const { data } = await supabase
        .from('student_results')
        .select('id, student_id, week_number, title, text_content, storage_path, storage_paths, display_name, link_url, result_type, file_type, submission_group, created_at, teacher_eval_score, teacher_eval_tags, teacher_eval_note')
        .in('student_id', studentIds)
        .eq('week_number', selectedWeek)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      const grouped: Record<string, ResultRow[]> = {};
      (data || []).forEach((r: any) => {
        const key = r.submission_group || r.id;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      });

      const entries: GroupEntry[] = Object.entries(grouped).map(([key, items]) => {
        const rep = items[0];
        const gradable = isResultGroupGradable(items);
        const alreadyEvaluated = items.some(r => (r.teacher_eval_score && r.teacher_eval_score > 0) || (r.teacher_eval_tags && r.teacher_eval_tags.length > 0));
        return {
          key,
          items,
          studentId: rep.student_id,
          studentName: studentMap.get(rep.student_id)?.name || '학생',
          gradable,
          alreadyEvaluated,
        };
      }).sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));

      // 기존에 저장된 평가값을 폼 초기값으로 채워둠
      const initialForms: Record<string, EvalFormValue> = {};
      entries.forEach(g => {
        const evalRow = g.items.find(r => r.teacher_eval_score || r.teacher_eval_tags?.length || r.teacher_eval_note);
        if (evalRow) {
          initialForms[g.key] = {
            tags: evalRow.teacher_eval_tags || [],
            score: evalRow.teacher_eval_score || 0,
            comment: evalRow.teacher_eval_note || '',
            aiSuggested: false,
          };
        }
      });

      setGroups(entries);
      setEvalForms(initialForms);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedWeek, students, studentMap]);

  const getEval = (key: string): EvalFormValue => evalForms[key] || { tags: [], score: 0, comment: '', aiSuggested: false };

  const toggleTag = (key: string, tag: string) => {
    setEvalForms(prev => {
      const current = getEval(key);
      const tags = current.tags.includes(tag) ? current.tags.filter(t => t !== tag) : [...current.tags, tag];
      return { ...prev, [key]: { ...current, tags, aiSuggested: false } };
    });
  };

  const setScore = (key: string, score: number) => {
    setEvalForms(prev => {
      const current = getEval(key);
      return { ...prev, [key]: { ...current, score: current.score === score ? 0 : score, aiSuggested: false } };
    });
  };

  const setComment = (key: string, comment: string) => {
    setEvalForms(prev => ({ ...prev, [key]: { ...getEval(key), comment, aiSuggested: false } }));
  };

  const saveCard = async (group: GroupEntry) => {
    const evalData = evalForms[group.key];
    if (!evalData) return;
    setSavingId(group.key);
    try {
      const payload = {
        teacher_eval_score: evalData.score || null,
        teacher_eval_tags: evalData.tags.length > 0 ? evalData.tags : null,
        teacher_eval_note: evalData.comment.trim() || null,
      };
      const submissionGroup = group.items.find(r => r.submission_group)?.submission_group;
      if (submissionGroup) {
        await supabase.from('student_results').update(payload).eq('submission_group', submissionGroup);
      } else {
        await supabase.from('student_results').update(payload).in('id', group.items.map(r => r.id));
      }
      setGroups(prev => prev.map(g => g.key === group.key ? { ...g, alreadyEvaluated: true } : g));
      showLimitToast('저장되었습니다. ✅');
    } catch {
      showLimitToast('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  const gradeGroup = async (group: GroupEntry): Promise<boolean> => {
    try {
      const content = await buildGradingContent(group.items);
      const suggestion = await autoGradeResult(rubric, content, classId);
      if (suggestion) {
        setEvalForms(prev => ({ ...prev, [group.key]: { tags: suggestion.tags, score: suggestion.score, comment: suggestion.comment, aiSuggested: true } }));
        setFailedIds(prev => { if (!prev.has(group.key)) return prev; const next = new Set(prev); next.delete(group.key); return next; });
        return true;
      }
      setFailedIds(prev => new Set(prev).add(group.key));
      return false;
    } catch {
      setFailedIds(prev => new Set(prev).add(group.key));
      return false;
    }
  };

  const handleSingleGrade = async (group: GroupEntry) => {
    if (!rubric.trim()) { showLimitToast('먼저 이번 주 채점 기준을 입력해주세요.'); return; }
    setSingleGradingKey(group.key);
    const remaining = await fetchRemainingAiQuota(teacherId);
    if (remaining <= 0) {
      showLimitToast('이번 달 AI 사용 한도에 도달했습니다.');
      setSingleGradingKey(null);
      return;
    }
    setLastRubric(classId, rubric);
    setSkippedIds(prev => { if (!prev.has(group.key)) return prev; const next = new Set(prev); next.delete(group.key); return next; });
    await gradeGroup(group);
    setSingleGradingKey(null);
  };

  const handleClickAutoGrade = async () => {
    if (!rubric.trim()) { showLimitToast('먼저 이번 주 채점 기준을 입력해주세요.'); return; }
    const targets = groups.filter(g => g.gradable && !g.alreadyEvaluated);
    if (targets.length === 0) { showLimitToast('자동 채점 대상이 없습니다.'); return; }

    setCheckingLimit(true);
    const remaining = await fetchRemainingAiQuota(teacherId);
    setCheckingLimit(false);

    if (remaining <= 0) {
      showLimitToast('이번 달 AI 사용 한도에 도달했습니다.');
      return;
    }
    setConfirmState({ n: targets.length, m: remaining, targets });
  };

  const runAutoGrade = async () => {
    if (!confirmState) return;
    const { targets, m } = confirmState;
    const toRun = m === Infinity ? targets : targets.slice(0, m);
    const skipped = m === Infinity ? [] : targets.slice(toRun.length);
    setLastRubric(classId, rubric);
    setConfirmState(null);
    setSkippedIds(new Set(skipped.map(g => g.key)));
    setFailedIds(new Set());
    setGrading(true);
    setGradeProgress({ done: 0, total: toRun.length });

    await runWithConcurrency(toRun, 4, async (group) => {
      await gradeGroup(group);
      setGradeProgress(p => ({ ...p, done: p.done + 1 }));
    });

    setGrading(false);
  };

  const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    text: { icon: <AlignLeft size={12} />, color: 'text-primary bg-primary/10', label: '텍스트' },
    link: { icon: <Link2 size={12} />, color: 'text-blue-500 bg-blue-50', label: '링크' },
    image: { icon: <ImageIcon size={12} />, color: 'text-emerald-500 bg-emerald-50', label: '이미지' },
    file: { icon: <File size={12} />, color: 'text-amber-500 bg-amber-50', label: '파일' },
  };

  return (
    <div className="max-w-5xl mx-auto space-y-7">
      <LimitToastView message={limitToastMessage} />

      {/* 주차 선택 */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-thin">
        {sortedWeeks.length === 0 ? (
          <p className="text-sm font-bold text-on-surface-variant/60">주차별 계획이 없습니다. 클래스 설정에서 먼저 주차별 계획을 등록해주세요.</p>
        ) : sortedWeeks.map(w => (
          <button
            key={w.week}
            ref={(el) => {
              if (selectedWeek === w.week && el && !weekScrolledRef.current) {
                weekScrolledRef.current = true;
                el.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
              }
            }}
            onClick={() => setSelectedWeek(w.week)}
            className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-black transition-all ${selectedWeek === w.week ? 'bg-on-surface text-surface' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container/70'}`}
          >
            {w.week}주차 · {w.topic}
          </button>
        ))}
      </div>

      {/* 채점 기준 입력 */}
      <div className="surface-card p-6 border border-white/60 space-y-3">
        <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">이번 주 채점 기준</label>
        <textarea
          value={rubric}
          onChange={e => setRubric(e.target.value)}
          placeholder="예: 배운 개념을 실생활 사례에 연결해서 설명했는지, 본인의 생각이 구체적으로 드러나는지를 기준으로 평가해줘."
          rows={2}
          className="w-full px-4 py-3.5 bg-surface-container rounded-xl text-base border border-transparent focus:border-primary/30 focus:outline-none resize-none transition-all"
        />
        <button
          onClick={handleClickAutoGrade}
          disabled={checkingLimit || grading || selectedWeek === null}
          className="flex items-center gap-2 px-5 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-black transition-all disabled:opacity-50"
        >
          {checkingLimit || grading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {grading ? `AI 자동 채점 중... (${gradeProgress.done}/${gradeProgress.total})` : 'AI 자동 채점'}
        </button>
      </div>

      {/* 결과 카드 목록 */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-primary" /></div>
      ) : groups.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
          <p className="text-sm font-bold text-neutral-400">{selectedWeek === null ? '주차를 선택해주세요.' : '이 주차에 제출된 결과물이 없습니다.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const textItem = group.items.find(r => r.result_type === 'text');
            const linkItem = group.items.find(r => r.result_type === 'link');
            const imageItem = group.items.find(r => r.result_type === 'image');
            const fileItem = group.items.find(r => r.result_type === 'file');
            const types = [...new Set(group.items.map(r => r.result_type))];
            const imageUrls = imageItem ? getResultImagePublicUrls(supabase.storage, imageItem) : [];
            const ev = getEval(group.key);
            const isFailed = failedIds.has(group.key);
            const isSkipped = skippedIds.has(group.key);

            return (
              <div key={group.key} className="surface-card p-6 border border-white/60 space-y-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-lg text-on-surface">{group.studentName}</span>
                    {types.map(type => {
                      const cfg = typeConfig[type] || typeConfig.file;
                      return (
                        <span key={type} className={`flex items-center gap-1 text-xs font-black uppercase tracking-wide px-2 py-1 rounded-md ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      );
                    })}
                    {!group.gradable && (
                      <span className="flex items-center gap-1 text-xs font-black px-2 py-1 rounded-md bg-neutral-100 text-neutral-500">
                        <AlertTriangle size={13} /> 직접 확인 필요
                      </span>
                    )}
                    {group.alreadyEvaluated && !ev.aiSuggested && (
                      <span className="text-xs font-black px-2 py-1 rounded-md bg-secondary/10 text-secondary">이미 평가됨</span>
                    )}
                    {isSkipped && (
                      <span className="text-xs font-black px-2 py-1 rounded-md bg-amber-100 text-amber-700">한도 초과로 스킵</span>
                    )}
                    {isFailed && (
                      <span className="flex items-center gap-1 text-xs font-black px-2 py-1 rounded-md bg-red-100 text-red-600">
                        <X size={13} /> AI 채점 실패 - 직접 입력
                      </span>
                    )}
                    {ev.aiSuggested && (
                      <span className="flex items-center gap-1 text-xs font-black px-2 py-1 rounded-md bg-violet-100 text-violet-600">
                        <Sparkles size={13} /> AI 제안
                      </span>
                    )}
                  </div>
                </div>

                {/* 내용 미리보기 */}
                <div className="space-y-2">
                  {textItem?.text_content && (
                    <p className="text-sm font-medium text-on-surface/80 line-clamp-3 leading-relaxed">{textItem.text_content}</p>
                  )}
                  {linkItem?.link_url && (
                    <a href={linkItem.link_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-500 hover:underline flex items-center gap-1.5 truncate">
                      <ExternalLink size={13} />{linkItem.link_url}
                    </a>
                  )}
                  {imageUrls.length > 0 && (
                    <div className="flex gap-2">
                      {imageUrls.slice(0, 3).map((u, i) => (
                        <img key={i} src={u} alt="제출 이미지" className="max-h-28 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                  {fileItem && (
                    <p className="text-sm font-bold text-amber-600 flex items-center gap-1.5"><File size={13} />{fileItem.display_name}</p>
                  )}
                </div>

                {/* 평가 입력 */}
                <div className="p-5 bg-violet-50/50 rounded-xl border border-violet-100 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-violet-400">평가 입력</span>
                    <button
                      onClick={() => handleSingleGrade(group)}
                      disabled={!group.gradable || grading || singleGradingKey === group.key}
                      title={!group.gradable ? '텍스트/이미지/PDF 등으로 확인 가능한 제출물만 AI 채점할 수 있어요.' : undefined}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black text-violet-500 bg-white border border-violet-200 hover:bg-violet-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {singleGradingKey === group.key ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      이 학생만 AI 채점
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => setScore(group.key, star)}
                        className={`text-3xl leading-none transition-colors ${star <= ev.score ? 'text-amber-400' : 'text-neutral-200 hover:text-amber-200'}`}
                      >★</button>
                    ))}
                    {ev.score > 0 && <span className="text-sm font-black text-amber-500 ml-1.5">{ev.score}점</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EVAL_TAGS.map(tag => (
                      <button key={tag} onClick={() => toggleTag(group.key, tag)}
                        className={`px-4 py-1.5 rounded-full text-sm font-black border transition-all ${
                          ev.tags.includes(tag) ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-neutral-400 border-neutral-200 hover:border-violet-300 hover:text-violet-500'
                        }`}
                      >{tag}</button>
                    ))}
                  </div>
                  <textarea
                    value={ev.comment}
                    onChange={e => setComment(group.key, e.target.value)}
                    placeholder="평가 코멘트"
                    rows={2}
                    className="w-full px-4 py-3 bg-white rounded-lg text-sm border border-violet-100 focus:border-violet-300 focus:outline-none resize-none transition-all"
                  />
                  <button onClick={() => saveCard(group)} disabled={savingId === group.key || !evalForms[group.key]}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-black transition-all disabled:opacity-40">
                    {savingId === group.key ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    저장
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 한도 확인 모달 */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmState(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-base text-on-surface flex items-center gap-2"><Wand2 size={18} className="text-violet-500" />AI 자동 채점 확인</h3>
            <p className="text-sm font-bold text-on-surface-variant leading-relaxed">
              {confirmState.n}명 자동 채점 시 {confirmState.n}회가 소모됩니다.<br />
              이번 달 남은 AI 사용 횟수: {confirmState.m === Infinity ? '무제한' : `${confirmState.m}회`}
              {confirmState.m !== Infinity && confirmState.m < confirmState.n && (
                <span className="block mt-1 text-amber-600">한도를 초과하는 {confirmState.n - confirmState.m}명은 자동 채점에서 제외되고 "직접 입력"으로 남습니다.</span>
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmState(null)} className="flex-1 px-4 py-2.5 bg-neutral-100 text-neutral-500 rounded-xl text-sm font-black hover:bg-neutral-200 transition-all">취소</button>
              <button onClick={runAutoGrade} className="flex-1 px-4 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-black transition-all">진행</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoGradingPanel;
