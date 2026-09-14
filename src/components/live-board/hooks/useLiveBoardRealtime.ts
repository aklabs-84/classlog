import { useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';

export interface LiveBoardResponse {
  id: string;
  board_id: string;
  student_user_id: string;
  nickname: string;
  content: string;
  created_at: string;
}

interface UseLiveBoardRealtimeOptions {
  boardId: string;
  onResponseAdded?: (response: LiveBoardResponse) => void;
  onResponseDeleted?: (id: string) => void;
  onToggle?: (isOpen: boolean) => void;
  onEnded?: () => void;
}

export interface UseLiveBoardRealtimeReturn {
  emitResponseAdded: (response: LiveBoardResponse) => void;
  emitResponseDeleted: (id: string) => void;
  emitToggle: (isOpen: boolean) => void;
  emitEnded: () => void;
}

// 화이트보드와 달리 제출/삭제/토글처럼 드문 이벤트만 오가므로
// 하트비트·커서·폴링 없이 broadcast 채널 하나로 충분히 저지연을 낸다.
export function useLiveBoardRealtime({
  boardId, onResponseAdded, onResponseDeleted, onToggle, onEnded,
}: UseLiveBoardRealtimeOptions): UseLiveBoardRealtimeReturn {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!boardId) return;

    const channel = supabase.channel(`live-board:${boardId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'response:new' }, ({ payload }) => {
        onResponseAdded?.(payload as LiveBoardResponse);
      })
      .on('broadcast', { event: 'response:delete' }, ({ payload }) => {
        onResponseDeleted?.((payload as { id: string }).id);
      })
      .on('broadcast', { event: 'board:toggle' }, ({ payload }) => {
        onToggle?.((payload as { isOpen: boolean }).isOpen);
      })
      .on('broadcast', { event: 'board:ended' }, () => {
        onEnded?.();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const emitResponseAdded = useCallback((response: LiveBoardResponse) => {
    channelRef.current?.send({ type: 'broadcast', event: 'response:new', payload: response });
  }, []);

  const emitResponseDeleted = useCallback((id: string) => {
    channelRef.current?.send({ type: 'broadcast', event: 'response:delete', payload: { id } });
  }, []);

  const emitToggle = useCallback((isOpen: boolean) => {
    channelRef.current?.send({ type: 'broadcast', event: 'board:toggle', payload: { isOpen } });
  }, []);

  const emitEnded = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'board:ended', payload: {} });
  }, []);

  return { emitResponseAdded, emitResponseDeleted, emitToggle, emitEnded };
}
