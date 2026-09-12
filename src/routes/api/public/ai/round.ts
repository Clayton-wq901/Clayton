import { createFileRoute } from "@tanstack/react-router";
import { runAiRound } from "@/lib/ai-round.functions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/ai/round")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const url = new URL(request.url);
          const slotParam = url.searchParams.get("slot");
          const slot = (slotParam === "morning" || slotParam === "afternoon" || slotParam === "night")
            ? slotParam : "morning";
          const dateParam = url.searchParams.get("date") ?? undefined;
          const date = dateParam ?? new Date().toISOString().slice(0, 10);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // Idempotência: verifica se já existe round para este slot+date
          const { data: existing } = await supabaseAdmin
            .from("ai_rounds")
            .select("id, status, fixtures_analyzed, tickets:ai_tickets(count)")
            .eq("slot", slot)
            .eq("ran_at", date)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existing) {
            return Response.json({ 
              ok: true, 
              idempotent: true, 
              roundId: existing.id, 
              status: existing.status,
              fixtures: existing.fixtures_analyzed,
              tickets: existing.tickets?.[0]?.count ?? 0,
              message: "Round já existe para este slot+date" 
            });
          }

          const result = await runAiRound({ data: { slot, date: dateParam } });
          return Response.json(result);
        } catch (e) {
          console.error("[ai/round]", (e as Error).message);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
