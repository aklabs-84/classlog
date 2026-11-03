-- 매일 한국시간 오전 9시 10분: Supabase 요청 수 점검 (평소의 2배 + 10만 건 이상이면 슬랙·앱 푸시)
-- 기록은 usage_alert_state 표를 재사용하므로 새 표는 없음. 요청 1건/일.
select cron.schedule(
  'request-check-daily',
  '10 0 * * *',
  $$select net.http_post(
    url := 'https://classlog-ai.vercel.app/api/slack?type=request-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
    ),
    body := '{}'::jsonb
  );$$
);
