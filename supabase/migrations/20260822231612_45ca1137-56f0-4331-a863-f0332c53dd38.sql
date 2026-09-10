
-- Granting proper access for non-user-scoped tables (system logs/cache)
GRANT SELECT ON public.ai_predictions TO authenticated, anon;
GRANT SELECT ON public.ai_rounds TO authenticated, anon;
GRANT SELECT ON public.ai_tickets TO authenticated, anon;
GRANT SELECT ON public.ai_weights TO authenticated, anon;
GRANT SELECT ON public.api_cache TO authenticated, anon;

-- Ensuring RLS is enabled but with public read for these system tables
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Predictions" ON public.ai_predictions;
CREATE POLICY "Public Read Predictions" ON public.ai_predictions FOR SELECT USING (true);

ALTER TABLE public.ai_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Rounds" ON public.ai_rounds;
CREATE POLICY "Public Read Rounds" ON public.ai_rounds FOR SELECT USING (true);

ALTER TABLE public.ai_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Tickets" ON public.ai_tickets;
CREATE POLICY "Public Read Tickets" ON public.ai_tickets FOR SELECT USING (true);

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Cache" ON public.api_cache;
CREATE POLICY "Public Read Cache" ON public.api_cache FOR SELECT USING (true);
