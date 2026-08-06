import { useState, useEffect, useCallback } from 'react';

export type NotifPermissionState = 'unsupported' | NotificationPermission;

// 알림 권한은 로그인 세션이 아니라 "이 기기의 이 브라우저"에 저장되는 값이라
// 같은 계정이라도 기기마다 별도로 켜야 한다 — 그래서 서버(Supabase) 동기화 없이
// 브라우저 Notification API 상태를 실시간으로 읽어서 보여준다.
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotifPermissionState>(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (!('Notification' in window)) return;

    const sync = () => setPermission(Notification.permission);
    sync();

    // Chrome/Edge/Android: 브라우저 알림 설정을 바꾸면 즉시 반영
    let permStatus: PermissionStatus | null = null;
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((status) => {
          permStatus = status;
          status.onchange = sync;
        })
        .catch(() => {});
    }

    // Safari 등 permissions API 미지원 브라우저 대비 — 탭 복귀 시 재확인
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);

    return () => {
      if (permStatus) permStatus.onchange = null;
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const request = useCallback(async (): Promise<NotifPermissionState> => {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, request };
}
