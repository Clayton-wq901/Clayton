/**
 * Varredura automática do site: verifica as rotas principais, as tabelas do
 * Supabase e as integrações externas, dando ao assistente autonomia para
 * diagnosticar o funcionamento real da aplicação.
 */

export interface RouteCheck {
  path: string;
  status: number | null;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface TableCheck {
  table: string;
  ok: boolean;
  rows: number | null;
  error?: string;
}

export interface SiteScan {
  scannedAt: string;
  baseUrl: string;
  routes: RouteCheck[];
  tables: TableCheck[];
  integrations: { name: string; configured: boolean }[];
  problems: string[];
}

const ROUTES = ["/", "/live", "/placar", "/proximo", "/seguinte", "/auth"];

const TABLES = [
  "fechamentos",
  "ai_rounds",
  "ai_predictions",
  "ai_tickets",
  "ai_weights",
  "ai_selftest",
  "api_cache",
  "auto_tickets",
  "assistant_messages",
  "betano_tickets",
] as const;

/** URL interna: evita proxies/CDN que bloqueiam varredura automática (403). */
function resolveInternalBaseUrl() {
  const port = process.env["PORT"] ?? "8080";
  return `http://127.0.0.1:${port}`;
}

function resolvePublicBaseUrl() {
  const url = process.env["SITE_URL"] ?? process.env["VITE_SITE_URL"];
  return url ? url.replace(/\/$/, "") : null;
}

async function checkRoute(baseUrl: string, path: string): Promise<RouteCheck> {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; OneOptionScanner/1.0)", accept: "text/html" },
    });
    return { path, status: res.status, ms: Date.now() - started, ok: res.ok };
  } catch (e) {
    return { path, status: null, ms: Date.now() - started, ok: false, error: (e as Error).message };
  }
}

export async function runSiteScan(): Promise<SiteScan> {
  const internal = resolveInternalBaseUrl();
  const publicUrl = resolvePublicBaseUrl();
  const problems: string[] = [];

  const routes = await Promise.all(
    ROUTES.map(async (path): Promise<RouteCheck> => {
      let check = await checkRoute(internal, path);
      // Se a checagem interna falhar, tenta a URL pública antes de reportar erro.
      if (!check.ok && publicUrl) {
        const external = await checkRoute(publicUrl, path);
        if (external.ok) check = external;
      }
      if (!check.ok) {
        problems.push(
          check.status
            ? `Rota ${path} respondeu ${check.status}.`
            : `Rota ${path} não respondeu: ${check.error}`,
        );
      }
      return check;
    }),
  );

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tables = await Promise.all(
    TABLES.map(async (table): Promise<TableCheck> => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        problems.push(`Tabela ${table}: ${error.message}`);
        return { table, ok: false, rows: null, error: error.message };
      }
      return { table, ok: true, rows: count ?? 0 };
    }),
  );

  const integrations = [
    { name: "GEMINI_API_KEY", configured: Boolean(process.env["GEMINI_API_KEY"]) },
    { name: "API_FOOTBALL_KEY", configured: Boolean(process.env["API_FOOTBALL_KEY"]) },
    { name: "CRON_SECRET", configured: Boolean(process.env["CRON_SECRET"]) },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      configured: Boolean(
        process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["APP_SUPABASE_SERVICE_ROLE_KEY"],
      ),
    },
  ];
  for (const i of integrations) {
    if (!i.configured) problems.push(`Integração sem chave configurada: ${i.name}.`);
  }

  return {
    scannedAt: new Date().toISOString(),
    baseUrl: publicUrl ?? internal,
    routes,
    tables,
    integrations,
    problems,
  };
}
