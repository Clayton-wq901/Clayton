# Instalação completa do Supabase

## Objetivo
Deixar o projeto pronto para ser ligado a um Supabase próprio com uma instalação única, repetível e segura, cobrindo todas as tabelas e permissões usadas pelo site.

## O que será feito
- Consolidar as tabelas `fechamentos`, `ai_rounds`, `ai_predictions`, `ai_tickets`, `ai_weights`, `ai_selftest`, `api_cache`, `auto_tickets`, `assistant_messages` e `betano_tickets` em uma migração completa e idempotente.
- Garantir todos os campos, valores padrão, relacionamentos, validações, índices e gatilhos esperados pelo código atual.
- Corrigir concessões e políticas de segurança: dados pessoais ficam limitados ao próprio usuário; dados públicos e operações internas recebem apenas o acesso necessário.
- Incluir os pesos iniciais da IA sem duplicá-los em reinstalações.
- Remover dos arquivos de instalação antigos os agendamentos presos a domínio e chave de outro projeto.
- Padronizar as variáveis do Supabase e a chave usada para proteger tarefas agendadas.
- Criar um guia curto para configurar variáveis, executar a migração, ativar login Google e cadastrar URLs de retorno.
- Validar a migração estaticamente contra todas as consultas do aplicativo e confirmar que o projeto continua compilando.

## Limites
- Nenhuma credencial será gravada no repositório.
- A migração ficará pronta no projeto, mas não será executada no Supabase externo sem acesso ao banco.
- Agendamentos automáticos dependerão da URL final publicada e de uma chave secreta definida pelo proprietário.

## Detalhes técnicos
- Uma nova migração de reconciliação usará `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, políticas recriadas de forma controlada e gatilhos substituídos com segurança.
- As funções públicas de agendamento usarão uma variável dedicada, em vez de uma chave pública do Supabase.
- O guia indicará como aplicar tudo pelo SQL Editor ou pela CLI do Supabase.
