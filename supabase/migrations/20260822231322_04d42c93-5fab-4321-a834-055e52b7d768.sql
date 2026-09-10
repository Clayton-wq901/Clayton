
-- Corrected RLS and Grants for system tables
-- We noticed columns are slightly different, focusing on table existence and basic access.

GRANT SELECT ON public.ai_weights TO authenticated, anon;
GRANT ALL ON public.ai_weights TO service_role;
ALTER TABLE public.ai_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read weights" ON public.ai_weights;
CREATE POLICY "Public read weights" ON public.ai_weights FOR SELECT USING (true);

GRANT SELECT, INSERT, UPDATE ON public.ai_predictions TO authenticated, anon;
GRANT ALL ON public.ai_predictions TO service_role;
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read ai_predictions" ON public.ai_predictions;
DROP POLICY IF EXISTS "Allow insert ai_predictions" ON public.ai_predictions;
CREATE POLICY "Public manage predictions" ON public.ai_predictions FOR ALL USING (true);

-- api_cache is for service_role but let's ensure it has RLS enabled with a bypass for admin
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.api_cache TO service_role;
