-- Tabelas que faltam no banco: sem elas os Bilhetes Automáticos não funcionam.
-- Rode este script inteiro no SQL Editor do Supabase.

-- Função de updated_at (usada pelo gatilho de auto_tickets)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1) Cache/travas usadas pelo motor automático
CREATE TABLE IF NOT EXISTS public.api_cache (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_cache TO authenticated;
GRANT ALL ON public.api_cache TO service_role;

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything on api_cache" ON public.api_cache;
CREATE POLICY "Service role can do everything on api_cache"
ON public.api_cache FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 2) Bilhetes automáticos (11 mercados)
CREATE TABLE IF NOT EXISTS public.auto_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fixture_id bigint NOT NULL UNIQUE,
  kickoff timestamp with time zone NOT NULL,
  league text,
  home text NOT NULL,
  away text NOT NULL,
  home_logo text,
  away_logo text,
  picks jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  result_snapshot jsonb,
  greens integer NOT NULL DEFAULT 0,
  reds integer NOT NULL DEFAULT 0,
  accuracy numeric,
  graded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_tickets ADD COLUMN IF NOT EXISTS result_snapshot jsonb;

GRANT SELECT ON public.auto_tickets TO anon;
GRANT SELECT ON public.auto_tickets TO authenticated;
GRANT ALL ON public.auto_tickets TO service_role;

ALTER TABLE public.auto_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read auto tickets" ON public.auto_tickets;
CREATE POLICY "Public read auto tickets"
  ON public.auto_tickets FOR SELECT TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS trg_auto_tickets_updated ON public.auto_tickets;
CREATE TRIGGER trg_auto_tickets_updated
  BEFORE UPDATE ON public.auto_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_auto_tickets_kickoff ON public.auto_tickets (kickoff DESC);
CREATE INDEX IF NOT EXISTS idx_auto_tickets_status ON public.auto_tickets (status);

-- 3) Conversas do Assistente IA
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_assistant_messages" ON public.assistant_messages;
CREATE POLICY "own_select_assistant_messages" ON public.assistant_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_assistant_messages" ON public.assistant_messages;
CREATE POLICY "own_insert_assistant_messages" ON public.assistant_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_assistant_messages" ON public.assistant_messages;
CREATE POLICY "own_delete_assistant_messages" ON public.assistant_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_created
  ON public.assistant_messages (user_id, created_at);

-- 4) Bilhetes Especiais Betano
CREATE TABLE IF NOT EXISTS public.betano_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.betano_tickets TO authenticated;
GRANT ALL ON public.betano_tickets TO service_role;

ALTER TABLE public.betano_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own Betano tickets" ON public.betano_tickets;
CREATE POLICY "Users can manage their own Betano tickets"
ON public.betano_tickets FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
