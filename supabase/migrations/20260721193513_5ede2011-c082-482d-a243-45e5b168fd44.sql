
CREATE TABLE public.fechamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_date DATE NOT NULL,
  games JSONB NOT NULL DEFAULT '[]'::jsonb,
  tickets JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fechamentos_device ON public.fechamentos(device_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos TO anon, authenticated;
GRANT ALL ON public.fechamentos TO service_role;

ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fechamentos"
  ON public.fechamentos FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert fechamentos"
  ON public.fechamentos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update fechamentos"
  ON public.fechamentos FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete fechamentos"
  ON public.fechamentos FOR DELETE
  USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_fechamentos_updated_at
  BEFORE UPDATE ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
