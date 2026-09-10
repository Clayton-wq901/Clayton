CREATE TABLE public.auto_tickets (
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
  greens integer NOT NULL DEFAULT 0,
  reds integer NOT NULL DEFAULT 0,
  accuracy numeric,
  graded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auto_tickets TO anon;
GRANT SELECT ON public.auto_tickets TO authenticated;
GRANT ALL ON public.auto_tickets TO service_role;

ALTER TABLE public.auto_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read auto tickets"
  ON public.auto_tickets FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER trg_auto_tickets_updated
  BEFORE UPDATE ON public.auto_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_auto_tickets_kickoff ON public.auto_tickets (kickoff DESC);
CREATE INDEX idx_auto_tickets_status ON public.auto_tickets (status);