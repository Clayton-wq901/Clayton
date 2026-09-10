-- Habilita inserção para usuários autenticados e anônimos para permitir o log de auditoria
-- Nota: anon é necessário se o usuário estiver vindo de um dispositivo sem login mas queremos auditar a previsão gerada
GRANT INSERT ON public.ai_predictions TO anon, authenticated;

-- Atualiza políticas de RLS para permitir inserção
-- Como a tabela não tem user_id, permitimos a inserção para que a auditoria funcione
-- O SELECT continua público conforme definido na migração original
CREATE POLICY "Allow insert ai_predictions" ON public.ai_predictions FOR INSERT WITH CHECK (true);
