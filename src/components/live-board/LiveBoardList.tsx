import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquareText, Trash2, Clock, AlertTriangle, Copy, Check, Radio, Archive } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import QuestionForm, { emptyDraft, isDraftValid, type QuestionDraft } from './QuestionForm';
import ClassPicker, { useMyClassOptions } from './ClassPicker';
import { createLiveBoard } from './createBoard';

interface LiveBoardMeta {
  id: string;
  question: string;
  code: string;
  is_open: boolean;
  is_saved: boolean;
  expires_at: string;
  created_at: string;
  ended_at: string | null;
  class_id: string | null;
}

export default function LiveBoardList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<LiveBoardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft());
  const [draftClassId, setDraftClassId] = useState<string | null>(null);
  const classOptions = useMyClassOptions();
  const className = (id: string | null) => (id ? classOptions.find(o => o.value === id)?.name ?? '연결된 클래스' : null);
  const [creating, setCreating] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('live_boards')
      .select('id, question, code, is_open, is_saved, expires_at, created_at, ended_at, class_id')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    setBoards(data ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const handleCreate = async () => {
    if (!user || !isDraftValid(draft) || creating) return;
    setCreating(true);
    const id = await createLiveBoard(user.id, draft, draftClassId);
    setCreating(false);
    if (!id) return;
    setShowCreate(false);
    setDraft(emptyDraft());
    navigate(`/live-board/${id}`);
  };

  const handleDeleteConfirm = async (id: string) => {
    setDeletingId(id);
    await supabase.from('live_boards').delete().eq('id', id);
    setBoards(prev => prev.filter(b => b.id !== id));
    setConfirmId(null);
    setDeletingId(null);
    setHoveredId(null);
  };

  const handleCopyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) return <div style={{ padding: 24, color: '#6B7280', fontSize: 14 }}>불러오는 중...</div>;

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        marginBottom: 12, padding: '8px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE',
        borderRadius: 10, fontSize: 12, color: '#1D4ED8',
      }}>
        📋 저장하지 않은 게시판은 만든 지 6시간 후 자동 삭제됩니다. 남기고 싶다면 진행 화면에서 "저장하기"를 눌러주세요.
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setShowCreate(true)}
        style={{
          width: '100%', marginBottom: 16, padding: '12px 20px',
          background: 'linear-gradient(135deg, #0EA5E9, #6366F1)',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={16} color="#fff" />
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>새 게시판 만들기</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0 }}>질문 입력 → 코드 생성 → 학생들이 실시간으로 답변·투표</p>
        </div>
      </motion.button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        <AnimatePresence>
          {boards.map(board => {
            const isHovered = hoveredId === board.id;
            const isConfirming = confirmId === board.id;
            const isDeleting = deletingId === board.id;
            const isEnded = !!board.ended_at;

            return (
              <motion.div
                key={board.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onMouseEnter={() => setHoveredId(board.id)}
                onMouseLeave={() => { setHoveredId(null); if (!isDeleting) setConfirmId(null); }}
                onClick={() => !isConfirming && navigate(`/live-board/${board.id}`)}
                style={{
                  background: '#fff',
                  border: `1px solid ${isConfirming ? '#FCA5A5' : isHovered ? '#0EA5E9' : '#E5E7EB'}`,
                  borderLeft: `3px solid ${isEnded ? '#9CA3AF' : board.is_open ? '#22C55E' : '#F59E0B'}`,
                  borderRadius: 12, cursor: isConfirming ? 'default' : 'pointer',
                  padding: '14px 16px', position: 'relative', overflow: 'hidden',
                  boxShadow: isHovered ? '0 4px 12px rgba(14,165,233,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <MessageSquareText size={18} color="#0EA5E9" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{
                    flexShrink: 0, padding: '2px 7px', borderRadius: 10,
                    background: isEnded ? '#F3F4F6' : board.is_open ? '#DCFCE7' : '#FEF3C7',
                    color: isEnded ? '#6B7280' : board.is_open ? '#16A34A' : '#B45309',
                    fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {!isEnded && board.is_open && <Radio size={9} />}
                    {isEnded ? '종료됨' : board.is_open ? '입력 중' : '일시정지'}
                  </span>
                </div>

                <p style={{
                  fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 10, lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {board.question}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} /> {formatDate(board.created_at)}
                    {className(board.class_id) && (
                      <span style={{ background: '#ECFDF5', color: '#047857', borderRadius: 4, padding: '1px 5px', fontSize: 10, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {className(board.class_id)}
                      </span>
                    )}
                    {board.is_saved && (
                      <span style={{ background: '#EEF2FF', color: '#4338CA', borderRadius: 4, padding: '1px 5px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
                        <Archive size={8} /> 저장됨
                      </span>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleCopyCode(board.code, board.id); }}
                    style={{
                      background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 6, padding: '2px 8px',
                      cursor: 'pointer', color: '#0369A1', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 4, letterSpacing: 1,
                    }}
                  >
                    {copiedId === board.id ? <><Check size={10} /> 복사됨</> : <><Copy size={10} /> {board.code}</>}
                  </button>
                </div>

                {isHovered && !isConfirming && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    <button
                      onClick={() => setConfirmId(board.id)}
                      style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, padding: '4px 6px', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                {isConfirming && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.97)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12,
                    }}
                  >
                    <AlertTriangle size={20} color="#EF4444" />
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                      게시판을 삭제할까요?<br />
                      <span style={{ fontWeight: 400, color: '#6B7280' }}>답변까지 모두 삭제되며 되돌릴 수 없습니다</span>
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setConfirmId(null)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#374151' }}>취소</button>
                      <button onClick={() => handleDeleteConfirm(board.id)} disabled={isDeleting} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#EF4444', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                        {isDeleting ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {boards.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>
          아직 만든 게시판이 없습니다. '새 게시판 만들기'로 시작해보세요.
        </div>
      )}

      {showCreate && (
        <div
          onClick={() => !creating && setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', margin: 16 }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111', marginBottom: 4 }}>새 실시간 게시판</h3>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>첫 질문을 만들어요. 게시판을 연 뒤에 질문을 더 추가해서 돌려 쓸 수 있어요.</p>
            <QuestionForm draft={draft} onChange={setDraft} autoFocus />
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '16px 0 6px' }}>어느 클래스 학생에게 열까요?</p>
            <ClassPicker value={draftClassId} onChange={setDraftClassId} options={classOptions} />
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '6px 0 0', lineHeight: 1.5 }}>
              클래스를 고르면 그 반 학생 화면(보드 탭)에 입장 칸이 바로 켜져요. 연결 안 함이면 6자리 코드를 알려 줘야 해요.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!isDraftValid(draft) || creating}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                  background: isDraftValid(draft) ? '#0EA5E9' : '#E5E7EB',
                  color: isDraftValid(draft) ? '#fff' : '#9CA3AF',
                  cursor: isDraftValid(draft) ? 'pointer' : 'default', fontSize: 14, fontWeight: 700,
                }}
              >
                {creating ? '만드는 중...' : '만들기'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
