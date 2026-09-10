import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";

export const Route = createFileRoute("/seguinte")({
  head: () => ({
    meta: [
      { title: "Meus jogos seguidos — Terror da Bet" },
      { name: "description", content: "Acompanhe seus jogos favoritos em um só lugar." },
    ],
  }),
  component: SeguintePage,
});

function SeguintePage() {
  return (
    <div>
      <BackHeader title="Meus jogos" />
      <div className="pt-8 flex flex-col items-center text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center">
        <Star className="w-7 h-7 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground max-w-xs mt-1">
          Toque no sino de um jogo para seguir. Em breve você poderá salvar seus favoritos e receber alertas.
        </p>
        </div>
      </div>
    </div>
  );
}
