import { createFileRoute } from "@tanstack/react-router";

const TABLES = [
  "auto_tickets",
  "ai_predictions",
  "ai_rounds",
  "ai_tickets",
  "ai_weights",
  "ai_selftest",
  "fechamentos",
  "betano_tickets",
] as const;

type TableName = (typeof TABLES)[number];

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "x-api-key, authorization, content-type",
  "access-control-max-age": "86400",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "no-store" },
  });
}

function authorized(request: Request, url: URL): boolean {
  const expected = process.env["EXPORT_API_KEY"];
  if (!expected) return false;
  const provided =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  return provided === expected || url.searchParams.get("key") === expected;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const firstRow = rows[0];
  if (!firstRow) return "";
  const cols = Object.keys(firstRow);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export const Route = createFileRoute("/api/public/export")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!authorized(request, url)) {
          return json(
            {
              ok: false,
              error: "Não autorizado. Envie a senha no cabeçalho x-api-key.",
            },
            401,
          );
        }

        const table = url.searchParams.get("table") as TableName | null;
        const format = url.searchParams.get("format") ?? "json";
        const rawLimit = Number(url.searchParams.get("limit") ?? 1000);
        const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 1000, 1), 5000);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
        const since = url.searchParams.get("since");

        if (!table) {
          return json({ ok: true, tables: TABLES });
        }
        if (!TABLES.includes(table)) {
          return json({ ok: false, error: "Tabela inválida", tables: TABLES }, 400);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let q = supabaseAdmin.from(table).select("*").range(offset, offset + limit - 1);
          if (since) q = q.gte("created_at", since);
          const { data, error } = await q;
          if (error) throw error;

          if (format === "csv") {
            return new Response(toCsv((data ?? []) as Record<string, unknown>[]), {
              headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename="${table}.csv"`,
                "cache-control": "no-store",
                ...CORS_HEADERS,
              },
            });
          }

          return json({ ok: true, table, count: data?.length ?? 0, offset, limit, rows: data ?? [] });
        } catch (e) {
          console.error("[api/public/export]", (e as Error).message);
          return json({ ok: false, error: "Falha ao preparar a exportação." }, 500);
        }
      },
    },
  },
});
