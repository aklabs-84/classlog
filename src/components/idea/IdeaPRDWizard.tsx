import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Loader2, RefreshCw, ClipboardList, Target, ListChecks, Wand2, PenLine } from 'lucide-react';
import {
  generateNextClarifyingQuestion,
  generateLessonPRD,
  generateContentFromPRD,
  type ClarifyingQuestion,
  type LessonPRD,
  type RelatedMaterialRef,
} from '../../lib/gemini';

type QAPair = { question: string; answer: string };
type Stage = 'question' | 'prd_loading' | 'prd' | 'generating';

const TOTAL_QUESTION_STEPS = 7;
const FREEFORM_HINT_STEP = 4; // "가장 중요하게 생각하는 것" 단계(0-indexed) — 직접 입력을 권장하는 안내 배너 표시

const FORMAT_TITLE: Record<'material' | 'slide', string> = {
  material: '수업 계획안',
  slide: '수업 슬라이드',
};

interface IdeaPRDWizardProps {
  ideaContent: string;
  format: 'material' | 'slide';
  relatedMaterials: RelatedMaterialRef[];
  classId?: string;
  onClose: () => void;
  onApprove: (content: string, prd: LessonPRD) => void;
}

export default function IdeaPRDWizard({ ideaContent, format, relatedMaterials, classId, onClose, onApprove }: IdeaPRDWizardProps) {
  const [stage, setStage] = useState<Stage>('question');
  const [qaHistory, setQaHistory] = useState<QAPair[]>([]);
  const [roundStep, setRoundStep] = useState(0); // 현재 라운드 내 진행도 (0~2)
  const [currentQuestion, setCurrentQuestion] = useState<ClarifyingQuestion | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [prd, setPrd] = useState<LessonPRD | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    setCustomMode(false);
    setCustomText('');
  }, [currentQuestion]);

  const fetchQuestion = async (qaHistoryForCall: QAPair[], revisionOf?: LessonPRD) => {
    setQuestionLoading(true);
    setError(null);
    try {
      const q = await generateNextClarifyingQuestion(ideaContent, format, qaHistoryForCall, classId, revisionOf);
      setCurrentQuestion(q);
    } catch {
      setError('질문을 준비하는 중 오류가 발생했습니다.');
    } finally {
      setQuestionLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestion([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectOption = async (option: string) => {
    if (!currentQuestion) return;
    const nextQa = [...qaHistory, { question: currentQuestion.question, answer: option }];
    setQaHistory(nextQa);
    setCurrentQuestion(null);

    if (roundStep + 1 < TOTAL_QUESTION_STEPS) {
      setRoundStep(roundStep + 1);
      fetchQuestion(nextQa);
      return;
    }

    setStage('prd_loading');
    try {
      const result = await generateLessonPRD(ideaContent, format, nextQa, classId);
      setPrd(result);
      setStage('prd');
    } catch {
      setError('기획서를 만드는 중 오류가 발생했습니다.');
      setStage('prd');
    }
  };

  const handleApprove = async () => {
    if (!prd) return;
    setStage('generating');
    setError(null);
    try {
      const content = await generateContentFromPRD(ideaContent, prd, relatedMaterials, format, classId);
      onApprove(content, prd);
    } catch (err: any) {
      setError(err?.message === 'AI_LIMIT_EXCEEDED' ? '이번 달 AI 사용 한도에 도달했습니다.' : '생성 중 오류가 발생했습니다.');
      setStage('prd');
    }
  };

  const handleRegenerate = () => {
    const rejectedPrd = prd ?? undefined;
    setPrd(null);
    setRoundStep(0);
    setStage('question');
    fetchQuestion(qaHistory, rejectedPrd);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="idea-prd-wizard"
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
            <div className="max-w-2xl mx-auto w-full">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 md:right-8 w-9 h-9 rounded-lg bg-white/40 hover:bg-white/60 flex items-center justify-center text-primary transition-all"
              >
                <X size={17} />
              </button>
              <h3 className="text-xl md:text-2xl font-black text-primary tracking-tight flex items-center gap-2 pr-10">
                <Wand2 size={20} /> AI와 질문하며 구체화하기
              </h3>
              <p className="text-xs font-bold text-primary/70 mt-1.5">
                {FORMAT_TITLE[format]} 만들기 · {stage === 'question' ? `질문 ${roundStep + 1}/${TOTAL_QUESTION_STEPS}` : '기획서(PRD) 검토'}
              </p>
            </div>
          </div>

          <div className="overflow-y-auto p-6 md:px-10 flex-1">
            <div className="max-w-2xl mx-auto w-full">
              {stage === 'question' && (
                questionLoading || !currentQuestion ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-on-surface-variant">
                    <Loader2 size={24} className="animate-spin text-primary" />
                    <p className="text-xs font-bold">{error ?? '질문을 준비하고 있습니다...'}</p>
                    {error && (
                      <button
                        onClick={() => fetchQuestion(qaHistory)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-container rounded-lg text-xs font-black hover:bg-surface-container-high"
                      >
                        <RefreshCw size={12} /> 다시 시도
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {roundStep === FREEFORM_HINT_STEP && !customMode && (
                      <p className="text-xs font-bold text-primary bg-primary-container/40 rounded-xl px-3.5 py-2.5">
                        이 질문은 선생님마다 생각이 다를 수 있어요. 보기 대신 아래 "직접 입력"으로 자유롭게 적어보셔도 좋습니다.
                      </p>
                    )}
                    <p className="text-lg font-black text-on-surface leading-relaxed">{currentQuestion.question}</p>
                    {!customMode ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {currentQuestion.options.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => handleSelectOption(opt)}
                              className="text-left px-4 py-3.5 rounded-2xl border-2 border-surface-container bg-white hover:border-primary/40 hover:bg-primary-container/30 transition-all text-sm font-bold text-on-surface"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setCustomMode(true)}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border-2 border-dashed border-surface-container-high text-on-surface-variant hover:border-primary/40 hover:text-primary text-xs font-black transition-all"
                        >
                          <PenLine size={13} /> 해당하는 보기가 없다면 직접 입력할게요
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={customText}
                          onChange={(e) => setCustomText(e.target.value)}
                          placeholder="자유롭게 답변을 적어주세요"
                          rows={3}
                          autoFocus
                          className="w-full rounded-2xl border-2 border-surface-container bg-white px-4 py-3 text-sm font-bold text-on-surface focus:outline-none focus:border-primary/50"
                        />
                        {currentQuestion.exampleAnswers.length > 0 && (
                          <div className="text-xs text-on-surface-variant bg-surface-container/50 rounded-xl px-3.5 py-2.5 space-y-1">
                            <p className="font-black text-on-surface-variant/70">답변 예시</p>
                            {currentQuestion.exampleAnswers.map((ex, i) => (
                              <p key={i}>· {ex}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => { setCustomMode(false); setCustomText(''); }}
                            className="flex-1 px-4 py-3 rounded-2xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-sm font-black transition-all"
                          >
                            보기로 돌아가기
                          </button>
                          <button
                            disabled={!customText.trim()}
                            onClick={() => {
                              const answer = customText.trim();
                              setCustomMode(false);
                              setCustomText('');
                              handleSelectOption(answer);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl btn-gradient text-white shadow-lg text-sm font-black transition-all disabled:opacity-40"
                          >
                            <Sparkles size={14} /> 이 답변으로 진행
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              {stage === 'prd_loading' && (
                <div className="py-16 flex flex-col items-center gap-3 text-on-surface-variant">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <p className="text-xs font-bold">답변을 바탕으로 기획서를 만들고 있습니다...</p>
                </div>
              )}

              {stage === 'prd' && prd && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-primary">
                    <ClipboardList size={16} />
                    <p className="text-[10px] font-black uppercase tracking-wide">PRD 미리보기</p>
                  </div>
                  <h4 className="text-xl font-black text-on-surface">{prd.title}</h4>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5 flex items-center gap-1">
                      <Target size={11} /> 목표
                    </p>
                    <div className="border-l-4 border-primary/40 bg-primary/5 rounded-r-xl px-4 py-2.5">
                      <p className="text-sm font-bold text-on-surface leading-relaxed italic">{prd.goal}</p>
                    </div>
                  </div>
                  {prd.structure.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-on-surface-variant/50 mb-1.5">구성</p>
                      <div className="rounded-xl border border-surface-container overflow-hidden">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-surface-container-low">
                              <th className="text-left font-black text-[11px] text-on-surface-variant/70 px-3.5 py-2 w-[30%]">단계</th>
                              <th className="text-left font-black text-[11px] text-on-surface-variant/70 px-3.5 py-2">설명</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prd.structure.map((s, i) => (
                              <tr key={i} className={i % 2 === 1 ? 'bg-surface-container/40' : ''}>
                                <td className="align-top font-black text-primary px-3.5 py-2.5 border-t border-surface-container">{s.phase}</td>
                                <td className="align-top text-on-surface-variant leading-relaxed px-3.5 py-2.5 border-t border-surface-container">{s.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant/50 mb-1">톤 · 분량</p>
                    <p className="text-sm text-on-surface leading-relaxed">{prd.tone}</p>
                  </div>
                  {prd.keyPoints.length > 0 && (
                    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 flex gap-2.5">
                      <span className="shrink-0 text-base leading-none mt-0.5">✅</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-emerald-700/70 mb-1.5 flex items-center gap-1">
                          <ListChecks size={11} /> 꼭 반영할 요소
                        </p>
                        <ul className="space-y-1">
                          {prd.keyPoints.map((kp, i) => (
                            <li key={i} className="text-xs text-emerald-900 leading-relaxed">· {kp}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  {error && <p className="text-xs font-bold text-error">{error}</p>}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={handleRegenerate}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-sm font-black transition-all"
                    >
                      <RefreshCw size={14} /> 다시 질문받기
                    </button>
                    <button
                      onClick={handleApprove}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl btn-gradient text-white shadow-lg text-sm font-black transition-all"
                    >
                      <Sparkles size={14} /> 이대로 만들기
                    </button>
                  </div>
                </div>
              )}

              {stage === 'generating' && (
                <div className="py-16 flex flex-col items-center gap-3 text-on-surface-variant">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <p className="text-xs font-bold">PRD를 바탕으로 {FORMAT_TITLE[format]}을(를) 만들고 있습니다...</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
