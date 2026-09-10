CREATE TABLE public.api_cache (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_cache TO authenticated;
GRANT ALL ON public.api_cache TO service_role;

-- RLS
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything on api_cache"
ON public.api_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
