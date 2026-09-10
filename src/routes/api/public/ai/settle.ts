import { createFileRoute } from "@tanstack/react-router";
import { settleAiTickets } from "@/lib/ai-round.functions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/ai/settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const r = await settleAiTickets();
          return Response.json({ ok: true, ...r });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
