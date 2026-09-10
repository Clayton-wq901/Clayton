# Reconstrução do OneOptiOn — 100% independente

Recriar o app do ZIP enviado neste projeto, ligado exclusivamente ao seu Supabase e à sua conta OpenAI, sem nenhum serviço nativo da Lovable.

## O que será feito

### 1. Base do app
- Trazer todas as telas e componentes do ZIP: início (jogos do dia), jogo, liga, time, ao vivo, placar, próximo, seguinte, IA e login.
- Manter o visual, os ícones, o manifesto e as configurações do app enviado.
- Ignorar a pasta `github-clone` (projeto de exemplo separado, não faz parte do app).

### 2. Supabase próprio
- Cliente único com `@supabase/supabase-js` lendo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Remover os arquivos gerados pela Lovable (cliente de serviço, middleware e anexador de token automáticos) e qualquer variável do tipo `EXT_SUPABASE_*`.
- Todas as leituras e gravações vão direto às suas tabelas, pelo cliente do navegador, respeitando as regras de acesso (RLS) que já existem no seu banco.
- Como as tabelas já estão criadas, nada de migração será executado; os arquivos SQL do ZIP ficam guardados apenas como referência.

### 3. Login com Google
- Tela de entrada com botão "Entrar com Google" usando `supabase.auth.signInWithOAuth({ provider: 'google' })`.
- Sessão mantida no navegador, cabeçalho mostrando o usuário logado e opção de sair.
- Você precisa ativar o provedor Google no painel do seu Supabase e incluir a URL do app na lista de redirecionamentos permitidos.

### 4. Recursos de IA na sua OpenAI
- Substituir as chamadas de IA da Lovable (comentários, previsões de rodada, bilhetes automáticos, diagnóstico) por chamadas à API da OpenAI.
- A chave da OpenAI fica no servidor, nunca no navegador.

### 5. Dados de futebol
- Manter a integração com a API-Football usando a sua chave, também guardada no servidor.

### 6. Limpeza final
- Remover relatórios de erro, ícones e textos ligados à Lovable, e o pacote de skill do Supabase que veio no ZIP.

## Detalhes técnicos

- Stack mantida: TanStack Start + Vite + React 19 + Tailwind v4 + shadcn/ui.
- Variáveis de ambiente:
  - Navegador: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - Servidor: `OPENAI_API_KEY`, `API_FOOTBALL_KEY`.
- Rotas de servidor (`src/routes/api/public/*` e `*.functions.ts`) continuam para a API-Football e IA; leituras/escritas de banco passam a ser feitas pelo cliente do navegador com a chave anônima.
- `src/lib/*.functions.ts` que hoje usam `LOVABLE_API_KEY` passam a usar `OPENAI_API_KEY` via `https://api.openai.com/v1/chat/completions`.
- `.env.example` atualizado com as quatro variáveis acima.

## O que preciso de você

1. URL e chave anônima do seu projeto Supabase.
2. Chave da OpenAI.
3. Chave da API-Football.

Vou pedir cada uma delas de forma segura durante a implementação.
