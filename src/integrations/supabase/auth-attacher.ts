import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

// Registrado como `functionMiddleware` global em `src/start.ts` para que o
// navegador envie o token do usuário nas chamadas de server functions.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      token = undefined;
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
