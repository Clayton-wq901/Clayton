
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='fechamentos' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fechamentos', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.fechamentos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos TO authenticated;
GRANT ALL ON public.fechamentos TO service_role;

CREATE POLICY "own_select" ON public.fechamentos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.fechamentos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON public.fechamentos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.fechamentos FOR DELETE TO authenticated USING (auth.uid() = user_id);
