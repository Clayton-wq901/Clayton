import { createFileRoute } from "@tanstack/react-router";
import { settleAiTickets } from "@/lib/ai-round.functions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/ai/settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // Verifica se há tickets abertos para liquidar
          const { count } = await supabaseAdmin
            .from("ai_tickets")
            .select("id", { count: "exact", head: true })
            .eq("status", "open");

          if (!count || count === 0) {
            return Response.json({ ok: true, settled: 0, message: "Nenhum ticket aberto para liquidar" });
          }

          const r = await settleAiTickets();
          return Response.json({ ok: true, ...r });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
