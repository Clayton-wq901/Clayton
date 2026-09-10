-- Habilita inserção para usuários autenticados e anônimos para permitir o log de auditoria
GRANT INSERT ON public.ai_predictions TO anon, authenticated;

-- Permite inserção para todos (auditoria de dispositivo)
DROP POLICY IF EXISTS "Allow insert ai_predictions" ON public.ai_predictions;
CREATE POLICY "Allow insert ai_predictions" ON public.ai_predictions FOR INSERT WITH CHECK (true);
