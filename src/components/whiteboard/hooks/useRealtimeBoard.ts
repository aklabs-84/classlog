import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import type { BoardObject, SessionMember, ConnectionStatus, RemoteCursor } from '../types';

const AVATAR_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4'];
const MAX_EDITORS = 200; // class_board_sessions.group_size 미설정 시 사실상 무제한
const HEARTBEAT_MS = 10_000;  // Realtime 상태와 무관하게 항상 실행
const SESSION_EXPIRY_MS = 45_000;  // fetchMembers 컷오프: 45초
const CURSOR_FADE_MS = 5_000;
const POLLING_MS = 3_000;
const CURSOR_THROTTLE_MS = 150; // 동시 접속자가 많을 때 메시지 폭주를 막기 위해 50→150ms

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getDisplayName(user: { email?: string; id: string; displayName?: string }): string {
  if (user.displayName) return user.displayName.slice(0, 10);
  if (user.email) return user.email.split('@')[0].slice(0, 8);
  return `사용자${user.id.slice(0, 4)}`;
}

export interface UseRealtimeBoardReturn {
  members: SessionMember[];
  connectionStatus: ConnectionStatus;
  remoteCursors: Record<string, RemoteCursor>;
  isViewer: boolean;
  showCapacityAlert: boolean;
  capacityInfo: { maxEditors: number; currentEditors: number };
  onAcceptViewer: () => void;
  onDeclineViewer: () => void;
  emitObjectCreated: (obj: BoardObject) => void;
  emitObjectUpdated: (id: string, changes: Partial<BoardObject>) => void;
  emitObjectDeleted: (id: string) => void;
  emitCursorMove: (canvasX: number, canvasY: number) => void;
}

export function useRealtimeBoard(
  boardId: string,
  user: { id: string; email?: string; displayName?: string },
  onRemoteChange: (event: 'created' | 'updated' | 'deleted', data: unknown) => void,
  onPollSync: (objects: BoardObject[]) => void,
): UseRealtimeBoardReturn {
  const [members, setMembers] = useState<SessionMember[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [showCapacityAlert, setShowCapacityAlert] = useState(false);
  const [isViewer, setIsViewer] = useState(false);
  const [capacityInfo, setCapacityInfo] = useState<{ maxEditors: number; currentEditors: number }>({ maxEditors: MAX_EDITORS, currentEditors: 0 });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sessionIdRef = useRef<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const isViewerRef = useRef(false);
  const lastCursorEmit = useRef(0);
  // Realtime 연결 상태와 무관하게 항상 동작하는 세션 유지 인터벌
  const sessionPingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const avatarColor = getAvatarColor(user.id);
  const displayName = getDisplayName(user);

  // auth 토큰을 ref에 캐싱 — beforeunload(동기) 핸들러에서 사용
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      authTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    setConnectionStatus('polling');
    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('board_objects').select('*').eq('board_id', boardId).order('z_index');
      if (data) onPollSync(data as BoardObject[]);
    }, POLLING_MS);
  }, [boardId, onPollSync]);

  const stopSessionPing = useCallback(() => {
    if (sessionPingRef.current) { clearInterval(sessionPingRef.current); sessionPingRef.current = null; }
  }, []);

  const registerSession = useCallback(async () => {
    // DELETE 제거: user_id 기반 삭제는 같은 브라우저의 다른 학생 세션까지 지우는 버그 발생
    // 정리는 removeSession(퇴장 시 id로 삭제)과 last_ping 만료(45s)에 위임
    const { data, error } = await supabase
      .from('whiteboard_sessions')
      .insert({ board_id: boardId, user_id: user.id, display_name: displayName, avatar_color: avatarColor })
      .select('id').single();
    if (error) console.error('[WB] registerSession INSERT 실패:', error.code, error.message);
    if (data) { sessionIdRef.current = data.id; }
  }, [boardId, user.id, displayName, avatarColor]);

  const removeSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    await supabase.from('whiteboard_sessions').delete().eq('id', sessionIdRef.current);
    sessionIdRef.current = null;
  }, []);

  const fetchMembers = useCallback(async () => {
    const cutoff = new Date(Date.now() - SESSION_EXPIRY_MS).toISOString();
    const { data, error } = await supabase
      .from('whiteboard_sessions').select('user_id, display_name, avatar_color, last_ping')
      .eq('board_id', boardId).gte('last_ping', cutoff)
      .order('last_ping', { ascending: false });
    if (error) { return; }
    if (!data) return;
    const map = new Map<string, SessionMember>();
    for (const s of data) {
      // last_ping DESC 정렬이므로 먼저 나온 것이 최신 → 이미 있으면 덮어쓰지 않음
      if (!map.has(s.user_id)) {
        map.set(s.user_id, {
          userId: s.user_id,
          displayName: s.display_name ?? s.user_id.slice(0, 6),
          avatarColor: s.avatar_color ?? '#6B7280',
          lastPing: s.last_ping,
        });
      }
    }
    setMembers(Array.from(map.values()));
  }, [boardId]);

  // Subscribe to Realtime channel (viewer or editor)
  const subscribe = useCallback((asViewer: boolean) => {
    const channel = supabase.channel(`board:${boardId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'object:created' }, ({ payload }) => {
        if ((payload as { userId?: string }).userId === user.id) return;
        onRemoteChange('created', payload);
      })
      .on('broadcast', { event: 'object:updated' }, ({ payload }) => {
        if ((payload as { userId?: string }).userId === user.id) return;
        onRemoteChange('updated', payload);
      })
      .on('broadcast', { event: 'object:deleted' }, ({ payload }) => {
        if ((payload as { userId?: string }).userId === user.id) return;
        onRemoteChange('deleted', payload);
      })
      .on('broadcast', { event: 'cursor:move' }, ({ payload }) => {
        const p = payload as { userId: string; canvasX: number; canvasY: number; displayName: string; avatarColor: string };
        if (p.userId === user.id) return;
        setRemoteCursors(prev => ({
          ...prev,
          [p.userId]: { ...p, lastSeen: Date.now() },
        }));
        if (cursorTimers.current[p.userId]) clearTimeout(cursorTimers.current[p.userId]);
        cursorTimers.current[p.userId] = setTimeout(() => {
          setRemoteCursors(prev => { const n = { ...prev }; delete n[p.userId]; return n; });
        }, CURSOR_FADE_MS);
      })
      .on('broadcast', { event: 'member:join' }, ({ payload }) => {
        const p = payload as SessionMember;
        setMembers(prev => [...prev.filter(m => m.userId !== p.userId), { ...p, lastPing: new Date().toISOString() }]);
      })
      .on('broadcast', { event: 'member:leave' }, ({ payload }) => {
        const p = payload as { userId: string };
        setMembers(prev => prev.filter(m => m.userId !== p.userId));
        setRemoteCursors(prev => { const n = { ...prev }; delete n[p.userId]; return n; });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          stopPolling();
          setConnectionStatus('connected');
          await fetchMembers();
          if (!asViewer) {
            channel.send({ type: 'broadcast', event: 'member:join',
              payload: { userId: user.id, displayName, avatarColor, lastPing: new Date().toISOString() } });
          }
        } else if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          setConnectionStatus('polling');
          startPolling();
          // 10초 후 재연결 시도 (기존 30초 → 10초로 단축)
          setTimeout(() => {
            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
            subscribe(asViewer);
          }, 10_000);
        }
      });

    channelRef.current = channel;
  }, [boardId, user.id, displayName, avatarColor, fetchMembers, onRemoteChange, startPolling, stopPolling]);

  // Initial connect: check capacity → register session → subscribe
  const connect = useCallback(async () => {
    // Fetch board info to determine ownership and class-specific group_size
    const { data: boardRow } = await supabase
      .from('whiteboards').select('class_id, created_by').eq('id', boardId).maybeSingle();

    // Board owner (teacher who created it) bypasses capacity check
    const isOwner = boardRow?.created_by === user.id;

    if (!isOwner) {
      let maxEditors = MAX_EDITORS;
      if (boardRow?.class_id) {
        const { data: sess } = await supabase
          .from('class_board_sessions')
          .select('group_size')
          .eq('class_id', boardRow.class_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sess?.group_size) maxEditors = sess.group_size;
      }

      const cutoff = new Date(Date.now() - SESSION_EXPIRY_MS).toISOString();
      let query = supabase
        .from('whiteboard_sessions').select('user_id')
        .eq('board_id', boardId).neq('user_id', user.id).gte('last_ping', cutoff);
      // 교사(보드 소유자)는 학생 정원 카운팅에서 제외
      if (boardRow?.created_by) query = query.neq('user_id', boardRow.created_by);
      const { data } = await query;

      const uniqueEditors = new Set((data ?? []).map((s: { user_id: string }) => s.user_id)).size;
      setCapacityInfo({ maxEditors, currentEditors: uniqueEditors });
      if (uniqueEditors >= maxEditors) {
        setShowCapacityAlert(true);
        // Connect as viewer immediately so they can see board while deciding
        subscribe(true);
        return;
      }
    }

    await registerSession();
    subscribe(false);

    // Realtime 연결 상태와 무관하게 last_ping 업데이트 + 멤버 목록 동기화
    // 이 인터벌이 핵심: 채널이 CLOSED 되어도 세션이 만료되지 않음
    stopSessionPing();
    sessionPingRef.current = setInterval(async () => {
      if (sessionIdRef.current) {
        await supabase.from('whiteboard_sessions')
          .update({ last_ping: new Date().toISOString() }).eq('id', sessionIdRef.current);
      }
      await fetchMembers();
    }, HEARTBEAT_MS);
  }, [boardId, user.id, registerSession, subscribe, stopSessionPing, fetchMembers]);

  useEffect(() => {
    // boardId가 '__none__'이면 보드가 아직 준비 안 됨 → 연결 안 함
    if (!boardId || boardId === '__none__') {
      setConnectionStatus('connecting');
      return;
    }
    connect();

    // 탭 닫힘/새로고침 시 세션 정리 — fetch keepalive로 DELETE 보장
    const handleBeforeUnload = () => {
      if (!sessionIdRef.current || !authTokenRef.current) return;
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/whiteboard_sessions?id=eq.${sessionIdRef.current}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${authTokenRef.current}`,
          },
          keepalive: true,
        },
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Announce leave
      channelRef.current?.send({ type: 'broadcast', event: 'member:leave', payload: { userId: user.id } });
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      stopPolling();
      stopSessionPing();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      Object.values(cursorTimers.current).forEach(clearTimeout);
      removeSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Capacity alert handlers
  const onAcceptViewer = useCallback(() => {
    setShowCapacityAlert(false);
    setIsViewer(true);
    isViewerRef.current = true;
  }, []);

  const onDeclineViewer = useCallback(() => {
    setShowCapacityAlert(false);
    // Parent handles navigation
  }, []);

  // Emit helpers
  const emitObjectCreated = useCallback((obj: BoardObject) => {
    if (isViewerRef.current) return;
    channelRef.current?.send({ type: 'broadcast', event: 'object:created', payload: { userId: user.id, object: obj } });
  }, [user.id]);

  const emitObjectUpdated = useCallback((id: string, changes: Partial<BoardObject>) => {
    if (isViewerRef.current) return;
    channelRef.current?.send({ type: 'broadcast', event: 'object:updated', payload: { userId: user.id, id, changes } });
  }, [user.id]);

  const emitObjectDeleted = useCallback((id: string) => {
    if (isViewerRef.current) return;
    channelRef.current?.send({ type: 'broadcast', event: 'object:deleted', payload: { userId: user.id, id } });
  }, [user.id]);

  const emitCursorMove = useCallback((canvasX: number, canvasY: number) => {
    if (isViewerRef.current) return; // 보기 전용 참가자는 커서를 보내지 않는다
    const now = Date.now();
    if (now - lastCursorEmit.current < CURSOR_THROTTLE_MS) return;
    lastCursorEmit.current = now;
    channelRef.current?.send({
      type: 'broadcast', event: 'cursor:move',
      payload: { userId: user.id, canvasX, canvasY, displayName, avatarColor },
    });
  }, [user.id, displayName, avatarColor]);

  return {
    members, connectionStatus, remoteCursors,
    isViewer, showCapacityAlert, capacityInfo,
    onAcceptViewer, onDeclineViewer,
    emitObjectCreated, emitObjectUpdated, emitObjectDeleted, emitCursorMove,
  };
}
