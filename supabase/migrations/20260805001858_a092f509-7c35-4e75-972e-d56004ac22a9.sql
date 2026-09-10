DROP POLICY IF EXISTS "Public read ai_predictions" ON public.ai_predictions;
DROP POLICY IF EXISTS "Public read ai_rounds" ON public.ai_rounds;
DROP POLICY IF EXISTS "Public read ai_selftest" ON public.ai_selftest;
DROP POLICY IF EXISTS "Public read ai_tickets" ON public.ai_tickets;
DROP POLICY IF EXISTS "Public read ai_weights" ON public.ai_weights;

REVOKE ALL ON public.ai_predictions FROM anon;
REVOKE ALL ON public.ai_rounds FROM anon;
REVOKE ALL ON public.ai_selftest FROM anon;
REVOKE ALL ON public.ai_tickets FROM anon;
REVOKE ALL ON public.ai_weights FROM anon;

REVOKE ALL ON public.ai_predictions FROM authenticated;
REVOKE ALL ON public.ai_rounds FROM authenticated;
REVOKE ALL ON public.ai_selftest FROM authenticated;
REVOKE ALL ON public.ai_tickets FROM authenticated;
REVOKE ALL ON public.ai_weights FROM authenticated;

GRANT ALL ON public.ai_predictions TO service_role;
GRANT ALL ON public.ai_rounds TO service_role;
GRANT ALL ON public.ai_selftest TO service_role;
GRANT ALL ON public.ai_tickets TO service_role;
GRANT ALL ON public.ai_weights TO service_role;