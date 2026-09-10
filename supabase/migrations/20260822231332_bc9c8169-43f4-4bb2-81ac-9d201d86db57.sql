
-- Permissive policies for remaining system tables to fix linter warnings
GRANT SELECT ON public.ai_rounds TO authenticated;
GRANT ALL ON public.ai_rounds TO service_role;
ALTER TABLE public.ai_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rounds" ON public.ai_rounds FOR SELECT USING (true);

GRANT SELECT ON public.ai_tickets TO authenticated;
GRANT ALL ON public.ai_tickets TO service_role;
ALTER TABLE public.ai_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tickets" ON public.ai_tickets FOR SELECT USING (true);

GRANT SELECT ON public.ai_selftest TO authenticated;
GRANT ALL ON public.ai_selftest TO service_role;
ALTER TABLE public.ai_selftest ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read selftest" ON public.ai_selftest FOR SELECT USING (true);
