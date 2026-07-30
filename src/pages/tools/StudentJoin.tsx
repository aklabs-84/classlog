import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2, ArrowRight, ArrowLeft, Users, GraduationCap } from 'lucide-react';

type Step = 'code' | 'name' | 'lobby';

interface SessionInfo {
  id: string;
  class_id: string;
  class_name: string;
  group_count: number;
  group_size: number;
  session_code: string;
  status: string;
}

interface BoardCard {
  id: string;
  group_number: number;
  group_name: string;
  memberCount: number;
}

const BOARD_COLORS = [
  '#1D4ED8', '#7C3AED', '#BE185D', '#B45309',
  '#065F46', '#0E7490', '#9D174D', '#92400E',
  '#1E3A5F', '#4C1D95',
];

export default function StudentJoin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [name, setName] = useState(searchParams.get('name') ?? '');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [boards, setBoards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [myGroupName, setMyGroupName] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const returnTo = (location.state as Record<string, unknown> | null)?.returnTo as string | undefined;

  // 코드가 URL 파라미터로 왔으면 자동 검증
  useEffect(() => {
    if (searchParams.get('code') && step === 'code') {
      handleCodeSubmit(searchParams.get('code')!);
    }
  }, []);

  // 이름이 URL 파라미터로 왔고 코드 검증 후 name 단계면 자동 진행
  useEffect(() => {
    if (step === 'name' && name.trim() && searchParams.get('name')) {
      handleNameSubmit();
    }
  }, [step]);

  const fetchMemberCounts = useCallback(async (boardIds: string[]): Promise<Record<string, number>> => {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data } = await supabase
      .from('whiteboard_sessions')
      .select('board_id, user_id')
      .in('board_id', boardIds)
      .gte('last_ping', cutoff);
    const countMap: Record<string, Set<string>> = {};
    (data ?? []).forEach(s => {
      if (!countMap[s.board_id]) countMap[s.board_id] = new Set();
      countMap[s.board_id].add(s.user_id);
    });
    return Object.fromEntries(Object.entries(countMap).map(([k, v]) => [k, v.size]));
  }, []);

  const handleCodeSubmit = async (inputCode?: string) => {
    const c = (inputCode ?? code).trim().toUpperCase();
    if (c.length < 6) { setError('코드는 6자리입니다'); return; }
    setLoading(true);
    setError('');

    const { data: sessionData } = await supabase
      .from('class_board_sessions')
      .select('id, class_id, class_name, group_count, group_size, session_code, status')
      .eq('session_code', c)
      .in('status', ['active', 'ended'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sessionData) {
      setError('유효한 코드가 아닙니다. 선생님께 확인해주세요.');
      setLoading(false);
      return;
    }

    setSession(sessionData);
    setCode(c);
    setStep('name');
    setLoading(false);
  };

  const handleNameSubmit = async () => {
    if (!name.trim() || !session) return;
    setLoading(true);
    setError('');

    const { data: { user: existingUser } } = await supabase.auth.getUser();
    if (!existingUser) {
      await supabase.auth.signInAnonymously();
    }

    const { data: boardData } = await supabase
      .from('whiteboards')
      .select('id, group_number, group_name')
      .eq('class_id', session.class_id)
      .order('group_number');

    if (!boardData || boardData.length === 0) {
      setError('현재 입장 가능한 보드가 없습니다. 선생님께 확인해주세요.');
      setLoading(false);
      return;
    }

    let foundGroupName: string | null = null;
    try {
      const { data: groupName } = await supabase.rpc('get_student_group_name', {
        p_class_id: session.class_id,
        p_student_name: name.trim(),
      });
      foundGroupName = groupName ?? null;
    } catch {
      // 조 찾기 실패 → 전체 보드 표시
    }

    const filtered = foundGroupName ? boardData.filter(b => b.group_name === foundGroupName) : [];
    const displayBoards = filtered.length > 0 ? filtered : boardData;
    if (filtered.length === 0) foundGroupName = null;

    const displayBoardIds = displayBoards.map(b => b.id);
    const counts = await fetchMemberCounts(displayBoardIds);

    setMyGroupName(foundGroupName);
    setBoards(displayBoards.map(b => ({
      id: b.id,
      group_number: b.group_number,
      group_name: b.group_name ?? `${b.group_number}조`,
      memberCount: counts[b.id] ?? 0,
    })));

    setStep('lobby');
    setLoading(false);

    if (session.status === 'active') {
      pollRef.current = setInterval(async () => {
        const updatedCounts = await fetchMemberCounts(displayBoardIds);
        setBoards(prev => prev.map(b => ({ ...b, memberCount: updatedCounts[b.id] ?? 0 })));
      }, 3000);
    }
  };

  const handleJoinBoard = async (boardId: string, _boardName: string) => {
    if (!session || !name.trim()) return;
    setJoining(boardId);

    let currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      const { error: authErr } = await supabase.auth.signInAnonymously();
      if (authErr) { setError('인증 오류. 다시 시도해주세요.'); setJoining(null); return; }
      currentUser = (await supabase.auth.getUser()).data.user;
    }

    if ((currentUser as any)?.is_anonymous) {
      await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    }
    localStorage.setItem('wb_student_name', name.trim());

    if (pollRef.current) clearInterval(pollRef.current);
    navigate(`/whiteboard/${boardId}`, { replace: true, state: { fromWbJoin: true, wbCode: session.session_code, returnTo } });
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const totalJoined = boards.reduce((s, b) => s + b.memberCount, 0);
  const isEndedSession = session?.status === 'ended';

  const handleGoBack = () => {
    if (returnTo) {
      navigate(returnTo, { state: { activeTab: 'board' } });
    } else {
      navigate('/student-log');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: step === 'lobby' ? 640 : 400 }}>

        {/* 학생 페이지로 돌아가기 버튼 */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={handleGoBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: '#1E293B', border: '1px solid #334155',
              borderRadius: 12, padding: '10px 16px',
              color: '#94A3B8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#263548';
              e.currentTarget.style.color = '#CBD5E1';
              e.currentTarget.style.borderColor = '#475569';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#1E293B';
              e.currentTarget.style.color = '#94A3B8';
              e.currentTarget.style.borderColor = '#334155';
            }}
          >
            <ArrowLeft size={15} /> 학생 페이지로 돌아가기
          </button>
        </div>

        {/* 로고 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <GraduationCap size={28} color="#3B82F6" />
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>클래스로그</span>
          </div>
          <p style={{ color: '#6B7280', fontSize: 13 }}>수업 보드 참여</p>
        </div>

        {/* Step 1: 코드 입력 */}
        {step === 'code' && (
          <div style={{ background: '#1E293B', borderRadius: 20, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              수업 코드 입력
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

        {/* Step 2: 이름 입력 */}
        {step === 'name' && session && (
          <div style={{ background: '#1E293B', borderRadius: 20, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ background: '#0F172A', borderRadius: 10, padding: '10px 16px', marginBottom: isEndedSession ? 12 : 24, textAlign: 'center' }}>
              <p style={{ color: '#60A5FA', fontSize: 13, fontWeight: 600, margin: 0 }}>{session.class_name}</p>
              <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>코드: {session.session_code}</p>
            </div>

            {isEndedSession && (
              <div style={{ background: '#1C1917', border: '1px solid #44403C', borderRadius: 8, padding: '8px 14px', marginBottom: 16, textAlign: 'center' }}>
                <p style={{ color: '#A8A29E', fontSize: 12, margin: 0 }}>
                  수업은 종료되었지만 이전 보드에서 이어서 작업할 수 있어요.
                </p>
              </div>
            )}

            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              내 이름 입력
            </h2>
            <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
              보드에 표시될 이름을 입력하세요
            </p>

            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
              placeholder="예: 홍길동"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12, border: `2px solid ${error ? '#EF4444' : '#374151'}`,
                background: '#0F172A', color: '#fff', fontSize: 18, fontWeight: 600,
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
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><ArrowRight size={18} /> 보드 목록 보기</>}
            </button>

            <button onClick={() => setStep('code')} style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13 }}>
              ← 코드 다시 입력
            </button>
          </div>
        )}

        {/* Step 3: 로비 (조 선택) */}
        {step === 'lobby' && session && (
          <div>
            <div style={{ background: '#1E293B', borderRadius: 14, padding: '16px 20px', marginBottom: isEndedSession ? 12 : 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>{session.class_name}</p>
                <p style={{ color: '#60A5FA', fontSize: 12, margin: 0 }}>
                  안녕하세요, <strong>{name}</strong>님 👋
                </p>
              </div>
              {!isEndedSession && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#10B981', fontSize: 20, fontWeight: 800 }}>{totalJoined}</div>
                  <div style={{ color: '#6B7280', fontSize: 11 }}>명 참여 중</div>
                </div>
              )}
            </div>

            {isEndedSession && (
              <div style={{ background: '#1C1917', border: '1px solid #44403C', borderRadius: 10, padding: '10px 16px', marginBottom: 12, textAlign: 'center' }}>
                <p style={{ color: '#A8A29E', fontSize: 13, margin: 0 }}>
                  수업은 종료되었지만 기존 보드에서 이어서 작업할 수 있어요. 내 조를 선택하세요.
                </p>
              </div>
            )}

            {myGroupName && (
              <div style={{ background: '#0D2137', border: '1px solid #1E40AF', borderRadius: 10, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />
                <p style={{ color: '#93C5FD', fontSize: 13, margin: 0 }}>
                  <strong>{name}</strong>님은 <strong style={{ color: '#fff' }}>{myGroupName}</strong> 조로 배정되어 있습니다.
                </p>
              </div>
            )}

            <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>
              {myGroupName
                ? `${myGroupName} 보드에 입장하세요`
                : isEndedSession ? '내 조 보드 선택' : '내 조를 선택해서 입장하세요'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {boards.map((board, i) => {
                const isFull = !isEndedSession && board.memberCount >= session.group_size;
                const color = BOARD_COLORS[i % BOARD_COLORS.length];
                return (
                  <button
                    key={board.id}
                    onClick={() => !isFull && handleJoinBoard(board.id, board.group_name)}
                    disabled={isFull || joining !== null}
                    style={{
                      background: '#1E293B', border: `2px solid ${isFull ? '#374151' : color}`,
                      borderRadius: 14, padding: '20px 16px', cursor: isFull ? 'not-allowed' : 'pointer',
                      opacity: isFull ? 0.5 : 1, textAlign: 'left', transition: 'all 0.15s',
                      position: 'relative', overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (!isFull) e.currentTarget.style.background = '#243044'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#1E293B'; }}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: isFull ? '#374151' : color, borderRadius: '14px 14px 0 0' }} />

                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
                      {board.group_name}
                      {isFull && <span style={{ fontSize: 14, marginLeft: 6 }}>🔒</span>}
                    </div>

                    {!isEndedSession && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                        <Users size={12} color={isFull ? '#6B7280' : '#60A5FA'} />
                        <span style={{ color: isFull ? '#6B7280' : '#60A5FA', fontSize: 12, fontWeight: 600 }}>
                          {board.memberCount}/{session.group_size}명
                        </span>
                      </div>
                    )}

                    {isEndedSession && (
                      <div style={{ color: '#60A5FA', fontSize: 12, marginBottom: 8 }}>이어서 작업하기</div>
                    )}

                    {!isEndedSession && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {Array.from({ length: session.group_size }, (_, j) => (
                          <div key={j} style={{ width: 10, height: 10, borderRadius: '50%', background: j < board.memberCount ? color : '#374151', transition: 'background 0.3s' }} />
                        ))}
                      </div>
                    )}

                    {joining === board.id && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
                        <Loader2 size={24} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {!isEndedSession && (
              <p style={{ color: '#4B5563', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
                정원이 찬 조는 입장할 수 없습니다 · 3초마다 자동 갱신
              </p>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { border-color: #3B82F6 !important; }
      `}</style>
    </div>
  );
}
