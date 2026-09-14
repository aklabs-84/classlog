import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, GraduationCap, Send, MessageSquareText, PauseCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLiveBoardRealtime, type LiveBoardResponse } from '../../components/live-board/hooks/useLiveBoardRealtime';

type Step = 'code' | 'name' | 'board';

interface JoinedBoard {
  id: string;
  question: string;
  is_open: boolean;
  expired: boolean;
}

export default function LiveBoardJoin() {
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [name, setName] = useState(localStorage.getItem('lb_student_name') ?? '');
  const [board, setBoard] = useState<JoinedBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState<LiveBoardResponse[]>([]);
  const myIdRef = useRef<string | null>(null);

  const { emitResponseAdded } = useLiveBoardRealtime({
    boardId: board?.id ?? '',
    onResponseAdded: (res) => {
      setResponses(prev => (prev.some(r => r.id === res.id) ? prev : [res, ...prev]));
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
    setBoard({ id: row.id, question: row.question, is_open: row.is_open, expired: row.expired });
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

    const { data: existing } = await supabase
      .from('live_board_responses')
      .select('id, board_id, student_user_id, nickname, content, created_at')
      .eq('board_id', board.id)
      .eq('student_user_id', currentUser!.id)
      .maybeSingle();

    if (existing) {
      setContent(existing.content);
      setSubmitted(true);
    }

    const { data: allRes } = await supabase
      .from('live_board_responses')
      .select('id, board_id, student_user_id, nickname, content, created_at')
      .eq('board_id', board.id)
      .order('created_at', { ascending: false });
    setResponses(allRes ?? []);

    setStep('board');
    setLoading(false);
  };

  const handleAnswerSubmit = async () => {
    if (!content.trim() || !board || submitting || !myIdRef.current) return;
    setSubmitting(true);
    const { data, error: insertError } = await supabase
      .from('live_board_responses')
      .insert({
        board_id: board.id,
        student_user_id: myIdRef.current,
        nickname: name.trim(),
        content: content.trim(),
      })
      .select('id, board_id, student_user_id, nickname, content, created_at')
      .single();

    setSubmitting(false);
    if (insertError || !data) {
      setError('제출에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    setSubmitted(true);
    setResponses(prev => [data, ...prev]);
    emitResponseAdded(data);
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
              <p style={{ color: '#60A5FA', fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.4 }}>{board.question}</p>
            </div>

            {!board.is_open && !submitted && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1C1917', border: '1px solid #44403C', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <PauseCircle size={16} color="#F59E0B" />
                <p style={{ color: '#A8A29E', fontSize: 12, margin: 0 }}>선생님이 입력을 일시정지했습니다. 잠시 후 다시 시도해주세요.</p>
              </div>
            )}

            {!submitted ? (
              <>
                <textarea
                  autoFocus
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="답변을 입력하세요"
                  rows={4}
                  disabled={!board.is_open}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12, border: '2px solid #374151',
                    background: board.is_open ? '#0F172A' : '#111827', color: '#fff', fontSize: 14,
                    outline: 'none', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                  }}
                />
                {error && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>{error}</p>}
                <button
                  onClick={handleAnswerSubmit}
                  disabled={!content.trim() || submitting || !board.is_open}
                  style={{
                    width: '100%', marginTop: 12, padding: '14px', borderRadius: 12, border: 'none',
                    background: content.trim() && board.is_open ? '#2563EB' : '#374151',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    cursor: content.trim() && board.is_open ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><Send size={16} /> 제출하기</>}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#052E16', border: '1px solid #166534', borderRadius: 8, padding: '10px 14px', marginBottom: 4 }}>
                <CheckCircle2 size={16} color="#4ADE80" />
                <p style={{ color: '#86EFAC', fontSize: 12, margin: 0 }}>답변이 제출되었습니다. 아래에서 다른 친구들의 답변도 볼 수 있어요.</p>
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #334155' }}>
              <p style={{ color: '#6B7280', fontSize: 12, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquareText size={13} /> 전체 답변 ({responses.length})
              </p>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
