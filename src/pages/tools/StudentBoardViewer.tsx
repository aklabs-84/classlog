import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Eye, WifiOff, Radio } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { BoardObject, ActiveTool } from '../../components/whiteboard/types';
import WhiteboardCanvas from '../../components/whiteboard/WhiteboardCanvas';

type SyncStatus = 'loading' | 'live' | 'error';

const POLL_MS = 3000;

export default function StudentBoardViewer() {
  const { boardId } = useParams<{ boardId: string }>();
  const [title, setTitle] = useState('');
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [className, setClassName] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    const { data: boardData, error } = await supabase
      .from('whiteboards')
      .select('id, title, is_public, class_id')
      .eq('id', boardId)
      .single();

    if (error || !boardData || !boardData.is_public) {
      setSyncStatus('error');
      return;
    }

    setTitle(boardData.title);

    // 클래스명 조회 (있을 때만)
    if (boardData.class_id) {
      const { data: boardClassName } = await supabase.rpc('board_class_name', { p_board_id: boardId });
      if (boardClassName) setClassName(boardClassName);
    }

    const { data: objData } = await supabase
      .from('board_objects')
      .select('*')
      .eq('board_id', boardId)
      .order('z_index');

    setObjects(objData || []);
    setSyncStatus('live');
  }, [boardId]);

  // 최초 로드
  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // 3초 폴링으로 교사 변경사항 반영
  useEffect(() => {
    if (syncStatus === 'error') return;

    pollingRef.current = setInterval(async () => {
      if (!boardId) return;
      const { data } = await supabase
        .from('board_objects')
        .select('*')
        .eq('board_id', boardId)
        .order('z_index');
      if (data) setObjects(data);
    }, POLL_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [boardId, syncStatus]);

  // 뷰어: 편집 콜백은 모두 no-op
  const noop = useCallback(() => {}, []);
  const noopId = useCallback((_id: string | null) => {}, []);
  const noopChanges = useCallback((_id: string, _changes: Partial<BoardObject>) => {}, []);
  const noopObj = useCallback((_obj: BoardObject) => {}, []);
  const noopTool = useCallback((_tool: ActiveTool) => {}, []);

  if (syncStatus === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', gap: 12 }}>
        <Loader2 size={32} color="#3B82F6" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6B7280', fontSize: 14 }}>보드를 불러오는 중...</p>
      </div>
    );
  }

  if (syncStatus === 'error') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', gap: 12 }}>
        <WifiOff size={40} color="#9CA3AF" />
        <p style={{ color: '#374151', fontSize: 16, fontWeight: 600 }}>보드를 찾을 수 없어요</p>
        <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
          선생님께 보드 접속 링크를 다시 요청해주세요.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f3f4f6', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ height: 48, background: '#1e1e1e', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', flexShrink: 0, zIndex: 100 }}>
        {/* 보기 전용 배지 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#374151', borderRadius: 6, padding: '3px 10px' }}>
          <Eye size={13} color="#9CA3AF" />
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>보기 전용</span>
        </div>

        <div style={{ width: 1, height: 18, background: '#333' }} />

        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{title}</span>

        {className && (
          <div style={{ background: '#1D4ED8', borderRadius: 6, padding: '2px 8px' }}>
            <span style={{ color: '#BFDBFE', fontSize: 11 }}>{className}</span>
          </div>
        )}

        {/* 동기화 상태 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: '#10B981', fontSize: 12 }}>
          <Radio size={13} />
          <span>실시간 동기화 중</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s infinite', display: 'inline-block' }} />
        </div>
      </div>

      {/* 캔버스 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div data-canvas="true" style={{ width: '100%', height: '100%' }}>
          <WhiteboardCanvas
            boardId={boardId!}
            objects={objects}
            activeTool="select"
            selectedId={null}
            isViewer={true}
            remoteCursors={{}}
            onToolChange={noopTool}
            onSelectObject={noopId}
            onAddObject={noopObj}
            onUpdateObject={noopChanges}
            onDeleteObject={noopId}
            onCursorMove={noop}
          />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
