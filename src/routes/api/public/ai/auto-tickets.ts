import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request): boolean {
  const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!expected) return false;
  const provided =
    request.headers.get("apikey") ??
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  return provided === expected;
}

export const Route = createFileRoute("/api/public/ai/auto-tickets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const url = new URL(request.url);
          const raw = Number(url.searchParams.get("limit") ?? 5);
          const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 5, 1), 200);
          const mode = url.searchParams.get("mode");
          if (mode === "grade") {
            const { gradePending, purgeExpiredCache } = await import("@/lib/auto-tickets.server");
            const graded = await gradePending(limit);
            const purged = await purgeExpiredCache();
            return Response.json({ ok: true, graded, purged });
          }
          const { runAutoTicketsBatch } = await import("@/lib/auto-tickets.server");
          return Response.json(await runAutoTicketsBatch(limit));
        } catch (e) {
          console.error("[ai/auto-tickets]", (e as Error).message);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
