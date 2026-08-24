// Vite의 env 주입이 적용되지 않는 정적 서비스워커라 값을 직접 명시함 (공개용 anon key, RLS로 보호됨)
const SUPABASE_URL = 'https://mxzhienqaypsammvwssb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14emhpZW5xYXlwc2FtbXZ3c3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTA4MTEsImV4cCI6MjA5MDg2NjgxMX0.YbB7TLNx-W58eEoKzeNUSg685Ug8BJH3cGRfWYgKjCI';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '클래스로그AI', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '클래스로그AI';
  const isClassAlarm = !!(data.triggerKey && data.dismissToken);
  const options = {
    body: data.body || '',
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/', triggerKey: data.triggerKey, dismissToken: data.dismissToken },
    // 클래스 알람(수업시작/쉬는시간)에만 정지 버튼 표시 — 완전히 앱이 꺼진 PWA에서도
    // 알림에서 바로 알람을 멈출 수 있게 함 (iOS Safari는 이 버튼 자체를 지원하지 않아
    // 알림 본문 클릭도 동일하게 정지 처리함 — notificationclick 핸들러 참고)
    actions: isClassAlarm ? [{ action: 'dismiss', title: '정지' }] : undefined,
    // 같은 tag로 재발송될 때(1분 간격 반복) 새 알림을 따로 쌓지 않고 기존 걸 갱신+재알림
    renotify: isClassAlarm,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const { triggerKey, dismissToken, url } = event.notification.data || {};
  event.notification.close();

  // 서버에 정지 사실을 기록 — 이걸 보고 다른 기기(PC 탭 등)의 알람도 함께 멈춘다
  const dismissRemote = () =>
    triggerKey && dismissToken
      ? fetch(`${SUPABASE_URL}/rest/v1/rpc/dismiss_class_alarm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ p_trigger_key: triggerKey, p_dismiss_token: dismissToken }),
        }).catch(() => {
          // 오프라인 등으로 실패해도 이 기기의 알림 자체는 이미 닫혔으므로 조용히 무시
        })
      : Promise.resolve();

  // "정지" 액션 버튼(지원 브라우저)뿐 아니라, 액션 버튼이 없는 iOS 등에서 알림
  // 본문을 그냥 탭한 경우(event.action === '')에도 클래스 알람이면 동일하게 정지 처리
  if (event.action === 'dismiss') {
    event.waitUntil(dismissRemote());
    return;
  }

  const targetUrl = url || '/';

  event.waitUntil(
    dismissRemote().then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
    )
  );
});
