import { createFileRoute } from "@tanstack/react-router";
import { runAiSelfTest, settleAiTickets } from "@/lib/ai-round.functions";

function authorized(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!expected) return false;
  const provided =
    request.headers.get("apikey") ??
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  return provided === expected;
}

export const Route = createFileRoute("/api/public/ai/selftest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const settled = await settleAiTickets();
          const result = await runAiSelfTest();
          return Response.json({ ok: true, settled, ...result });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
