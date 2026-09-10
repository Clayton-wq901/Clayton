-- OneOption — modelo opcional de agendamentos automáticos.
-- 1. Substitua https://SEU-DOMINIO pelas URL publicada do aplicativo.
-- 2. Substitua SUA_CHAVE_CRON pelo mesmo valor de CRON_SECRET configurado no servidor.
-- 3. Só então execute este arquivo no SQL Editor do Supabase.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'oneoption-ai-round-morning',
    'oneoption-ai-round-afternoon',
    'oneoption-ai-round-night',
    'oneoption-ai-selftest-daily',
    'oneoption-auto-tickets',
    'oneoption-auto-tickets-grade'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('oneoption-ai-round-morning', '0 10 * * *', $$
  SELECT net.http_post(url := 'https://SEU-DOMINIO/api/public/ai/round?slot=morning', headers := '{"Content-Type":"application/json","x-cron-secret":"SUA_CHAVE_CRON"}'::jsonb, body := '{}'::jsonb);
$$);
SELECT cron.schedule('oneoption-ai-round-afternoon', '0 16 * * *', $$
  SELECT net.http_post(url := 'https://SEU-DOMINIO/api/public/ai/round?slot=afternoon', headers := '{"Content-Type":"application/json","x-cron-secret":"SUA_CHAVE_CRON"}'::jsonb, body := '{}'::jsonb);
$$);
SELECT cron.schedule('oneoption-ai-round-night', '0 21 * * *', $$
  SELECT net.http_post(url := 'https://SEU-DOMINIO/api/public/ai/round?slot=night', headers := '{"Content-Type":"application/json","x-cron-secret":"SUA_CHAVE_CRON"}'::jsonb, body := '{}'::jsonb);
$$);
SELECT cron.schedule('oneoption-ai-selftest-daily', '0 2 * * *', $$
  SELECT net.http_post(url := 'https://SEU-DOMINIO/api/public/ai/selftest', headers := '{"Content-Type":"application/json","x-cron-secret":"SUA_CHAVE_CRON"}'::jsonb, body := '{}'::jsonb);
$$);
SELECT cron.schedule('oneoption-auto-tickets', '*/15 * * * *', $$
  SELECT net.http_post(url := 'https://SEU-DOMINIO/api/public/ai/auto-tickets?limit=5', headers := '{"Content-Type":"application/json","x-cron-secret":"SUA_CHAVE_CRON"}'::jsonb, body := '{}'::jsonb);
$$);
SELECT cron.schedule('oneoption-auto-tickets-grade', '*/10 * * * *', $$
  SELECT net.http_post(url := 'https://SEU-DOMINIO/api/public/ai/auto-tickets?mode=grade&limit=200', headers := '{"Content-Type":"application/json","x-cron-secret":"SUA_CHAVE_CRON"}'::jsonb, body := '{}'::jsonb);
$$);
