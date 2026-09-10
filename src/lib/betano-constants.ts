export const BETANO_FIXED_MARKETS = [
  {
    id: "margem_vitoria",
    name: "Margem de Vitória",
    description: "Diferença exata de gols entre o vencedor e o perdedor.",
    options: [
      { label: "{home} ganhar por exatamente 2 gols" },
      { label: "{home} ganhar por 3 ou mais gols" },
      { label: "{away} ganhar por exatamente 2 gols" },
      { label: "{away} ganhar por 3 ou mais gols" },
    ]
  },
  {
    id: "evolucao_jogo",
    name: "Evolução do Jogo",
    description: "Quem marca primeiro e o resultado final.",
    options: [
      { label: "{home} marcar primeiro e empatar" },
      { label: "{away} marcar primeiro e empatar" },
    ]
  },
  {
    id: "placar_multipla",
    name: "Resultado Correto (Múltipla)",
    description: "Agrupamento de placares exatos.",
    options: [
      { label: "{home}: (2-1) (3-1) ou (4-1)" },
      { label: "{home}: (3-2) (4-2) (4-3) ou (5-1)" },
      { label: "{away}: (1-2) (1-3) ou (1-4)" },
      { label: "{away}: (2-3) (2-4) (3-4) ou (1-5)" },
    ]
  }
];
