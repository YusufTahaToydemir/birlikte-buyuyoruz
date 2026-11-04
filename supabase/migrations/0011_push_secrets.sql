-- Kyron · 0011_push_secrets.sql · Push gizli değerleri veritabanında (yalnızca service_role okur)
-- VAPID özel anahtarı ve push paylaşılan sırrı app_config'te DEĞİL, hiçbir role açılmayan app_secrets tablosunda durur.
create table if not exists app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated, public;

-- pushSecret'i app_config'ten (istemciye giden) app_secrets'e taşı
insert into app_secrets (key, value)
  select 'pushSecret', value->>'pushSecret' from app_config where key = 'game' and value ? 'pushSecret'
  on conflict (key) do nothing;
update app_config set value = value - 'pushSecret' where key = 'game';

-- Edge Function (service_role) bu fonksiyonla okur; authenticated çağıramaz
create or replace function bb_push_secrets() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'vapidPublic', (select value->>'vapidPublic' from app_config where key = 'game'),
    'vapidPrivate', (select value from app_secrets where key = 'vapidPrivate'),
    'pushSecret', (select value from app_secrets where key = 'pushSecret'))
$$;
revoke execute on function bb_push_secrets() from public, anon, authenticated;

-- cron: sırrı app_secrets'ten al (fonksiyonda "Verify JWT" kapalı; yetki x-kyron-secret başlığıyla)
do $$ begin if exists (select 1 from cron.job where jobname = 'bb-push') then perform cron.unschedule('bb-push'); end if; end $$;
select cron.schedule('bb-push', '*/5 * * * *', $job$select net.http_post(
  url := 'https://wricfuhizwzvlpnvkfxi.supabase.co/functions/v1/push',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-kyron-secret', (select value from app_secrets where key = 'pushSecret')),
  body := '{}'::jsonb)$job$);

select 'push secrets ok' as result, (select count(*) from app_secrets) as secrets, (select value ? 'pushSecret' from app_config where key = 'game') as still_in_config;
