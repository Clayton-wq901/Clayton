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
