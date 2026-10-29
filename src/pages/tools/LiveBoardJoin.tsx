import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, GraduationCap, Send, MessageSquareText, PauseCircle, CheckCircle2, Vote, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLiveBoardRealtime, type LiveBoardResponse } from '../../components/live-board/hooks/useLiveBoardRealtime';
import PollBars from '../../components/live-board/PollBars';
import { QUESTION_COLUMNS, RESPONSE_COLUMNS, type LiveBoardQuestion } from '../../components/live-board/types';

type Step = 'code' | 'name' | 'board';

interface JoinedBoard {
  id: string;
  question: string;
  current_question_id: string | null;
  is_open: boolean;
  expired: boolean;
}

export default function LiveBoardJoin() {
  const [searchParams] = useSearchParams();
  // 학생 로그 화면의 "우리 반 게시판"으로 들어오면 로그인한 이름으로 바로 입장한다
  const autoJoinName = ((useLocation().state as { autoJoinName?: string } | null)?.autoJoinName ?? '').trim();
  const autoJoinTried = useRef(false);

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [name, setName] = useState(autoJoinName || (localStorage.getItem('lb_student_name') ?? ''));
  const [board, setBoard] = useState<JoinedBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [question, setQuestion] = useState<LiveBoardQuestion | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState<LiveBoardResponse[]>([]);
  const myIdRef = useRef<string | null>(null);
  const boardIdRef = useRef<string | null>(null);
  const questionIdRef = useRef<string | null>(null);
  boardIdRef.current = board?.id ?? null;
  questionIdRef.current = question?.id ?? null;

  // 지금 질문을 불러와 화면을 그 질문 기준으로 맞춘다(입장할 때, 선생님이 질문을 넘길 때)
  const loadQuestion = async (boardId: string, questionId: string | null) => {
    if (!questionId) { setQuestion(null); setResponses([]); setSubmitted(false); return; }
    const [{ data: q }, { data: res }] = await Promise.all([
      supabase.from('live_board_questions').select(QUESTION_COLUMNS).eq('id', questionId).maybeSingle(),
      supabase.from('live_board_responses').select(RESPONSE_COLUMNS)
        .eq('board_id', boardId).eq('question_id', questionId)
        .order('created_at', { ascending: false }),
    ]);
    // 불러오는 사이 선생님이 또 넘겼다면 오래된 결과는 버린다
    if (boardIdRef.current !== boardId) return;
    const list = (res ?? []) as LiveBoardResponse[];
    setQuestion((q as LiveBoardQuestion) ?? null);
    setResponses(list);
    const mine = myIdRef.current ? list.find(r => r.student_user_id === myIdRef.current) : undefined;
    setSubmitted(!!mine);
    setContent(mine?.content ?? '');
    setPicked(mine?.choices ?? []);
    setError('');
  };

  const { emitResponseAdded } = useLiveBoardRealtime({
    boardId: board?.id ?? '',
    onResponseAdded: (res) => {
      if (res.question_id !== questionIdRef.current) return;
      setResponses(prev => (prev.some(r => r.id === res.id) ? prev : [res, ...prev]));
    },
    onResponseDeleted: (id) => {
      setResponses(prev => prev.filter(r => r.id !== id));
    },
    onQuestionChanged: (questionId) => {
      if (!boardIdRef.current) return;
      setBoard(prev => (prev ? { ...prev, current_question_id: questionId } : prev));
      loadQuestion(boardIdRef.current, questionId);
    },
    onToggle: (isOpen) => {
      setBoard(prev => (prev ? { ...prev, is_open: isOpen } : prev));
    },
    onEnded: () => {
      setBoard(prev => (prev ? { ...prev, is_open: false } : prev));
    },
  });

  const handleCodeSubmit = async (inputCode?: string) => {
    const c = (inputCode ?? code).trim().toUpperCase();
    if (c.length < 6) { setError('코드는 6자리입니다'); return; }
    setLoading(true);
    setError('');

    const { data, error: rpcError } = await supabase.rpc('get_live_board_by_code', { p_code: c });
    const row = Array.isArray(data) ? data[0] : data;

    if (rpcError || !row) {
      setError('유효한 코드가 아닙니다. 선생님께 확인해주세요.');
      setLoading(false);
      return;
    }
    if (row.expired) {
      setError('종료된 게시판입니다.');
      setLoading(false);
      return;
    }

    setCode(c);
    setBoard({ id: row.id, question: row.question, current_question_id: row.current_question_id ?? null, is_open: row.is_open, expired: row.expired });
    setStep('name');
    setLoading(false);
  };

  useEffect(() => {
    if (searchParams.get('code') && step === 'code') {
      handleCodeSubmit(searchParams.get('code')!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNameSubmit = async () => {
    if (!name.trim() || !board) return;
    setLoading(true);
    setError('');

    let currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      const { error: authErr } = await supabase.auth.signInAnonymously();
      if (authErr) { setError('인증 오류. 다시 시도해주세요.'); setLoading(false); return; }
      currentUser = (await supabase.auth.getUser()).data.user;
    }
    myIdRef.current = currentUser?.id ?? null;
    localStorage.setItem('lb_student_name', name.trim());

    // 입장 사이에 선생님이 질문을 넘겼을 수 있으니 지금 질문을 다시 확인한다
    const { data: st } = await supabase.rpc('get_live_board_state', { p_board_id: board.id });
    const state = Array.isArray(st) ? st[0] : st;
    const currentId: string | null = state?.current_question_id ?? board.current_question_id;
    setBoard(prev => (prev ? { ...prev, current_question_id: currentId, is_open: state?.is_open ?? prev.is_open } : prev));
    await loadQuestion(board.id, currentId);

    setStep('board');
    setLoading(false);
  };

  useEffect(() => {
    if (autoJoinName && step === 'name' && board && !autoJoinTried.current) {
      autoJoinTried.current = true;
      handleNameSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, board]);

  const isPoll = question?.kind === 'poll' && !!question.options;

  const togglePick = (i: number) => {
    if (submitted || !board?.is_open) return;
    if (question?.allow_multiple) {
      setPicked(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort((x, y) => x - y)));
    } else {
      setPicked([i]);
    }
  };

  const canSubmit = isPoll ? picked.length > 0 : !!content.trim();

  const handleAnswerSubmit = async () => {
    if (!canSubmit || !board || !question || submitting || !myIdRef.current) return;
    setSubmitting(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('live_board_responses')
      .insert({
        board_id: board.id,
        question_id: question.id,
        student_user_id: myIdRef.current,
        nickname: name.trim(),
        content: isPoll ? '' : content.trim(),
        choices: isPoll ? picked : null,
      })
      .select(RESPONSE_COLUMNS)
      .single();

    setSubmitting(false);
    if (insertError || !data) {
      // 선생님이 방금 다른 질문으로 넘겼거나(42501), 이미 제출한 경우(23505)는 최신 상태로 맞춘다
      if (insertError?.code === '42501' || insertError?.code === '23505') {
        const { data: st } = await supabase.rpc('get_live_board_state', { p_board_id: board.id });
        const state = Array.isArray(st) ? st[0] : st;
        await loadQuestion(board.id, state?.current_question_id ?? question.id);
        if (insertError.code === '42501') setError('선생님이 다음 질문으로 넘겼어요. 새 질문에 답해주세요.');
        return;
      }
      setError('제출에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    setSubmitted(true);
    setResponses(prev => [data as LiveBoardResponse, ...prev]);
    emitResponseAdded(data as LiveBoardResponse);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: step === 'board' ? 640 : 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <GraduationCap size={28} color="#3B82F6" />
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>클래스로그</span>
          </div>
          <p style={{ color: '#6B7280', fontSize: 13 }}>실시간 참여 게시판</p>
        </div>

        {step === 'code' && (
          <div style={{ background: '#1E293B', borderRadius: 20, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              참여 코드 입력
            </h2>
            <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
              선생님이 알려준 6자리 코드를 입력하세요
            </p>

            <input
              autoFocus
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
              placeholder="예: AB3K7M"
              maxLength={6}
              style={{
                width: '100%', padding: '16px', borderRadius: 12, border: `2px solid ${error ? '#EF4444' : '#374151'}`,
                background: '#0F172A', color: '#fff', fontSize: 28, fontWeight: 700,
                textAlign: 'center', letterSpacing: 8, outline: 'none', boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            />
            {error && <p style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{error}</p>}

            <button
              onClick={() => handleCodeSubmit()}
              disabled={loading || code.length < 6}
              style={{
                width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none',
                background: code.length === 6 ? '#2563EB' : '#374151',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: code.length === 6 ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><ArrowRight size={18} /> 다음</>}
            </button>
          </div>
        )}

        {step === 'name' && board && (
          <div style={{ background: '#1E293B', borderRadius: 20, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ background: '#0F172A', borderRadius: 10, padding: '10px 16px', marginBottom: 24, textAlign: 'center' }}>
              <p style={{ color: '#60A5FA', fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>{board.question}</p>
            </div>

            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              내 이름 입력
            </h2>
            <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
              답변에 표시될 이름을 입력하세요
            </p>

            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value.slice(0, 20))}
              onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
              placeholder="이름 또는 별명"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #374151',
                background: '#0F172A', color: '#fff', fontSize: 16, fontWeight: 600,
                textAlign: 'center', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {error && <p style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{error}</p>}

            <button
              onClick={handleNameSubmit}
              disabled={loading || !name.trim()}
              style={{
                width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none',
                background: name.trim() ? '#2563EB' : '#374151',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><ArrowRight size={18} /> 입장하기</>}
            </button>
          </div>
        )}

        {step === 'board' && board && (
          <div style={{ background: '#1E293B', borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ background: '#0F172A', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
              {isPoll && (
                <p style={{ color: '#818CF8', fontSize: 11, fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Vote size={12} /> 투표 · {question?.allow_multiple ? '여러 개 고를 수 있어요' : '하나만 고르세요'}
                </p>
              )}
              <p style={{ color: '#60A5FA', fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>{question?.question ?? board.question}</p>
            </div>

            {!board.is_open && !submitted && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1C1917', border: '1px solid #44403C', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <PauseCircle size={16} color="#F59E0B" />
                <p style={{ color: '#A8A29E', fontSize: 12, margin: 0 }}>선생님이 입력을 일시정지했습니다. 잠시 후 다시 시도해주세요.</p>
              </div>
            )}

            {!submitted ? (
              <>
                {isPoll && question?.options ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {question.options.map((opt, i) => {
                      const on = picked.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => togglePick(i)}
                          disabled={!board.is_open}
                          aria-pressed={on}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                            padding: '14px 16px', borderRadius: 12, cursor: board.is_open ? 'pointer' : 'not-allowed',
                            border: `2px solid ${on ? '#3B82F6' : '#374151'}`,
                            background: on ? 'rgba(59,130,246,0.18)' : '#0F172A',
                            color: '#E2E8F0', fontSize: 15, fontWeight: on ? 700 : 500, lineHeight: 1.4,
                            opacity: board.is_open ? 1 : 0.6,
                          }}
                        >
                          <span style={{
                            width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: question.allow_multiple ? 6 : 11,
                            border: `2px solid ${on ? '#3B82F6' : '#6B7280'}`, background: on ? '#3B82F6' : 'transparent',
                          }}>
                            {on && <Check size={14} color="#fff" strokeWidth={3} />}
                          </span>
                          <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    autoFocus
                    value={content}
                    onChange={e => setContent(e.target.value.slice(0, 200))}
                    placeholder="답변을 입력하세요"
                    rows={4}
                    disabled={!board.is_open}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 12, border: '2px solid #374151',
                      background: board.is_open ? '#0F172A' : '#111827', color: '#fff', fontSize: 14,
                      outline: 'none', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                    }}
                  />
                )}
                {error && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>{error}</p>}
                <button
                  onClick={handleAnswerSubmit}
                  disabled={!canSubmit || submitting || !board.is_open}
                  style={{
                    width: '100%', marginTop: 12, padding: '14px', borderRadius: 12, border: 'none',
                    background: canSubmit && board.is_open ? '#2563EB' : '#374151',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    cursor: canSubmit && board.is_open ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><Send size={16} /> {isPoll ? '투표하기' : '제출하기'}</>}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#052E16', border: '1px solid #166534', borderRadius: 8, padding: '10px 14px', marginBottom: 4 }}>
                <CheckCircle2 size={16} color="#4ADE80" />
                <p style={{ color: '#86EFAC', fontSize: 12, margin: 0 }}>{isPoll ? '투표가 완료되었어요. 아래에서 결과를 볼 수 있어요.' : '답변이 제출되었습니다. 아래에서 다른 친구들의 답변도 볼 수 있어요.'}</p>
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #334155' }}>
              <p style={{ color: '#6B7280', fontSize: 12, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                {isPoll ? <><Vote size={13} /> 투표 결과</> : <><MessageSquareText size={13} /> 전체 답변 ({responses.length})</>}
              </p>
              {isPoll && question?.options && (
                submitted
                  ? <PollBars options={question.options} responses={responses} theme="dark" mine={picked} />
                  : <p style={{ color: '#4B5563', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>투표하면 결과가 보여요 ({responses.length}명 참여 중)</p>
              )}
              {!isPoll && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                <AnimatePresence>
                  {responses.map(res => (
                    <motion.div
                      key={res.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px' }}
                    >
                      <p style={{ color: '#60A5FA', fontSize: 11, fontWeight: 700, margin: '0 0 4px' }}>{res.nickname}</p>
                      <p style={{ color: '#E2E8F0', fontSize: 13, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {res.content}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {responses.length === 0 && (
                  <p style={{ color: '#4B5563', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>아직 답변이 없습니다</p>
                )}
              </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
