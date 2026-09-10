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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_fechamentos_device ON public.fechamentos(device_id, created_at DESC);
CREATE INDEX idx_fechamentos_user ON public.fechamentos(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos TO authenticated;
GRANT ALL ON public.fechamentos TO service_role;

ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.fechamentos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.fechamentos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON public.fechamentos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.fechamentos FOR DELETE TO authenticated USING (auth.uid() = user_id);

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

CREATE TABLE public.ai_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT NOT NULL CHECK (slot IN ('morning','afternoon','night')),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  weights_version INT NOT NULL DEFAULT 1,
  fixtures_analyzed INT NOT NULL DEFAULT 0,
  api_calls INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_rounds TO service_role;
ALTER TABLE public.ai_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.ai_rounds(id) ON DELETE CASCADE,
  fixture_id BIGINT NOT NULL,
  market TEXT NOT NULL,
  probability NUMERIC(6,4) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  vetoed BOOLEAN NOT NULL DEFAULT false,
  veto_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_predictions_round_idx ON public.ai_predictions(round_id);
CREATE INDEX ai_predictions_fixture_idx ON public.ai_predictions(fixture_id);
GRANT ALL ON public.ai_predictions TO service_role;
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ai_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.ai_rounds(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('B1','B2','B3','B4','B5')),
  fixtures JSONB NOT NULL DEFAULT '[]'::jsonb,
  composite_score NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','green','red','void')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_tickets_round_idx ON public.ai_tickets(round_id);
CREATE INDEX ai_tickets_status_idx ON public.ai_tickets(status);
GRANT ALL ON public.ai_tickets TO service_role;
ALTER TABLE public.ai_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ai_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE,
  weights JSONB NOT NULL,
  reason TEXT,
  accuracy_30d NUMERIC(5,2),
  roi_30d NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_weights TO service_role;
ALTER TABLE public.ai_weights ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_weights (version, weights, reason) VALUES (
  1,
  '{"base_strength":0.35,"form":0.20,"h2h":0.10,"injuries":0.15,"predictions_api":0.10,"home_advantage":0.10}'::jsonb,
  'Pesos iniciais baseados em literatura de apostas esportivas'
);

CREATE TABLE public.ai_selftest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  backtest_accuracy NUMERIC(5,2),
  calibration_brier NUMERIC(6,4),
  veto_rate NUMERIC(5,2),
  weight_drift NUMERIC(5,2),
  passed BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_selftest TO service_role;
ALTER TABLE public.ai_selftest ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_ai_rounds_updated BEFORE UPDATE ON public.ai_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_tickets_updated BEFORE UPDATE ON public.ai_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();