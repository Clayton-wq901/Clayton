import { createFileRoute } from "@tanstack/react-router";
import { runAiSelfTest, settleAiTickets } from "@/lib/ai-round.functions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/ai/selftest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
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
