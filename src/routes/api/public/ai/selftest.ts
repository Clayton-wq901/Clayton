import { createFileRoute } from "@tanstack/react-router";
import { runAiSelfTest, settleAiTickets } from "@/lib/ai-round.functions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/ai/selftest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const today = new Date().toISOString().slice(0, 10);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Idempotência: no máximo 1 self-test por dia
          const { data: existing } = await supabaseAdmin
            .from("ai_selftest")
            .select("id, passed, accuracy:backtest_accuracy")
            .gte("created_at", `${today}T00:00:00Z`)
            .lt("created_at", `${today}T23:59:59Z`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existing) {
            return Response.json({ 
              ok: true, 
              idempotent: true, 
              id: existing.id,
              passed: existing.passed,
              accuracy: existing.accuracy,
              message: "Self-test já executado hoje" 
            });
          }

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
