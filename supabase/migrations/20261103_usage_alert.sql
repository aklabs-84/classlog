-- 용량 알림: 매일 아침 DB·파일 저장 용량을 재서 70%/90%를 넘으면 Slack으로 알린다 (Pro 기준 DB 8GB, 파일 100GB)
-- 같은 단계에서는 한 번만 보내고, 다시 내려가면 초기화한다. 요청 1건/일이라 비용은 거의 0.

create table if not exists public.usage_alert_state (
  key text primary key,
  level int not null default 0,
  notified_at timestamptz
);
alter table public.usage_alert_state enable row level security;
-- 정책 없음 = 일반 사용자는 접근 불가 (함수만 사용)

create or replace function public.run_usage_check()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  items jsonb := '[]'::jsonb;
  r record;
  pct numeric;
  lvl int;
  prev int;
begin
  for r in
    select * from (values
      ('db',      '데이터베이스', pg_database_size(current_database())::numeric,                                         8::numeric * 1024^3),
      ('storage', '파일 저장',    (select coalesce(sum((metadata->>'size')::numeric), 0) from storage.objects),            100::numeric * 1024^3)
    ) as t(key, label, used, lim)
  loop
    pct := round(r.used / r.lim * 100, 1);
    lvl := case when pct >= 90 then 90 when pct >= 70 then 70 else 0 end;
    select level into prev from public.usage_alert_state where key = r.key;
    prev := coalesce(prev, 0);

    if lvl > prev then
      items := items || jsonb_build_object('label', r.label, 'pct', pct, 'level', lvl,
                                           'used_mb', round(r.used / 1024^2), 'limit_mb', round(r.lim / 1024^2));
    end if;

    insert into public.usage_alert_state(key, level, notified_at)
    values (r.key, lvl, case when lvl > prev then now() else null end)
    on conflict (key) do update
      set level = excluded.level,
          notified_at = case when excluded.level > public.usage_alert_state.level then now() else public.usage_alert_state.notified_at end;
  end loop;

  if jsonb_array_length(items) > 0 then
    perform net.http_post(
      url := 'https://classlog-ai.vercel.app/api/slack?type=usage-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
      ),
      body := jsonb_build_object('items', items)
    );
  end if;
end;
$$;

revoke all on function public.run_usage_check() from public, anon, authenticated;

-- 매일 한국시간 오전 9시 (UTC 0시)
select cron.schedule('usage-alert-daily', '0 0 * * *', $$select public.run_usage_check();$$);
