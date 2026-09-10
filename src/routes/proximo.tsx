import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFixturesByDate, LIVE_STATUSES, FINISHED_STATUSES } from "@/lib/api-football.functions";
import { LeagueGroup, groupFixtures } from "@/components/LeagueGroup";
import { useFavorites } from "@/lib/favorites";
import { LoadingList, EmptyState } from "@/components/StateViews";
import { BackHeader } from "@/components/BackHeader";

function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

export const Route = createFileRoute("/proximo")({
  head: () => ({
    meta: [
      { title: "Próximos jogos de futebol — Terror da Bet" },
      { name: "description", content: "Confira os próximos jogos de futebol do dia com horários em tempo real." },
    ],
  }),
  component: ProximoPage,
});

function ProximoPage() {
  const date = today();
  const favorites = useFavorites();
  const fetchFixtures = useServerFn(getFixturesByDate);
  const q = useQuery({
    queryKey: ["fixtures", "date", date],
    queryFn: () => fetchFixtures({ data: { date } }),
    staleTime: 60_000,
    select: (data) => data.filter((f) => !LIVE_STATUSES.has(f.fixture.status.short) && !FINISHED_STATUSES.has(f.fixture.status.short)),
  });

  return (
    <div className="pt-4">
      <BackHeader title="Próximos jogos" />
      {q.isLoading && <LoadingList />}
      {q.data && q.data.length === 0 && <EmptyState text="Nenhum jogo agendado restante hoje." />}
      {q.data && q.data.length > 0 && groupFixtures(q.data, favorites).map((g) => <LeagueGroup key={g.key} group={g} />)}
    </div>
  );
}
