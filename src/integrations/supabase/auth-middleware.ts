import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Exige um usuário autenticado (token Bearer do Supabase) na server function. */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env["APP_SUPABASE_URL"] || process.env["SUPABASE_URL"];
    const SUPABASE_ANON_KEY =
      process.env["APP_SUPABASE_ANON_KEY"] || process.env["SUPABASE_ANON_KEY"];

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY.");
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: token ausente");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || token.split(".").length !== 3) {
      throw new Error("Unauthorized: token inválido");
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error("Unauthorized: sessão inválida");
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user,
      },
    });
  },
);
