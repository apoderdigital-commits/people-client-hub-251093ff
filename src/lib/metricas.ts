/**
 * Períodos, catálogo de métricas e agregação do dashboard.
 *
 * As linhas vêm de `metricas_campanhas` — um registro por campanha por dia.
 * Somar todas as campanhas dá o total da conta, então o dashboard trabalha
 * sempre sobre a mesma fonte, com ou sem filtro.
 */

export type PeriodoId = "hoje" | "7d" | "30d" | "mes" | "personalizado";

export const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Mês atual" },
  { id: "personalizado", label: "Personalizado" },
];

export type Janela = { desde: string; ate: string };

export type LinhaCampanha = {
  campanha_id: string;
  campanha_nome: string;
  status: string;
  data: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  leads: number;
  conversoes: number;
  acoes: Record<string, number> | null;
  video_p25: number;
  video_p50: number;
  video_p75: number;
  video_p95: number;
  video_p100: number;
  alcance: number;
  cliques_unicos: number;
  cliques_link: number;
  cliques_link_unicos: number;
  cliques_saida: number;
  video_thruplay: number;
  video_15s: number;
  video_continuo_2s: number;
  video_tempo_medio: number;
  reconhecimento_est: number;
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function somarDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + dias);
  return d;
}

/**
 * Janela do período. Os presets de 7 e 30 dias terminam **ontem**, seguindo a
 * convenção do Gerenciador de Anúncios: o dia corrente ainda está incompleto e
 * incluí-lo faz os números divergirem do que a Meta mostra.
 */
export function intervalo(periodo: PeriodoId, personalizado?: Janela): Janela {
  const hoje = new Date();
  const ontem = somarDias(hoje, -1);

  if (periodo === "personalizado") {
    return personalizado ?? { desde: iso(somarDias(hoje, -29)), ate: iso(ontem) };
  }
  if (periodo === "hoje") return { desde: iso(hoje), ate: iso(hoje) };
  if (periodo === "7d") return { desde: iso(somarDias(ontem, -6)), ate: iso(ontem) };
  if (periodo === "30d") return { desde: iso(somarDias(ontem, -29)), ate: iso(ontem) };

  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { desde: iso(primeiro), ate: iso(hoje) };
}

/** Janela de mesmo tamanho imediatamente anterior, para a variação percentual. */
export function janelaAnterior(janela: Janela): Janela {
  const desde = new Date(`${janela.desde}T12:00:00`);
  const ate = new Date(`${janela.ate}T12:00:00`);
  const dias = Math.round((ate.getTime() - desde.getTime()) / 86_400_000) + 1;
  const novoAte = somarDias(desde, -1);
  return { desde: iso(somarDias(novoAte, -(dias - 1))), ate: iso(novoAte) };
}

// --- ações da Meta ---

/**
 * Tipos de ação que costumam representar um lead, em ordem de preferência.
 * Usados apenas enquanto o cliente não tem `acao_lead` configurada. Como
 * `metricas_campanhas.acoes` guarda todos os tipos, trocar a escolha recalcula
 * na hora, sem puxar nada da Meta de novo.
 */
export const ACOES_LEAD_PADRAO = [
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.messaging_conversation_started_7d",
] as const;

export const ACOES_CONVERSAO_PADRAO = [
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "omni_purchase",
] as const;

export function contarAcao(
  acoes: Record<string, number> | null | undefined,
  configurada: string | null,
  padroes: readonly string[],
): number {
  if (!acoes) return 0;
  if (configurada) return acoes[configurada] ?? 0;
  for (const tipo of padroes) {
    if (acoes[tipo] !== undefined) return acoes[tipo];
  }
  return 0;
}

/** Tipos de ação presentes nos dados, para montar o seletor de configuração. */
export function tiposDeAcao(
  linhas: { acoes: Record<string, number> | null }[],
): { tipo: string; total: number }[] {
  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    for (const [tipo, valor] of Object.entries(linha.acoes ?? {})) {
      mapa.set(tipo, (mapa.get(tipo) ?? 0) + valor);
    }
  }
  return [...mapa.entries()]
    .map(([tipo, total]) => ({ tipo, total }))
    .sort((a, b) => b.total - a.total);
}

// --- catálogo de métricas ---

export type MetricaId =
  | "investimento"
  | "impressoes"
  | "cliques"
  | "ctr"
  | "cpc"
  | "cpm"
  | "leads"
  | "cpl"
  | "conversoes"
  | "taxa_conversao"
  | "video25"
  | "video50"
  | "video75"
  | "video95"
  | "video100"
  | "alcance"
  | "frequencia"
  | "cliques_unicos"
  | "ctr_unico"
  | "cliques_link"
  | "ctr_link"
  | "cliques_link_unicos"
  | "ctr_link_unico"
  | "cliques_saida"
  | "ctr_saida"
  | "custo_clique_unico"
  | "custo_clique_saida"
  | "custo_mil_alcancadas"
  | "engajamento_publicacao"
  | "custo_por_engajamento"
  | "reacoes"
  | "custo_por_reacao"
  | "comentarios"
  | "custo_por_comentario"
  | "compartilhamentos"
  | "custo_por_compartilhamento"
  | "curtidas_pagina"
  | "custo_por_curtida"
  | "respostas_evento"
  | "video_thruplay"
  | "video_15s"
  | "video_continuo_2s"
  | "video_tempo_medio"
  | "custo_por_thruplay"
  | "reconhecimento_est"
  | "custo_por_reconhecimento";

export const METRICAS: {
  id: MetricaId;
  label: string;
  formato: "brl" | "num" | "pct" | "dec";
  /** true quando aumentar é ruim (custos). */
  inverso?: boolean;
}[] = [
  { id: "investimento", label: "Investimento", formato: "brl" },
  { id: "impressoes", label: "Impressões", formato: "num" },
  { id: "alcance", label: "Alcance", formato: "num" },
  { id: "frequencia", label: "Frequência", formato: "dec" },
  { id: "cliques", label: "Cliques (todos)", formato: "num" },
  { id: "ctr", label: "CTR (todos)", formato: "pct" },
  { id: "cliques_unicos", label: "Cliques únicos (todos)", formato: "num" },
  { id: "ctr_unico", label: "CTR único (todos)", formato: "pct" },
  { id: "cliques_link", label: "Cliques no link", formato: "num" },
  { id: "ctr_link", label: "CTR (link)", formato: "pct" },
  { id: "cliques_link_unicos", label: "Cliques únicos no link", formato: "num" },
  { id: "ctr_link_unico", label: "CTR único (link)", formato: "pct" },
  { id: "cliques_saida", label: "Cliques de saída", formato: "num" },
  { id: "ctr_saida", label: "CTR de saída", formato: "pct" },
  { id: "cpc", label: "CPC (todos)", formato: "brl", inverso: true },
  { id: "cpm", label: "CPM", formato: "brl", inverso: true },
  { id: "custo_clique_unico", label: "Custo por clique único", formato: "brl", inverso: true },
  { id: "custo_clique_saida", label: "Custo por clique de saída", formato: "brl", inverso: true },
  { id: "custo_mil_alcancadas", label: "Custo por 1.000 alcançadas", formato: "brl", inverso: true },
  { id: "leads", label: "Leads", formato: "num" },
  { id: "cpl", label: "CPL", formato: "brl", inverso: true },
  { id: "conversoes", label: "Conversões", formato: "num" },
  { id: "taxa_conversao", label: "Taxa de conversão", formato: "pct" },
  { id: "engajamento_publicacao", label: "Engajamento com a publicação", formato: "num" },
  { id: "custo_por_engajamento", label: "Custo por engajamento", formato: "brl", inverso: true },
  { id: "reacoes", label: "Reações à publicação", formato: "num" },
  { id: "custo_por_reacao", label: "Custo por reação", formato: "brl", inverso: true },
  { id: "comentarios", label: "Comentários da publicação", formato: "num" },
  { id: "custo_por_comentario", label: "Custo por comentário", formato: "brl", inverso: true },
  { id: "compartilhamentos", label: "Compartilhamentos da publicação", formato: "num" },
  { id: "custo_por_compartilhamento", label: "Custo por compartilhamento", formato: "brl", inverso: true },
  { id: "curtidas_pagina", label: "Curtidas da página", formato: "num" },
  { id: "custo_por_curtida", label: "Custo por curtida na página", formato: "brl", inverso: true },
  { id: "respostas_evento", label: "Respostas a eventos", formato: "num" },
  { id: "video25", label: "Reprodução de vídeo 25%", formato: "num" },
  { id: "video50", label: "Reprodução de vídeo 50%", formato: "num" },
  { id: "video75", label: "Reprodução de vídeo 75%", formato: "num" },
  { id: "video95", label: "Reprodução de vídeo 95%", formato: "num" },
  { id: "video100", label: "Reprodução de vídeo 100%", formato: "num" },
  { id: "video_thruplay", label: "ThruPlays", formato: "num" },
  { id: "video_15s", label: "Reproduções de 15 segundos", formato: "num" },
  { id: "video_continuo_2s", label: "Reproduções contínuas de 2 segundos", formato: "num" },
  { id: "video_tempo_medio", label: "Tempo médio de reprodução (seg)", formato: "dec" },
  { id: "custo_por_thruplay", label: "Custo por ThruPlay", formato: "brl", inverso: true },
  { id: "reconhecimento_est", label: "Aumento estimado de reconhecimento", formato: "num" },
  { id: "custo_por_reconhecimento", label: "Custo por pessoa com reconhecimento", formato: "brl", inverso: true },
];

export const METRICAS_PADRAO: MetricaId[] = [
  "investimento",
  "impressoes",
  "cliques",
  "ctr",
  "cpc",
  "leads",
  "cpl",
  "conversoes",
];

export function ehMetricaValida(valor: unknown): valor is MetricaId {
  return typeof valor === "string" && METRICAS.some((m) => m.id === valor);
}

/** Normaliza o que veio do banco, caindo no padrão quando estiver vazio. */
export function lerMetricasConfig(valor: unknown): MetricaId[] {
  if (!Array.isArray(valor)) return METRICAS_PADRAO;
  const ids = valor.filter(ehMetricaValida);
  return ids.length > 0 ? ids : METRICAS_PADRAO;
}

// --- agregação ---

export type Totais = Record<MetricaId, number>;

export function totais(
  linhas: LinhaCampanha[],
  acaoLead: string | null,
  acaoConversao: string | null,
): Totais {
  let investimento = 0;
  let impressoes = 0;
  let cliques = 0;
  let leads = 0;
  let conversoes = 0;
  let video25 = 0;
  let video50 = 0;
  let video75 = 0;
  let video95 = 0;
  let video100 = 0;
  let alcance = 0;
  let cliquesUnicos = 0;
  let cliquesLink = 0;
  let cliquesLinkUnicos = 0;
  let cliquesSaida = 0;
  let engajamentoPublicacao = 0;
  let reacoes = 0;
  let comentarios = 0;
  let compartilhamentos = 0;
  let curtidasPagina = 0;
  let respostasEvento = 0;
  let videoThruplay = 0;
  let video15s = 0;
  let videoContinuo2s = 0;
  let somaTempoMedio = 0;
  let linhasComTempoMedio = 0;
  let reconhecimentoEst = 0;

  for (const linha of linhas) {
    investimento += linha.investimento;
    impressoes += linha.impressoes;
    cliques += linha.cliques;
    leads += linha.acoes
      ? contarAcao(linha.acoes, acaoLead, ACOES_LEAD_PADRAO)
      : linha.leads;
    conversoes += linha.acoes
      ? contarAcao(linha.acoes, acaoConversao, ACOES_CONVERSAO_PADRAO)
      : linha.conversoes;
    video25 += linha.video_p25 ?? 0;
    video50 += linha.video_p50 ?? 0;
    video75 += linha.video_p75 ?? 0;
    video95 += linha.video_p95 ?? 0;
    video100 += linha.video_p100 ?? 0;
    alcance += linha.alcance ?? 0;
    cliquesUnicos += linha.cliques_unicos ?? 0;
    cliquesLink += linha.cliques_link ?? 0;
    cliquesLinkUnicos += linha.cliques_link_unicos ?? 0;
    cliquesSaida += linha.cliques_saida ?? 0;
    videoThruplay += linha.video_thruplay ?? 0;
    video15s += linha.video_15s ?? 0;
    videoContinuo2s += linha.video_continuo_2s ?? 0;
    reconhecimentoEst += linha.reconhecimento_est ?? 0;
    if (linha.video_tempo_medio) {
      somaTempoMedio += linha.video_tempo_medio;
      linhasComTempoMedio += 1;
    }
    if (linha.acoes) {
      engajamentoPublicacao += linha.acoes["post_engagement"] ?? 0;
      reacoes += linha.acoes["post_reaction"] ?? 0;
      comentarios += linha.acoes["comment"] ?? 0;
      compartilhamentos += linha.acoes["post"] ?? 0;
      curtidasPagina += linha.acoes["like"] ?? 0;
      respostasEvento += linha.acoes["rsvp"] ?? 0;
    }
  }

  return {
    investimento,
    impressoes,
    alcance,
    frequencia: alcance ? impressoes / alcance : 0,
    cliques,
    ctr: impressoes ? (cliques / impressoes) * 100 : 0,
    cliques_unicos: cliquesUnicos,
    ctr_unico: alcance ? (cliquesUnicos / alcance) * 100 : 0,
    cliques_link: cliquesLink,
    ctr_link: impressoes ? (cliquesLink / impressoes) * 100 : 0,
    cliques_link_unicos: cliquesLinkUnicos,
    ctr_link_unico: alcance ? (cliquesLinkUnicos / alcance) * 100 : 0,
    cliques_saida: cliquesSaida,
    ctr_saida: impressoes ? (cliquesSaida / impressoes) * 100 : 0,
    cpc: cliques ? investimento / cliques : 0,
    cpm: impressoes ? (investimento / impressoes) * 1000 : 0,
    custo_clique_unico: cliquesUnicos ? investimento / cliquesUnicos : 0,
    custo_clique_saida: cliquesSaida ? investimento / cliquesSaida : 0,
    custo_mil_alcancadas: alcance ? (investimento / alcance) * 1000 : 0,
    leads,
    cpl: leads ? investimento / leads : 0,
    conversoes,
    taxa_conversao: cliques ? (leads / cliques) * 100 : 0,
    engajamento_publicacao: engajamentoPublicacao,
    custo_por_engajamento: engajamentoPublicacao ? investimento / engajamentoPublicacao : 0,
    reacoes,
    custo_por_reacao: reacoes ? investimento / reacoes : 0,
    comentarios,
    custo_por_comentario: comentarios ? investimento / comentarios : 0,
    compartilhamentos,
    custo_por_compartilhamento: compartilhamentos ? investimento / compartilhamentos : 0,
    curtidas_pagina: curtidasPagina,
    custo_por_curtida: curtidasPagina ? investimento / curtidasPagina : 0,
    respostas_evento: respostasEvento,
    video25,
    video50,
    video75,
    video95,
    video100,
    video_thruplay: videoThruplay,
    video_15s: video15s,
    video_continuo_2s: videoContinuo2s,
    video_tempo_medio: linhasComTempoMedio ? somaTempoMedio / linhasComTempoMedio : 0,
    custo_por_thruplay: videoThruplay ? investimento / videoThruplay : 0,
    reconhecimento_est: reconhecimentoEst,
    custo_por_reconhecimento: reconhecimentoEst ? investimento / reconhecimentoEst : 0,
  };
}

export function variacao(atual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

export type Campanha = { id: string; nome: string; status: string };

/** Campanhas distintas presentes no período, para montar o filtro. */
export function campanhasDe(linhas: LinhaCampanha[]): Campanha[] {
  const mapa = new Map<string, Campanha>();
  for (const linha of linhas) {
    if (!mapa.has(linha.campanha_id)) {
      mapa.set(linha.campanha_id, {
        id: linha.campanha_id,
        nome: linha.campanha_nome || linha.campanha_id,
        status: linha.status,
      });
    }
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Série diária somada, pronta para o gráfico. */
export function porDia(
  linhas: LinhaCampanha[],
  acaoLead: string | null,
): { data: string; leads: number; investimento: number }[] {
  const mapa = new Map<string, { leads: number; investimento: number }>();
  for (const linha of linhas) {
    const atual = mapa.get(linha.data) ?? { leads: 0, investimento: 0 };
    atual.leads += linha.acoes
      ? contarAcao(linha.acoes, acaoLead, ACOES_LEAD_PADRAO)
      : linha.leads;
    atual.investimento += linha.investimento;
    mapa.set(linha.data, atual);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, v]) => ({ data, leads: v.leads, investimento: Math.round(v.investimento) }));
}

/** Totais por campanha, para a tabela. */
export function porCampanha(
  linhas: LinhaCampanha[],
  acaoLead: string | null,
): { id: string; nome: string; status: string; investimento: number; leads: number }[] {
  const mapa = new Map<
    string,
    { nome: string; status: string; investimento: number; leads: number }
  >();
  for (const linha of linhas) {
    const atual = mapa.get(linha.campanha_id) ?? {
      nome: linha.campanha_nome || linha.campanha_id,
      status: linha.status,
      investimento: 0,
      leads: 0,
    };
    atual.investimento += linha.investimento;
    atual.leads += linha.acoes
      ? contarAcao(linha.acoes, acaoLead, ACOES_LEAD_PADRAO)
      : linha.leads;
    mapa.set(linha.campanha_id, atual);
  }
  return [...mapa.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.investimento - a.investimento);
}

/** Rótulos por dia da semana e mês, derivados dos dados diários já sincronizados. */
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function porDiaDaSemana(
  linhas: LinhaCampanha[],
): { rotulo: string; investimento: number; cliques: number; impressoes: number }[] {
  const somas = DIAS_SEMANA.map(() => ({ investimento: 0, cliques: 0, impressoes: 0 }));
  for (const linha of linhas) {
    const dia = new Date(`${linha.data}T12:00:00`).getDay();
    somas[dia].investimento += linha.investimento;
    somas[dia].cliques += linha.cliques;
    somas[dia].impressoes += linha.impressoes;
  }
  return DIAS_SEMANA.map((rotulo, i) => ({ rotulo, ...somas[i] }));
}

export function porMes(
  linhas: LinhaCampanha[],
): { rotulo: string; investimento: number; cliques: number; impressoes: number }[] {
  const mapa = new Map<string, { investimento: number; cliques: number; impressoes: number }>();
  for (const linha of linhas) {
    const chave = linha.data.slice(0, 7);
    const atual = mapa.get(chave) ?? { investimento: 0, cliques: 0, impressoes: 0 };
    atual.investimento += linha.investimento;
    atual.cliques += linha.cliques;
    atual.impressoes += linha.impressoes;
    mapa.set(chave, atual);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, v]) => {
      const [, mesStr] = chave.split("-");
      const mes = Number(mesStr) - 1;
      return { rotulo: MESES[mes] ?? chave, ...v };
    });
}
