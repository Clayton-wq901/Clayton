
ALTER TABLE public.fechamentos ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_fechamentos_user ON public.fechamentos(user_id, created_at DESC);

DROP POLICY IF EXISTS "Anyone can read fechamentos" ON public.fechamentos;
DROP POLICY IF EXISTS "Anyone can insert fechamentos" ON public.fechamentos;
DROP POLICY IF EXISTS "Anyone can update fechamentos" ON public.fechamentos;
DROP POLICY IF EXISTS "Anyone can delete fechamentos" ON public.fechamentos;

-- Authenticated users: only their own rows
CREATE POLICY "Users read own fechamentos"
  ON public.fechamentos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own fechamentos"
  ON public.fechamentos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own fechamentos"
  ON public.fechamentos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own fechamentos"
  ON public.fechamentos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Anonymous: only legacy device rows (user_id IS NULL). Kept so nothing is lost.
CREATE POLICY "Anon read legacy device fechamentos"
  ON public.fechamentos FOR SELECT
  TO anon
  USING (user_id IS NULL);

CREATE POLICY "Anon update legacy device fechamentos"
  ON public.fechamentos FOR UPDATE
  TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Anon delete legacy device fechamentos"
  ON public.fechamentos FOR DELETE
  TO anon
  USING (user_id IS NULL);
