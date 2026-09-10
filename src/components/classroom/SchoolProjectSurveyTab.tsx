import { useState, useEffect } from 'react';
import { Reorder } from 'framer-motion';
import {
  Plus, X, Copy, Check, Trash2, ChevronDown, ChevronRight,
  Play, StopCircle, Users, BarChart2, ArrowRight, ArrowLeft, Edit3, GripVertical,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import {
  TYPE_META, MultipleChoiceChart, YesNoChart, StarRatingChart,
  ShortTextChart, OpinionScaleChart, RankingChart, QuestionEditor,
  type QuestionType, type SurveyQuestion, type SurveyAnswer,
} from '../../pages/tools/SurveyTool';

// ─── Types ─────────────────────────────────────────────────────────────────
interface SurveyFormRow {
  id: string;
  title: string;
  pin_code: string;
  status: 'draft' | 'open' | 'closed';
  is_anonymous: boolean;
  survey_phase: 'pre' | 'post' | null;
  paired_form_id: string | null;
  created_at: string;
}

interface SchoolClassOption { id: string; name: string }
interface SchoolOption { id: string; name: string; school_name: string | null; classes: SchoolClassOption[] }

interface SurveyResponseRow {
  id: string;
  respondent_name: string;
  student_id: string | null;
  class_id: string | null;
  submitted_at: string;
}

const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();
const NUMERIC_TYPES: QuestionType[] = ['star_rating', 'opinion_scale'];

export default function SchoolProjectSurveyTab({ projectId, schools }: { projectId: string; schools: SchoolOption[] }) {
  const { user } = useAuth();

  const [forms, setForms] = useState<SurveyFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPreId, setExpandedPreId] = useState<string | null>(null);
  const [copiedPin, setCopiedPin] = useState<string | null>(null);

  const [editingForm, setEditingForm] = useState<SurveyFormRow | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Partial<SurveyQuestion> | null>(null);

  const [resultsForm, setResultsForm] = useState<SurveyFormRow | null>(null);
  const [resultsQuestions, setResultsQuestions] = useState<SurveyQuestion[]>([]);
  const [resultsAnswers, setResultsAnswers] = useState<SurveyAnswer[]>([]);
  const [resultsResponses, setResultsResponses] = useState<SurveyResponseRow[]>([]);
  const [filterSchoolId, setFilterSchoolId] = useState('all');
  const [filterClassId, setFilterClassId] = useState('all');
  const [compareForm, setCompareForm] = useState<SurveyFormRow | null>(null);
  const [compareQuestions, setCompareQuestions] = useState<SurveyQuestion[]>([]);
  const [compareAnswers, setCompareAnswers] = useState<SurveyAnswer[]>([]);
  const [compareResponses, setCompareResponses] = useState<SurveyResponseRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  useEffect(() => { fetchForms(); }, [projectId]);

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await supabase.from('survey_forms').select('*')
      .eq('school_project_id', projectId).order('created_at', { ascending: false });
    setForms(data ?? []);
    setLoading(false);
  };

  // ── 사전 설문 생성 ────────────────────────────────────────────────────────
  const handleCreatePre = async () => {
    if (!user) return;
    const pin = generatePin();
    const { data, error } = await supabase.from('survey_forms').insert({
      teacher_id: user.id, school_project_id: projectId, survey_phase: 'pre',
      title: '사전 설문', pin_code: pin, status: 'draft', is_anonymous: false,
    }).select().single();
    if (error || !data) return;
    setForms(prev => [data, ...prev]);
    openEditor(data);
  };

  // ── 사후 설문 생성 (사전 문항 복제) ────────────────────────────────────────
  const handleCreatePost = async (preForm: SurveyFormRow) => {
    if (!user) return;
    const { data: preQuestions } = await supabase.from('survey_questions').select('*')
      .eq('form_id', preForm.id).order('order_index');
    const pin = generatePin();
    const { data: postForm, error } = await supabase.from('survey_forms').insert({
      teacher_id: user.id, school_project_id: projectId, survey_phase: 'post',
      paired_form_id: preForm.id, title: preForm.title.replace(/^사전/, '사후') || '사후 설문',
      pin_code: pin, status: 'draft', is_anonymous: false,
    }).select().single();
    if (error || !postForm) return;
    if (preQuestions && preQuestions.length > 0) {
      await supabase.from('survey_questions').insert(
        preQuestions.map(q => ({ form_id: postForm.id, order_index: q.order_index, type: q.type, text: q.text, options: q.options }))
      );
    }
    setForms(prev => [postForm, ...prev]);
    setExpandedPreId(preForm.id);
  };

  // ── 문항 편집기 ────────────────────────────────────────────────────────────
  const openEditor = async (form: SurveyFormRow) => {
    setEditingForm(form);
    const { data } = await supabase.from('survey_questions').select('*').eq('form_id', form.id).order('order_index');
    setQuestions((data ?? []).map(q => ({ ...q, options: q.options ?? [] })));
  };

  const handleSaveQuestion = async (q: Partial<SurveyQuestion>) => {
    if (!editingForm) return;
    if (q.id) {
      await supabase.from('survey_questions').update({ type: q.type, text: q.text, options: q.options }).eq('id', q.id);
      setQuestions(prev => prev.map(old => old.id === q.id ? { ...old, ...q } as SurveyQuestion : old));
    } else {
      const { data } = await supabase.from('survey_questions').insert({
        form_id: editingForm.id, type: q.type, text: q.text, options: q.options, order_index: questions.length,
      }).select().single();
      if (data) setQuestions(prev => [...prev, { ...data, options: data.options ?? [] }]);
    }
    setEditingQuestion(null);
  };

  const handleReorderQuestions = (newOrder: SurveyQuestion[]) => {
    setQuestions(newOrder);
    newOrder.forEach((q, i) => {
      if (q.order_index !== i) {
        supabase.from('survey_questions').update({ order_index: i }).eq('id', q.id);
      }
    });
  };

  const handleDeleteQuestion = async (id: string) => {
    await supabase.from('survey_questions').delete().eq('id', id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleToggleStatus = async (form: SurveyFormRow, next: 'open' | 'closed') => {
    await supabase.from('survey_forms').update({ status: next }).eq('id', form.id);
    setForms(prev => prev.map(f => f.id === form.id ? { ...f, status: next } : f));
    if (editingForm?.id === form.id) setEditingForm(prev => prev ? { ...prev, status: next } : prev);
  };

  const handleDeleteForm = async (form: SurveyFormRow) => {
    const isPre = form.survey_phase === 'pre' || !form.survey_phase;
    const pairedPost = isPre ? forms.find(f => f.paired_form_id === form.id) : null;
    const idsToDelete = pairedPost ? [form.id, pairedPost.id] : [form.id];

    const { count } = await supabase.from('survey_responses').select('id', { count: 'exact', head: true }).in('form_id', idsToDelete);
    const target = pairedPost ? `"${form.title}"와 연결된 사후 설문 "${pairedPost.title}"` : `"${form.title}"`;
    const respNote = count ? ` 응답 ${count}건도 함께 삭제됩니다.` : '';
    if (!window.confirm(`${target}을(를) 삭제할까요?${respNote}\n이 작업은 되돌릴 수 없습니다.`)) return;

    await supabase.from('survey_forms').delete().in('id', idsToDelete);
    setForms(prev => prev.filter(f => !idsToDelete.includes(f.id)));
    if (editingForm && idsToDelete.includes(editingForm.id)) setEditingForm(null);
    if (resultsForm && idsToDelete.includes(resultsForm.id)) setResultsForm(null);
  };

  const handleCopyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(pin);
    setTimeout(() => setCopiedPin(null), 1500);
  };

  // ── 결과 보기 ──────────────────────────────────────────────────────────────
  const openResults = async (form: SurveyFormRow) => {
    setResultsForm(form);
    setFilterSchoolId('all');
    setFilterClassId('all');
    setResultsLoading(true);
    const [{ data: qs }, { data: ans }, { data: resp }] = await Promise.all([
      supabase.from('survey_questions').select('*').eq('form_id', form.id).order('order_index'),
      supabase.from('survey_answers').select('*').eq('form_id', form.id),
      supabase.from('survey_responses').select('id, respondent_name, student_id, class_id, submitted_at').eq('form_id', form.id),
    ]);
    setResultsQuestions((qs ?? []).map(q => ({ ...q, options: q.options ?? [] })));
    setResultsAnswers(ans ?? []);
    setResultsResponses(resp ?? []);

    // 페어링된 설문(사전↔사후)이 있으면 비교용 데이터도 로드
    const pairedId = form.survey_phase === 'pre'
      ? forms.find(f => f.paired_form_id === form.id)?.id
      : form.paired_form_id;
    if (pairedId) {
      const pairedForm = forms.find(f => f.id === pairedId) ?? null;
      setCompareForm(pairedForm);
      if (pairedForm) {
        const [{ data: cqs }, { data: cans }, { data: cresp }] = await Promise.all([
          supabase.from('survey_questions').select('*').eq('form_id', pairedForm.id).order('order_index'),
          supabase.from('survey_answers').select('*').eq('form_id', pairedForm.id),
          supabase.from('survey_responses').select('id, respondent_name, student_id, class_id, submitted_at').eq('form_id', pairedForm.id),
        ]);
        setCompareQuestions((cqs ?? []).map(q => ({ ...q, options: q.options ?? [] })));
        setCompareAnswers(cans ?? []);
        setCompareResponses(cresp ?? []);
      }
    } else {
      setCompareForm(null);
      setCompareQuestions([]);
      setCompareAnswers([]);
      setCompareResponses([]);
    }
    setResultsLoading(false);
  };

  const filteredResponseIds = (): Set<string> => {
    let list = resultsResponses;
    if (filterSchoolId !== 'all') {
      const school = schools.find(s => s.id === filterSchoolId);
      const classIds = new Set((school?.classes ?? []).map(c => c.id));
      list = list.filter(r => r.class_id && classIds.has(r.class_id));
    }
    if (filterClassId !== 'all') list = list.filter(r => r.class_id === filterClassId);
    return new Set(list.map(r => r.id));
  };

  const visibleAnswersFor = (question: SurveyQuestion): SurveyAnswer[] => {
    const ids = filteredResponseIds();
    return resultsAnswers.filter(a => a.question_id === question.id && ids.has(a.response_id));
  };

  const renderQuestionChart = (q: SurveyQuestion, ans: SurveyAnswer[]) => {
    switch (q.type) {
      case 'multiple_choice': return <MultipleChoiceChart question={q} answers={ans} />;
      case 'yes_no': return <YesNoChart answers={ans} />;
      case 'star_rating': return <StarRatingChart answers={ans} />;
      case 'short_text': return <ShortTextChart answers={ans} />;
      case 'opinion_scale': return <OpinionScaleChart question={q} answers={ans} />;
      case 'ranking': return <RankingChart question={q} answers={ans} />;
      default: return null;
    }
  };

  // ── 사전/사후 비교 계산 ───────────────────────────────────────────────────
  const computeComparison = () => {
    if (!compareForm || !resultsForm) return null;
    const preForm = resultsForm.survey_phase === 'pre' ? resultsForm : compareForm;
    const postForm = resultsForm.survey_phase === 'pre' ? compareForm : resultsForm;
    const preQ = resultsForm.survey_phase === 'pre' ? resultsQuestions : compareQuestions;
    const postQ = resultsForm.survey_phase === 'pre' ? compareQuestions : resultsQuestions;
    const preAns = resultsForm.survey_phase === 'pre' ? resultsAnswers : compareAnswers;
    const postAns = resultsForm.survey_phase === 'pre' ? compareAnswers : resultsAnswers;
    const preResp = resultsForm.survey_phase === 'pre' ? resultsResponses : compareResponses;
    const postResp = resultsForm.survey_phase === 'pre' ? compareResponses : resultsResponses;

    // 학생 ID 기준 매칭 (둘 다 student_id가 있는 응답만)
    const preByStudent = new Map(preResp.filter(r => r.student_id).map(r => [r.student_id as string, r.id]));
    const postByStudent = new Map(postResp.filter(r => r.student_id).map(r => [r.student_id as string, r.id]));
    const matchedStudentIds = [...preByStudent.keys()].filter(sid => postByStudent.has(sid));
    const matched = matchedStudentIds.length > 0;

    const preRespIds = matched ? new Set(matchedStudentIds.map(sid => preByStudent.get(sid)!)) : new Set(preResp.map(r => r.id));
    const postRespIds = matched ? new Set(matchedStudentIds.map(sid => postByStudent.get(sid)!)) : new Set(postResp.map(r => r.id));

    // 문항 텍스트 기준으로 사전/사후 짝짓기 (복제 생성이라 order_index 우선, 없으면 텍스트로 폴백)
    const pairs = preQ.map((pq, idx) => {
      const matchQ = postQ[idx] && postQ[idx].type === pq.type ? postQ[idx] : postQ.find(q => q.text === pq.text && q.type === pq.type);
      return matchQ ? { pre: pq, post: matchQ } : null;
    }).filter(Boolean) as { pre: SurveyQuestion; post: SurveyQuestion }[];

    const rows = pairs.map(({ pre, post }) => {
      const preA = preAns.filter(a => a.question_id === pre.id && preRespIds.has(a.response_id));
      const postA = postAns.filter(a => a.question_id === post.id && postRespIds.has(a.response_id));
      if (NUMERIC_TYPES.includes(pre.type)) {
        const key = pre.type === 'star_rating' ? 'rating' : 'score';
        const avg = (list: SurveyAnswer[]) => {
          const vals = list.map(a => (a.value as any)[key]).filter((v: any) => typeof v === 'number');
          return vals.length > 0 ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : null;
        };
        const preAvg = avg(preA);
        const postAvg = avg(postA);
        return { text: pre.text, type: pre.type as 'star_rating' | 'opinion_scale', preAvg, postAvg, preN: preA.length, postN: postA.length };
      }
      if (pre.type === 'yes_no') {
        const yesPct = (list: SurveyAnswer[]) => list.length > 0 ? Math.round((list.filter(a => (a.value as any).value === true).length / list.length) * 100) : null;
        return { text: pre.text, type: 'yes_no' as const, prePct: yesPct(preA), postPct: yesPct(postA), preN: preA.length, postN: postA.length };
      }
      return null;
    }).filter(Boolean);

    return { matched, matchedCount: matchedStudentIds.length, preForm, postForm, rows };
  };

  const uniqueSchoolsWithResponses = (): SchoolOption[] => {
    const classIds = new Set(resultsResponses.map(r => r.class_id).filter(Boolean));
    return schools.filter(s => s.classes.some(c => classIds.has(c.id)));
  };

  // ── 사전 설문 목록 (사후는 사전 아래 묶어서 표시) ───────────────────────────
  const preForms = forms.filter(f => f.survey_phase === 'pre' || !f.survey_phase);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-on-surface-variant/60 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
        <BarChart2 size={16} className="text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-on-surface-variant">
          여기서 만든 설문은 <span className="font-bold text-primary">프로젝트 소속 모든 학교/반</span>에서 공통 PIN으로 참여할 수 있습니다.
          학생이 학생 로그인으로 참여하면 개인별 사전-사후 비교가 가능하고, PIN만으로 참여한 경우 학교/반을 직접 선택하게 됩니다.
        </p>
      </div>

      <button onClick={handleCreatePre} className="w-full py-3 rounded-xl border-2 border-dashed border-surface-container-high hover:border-primary/40 text-sm font-bold text-on-surface-variant/60 hover:text-primary transition-all flex items-center justify-center gap-1.5">
        <Plus size={16} /> 새 사전 설문 만들기
      </button>

      <div className="space-y-3">
        {preForms.length === 0 && (
          <p className="text-center text-sm text-on-surface-variant/50 py-8">아직 만든 설문이 없습니다.</p>
        )}
        {preForms.map(preForm => {
          const postForm = forms.find(f => f.paired_form_id === preForm.id);
          const expanded = expandedPreId === preForm.id;
          return (
            <div key={preForm.id} className="surface-card border border-surface-container-high rounded-2xl overflow-hidden">
              <button onClick={() => setExpandedPreId(expanded ? null : preForm.id)} className="w-full flex items-center gap-3 p-4 text-left">
                {expanded ? <ChevronDown size={16} className="text-on-surface-variant/50 shrink-0" /> : <ChevronRight size={16} className="text-on-surface-variant/50 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{preForm.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${preForm.status === 'open' ? 'bg-green-100 text-green-600' : preForm.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-600'}`}>
                      {preForm.status === 'open' ? '진행 중' : preForm.status === 'closed' ? '종료' : '준비 중'}
                    </span>
                    {postForm && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">사후 설문 연결됨</span>}
                  </div>
                </div>
              </button>

              {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-surface-container-high pt-3">
                  {[preForm, ...(postForm ? [postForm] : [])].map(form => (
                    <div key={form.id} className="bg-surface-container rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-on-surface-variant/70">{form.survey_phase === 'post' ? '사후' : '사전'} 설문</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleCopyPin(form.pin_code)} className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-surface-container-lowest border border-surface-container-high">
                            PIN {form.pin_code} {copiedPin === form.pin_code ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                          <button onClick={() => handleDeleteForm(form)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="설문 삭제">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => openEditor(form)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-surface-container-lowest border border-surface-container-high hover:border-primary/40">
                          문항 편집
                        </button>
                        {form.status !== 'open' && (
                          <button onClick={() => handleToggleStatus(form, 'open')} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-green-500 text-white flex items-center gap-1">
                            <Play size={12} /> 설문 시작
                          </button>
                        )}
                        {form.status === 'open' && (
                          <button onClick={() => handleToggleStatus(form, 'closed')} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gray-500 text-white flex items-center gap-1">
                            <StopCircle size={12} /> 종료
                          </button>
                        )}
                        <button onClick={() => openResults(form)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary flex items-center gap-1">
                          <BarChart2 size={12} /> 결과 보기
                        </button>
                      </div>
                    </div>
                  ))}
                  {!postForm && (
                    <button onClick={() => handleCreatePost(preForm)} className="w-full py-2.5 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 text-xs font-bold text-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-1.5">
                      <Plus size={14} /> 사후 설문 만들기 (동일 문항 복제)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 문항 편집 — 수업도구 설문과 동일한 전체화면 빌더 */}
      {editingForm && (
        <div className="fixed inset-0 bg-surface-container-lowest z-50 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setEditingForm(null)} className="text-on-surface-variant/60 hover:text-on-surface flex items-center gap-1 text-sm shrink-0">
                <ArrowLeft size={16} /> 목록
              </button>
              <h2 className="flex-1 font-black text-lg truncate">{editingForm.title}</h2>
              <button onClick={() => handleCopyPin(editingForm.pin_code)} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-surface-container border border-surface-container-high shrink-0">
                PIN {editingForm.pin_code} {copiedPin === editingForm.pin_code ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
              {editingForm.status !== 'open' ? (
                <button onClick={() => handleToggleStatus(editingForm, 'open')} disabled={questions.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-green-500 disabled:bg-surface-container-high disabled:text-on-surface-variant/40 shrink-0">
                  <Play size={14} /> 설문 시작
                </button>
              ) : (
                <button onClick={() => handleToggleStatus(editingForm, 'closed')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-gray-500 shrink-0">
                  <StopCircle size={14} /> 종료
                </button>
              )}
            </div>

            <Reorder.Group axis="y" values={questions} onReorder={handleReorderQuestions} className="list-none p-0 m-0 flex flex-col gap-2.5 mb-4">
              {questions.map((q, i) => (
                <Reorder.Item key={q.id} value={q}
                  className="bg-surface-container-highest border border-surface-container-high rounded-2xl px-4 py-3.5 flex items-start gap-3"
                  whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10 }}
                >
                  <GripVertical size={16} className="text-on-surface-variant/30 mt-0.5 shrink-0 cursor-grab" />
                  <span className="text-xs text-on-surface-variant/40 pt-0.5 shrink-0">Q{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 mb-1" style={{ color: TYPE_META[q.type].color, background: `${TYPE_META[q.type].color}18` }}>
                      {TYPE_META[q.type].icon} {TYPE_META[q.type].label}
                    </span>
                    <p className="text-sm">{q.text}</p>
                    {q.type === 'multiple_choice' && q.options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {q.options.map((opt, j) => (
                          <span key={j} className="text-[11px] text-on-surface-variant/70 bg-surface-container px-2 py-0.5 rounded">
                            {String.fromCharCode(65 + j)}. {opt.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditingQuestion(q)} className="p-1.5 rounded-lg bg-surface-container text-on-surface-variant/70 hover:text-on-surface"><Edit3 size={13} /></button>
                    <button onClick={() => handleDeleteQuestion(q.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500"><Trash2 size={13} /></button>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>

            <button
              onClick={() => setEditingQuestion({ form_id: editingForm.id, type: 'multiple_choice', text: '', options: [{ label: '' }, { label: '' }] })}
              className="w-full py-3 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary text-primary text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <Plus size={15} /> 질문 추가
            </button>
          </div>

          {editingQuestion && (
            <QuestionEditor
              initial={editingQuestion}
              onSave={handleSaveQuestion}
              onClose={() => setEditingQuestion(null)}
            />
          )}
        </div>
      )}

      {/* 결과 모달 */}
      {resultsForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setResultsForm(null)}>
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">{resultsForm.title} 결과</h2>
              <button onClick={() => setResultsForm(null)} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant"><X size={18} /></button>
            </div>

            {resultsLoading ? (
              <div className="flex items-center justify-center py-16 text-on-surface-variant/60 text-sm">불러오는 중...</div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={14} className="text-on-surface-variant/50" />
                  <span className="text-xs font-bold text-on-surface-variant/70">전체 {resultsResponses.length}명 참여</span>
                </div>

                <div className="flex gap-2 mb-4">
                  <select value={filterSchoolId} onChange={e => { setFilterSchoolId(e.target.value); setFilterClassId('all'); }}
                    className="flex-1 text-xs font-bold px-2.5 py-2 rounded-lg bg-surface-container border border-surface-container-high outline-none">
                    <option value="all">전체 학교</option>
                    {uniqueSchoolsWithResponses().map(s => <option key={s.id} value={s.id}>{s.school_name || s.name}</option>)}
                  </select>
                  <select value={filterClassId} onChange={e => setFilterClassId(e.target.value)} disabled={filterSchoolId === 'all'}
                    className="flex-1 text-xs font-bold px-2.5 py-2 rounded-lg bg-surface-container border border-surface-container-high outline-none disabled:opacity-40">
                    <option value="all">전체 반</option>
                    {(schools.find(s => s.id === filterSchoolId)?.classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-4">
                  {resultsQuestions.map(q => (
                    <div key={q.id} className="surface-card p-4 border border-surface-container-high">
                      <p className="text-xs font-bold mb-3" style={{ color: TYPE_META[q.type].color }}>{TYPE_META[q.type].label}</p>
                      <p className="text-sm font-bold mb-3">{q.text}</p>
                      {renderQuestionChart(q, visibleAnswersFor(q))}
                    </div>
                  ))}
                </div>

                {compareForm && (() => {
                  const cmp = computeComparison();
                  if (!cmp || cmp.rows.length === 0) return null;
                  return (
                    <div className="mt-6 pt-4 border-t border-surface-container-high">
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowRight size={14} className="text-primary" />
                        <h3 className="text-sm font-black">사전 → 사후 비교</h3>
                      </div>
                      <p className="text-[11px] text-on-surface-variant/60 mb-3">
                        {cmp.matched
                          ? `${cmp.matchedCount}명 사전·사후 모두 참여 기준 개인별 비교`
                          : '학생 식별 정보가 없어 전체 응답 평균으로 비교 (익명/PIN 직접 참여 포함)'}
                      </p>
                      <div className="space-y-2.5">
                        {cmp.rows.map((row: any, i: number) => (
                          <div key={i} className="bg-surface-container rounded-xl p-3">
                            <p className="text-xs font-bold mb-2">{row.text}</p>
                            {row.type === 'yes_no' ? (
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-on-surface-variant/60">사전 {row.prePct ?? '—'}%</span>
                                <ArrowRight size={12} className="text-on-surface-variant/40" />
                                <span className={`font-black ${row.postPct != null && row.prePct != null && row.postPct >= row.prePct ? 'text-green-600' : 'text-orange-600'}`}>
                                  사후 {row.postPct ?? '—'}%
                                </span>
                                <span className="text-[10px] text-on-surface-variant/40">(예 응답 비율)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-on-surface-variant/60">사전 {row.preAvg != null ? row.preAvg.toFixed(1) : '—'}점</span>
                                <ArrowRight size={12} className="text-on-surface-variant/40" />
                                <span className={`font-black ${row.postAvg != null && row.preAvg != null && row.postAvg >= row.preAvg ? 'text-green-600' : 'text-orange-600'}`}>
                                  사후 {row.postAvg != null ? row.postAvg.toFixed(1) : '—'}점
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
