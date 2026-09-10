-- Habilita inserção para usuários autenticados, anônimos e service_role
GRANT INSERT ON public.ai_predictions TO anon, authenticated, service_role;

-- Remove qualquer política anterior que possa estar causando conflito
DROP POLICY IF EXISTS "Allow insert ai_predictions" ON public.ai_predictions;
DROP POLICY IF EXISTS "Public read ai_predictions" ON public.ai_predictions;

-- Garante que o SELECT continue funcionando
CREATE POLICY "Public read ai_predictions" ON public.ai_predictions FOR SELECT USING (true);

-- Permite inserção para todos (auditoria de dispositivo)
CREATE POLICY "Allow insert ai_predictions" ON public.ai_predictions FOR INSERT WITH CHECK (true);
