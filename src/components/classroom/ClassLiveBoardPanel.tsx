import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import QuestionForm, { emptyDraft, isDraftValid, type QuestionDraft } from '../live-board/QuestionForm';
import { createLiveBoard } from '../live-board/createBoard';
import { ShortcutRow } from './ShortcutRow';

interface ClassBoard {
  id: string;
  question: string;
  code: string;
  is_open: boolean;
}

// 클래스룸: 이 반에 실시간 참여 게시판(글 답하기/투표)을 바로 열면, 우리 반 학생 화면(보드 탭)에 입장 칸이 켜진다
export default function ClassLiveBoardPanel({ classId, teacherId }: { classId: string; teacherId: string }) {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<ClassBoard[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setBoards(null);
    (async () => {
      const { data } = await supabase
        .from('live_boards').select('id, question, code, is_open')
        .eq('teacher_id', teacherId).eq('class_id', classId)
        .is('ended_at', null).gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (alive) setBoards((data as ClassBoard[]) || []);
    })();
    return () => { alive = false; };
  }, [classId, teacherId]);

  const handleCreate = async () => {
    if (!isDraftValid(draft) || creating) return;
    setCreating(true);
    setFailed(false);
    const id = await createLiveBoard(teacherId, draft, classId);
    setCreating(false);
    if (!id) { setFailed(true); return; }
    setShowCreate(false);
    setDraft(emptyDraft());
    navigate(`/live-board/${id}`);
  };

  if (boards === null) return null;

  return (
    <>
      <ShortcutRow
        tone="emerald"
        kind="게시판"
        linked={false}
        title="실시간 참여 게시판"
        summary={boards.length > 0 ? `진행 중 ${boards.length}개` : '글 답하기 · 투표'}
        help={'글로 답하기나 투표 게시판을 열면, 우리 반 학생 화면(보드 탭)에 "입장하기"가 바로 나타나요. 코드를 따로 알려 주지 않아도 돼요.'}
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus size={12} /> 게시판 시작
          </button>
        }
      />
      {boards.map(b => (
        <ShortcutRow
          key={b.id}
          tone="emerald"
          kind="게시판"
          title={b.question}
          summary={`${b.is_open ? '입력 중' : '일시정지'} · 코드 ${b.code}`}
          action={
            <button
              onClick={() => navigate(`/live-board/${b.id}`)}
              className="text-xs font-black px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-white"
            >
              이어서 진행
            </button>
          }
        />
      ))}

      {showCreate && (
        <div
          onClick={() => !creating && setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', margin: 16 }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111', marginBottom: 4 }}>우리 반 게시판 시작</h3>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>첫 질문을 만들어요. 열린 뒤에 질문을 더 추가해서 돌려 쓸 수 있어요.</p>
            <QuestionForm draft={draft} onChange={setDraft} autoFocus />
            {failed && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 10 }}>게시판을 만들지 못했어요. 다시 시도해 주세요.</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!isDraftValid(draft) || creating}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, border: 'none',
                  background: isDraftValid(draft) ? '#059669' : '#E5E7EB',
                  color: isDraftValid(draft) ? '#fff' : '#9CA3AF',
                  cursor: isDraftValid(draft) ? 'pointer' : 'default', fontSize: 14, fontWeight: 700,
                }}
              >
                {creating ? '여는 중...' : '시작하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
