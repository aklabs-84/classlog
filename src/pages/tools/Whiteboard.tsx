import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Save, Check, Loader2, AlertCircle, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, isAnonymousUser } from '../../lib/auth';
import type { BoardObject, Whiteboard as WhiteboardType, ActiveTool, TemplateKey } from '../../components/whiteboard/types';
import WhiteboardCanvas from '../../components/whiteboard/WhiteboardCanvas';
import { createTemplateObjects } from '../../components/whiteboard/boardUtils';
import TemplateSelector from '../../components/whiteboard/toolbar/TemplateSelector';
import { useRealtimeBoard } from '../../components/whiteboard/hooks/useRealtimeBoard';
import ConnectionStatus from '../../components/whiteboard/ui/ConnectionStatus';
import MembersBar from '../../components/whiteboard/ui/MembersBar';
import CapacityAlert from '../../components/whiteboard/ui/CapacityAlert';
import ClassLinkModal from '../../components/whiteboard/ui/ClassLinkModal';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';
import { uploadBoardImage } from '../../components/whiteboard/utils/imageUtils';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function Whiteboard() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // /wb-join 에서 진입한 학생이면 true (isAnon 체크 대신 state 기반으로 판단)
  const fromWbJoin = !!(location.state as Record<string, unknown> | null)?.fromWbJoin;
  // 학생 페이지에서 진입한 경우 돌아갈 경로
  const returnTo = (location.state as Record<string, unknown> | null)?.returnTo as string | undefined;

  const [board, setBoard] = useState<WhiteboardType | null>(null);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boardReady, setBoardReady] = useState(false); // 보드 존재 확인 후 Realtime 연결
  const [isNewBoard, setIsNewBoard] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('새 보드');
  const [showClassLinkModal, setShowClassLinkModal] = useState(false);
  const [linkedClassName, setLinkedClassName] = useState<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardRef = useRef<BoardObject | null>(null);
  const historyStack = useRef<BoardObject[][]>([]);
  const pasteOffsetRef = useRef(0);

  // Realtime: 원격 변경사항 수신 (auto-save 미트리거)
  const onRemoteChange = useCallback((event: 'created' | 'updated' | 'deleted', data: unknown) => {
    const payload = data as Record<string, unknown>;
    setObjects(prev => {
      if (event === 'created') {
        const obj = payload.object as BoardObject;
        if (prev.some(o => o.id === obj.id)) return prev;
        return [...prev, obj];
      }
      if (event === 'updated') {
        return prev.map(o => {
          if (o.id !== payload.id) return o;
          const changes = payload.changes as Partial<BoardObject>;
          const localMs = o.updated_at ? new Date(o.updated_at).getTime() : 0;
          const remoteMs = changes.updated_at ? new Date(changes.updated_at).getTime() : 0;
          return remoteMs >= localMs ? { ...o, ...changes } : o;
        });
      }
      if (event === 'deleted') {
        return prev.filter(o => o.id !== payload.id);
      }
      return prev;
    });
  }, []);

  // Realtime: 폴링 폴백 — DB 상태로 병합
  const onPollSync = useCallback((newObjects: BoardObject[]) => {
    setObjects(prev => {
      const localMap = new Map(prev.map(o => [o.id, o]));
      const merged = newObjects.map(remote => {
        const local = localMap.get(remote.id);
        if (!local) return remote;
        const localMs = local.updated_at ? new Date(local.updated_at).getTime() : 0;
        const remoteMs = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        return remoteMs >= localMs ? remote : local;
      });
      const remoteIds = new Set(newObjects.map(o => o.id));
      return [...merged, ...prev.filter(o => !remoteIds.has(o.id))];
    });
  }, []);

  // Realtime 훅 — boardReady(보드 존재 확인) 후에만 실제 연결
  const {
    members, connectionStatus, remoteCursors,
    isViewer, showCapacityAlert, capacityInfo,
    onAcceptViewer, onDeclineViewer,
    emitObjectCreated, emitObjectUpdated, emitObjectDeleted, emitCursorMove,
  } = useRealtimeBoard(
    boardReady ? (boardId ?? '__none__') : '__none__',
    {
      id: user?.id ?? '',
      email: user?.email ?? '',
      // 교사는 user_metadata 무시하고 email 기반 표시 (테스트 중 오염된 메타데이터 우회)
      // 학생(fromWbJoin)만 user_metadata.display_name 또는 localStorage 이름 사용
      displayName: fromWbJoin
        ? ((user as any)?.user_metadata?.display_name ?? localStorage.getItem('wb_student_name') ?? undefined)
        : undefined,
    },
    onRemoteChange,
    onPollSync,
  );

  // 학생/익명 나가기 공통 처리 — 익명 세션 정리 후 이동
  const handleStudentExit = useCallback(() => {
    const isAnon = isAnonymousUser(user);
    if (fromWbJoin || isAnon) {
      if (isAnon) {
        supabase.auth.signOut(); // 익명 세션 즉시 파기
        navigate('/wb-join', { replace: true });
      } else if (returnTo) {
        // 학생 페이지에서 왔을 경우 → 보드 탭으로 복귀
        navigate(returnTo, { replace: true, state: { activeTab: 'board' } });
      } else {
        navigate('/wb-join', { replace: true });
      }
    } else {
      navigate('/teaching-tools', { state: { activeToolId: 'whiteboard' } });
    }
  }, [user, fromWbJoin, returnTo, navigate]);

  // 정원 초과 거절 → 목록으로 이동 (학생이면 wb-join으로)
  const handleDeclineViewer = useCallback(() => {
    onDeclineViewer();
    handleStudentExit();
  }, [onDeclineViewer, handleStudentExit]);

  // 교사 계정에 오염된 display_name 메타데이터가 있으면 자동 정리
  useEffect(() => {
    if (!fromWbJoin && user && !isAnonymousUser(user) && (user as any)?.user_metadata?.display_name) {
      supabase.auth.updateUser({ data: { display_name: null } });
    }
  }, [user, fromWbJoin]);

  // 보드 로드
  useEffect(() => {
    if (!boardId) return;
    (async () => {
      const { data: boardData } = await supabase.from('whiteboards').select('*').eq('id', boardId).single();
      if (!boardData) {
        // 신규 보드 생성 모드
        setIsNewBoard(true);
        setShowTemplateSelector(true);
        setLoading(false);
        return;
      }
      setBoard(boardData);
      setTitle(boardData.title);
      // 연결된 클래스명 조회
      if (boardData.class_id) {
        const { data: classData } = await supabase
          .from('classes').select('name').eq('id', boardData.class_id).single();
        if (classData) setLinkedClassName(classData.name);
      }
      const { data: objData } = await supabase.from('board_objects').select('*').eq('board_id', boardId).order('z_index');
      setObjects(objData || []);
      setLoading(false);
      setBoardReady(true); // 보드 확인 완료 → Realtime 연결 허용
    })();
  }, [boardId]);

  // saveObjects를 ref로 관리해서 auto-save의 stale closure 방지
  const saveObjectsRef = useRef<((objs: BoardObject[]) => Promise<void>) | undefined>(undefined);

  // 자동 저장 (디바운스 2초)
  const scheduleAutoSave = useCallback((updatedObjects: BoardObject[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveObjectsRef.current?.(updatedObjects), 2000);
  }, []);

  const saveObjects = async (objs: BoardObject[]) => {
    if (!boardId) return;
    setSaveStatus('saving');

    const isCreator = board?.created_by === user?.id;

    // 보드 제목·updated_at 업데이트 — 생성자만 (초대 유저는 건너뜀)
    if (isCreator) {
      const { error: boardErr } = await supabase
        .from('whiteboards')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', boardId);
      if (boardErr) { console.error('보드 저장 실패:', boardErr); setSaveStatus('error'); return; }
    }

    // 객체 전체 교체 (공개 보드 편집 권한은 WHITEBOARD_SHARE_FIX.sql 필요)
    const { error: delErr } = await supabase.from('board_objects').delete().eq('board_id', boardId);
    if (delErr) { console.error('객체 삭제 실패:', delErr); setSaveStatus('error'); return; }

    if (objs.length > 0) {
      const toInsert = objs.map(o => ({ ...o, created_by: o.created_by ?? user?.id }));
      const { error: insErr } = await supabase.from('board_objects').insert(toInsert);
      if (insErr) { console.error('객체 저장 실패:', insErr); setSaveStatus('error'); return; }
    }
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // 매 렌더마다 ref를 최신 saveObjects로 갱신
  saveObjectsRef.current = saveObjects;

  const pushHistory = useCallback((snapshot: BoardObject[]) => {
    historyStack.current = [...historyStack.current.slice(-19), snapshot];
  }, []);

  const handleAddObject = useCallback((obj: BoardObject) => {
    setObjects(prev => {
      pushHistory(prev);
      const next = [...prev, obj];
      scheduleAutoSave(next);
      return next;
    });
    emitObjectCreated(obj);
  }, [scheduleAutoSave, emitObjectCreated, pushHistory]);

  // 끌기·크기조절은 pointermove마다 호출되므로, 화면 반영은 즉시 하되 다른 참가자에게 보내는 브로드캐스트는
  // 오브젝트별로 묶어(100ms) 마지막 상태까지 함께 보낸다 — 동시 접속자가 많을 때 메시지 폭주를 막는다.
  const pendingEmits = useRef<Map<string, { changes: Partial<BoardObject>; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const emitUpdatedRef = useRef(emitObjectUpdated);
  emitUpdatedRef.current = emitObjectUpdated;
  useEffect(() => () => {
    pendingEmits.current.forEach(({ changes, timer }, id) => { clearTimeout(timer); emitUpdatedRef.current(id, changes); });
    pendingEmits.current.clear();
  }, []);

  const handleUpdateObject = useCallback((id: string, changes: Partial<BoardObject>) => {
    const stamped = { ...changes, updated_at: new Date().toISOString() };
    setObjects(prev => {
      pushHistory(prev);
      const next = prev.map(o => o.id === id ? { ...o, ...stamped } : o);
      scheduleAutoSave(next);
      return next;
    });
    const pending = pendingEmits.current.get(id);
    if (pending) {
      pending.changes = { ...pending.changes, ...stamped };
      return;
    }
    const entry = {
      changes: stamped as Partial<BoardObject>,
      timer: setTimeout(() => {
        pendingEmits.current.delete(id);
        emitUpdatedRef.current(id, entry.changes);
      }, 100),
    };
    pendingEmits.current.set(id, entry);
  }, [scheduleAutoSave, pushHistory]);

  const handleDeleteObject = useCallback((id: string) => {
    setObjects(prev => {
      pushHistory(prev);
      const next = prev.filter(o => o.id !== id);
      scheduleAutoSave(next);
      return next;
    });
    setSelectedId(null);
    emitObjectDeleted(id);
  }, [scheduleAutoSave, emitObjectDeleted, pushHistory]);

  const getNextZIndex = useCallback(() => {
    return objects.length > 0 ? Math.max(...objects.map(o => o.z_index)) + 1 : 1;
  }, [objects]);

  // 전역 붙여넣기: 이미지 → 업로드, 아니면 내부 clipboard 객체 붙여넣기
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!boardId) return;
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      if (item) {
        const file = item.getAsFile();
        if (!file) return;
        const tempId = uuidv4();
        const placeholder: BoardObject = {
          id: tempId, board_id: boardId, type: 'image',
          x: 200, y: 150, width: 320, height: 240,
          z_index: getNextZIndex(),
          content: { url: '', caption: '' },
          style: {},
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        handleAddObject(placeholder);
        const publicUrl = await uploadBoardImage(file);
        if (publicUrl) handleUpdateObject(tempId, { content: { url: publicUrl, caption: '' } });
        return;
      }
      // 내부 객체 붙여넣기 (Ctrl/Cmd+V)
      if (clipboardRef.current) {
        pasteOffsetRef.current = (pasteOffsetRef.current + 20) % 200;
        const offset = pasteOffsetRef.current;
        const src = clipboardRef.current;
        const newObj: BoardObject = {
          ...src,
          id: uuidv4(),
          board_id: boardId,
          x: src.x + offset,
          y: src.y + offset,
          z_index: getNextZIndex(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        handleAddObject(newObj);
        setSelectedId(newObj.id);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [boardId, handleAddObject, handleUpdateObject, getNextZIndex]);

  // Ctrl/Cmd+C (복사) / Ctrl/Cmd+Z (실행취소)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'c') {
        if (selectedId) {
          setObjects(prev => {
            const found = prev.find(o => o.id === selectedId);
            if (found) { clipboardRef.current = found; pasteOffsetRef.current = 0; }
            return prev;
          });
        }
      }
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const prev = historyStack.current.pop();
        if (prev) {
          setObjects(prev);
          setSelectedId(null);
          scheduleAutoSave(prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, scheduleAutoSave]);

  // 템플릿 선택 시 보드 생성
  const handleTemplateSelect = async (templateKey: TemplateKey) => {
    if (!boardId || !user) return;
    setShowTemplateSelector(false);
    const { data } = await supabase.from('whiteboards').upsert({
      id: boardId, title: '새 보드', template: templateKey,
      created_by: user.id, share_token: boardId, is_public: false,
    }).select().single();
    if (data) { setBoard(data); setTitle(data.title); }
    const initObjects = createTemplateObjects(boardId, templateKey);
    setObjects(initObjects);
    if (initObjects.length > 0) {
      await supabase.from('board_objects').insert(initObjects.map(o => ({ ...o, created_by: user.id })));
    }
    setLoading(false);
    setBoardReady(true); // 신규 보드 생성 완료 → Realtime 연결 허용
  };

  // PNG 내보내기
  const handleExportPng = async () => {
    const el = canvasContainerRef.current?.querySelector('[data-canvas="true"]') as HTMLElement;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${title}.png`;
    a.click();
  };

  // URL 공유 — is_public=true 설정 후 링크 복사
  const handleShare = async () => {
    if (!boardId) return;
    await supabase.from('whiteboards').update({ is_public: true }).eq('id', boardId);
    await navigator.clipboard.writeText(window.location.href);
    alert('링크가 복사되었습니다.\n이 보드는 이제 링크를 아는 누구나 접근하여 함께 편집할 수 있습니다.');
  };

  if (loading && !showTemplateSelector) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f3f4f6', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ height: 52, background: '#1e1e1e', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', flexShrink: 0, zIndex: 100 }}>
        <button
          onClick={handleStudentExit}
          style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
        >
          <ArrowLeft size={16} /> {(fromWbJoin || isAnonymousUser(user)) ? '수업 나가기' : '뒤로'}
        </button>
        <div style={{ width: 1, height: 20, background: '#333' }} />
        {editingTitle ? (
          <input
            autoFocus value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(false); }}
            style={{ background: 'transparent', border: '1px solid #3B82F6', borderRadius: 4, color: '#fff', fontSize: 14, fontWeight: 'bold', padding: '3px 8px', outline: 'none', minWidth: 160 }}
          />
        ) : (
          <span onDoubleClick={() => setEditingTitle(true)} style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'text', padding: '3px 0' }}>
            {title}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 클래스 뱃지 — 선생님만 표시 (학생 진입 시 숨김) */}
          {linkedClassName && !fromWbJoin && (
            <button
              onClick={() => setShowClassLinkModal(true)}
              title="클래스 연결 설정"
              style={{
                background: '#1D4ED8', border: 'none', borderRadius: 6,
                padding: '3px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Users size={11} color="#BFDBFE" />
              <span style={{ color: '#BFDBFE', fontSize: 11 }}>{linkedClassName}</span>
            </button>
          )}

          {/* 접속 멤버 */}
          {members.length > 0 && (
            <MembersBar members={members} currentUserId={user?.id ?? ''} />
          )}
          {/* 연결 상태 */}
          <ConnectionStatus status={connectionStatus} />

          <div style={{ width: 1, height: 20, background: '#333' }} />

          {/* 저장 상태 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: saveStatus === 'error' ? '#EF4444' : '#6B7280' }}>
            {saveStatus === 'saving' && <><Loader2 size={13} /> 저장 중...</>}
            {saveStatus === 'saved' && <><Check size={13} color="#10B981" /> 저장됨</>}
            {saveStatus === 'error' && <><AlertCircle size={13} /> 저장 실패</>}
          </div>
          {!isViewer && (
            <button onClick={() => saveObjects(objects)} style={{ background: '#374151', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Save size={13} /> 저장
            </button>
          )}
          {/* 클래스 연결 버튼 (생성자만) */}
          {board?.created_by === user?.id && (
            <button
              onClick={() => setShowClassLinkModal(true)}
              title="클래스 연결"
              style={{
                background: linkedClassName ? '#1D4ED8' : '#374151',
                border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px',
                cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Users size={13} /> 클래스
            </button>
          )}
          <button onClick={handleShare} style={{ background: '#374151', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Share2 size={13} /> 공유
          </button>
          <button onClick={handleExportPng} style={{ background: '#3B82F6', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={13} /> 내보내기
          </button>
        </div>
      </div>

      {/* 캔버스 영역 */}
      <div ref={canvasContainerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div data-canvas="true" style={{ width: '100%', height: '100%' }}>
          <WhiteboardCanvas
            boardId={boardId!}
            objects={objects}
            activeTool={activeTool}
            selectedId={selectedId}
            isViewer={isViewer}
            remoteCursors={remoteCursors}
            onToolChange={setActiveTool}
            onSelectObject={setSelectedId}
            onAddObject={handleAddObject}
            onUpdateObject={handleUpdateObject}
            onDeleteObject={handleDeleteObject}
            onCursorMove={emitCursorMove}
          />
        </div>
      </div>

      {/* 템플릿 선택 모달 */}
      {showTemplateSelector && (
        <TemplateSelector
          onSelect={handleTemplateSelect}
          onClose={() => { if (!isNewBoard) setShowTemplateSelector(false); else navigate(-1); }}
        />
      )}

      {/* 정원 초과 알림 */}
      {showCapacityAlert && (
        <CapacityAlert
          onAcceptViewer={onAcceptViewer}
          onDecline={handleDeclineViewer}
          maxEditors={capacityInfo.maxEditors}
          currentEditors={capacityInfo.currentEditors}
        />
      )}

      {/* 클래스 연결 모달 */}
      {showClassLinkModal && boardId && (
        <ClassLinkModal
          boardId={boardId}
          currentClassId={board?.class_id}
          onClose={() => setShowClassLinkModal(false)}
          onLinked={(classId, name) => {
            setLinkedClassName(name);
            if (board) setBoard({ ...board, class_id: classId ?? undefined });
            setShowClassLinkModal(false);
          }}
        />
      )}
    </div>
  );
}
