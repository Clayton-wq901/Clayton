import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getPublicConfig } from "@/lib/public-config";

function createSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // A troca do código do Google é feita manualmente em /auth
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
