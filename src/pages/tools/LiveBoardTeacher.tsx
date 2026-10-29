import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Copy, Check, Users, Radio, Pause, Play,
  Trash2, Save, Square, Loader2, MessageSquareText, Plus, Vote, Send, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLiveBoardRealtime, type LiveBoardResponse } from '../../components/live-board/hooks/useLiveBoardRealtime';
import { useActionToast, ActionToast } from '../../components/ui/LimitToast';
import QuestionForm, { emptyDraft, isDraftValid, draftToRow, type QuestionDraft } from '../../components/live-board/QuestionForm';
import ClassPicker, { useMyClassOptions } from '../../components/live-board/ClassPicker';
import PollBars from '../../components/live-board/PollBars';
import { QUESTION_COLUMNS, RESPONSE_COLUMNS, type LiveBoardQuestion } from '../../components/live-board/types';

interface BoardMeta {
  id: string;
  teacher_id: string;
  question: string;
  current_question_id: string | null;
  code: string;
  is_open: boolean;
  is_saved: boolean;
  ended_at: string | null;
  class_id: string | null;
}

export default function LiveBoardTeacher() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { actionToastMessage, showActionToast } = useActionToast();

  const [board, setBoard] = useState<BoardMeta | null>(null);
  const [responses, setResponses] = useState<LiveBoardResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [ending, setEnding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [deletingResId, setDeletingResId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<LiveBoardQuestion[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState<QuestionDraft>(emptyDraft());
  const [adding, setAdding] = useState(false);
  const [confirmDeleteQ, setConfirmDeleteQ] = useState<LiveBoardQuestion | null>(null);
  const [deletingQ, setDeletingQ] = useState(false);
  const boardRef = useRef<BoardMeta | null>(null);
  boardRef.current = board;

  const { emitToggle, emitEnded, emitResponseDeleted, emitQuestionChanged } = useLiveBoardRealtime({
    boardId: boardId ?? '',
    onResponseAdded: (res) => {
      setResponses(prev => (prev.some(r => r.id === res.id) ? prev : [res, ...prev]));
    },
    onResponseDeleted: (id) => {
      setResponses(prev => prev.filter(r => r.id !== id));
    },
    onToggle: (isOpen) => {
      setBoard(prev => (prev ? { ...prev, is_open: isOpen } : prev));
    },
    onEnded: () => {
      setBoard(prev => (prev ? { ...prev, ended_at: new Date().toISOString() } : prev));
    },
  });

  const loadBoard = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    const [{ data: boardData }, { data: resData }, { data: qData }] = await Promise.all([
      supabase.from('live_boards')
        .select('id, teacher_id, question, current_question_id, code, is_open, is_saved, ended_at, class_id')
        .eq('id', boardId).maybeSingle(),
      supabase.from('live_board_responses')
        .select(RESPONSE_COLUMNS)
        .eq('board_id', boardId)
        .order('created_at', { ascending: false }),
      supabase.from('live_board_questions')
        .select(QUESTION_COLUMNS)
        .eq('board_id', boardId)
        .order('position', { ascending: true }),
    ]);
    if (!boardData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setBoard(boardData);
    setResponses((resData ?? []) as LiveBoardResponse[]);
    setQuestions((qData ?? []) as LiveBoardQuestion[]);
    setViewId(prev => prev ?? boardData.current_question_id);
    setLoading(false);
  }, [boardId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const handleCopyCode = async () => {
    if (!board) return;
    await navigator.clipboard.writeText(board.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggle = async () => {
    if (!board || toggling) return;
    setToggling(true);
    const nextOpen = !board.is_open;
    const { error } = await supabase.from('live_boards').update({ is_open: nextOpen }).eq('id', board.id);
    setToggling(false);
    if (error) return;
    setBoard(prev => (prev ? { ...prev, is_open: nextOpen } : prev));
    emitToggle(nextOpen);
  };

  const handleDeleteResponse = async (id: string) => {
    setDeletingResId(id);
    const { error } = await supabase.from('live_board_responses').delete().eq('id', id);
    setDeletingResId(null);
    if (error) return;
    setResponses(prev => prev.filter(r => r.id !== id));
    emitResponseDeleted(id);
  };

  const handleEnd = async () => {
    if (!board || ending) return;
    setEnding(true);
    const { error } = await supabase.from('live_boards')
      .update({ is_open: false, ended_at: new Date().toISOString() })
      .eq('id', board.id);
    setEnding(false);
    setConfirmEnd(false);
    if (error) return;
    setBoard(prev => (prev ? { ...prev, is_open: false, ended_at: new Date().toISOString() } : prev));
    emitToggle(false);
    emitEnded();
  };

  // 학생들에게 이 질문을 보낸다(학생 화면이 새로고침 없이 바뀜)
  const handleSendQuestion = async (q: LiveBoardQuestion) => {
    if (!board || switchingId) return;
    setSwitchingId(q.id);
    const { error } = await supabase.from('live_boards')
      .update({ current_question_id: q.id, question: q.question })
      .eq('id', board.id);
    setSwitchingId(null);
    if (error) { showActionToast('질문을 보내지 못했어요. 다시 시도해주세요.'); return; }
    setBoard(prev => (prev ? { ...prev, current_question_id: q.id, question: q.question } : prev));
    setViewId(q.id);
    emitQuestionChanged(q.id);
  };

  const handleAddQuestion = async (sendNow: boolean) => {
    if (!board || adding || !isDraftValid(addDraft)) return;
    setAdding(true);
    const row = draftToRow(addDraft);
    const nextPos = questions.reduce((m, q) => Math.max(m, q.position), 0) + 1;
    const { data, error } = await supabase.from('live_board_questions')
      .insert({ board_id: board.id, position: nextPos, ...row })
      .select(QUESTION_COLUMNS).single();
    setAdding(false);
    if (error || !data) { showActionToast('질문을 추가하지 못했어요. 다시 시도해주세요.'); return; }
    const q = data as LiveBoardQuestion;
    setQuestions(prev => [...prev, q]);
    setShowAdd(false);
    setAddDraft(emptyDraft());
    if (sendNow) await handleSendQuestion(q);
    else { setViewId(q.id); showActionToast('질문을 추가했어요. 준비되면 "학생에게 보내기"를 눌러주세요.'); }
  };

  const handleDeleteQuestion = async () => {
    if (!confirmDeleteQ || deletingQ) return;
    setDeletingQ(true);
    const { error } = await supabase.from('live_board_questions').delete().eq('id', confirmDeleteQ.id);
    setDeletingQ(false);
    if (error) { showActionToast('질문을 지우지 못했어요.'); return; }
    const gone = confirmDeleteQ.id;
    setQuestions(prev => prev.filter(q => q.id !== gone));
    setResponses(prev => prev.filter(r => r.question_id !== gone));
    setViewId(prev => (prev === gone ? board?.current_question_id ?? null : prev));
    setConfirmDeleteQ(null);
  };

  const classOptions = useMyClassOptions();
  const [linking, setLinking] = useState(false);
  const handleLinkClass = async (classId: string | null) => {
    if (!board || linking) return;
    setLinking(true);
    const { error } = await supabase.from('live_boards').update({ class_id: classId }).eq('id', board.id);
    setLinking(false);
    if (error) { showActionToast('클래스를 연결하지 못했어요. 다시 시도해 주세요.'); return; }
    setBoard(prev => (prev ? { ...prev, class_id: classId } : prev));
    showActionToast(classId ? '연결한 클래스 학생 화면에 입장 칸이 켜졌어요.' : '클래스 연결을 풀었어요.');
  };

  const handleSave = async () => {
    if (!board || saving) return;
    setSaving(true);
    const { error } = await supabase.from('live_boards').update({ is_saved: true }).eq('id', board.id);
    setSaving(false);
    if (error) return;
    setBoard(prev => (prev ? { ...prev, is_saved: true } : prev));
    showActionToast('게시판이 저장되었습니다. 자동 삭제되지 않습니다.');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <Loader2 size={28} className="animate-spin" color="#0EA5E9" />
      </div>
    );
  }

  if (notFound || !board) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', gap: 12 }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>게시판을 찾을 수 없습니다.</p>
        <button onClick={() => navigate('/teaching-tools')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          돌아가기
        </button>
      </div>
    );
  }

  if (user && board.teacher_id !== user.id) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>이 게시판에 접근할 권한이 없습니다.</p>
      </div>
    );
  }

  const isEnded = !!board.ended_at;
  const currentQ = questions.find(q => q.id === board.current_question_id) ?? null;
  const viewQ = questions.find(q => q.id === viewId) ?? currentQ;
  const viewResponses = viewQ ? responses.filter(r => r.question_id === viewQ.id) : [];
  const viewingCurrent = !!viewQ && viewQ.id === board.current_question_id;
  const viewIsPoll = viewQ?.kind === 'poll' && !!viewQ.options;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <ActionToast message={actionToastMessage} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 20px 60px' }}>
        <button
          onClick={() => navigate('/teaching-tools')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0,
          }}
        >
          <ArrowLeft size={15} /> 수업 도구로
        </button>

        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
                color: isEnded ? '#6B7280' : board.is_open ? '#16A34A' : '#B45309',
                background: isEnded ? '#F3F4F6' : board.is_open ? '#DCFCE7' : '#FEF3C7',
                borderRadius: 10, padding: '3px 9px', marginBottom: 10,
              }}>
                {!isEnded && board.is_open && <Radio size={10} />}
                {isEnded ? '종료됨' : board.is_open ? '학생 입력 가능' : '입력 일시정지'}
              </span>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0, lineHeight: 1.4 }}>
                {viewQ?.question ?? board.question}
              </h1>
              {viewIsPoll && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6366F1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Vote size={13} /> 투표 · {viewQ?.allow_multiple ? '여러 개 선택 가능' : '하나만 선택'}
                </p>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px' }}>참여 코드</p>
              <button
                onClick={handleCopyCode}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: '#F0F9FF', border: '1px solid #BAE6FD',
                  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: '#0369A1',
                  fontFamily: 'monospace', fontSize: 18, fontWeight: 700, letterSpacing: 2,
                }}
              >
                {board.code} {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                학생은 <span style={{ fontFamily: 'monospace' }}>/lb-join</span>에서 코드 입력
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18, paddingTop: 16, borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: 13, fontWeight: 600 }}>
              <Users size={15} color="#0EA5E9" /> 참여 {viewResponses.length}명
            </div>

            {!isEnded && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280', fontWeight: 600, minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>연결 클래스</span>
                <ClassPicker compact value={board.class_id} onChange={handleLinkClass} options={classOptions} disabled={linking} />
              </label>
            )}

            {!isEnded && (
              <button
                onClick={handleToggle}
                disabled={toggling}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: board.is_open ? '#FEF3C7' : '#DCFCE7',
                  color: board.is_open ? '#B45309' : '#16A34A',
                }}
              >
                {board.is_open ? <><Pause size={14} /> 입력 멈추기</> : <><Play size={14} /> 입력 재개</>}
              </button>
            )}

            <div style={{ flex: 1 }} />

            {!isEnded && !board.is_saved && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: '1px solid #C7D2FE', background: '#EEF2FF', color: '#4338CA',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                <Save size={14} /> {saving ? '저장 중...' : '저장하기'}
              </button>
            )}
            {board.is_saved && (
              <span style={{ fontSize: 12, color: '#4338CA', fontWeight: 600 }}>✓ 저장됨 (자동삭제 안 됨)</span>
            )}

            {!isEnded && (
              <button
                onClick={() => setConfirmEnd(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: '1px solid #FCA5A5', background: '#fff', color: '#EF4444',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                <Square size={13} /> 수업 종료
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {questions.map((q, i) => {
            const isCur = q.id === board.current_question_id;
            const isView = q.id === viewQ?.id;
            const count = responses.filter(r => r.question_id === q.id).length;
            return (
              <div
                key={q.id}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', borderRadius: 10,
                  border: `2px solid ${isView ? '#0EA5E9' : '#E5E7EB'}`,
                  background: isView ? '#F0F9FF' : '#fff',
                }}
              >
                <button
                  onClick={() => setViewId(q.id)}
                  title={q.question}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '7px 10px',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
                    color: isView ? '#0369A1' : '#4B5563', maxWidth: 190,
                  }}
                >
                  <span>{i + 1}</span>
                  {q.kind === 'poll' && <Vote size={12} />}
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{q.question}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>{count}</span>
                  {isCur && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: '#DCFCE7', borderRadius: 8, padding: '1px 6px' }}>진행 중</span>
                  )}
                </button>
                {!isCur && !isEnded && (
                  <button
                    onClick={() => setConfirmDeleteQ(q)}
                    title="이 질문 지우기"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: '0 8px 0 0', display: 'flex' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
          {!isEnded && (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 10,
                border: '2px dashed #BAE6FD', background: '#fff', color: '#0369A1', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={14} /> 질문 추가
            </button>
          )}
        </div>

        {viewQ && !viewingCurrent && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: '#92400E' }}>
              {responses.some(r => r.question_id === viewQ.id)
                ? '지난 질문의 결과를 보고 있어요. 학생 화면에는 지금 진행 중인 질문이 보여요.'
                : '아직 학생에게 보이지 않는 질문이에요.'}
            </p>
            {!isEnded && (
              <button
                onClick={() => handleSendQuestion(viewQ)}
                disabled={!!switchingId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: '#0EA5E9', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {switchingId === viewQ.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 학생에게 보내기
              </button>
            )}
          </div>
        )}

        {viewIsPoll && viewQ?.options && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <PollBars options={viewQ.options} responses={viewResponses} theme="light" />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <AnimatePresence>
            {viewResponses.map(res => (
              <motion.div
                key={res.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
                  padding: '14px 16px', position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0EA5E9' }}>{res.nickname}</span>
                  <button
                    onClick={() => handleDeleteResponse(res.id)}
                    disabled={deletingResId === res.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 2 }}
                    title="삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {viewIsPoll && viewQ?.options ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(res.choices ?? []).map(c => (
                      <span key={c} style={{ fontSize: 12, fontWeight: 600, color: '#4338CA', background: '#EEF2FF', borderRadius: 8, padding: '3px 8px', wordBreak: 'break-word' }}>
                        {viewQ.options?.[c] ?? `보기 ${c + 1}`}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 14, color: '#1f2937', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {res.content}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {viewResponses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
            <MessageSquareText size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ fontSize: 13, margin: 0 }}>{viewIsPoll ? '아직 투표한 학생이 없습니다. 코드를 학생들에게 공유해주세요.' : '아직 답변이 없습니다. 코드를 학생들에게 공유해주세요.'}</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div
          onClick={() => !adding && setShowAdd(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111', margin: '0 0 4px' }}>질문 추가</h3>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 16px' }}>같은 코드로 다음 질문을 이어서 물어볼 수 있어요.</p>
            <QuestionForm draft={addDraft} onChange={setAddDraft} autoFocus />
            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={() => setShowAdd(false)} disabled={adding} style={{ flex: '1 1 80px', padding: 12, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                취소
              </button>
              <button
                onClick={() => handleAddQuestion(false)}
                disabled={!isDraftValid(addDraft) || adding}
                style={{ flex: '1 1 110px', padding: 12, borderRadius: 10, border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0369A1', cursor: isDraftValid(addDraft) ? 'pointer' : 'default', fontSize: 13, fontWeight: 700 }}
              >
                추가만 하기
              </button>
              <button
                onClick={() => handleAddQuestion(true)}
                disabled={!isDraftValid(addDraft) || adding}
                style={{ flex: '1 1 140px', padding: 12, borderRadius: 10, border: 'none', background: isDraftValid(addDraft) ? '#0EA5E9' : '#E5E7EB', color: isDraftValid(addDraft) ? '#fff' : '#9CA3AF', cursor: isDraftValid(addDraft) ? 'pointer' : 'default', fontSize: 13, fontWeight: 700 }}
              >
                {adding ? '추가 중...' : '추가하고 바로 보내기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteQ && (
        <div
          onClick={() => !deletingQ && setConfirmDeleteQ(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>이 질문을 지울까요?</h3>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 18, lineHeight: 1.5, wordBreak: 'break-word' }}>
              "{confirmDeleteQ.question}"<br />이 질문에 달린 답변·투표도 함께 지워지고, 되돌릴 수 없어요.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDeleteQ(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>취소</button>
              <button onClick={handleDeleteQuestion} disabled={deletingQ} style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {deletingQ ? '지우는 중...' : '지우기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div
          onClick={() => !ending && setConfirmEnd(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>수업을 종료할까요?</h3>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 18, lineHeight: 1.5 }}>
              종료하면 학생 입력이 즉시 막힙니다.<br />저장하지 않으면 몇 시간 후 자동 삭제됩니다.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmEnd(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                취소
              </button>
              <button onClick={handleEnd} disabled={ending} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {ending ? '종료 중...' : '종료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
