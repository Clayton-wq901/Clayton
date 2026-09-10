-- Adiciona coluna result para armazenar o desfecho da auditoria da IA
ALTER TABLE public.ai_predictions ADD COLUMN IF NOT EXISTS result jsonb;

-- Garante que as permissões estejam corretas
GRANT ALL ON public.ai_predictions TO authenticated;
GRANT ALL ON public.ai_predictions TO service_role;
