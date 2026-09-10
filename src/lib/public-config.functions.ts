import { createServerFn } from "@tanstack/react-start";
import type { PublicConfig } from "./public-config";

/** Entrega ao navegador apenas os valores públicos do Supabase (URL + anon key). */
export const getPublicConfigFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicConfig> => {
    const url = process.env["APP_SUPABASE_URL"] || process.env["SUPABASE_URL"] || "";
    const anon = process.env["APP_SUPABASE_ANON_KEY"] || process.env["SUPABASE_ANON_KEY"] || "";
    return { supabaseUrl: url, supabaseAnonKey: anon };
  },
);
