export type ExportPick = {
  home: string;
  away: string;
  league?: string;
  time?: string;
  pick: string;
  side?: "home" | "away" | "draw" | string | null;
  p?: number;
  odd?: number;
  reasoning?: string;
  /** mercado do jogo dentro de um bilhete misto (B1..B5) ou tag de especial */
  tag?: string;
};

export type ExportTicket = {
  market: string;
  label: string;
  picks: ExportPick[];
};

/** Jogo validado na "Prova Real" (etapa de segurança antes do fechamento). */
export type ExportProof = {
  home: string;
  away: string;
  league?: string;
  time?: string;
  lambdaTotal: number;
  lambdaHome: number;
  lambdaAway: number;
  gfHome: number;
  gaHome: number;
  gfAway: number;
  gaAway: number;
  pUnder15: number;
  score?: number;
  status: "APROVADO" | "RISCO ALTO";
  note?: string;
};

export type ExportFechamento = {
  name: string;
  date?: string;
  tickets: ExportTicket[];
  /** bilhetes mistos (verticais) — um mercado por jogo */
  mixed?: ExportTicket[];
  /** texto da justificativa da IA impresso no rodapé */
  justification?: string;
  /** os 4 jogos validados na Prova Real */
  proof?: ExportProof[];
  /** Nível de confiança total (%) */
  confidence?: number;
  /** Análise detalhada da múltipla */
  analysis?: string;
};




const sideLabel = (side?: string | null) =>
  side === "home" ? "CASA" : side === "away" ? "FORA" : side === "draw" ? "EMPATE" : "";

const fmtTime = (t?: string) => {
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/** Texto simples para compartilhar (WhatsApp, etc). */
export function buildFechamentoText(f: ExportFechamento): string {
  const lines: string[] = [];
  lines.push(`🎯 *${f.name}*${f.date ? ` · ${f.date}` : ""}`);
  const mixed = f.mixed ?? [];
  lines.push(`${f.tickets.length} bilhetes fixos${mixed.length ? ` + ${mixed.length} mistos` : ""}`);
  const block = (t: ExportTicket) => {
    lines.push("");
    lines.push(`*${t.market}* — ${t.label}`);
    t.picks.forEach((p, i) => {
      const sl = sideLabel(p.side);
      const prob = typeof p.p === "number" ? ` (${(p.p * 100).toFixed(0)}%)` : "";
      const when = fmtTime(p.time);
      lines.push(
        `${i + 1}. ${p.tag ? `[${p.tag}] ` : ""}${p.home} x ${p.away} → ${sl ? `${sl} · ` : ""}${p.pick}${prob}${when ? `\n   🕒 ${when}` : ""}`,
      );
    });
  };
  for (const t of f.tickets) block(t);
  if (mixed.length) {
    lines.push("");
    lines.push("— *BILHETES MISTOS (verticais)* —");
    for (const t of mixed) block(t);
  }
  if (f.justification) {
    lines.push("");
    lines.push(`🧠 *Justificativa da IA*\n${f.justification}`);
  }
  lines.push("");
  lines.push("_Gerado pela IA do Bingão_");
  return lines.join("\n");
}



const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TICKET_COLORS: Record<string, string> = {
  B1: "#7c3aed",
  B2: "#2563eb",
  B3: "#0891b2",
  B4: "#059669",
  B5: "#d97706",
  V1: "#4f46e5",
  V2: "#0ea5e9",
  V3: "#14b8a6",
  V4: "#f59e0b",
  V5: "#ec4899",
};

function ticketSection(t: ExportTicket): string {
  const color = TICKET_COLORS[t.market] ?? "#7c3aed";
  const rows = t.picks
    .map((p, i) => {
      const sl = sideLabel(p.side);
      const prob = typeof p.p === "number" ? `${(p.p * 100).toFixed(0)}%` : "";
      const oddText = typeof p.odd === "number" ? `@${p.odd.toFixed(2)}` : "";
      const meta = [p.league, fmtTime(p.time)].filter(Boolean).join(" · ");
      return `<li>
            <span class="n">${i + 1}</span>
            <span class="game">
              <span class="teams">${p.tag ? `<i class="mk">${esc(p.tag)}</i> ` : ""}${esc(p.home)} <em>x</em> ${esc(p.away)}</span>
              ${meta ? `<span class="meta">${esc(meta)}</span>` : ""}
              ${p.reasoning ? `<span class="meta" style="color:#059669; font-weight:600; font-size:7px;">⚡ PROVA REAL: ${esc(p.reasoning)}</span>` : ""}
            </span>
            <span class="pick">${sl ? `<b>${sl}</b> ` : ""}${esc(p.pick)}</span>
            <span class="prob" style="width: auto; min-width: 24px;">${prob}</span>
            ${oddText ? `<span class="prob" style="color:#059669; font-weight:900; width: auto; margin-left: 4px;">${oddText}</span>` : ""}
          </li>`;
    })
    .join("");
  return `
    <section class="ticket" style="--c:${color}">
      <div class="thead">
        <span class="tag">${esc(t.market)}</span>
        <span class="tlabel">${esc(t.label)}</span>
        <span class="tcount">${t.picks.length}</span>
      </div>
      <ol>${rows}</ol>
    </section>`;
}

function proofSection(proof: ExportProof[]): string {
  const rows = proof
    .map((p) => {
      const gap = Math.abs(p.lambdaHome - p.lambdaAway);
      const ok = p.status === "APROVADO";
      return `<li>
        <span class="pv ${ok ? "okv" : "bad"}">${ok ? "APROVADO" : "RISCO ALTO"}</span>
        <span class="game">
          <span class="teams">${esc(p.home)} <em>x</em> ${esc(p.away)}</span>
          <span class="meta">${esc([p.league, fmtTime(p.time)].filter(Boolean).join(" · "))}</span>
        </span>
        <span class="pmeta">λ total <b>${p.lambdaTotal.toFixed(2)}</b> · Δλ ${gap.toFixed(2)} · GM ${p.gfHome.toFixed(2)}/${p.gfAway.toFixed(2)} · GS ${p.gaHome.toFixed(2)}/${p.gaAway.toFixed(2)} · U1.5 ${(p.pUnder15 * 100).toFixed(0)}%${typeof p.score === "number" ? ` · nota ${p.score}` : ""}${p.note ? ` · <span style="color:#b91c1c; font-weight:700;">${esc(p.note)}</span>` : ""}</span>
      </li>`;
    })
    .join("");
  return `<div class="sect">Prova Real · ${proof.length} jogos validados</div>
    <section class="proof"><ol>${rows}</ol></section>`;
}

const METHOD_TEXT =
  "Como esta análise foi feita (Prova Real): 1) Modelagem matemática — para cada jogo foram calculados os gols esperados de cada lado (λ casa e λ fora) pela distribuição de Poisson com correção Dixon-Coles, usando as médias de gols marcados (GM) e sofridos (GS) da temporada. " +
  "2) Auditoria Estratégica OneOption — as métricas foram cruzadas com sinais de volume ofensivo (SOG) e solidez defensiva recente para validar mercados especiais da Betano (Margem, Evolução e Placar). " +
  "3) Critérios de corte — apenas jogos com score de confiança acima de 60% e λ total dentro da margem de segurança entram no bilhete consolidado. " +
  "4) Fechamento Múltiplo — os 4 jogos aprovados na Prova Real foram agrupados com suas 3 melhores opções estatísticas cada, totalizando 12 escolhas estratégicas para cobertura máxima.";

function buildHtml(f: ExportFechamento): string {

  const ticketsHtml = f.tickets.map(ticketSection).join("");
  const mixed = f.mixed ?? [];
  const mixedHtml = mixed.map(ticketSection).join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(f.name)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 10mm; }
  html, body { width: 190mm; height: auto; overflow: visible; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; background: #fff; display: flex; flex-direction: column; min-height: 100%; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px;
           background: linear-gradient(135deg, #1e40af, #2563eb); color: #fff;
           border-radius: 8px; padding: 4px 10px; margin-bottom: 4px; }
  h1 { font-size: 14px; margin: 0; letter-spacing: -.2px; }
  header .sub { font-size: 10px; opacity: .85; }
  header .badge { font-size: 10px; font-weight: 700; background: rgba(255,255,255,.18); border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
  .sect { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: #64748b; margin: 5px 0 3px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ticket { border: 1px solid #e5e7eb; border-top: 3px solid var(--c); border-radius: 6px;
            padding: 5px 8px 4px; page-break-inside: avoid; break-inside: avoid; background: #fff; display: flex; flex-direction: column; }
  .thead { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .tag { background: var(--c); color: #fff; border-radius: 3px; padding: 2px 6px; font-size: 10px; font-weight: 800; }
  .tlabel { font-size: 10px; font-weight: 700; flex: 1; }
  .tcount { font-size: 9px; color: #94a3b8; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: flex-start; gap: 4px; padding: 3px 0; border-top: 1px solid #f1f5f9; font-size: 10px; }
  li:first-child { border-top: 0; }
  .n { width: 14px; height: 14px; flex: none; border-radius: 50%; background: #f1f5f9; color: #64748b;
       font-size: 8px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .game { flex: 1; min-width: 0; }
  .teams { display: block; font-weight: 700; font-size: 10px; line-height: 1.1; }
  .teams em { color: #94a3b8; font-style: normal; }
  .teams .mk { font-style: normal; font-size: 8px; font-weight: 800; color: #fff; background: var(--c);
               border-radius: 3px; padding: 0 3px; vertical-align: middle; }
  .meta { display: block; font-size: 8px; color: #94a3b8; }
  .pick { font-size: 9px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff);
          border-radius: 4px; padding: 2px 5px; white-space: nowrap; }
  .pick b { font-size: 8px; opacity: .75; }
  .prob { width: 24px; text-align: right; font-size: 9px; font-weight: 800; color: #475569; font-variant-numeric: tabular-nums; }
  .just { margin-top: 5px; border: 1px solid #e5e7eb; border-left: 3px solid #1e40af; border-radius: 5px;
          padding: 5px 8px; page-break-inside: avoid; break-inside: avoid; flex: 0 0 auto; overflow: visible; }
  .just h2 { margin: 0 0 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #1e40af; }
  .just p { margin: 0; font-size: 9px; line-height: 1.35; color: #334155; white-space: pre-wrap; overflow: visible; }
  footer { margin-top: 10px; padding-top: 6px; font-size: 8px; color: #94a3b8; text-align: center; page-break-before: auto; }
  .proof { border: 1px solid #e5e7eb; border-radius: 5px; padding: 4px 8px; background: #fafafa; margin-bottom: 5px; page-break-inside: avoid; }
  .proof li { border-top: 1px solid #eee; padding: 3px 0; gap: 8px; font-size: 9px; }
  .pv { font-size: 8px; font-weight: 900; padding: 1px 5px; border-radius: 3px; white-space: nowrap; }
  .okv { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
  .bad { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .pmeta { font-size: 8.5px; color: #64748b; line-height: 1.3; }
  .pmeta b { color: #0f172a; }
</style></head>
<body>
  <header>
    <div>
      <h1>${esc(f.name)}</h1>
      <div class="sub">${f.date ? esc(f.date) + " · " : ""}gerado pela IA do Bingão</div>
    </div>
    <div class="badge">${f.tickets.length} fixos${mixed.length ? ` + ${mixed.length} mistos` : ""}</div>
  </header>
  
  ${f.confidence ? `
    <div style="margin: 10px 0; display: flex; gap: 10px;">
      <div style="flex: 1; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;">
        <div style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase;">Confiança OneOption</div>
        <div style="font-size: 20px; font-weight: 900; color: #f97316;">${f.confidence}%</div>
      </div>
      <div style="flex: 3; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;">
        <div style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase;">Análise da Elite</div>
        <div style="font-size: 9px; line-height: 1.4; color: #334155;">${esc(f.analysis || "Análise estratégica baseada em padrões de mercados especiais.")}</div>
      </div>
    </div>
  ` : ""}

  ${f.proof && f.proof.length ? proofSection(f.proof) : ""}
  
  <div class="sect">Bilhetes fixos (Horizontal) · 1 mercado por bilhete</div>
  <div class="grid">${ticketsHtml}</div>
  
  ${mixed.length ? `<div class="sect" style="margin-top: 10px;">Bilhetes mistos (Vertical) · 1 mercado por jogo</div><div class="grid">${mixedHtml}</div>` : ""}
  
  ${f.justification ? `<div class="just"><h2>Justificativa da IA · Fechamento e Times Utilizados</h2><p>${esc(f.justification)}</p></div>` : ""}
  
  <div class="just" style="margin-top: 5px; border-left: 3px solid #64748b; background: #f8fafc; flex: 0 0 auto;">
    <h2 style="color: #64748b; font-size: 9px;">Metodologia da Prova Real (Critérios Estatísticos)</h2>
    <p style="font-size: 8px; color: #64748b; font-style: italic; overflow: visible;">${esc(METHOD_TEXT)}</p>
  </div>
  
  <footer>Documento gerado automaticamente pela IA do Bingão · apostas envolvem risco</footer>
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };<\/script>
</body></html>`;


}


/** Abre a janela de impressão / salvar em PDF. */
export function printFechamento(f: ExportFechamento) {
  const w = window.open("", "_blank", "width=860,height=1000");
  if (!w) {
    alert("Permita pop-ups para gerar o PDF.");
    return;
  }
  w.document.open();
  w.document.write(buildHtml(f));
  w.document.close();
}

/** Abre o WhatsApp com os 5 bilhetes já formatados. */
export function shareFechamentoWhatsApp(f: ExportFechamento) {
  const url = `https://wa.me/?text=${encodeURIComponent(buildFechamentoText(f))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}


/** Compartilha via Web Share API, com fallback para a área de transferência. */
export async function shareFechamento(f: ExportFechamento) {
  const text = buildFechamentoText(f);
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: f.name, text });
      return "shared" as const;
    }
    await navigator.clipboard.writeText(text);
    return "copied" as const;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return "copied" as const;
    } catch {
      return "failed" as const;
    }
  }
}
