
-- Remove agendamentos antigos (se existirem)
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN ('ai-round-morning','ai-round-afternoon','ai-round-night','ai-selftest-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Manhã 07h Brasília (10:00 UTC)
SELECT cron.schedule(
  'ai-round-morning',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://playful-wink-smile.lovable.app/api/public/ai/round?slot=morning',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_bkG18rHZ9ne3oQGcvtJM7g_C0gOrFBI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Tarde 13h Brasília (16:00 UTC)
SELECT cron.schedule(
  'ai-round-afternoon',
  '0 16 * * *',
  $$
  SELECT net.http_post(
    url := 'https://playful-wink-smile.lovable.app/api/public/ai/round?slot=afternoon',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_bkG18rHZ9ne3oQGcvtJM7g_C0gOrFBI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Noite 18h Brasília (21:00 UTC)
SELECT cron.schedule(
  'ai-round-night',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://playful-wink-smile.lovable.app/api/public/ai/round?slot=night',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_bkG18rHZ9ne3oQGcvtJM7g_C0gOrFBI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Liquidação + auto-teste diário 23h Brasília (02:00 UTC do dia seguinte)
SELECT cron.schedule(
  'ai-selftest-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://playful-wink-smile.lovable.app/api/public/ai/selftest',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_bkG18rHZ9ne3oQGcvtJM7g_C0gOrFBI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
