import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Copy, Check, Users, Radio, Pause, Play,
  Trash2, Save, Square, Loader2, MessageSquareText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLiveBoardRealtime, type LiveBoardResponse } from '../../components/live-board/hooks/useLiveBoardRealtime';
import { useActionToast, ActionToast } from '../../components/ui/LimitToast';

interface BoardMeta {
  id: string;
  teacher_id: string;
  question: string;
  code: string;
  is_open: boolean;
  is_saved: boolean;
  ended_at: string | null;
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
  const boardRef = useRef<BoardMeta | null>(null);
  boardRef.current = board;

  const { emitToggle, emitEnded, emitResponseDeleted } = useLiveBoardRealtime({
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
    const [{ data: boardData }, { data: resData }] = await Promise.all([
      supabase.from('live_boards')
        .select('id, teacher_id, question, code, is_open, is_saved, ended_at')
        .eq('id', boardId).maybeSingle(),
      supabase.from('live_board_responses')
        .select('id, board_id, student_user_id, nickname, content, created_at')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false }),
    ]);
    if (!boardData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setBoard(boardData);
    setResponses(resData ?? []);
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
                {board.question}
              </h1>
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
              <Users size={15} color="#0EA5E9" /> 참여 {responses.length}명
            </div>

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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <AnimatePresence>
            {responses.map(res => (
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
                <p style={{ fontSize: 14, color: '#1f2937', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {res.content}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {responses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
            <MessageSquareText size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ fontSize: 13, margin: 0 }}>아직 답변이 없습니다. 코드를 학생들에게 공유해주세요.</p>
          </div>
        )}
      </div>

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
