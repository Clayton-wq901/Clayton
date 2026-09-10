CREATE TABLE public.betano_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.betano_tickets TO authenticated;
GRANT ALL ON public.betano_tickets TO service_role;

ALTER TABLE public.betano_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Betano tickets"
ON public.betano_tickets
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
