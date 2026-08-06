/**
 * Cliente da Graph API da Meta (Marketing API).
 *
 * Este módulo só pode ser importado dentro de handlers de server function, via
 * `await import(...)`: o token de anúncios do cliente nunca deve chegar ao
 * navegador. Arquivos `*.functions.ts` e de rota vão para o bundle do cliente.
 */

const VERSAO_API = "v21.0";
const BASE = `https://graph.facebook.com/${VERSAO_API}`;
const MAX_PAGINAS = 25;

export type InsightDiario = {
  data: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  /** Todas as ações devolvidas pela Meta, por action_type. */
  acoes: Record<string, number>;
  alcance: number;
  cliquesUnicos: number;
  cliquesLink: number;
  cliquesLinkUnicos: number;
  cliquesSaida: number;
  video25: number;
  video50: number;
  video75: number;
  video95: number;
  video100: number;
  videoThruplay: number;
  video15s: number;
  videoContinuo2s: number;
  videoTempoMedio: number;
  reconhecimentoEst: number;
};

export type InsightCampanha = InsightDiario & {
  campanhaId: string;
  campanhaNome: string;
};

type AcaoBruta = { action_type?: string; value?: string };

type LinhaInsight = {
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: AcaoBruta[];
  campaign_id?: string;
  campaign_name?: string;
  reach?: string;
  unique_clicks?: string;
  inline_link_clicks?: string;
  unique_inline_link_clicks?: string;
  outbound_clicks?: AcaoBruta[];
  video_p25_watched_actions?: AcaoBruta[];
  video_p50_watched_actions?: AcaoBruta[];
  video_p75_watched_actions?: AcaoBruta[];
  video_p95_watched_actions?: AcaoBruta[];
  video_p100_watched_actions?: AcaoBruta[];
  video_thruplay_watched_actions?: AcaoBruta[];
  video_15_sec_watched_actions?: AcaoBruta[];
  video_continuous_2_sec_watched_actions?: AcaoBruta[];
  video_avg_time_watched_actions?: AcaoBruta[];
  estimated_ad_recallers?: string;
};

type ErroMeta = { message?: string; type?: string; code?: number; error_subcode?: number };

type Resposta<T> = { data?: T[]; paging?: { next?: string }; error?: ErroMeta };

/** A Meta aceita a conta com e sem o prefixo; a API exige o prefixo. */
export function normalizarConta(id: string): string {
  const limpo = id.trim();
  return limpo.startsWith("act_") ? limpo : `act_${limpo}`;
}

function numero(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function somarAcoes(lista: AcaoBruta[] | undefined): number {
  return (lista ?? []).reduce((acc, a) => acc + numero(a.value), 0);
}

/** Mensagens da Meta chegam em inglês e sem contexto; traduzimos as comuns. */
function traduzirErro(erro: ErroMeta): string {
  const codigo = erro.code;
  if (codigo === 190) {
    return "Token da Meta inválido ou expirado. Gere um novo token e salve novamente.";
  }
  if (codigo === 200 || codigo === 10) {
    return "O token não tem permissão para ler esta conta de anúncio (é necessário o escopo ads_read).";
  }
  if (codigo === 100) {
    return "Conta de anúncio não encontrada. Confira o ID (formato act_123456789).";
  }
  if (codigo === 17 || codigo === 4 || codigo === 613) {
    return "Limite de requisições da Meta atingido. Tente novamente em alguns minutos.";
  }
  if (codigo === 803) {
    return "Conta de anúncio inacessível com este token.";
  }
  return erro.message
    ? `Erro da Meta: ${erro.message}`
    : "Não foi possível falar com a Meta.";
}

async function pedir<T>(url: string): Promise<Resposta<T>> {
  let resposta: Response;
  try {
    resposta = await fetch(url);
  } catch {
    throw new Error("Não foi possível alcançar a Meta. Verifique a conexão.");
  }

  let corpo: Resposta<T>;
  try {
    corpo = (await resposta.json()) as Resposta<T>;
  } catch {
    throw new Error("A Meta devolveu uma resposta inesperada.");
  }

  if (corpo.error) throw new Error(traduzirErro(corpo.error));
  if (!resposta.ok) throw new Error("A Meta recusou a requisição.");
  return corpo;
}

/**
 * Confirma que o par token + conta de anúncio funciona, devolvendo o nome da
 * conta. Serve para validar a credencial no momento do cadastro.
 */
export async function validarCredenciais(
  adAccountId: string,
  token: string,
): Promise<{ nome: string; moeda: string }> {
  const conta = normalizarConta(adAccountId);
  const url = new URL(`${BASE}/${conta}`);
  url.searchParams.set("fields", "name,currency,account_status");
  url.searchParams.set("access_token", token);

  const corpo = (await pedir<never>(url.toString())) as unknown as {
    name?: string;
    currency?: string;
  };
  return { nome: corpo.name ?? conta, moeda: corpo.currency ?? "BRL" };
}

/**
 * Insights diários da conta, um registro por dia. `time_increment=1` faz a
 * Meta quebrar o período por dia em vez de somar tudo num único total.
 */
type Periodo = { adAccountId: string; token: string; desde: string; ate: string };

const CAMPOS_INSIGHTS =
  "spend,impressions,clicks,actions,reach,unique_clicks,inline_link_clicks,unique_inline_link_clicks,outbound_clicks," +
  "video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions," +
  "video_thruplay_watched_actions,video_15_sec_watched_actions,video_continuous_2_sec_watched_actions,video_avg_time_watched_actions," +
  "estimated_ad_recallers";

async function coletarInsights(
  opts: Periodo,
  nivel: "account" | "campaign",
): Promise<LinhaInsight[]> {
  const conta = normalizarConta(opts.adAccountId);
  const url = new URL(`${BASE}/${conta}/insights`);
  url.searchParams.set("level", nivel);
  url.searchParams.set("time_increment", "1");
  url.searchParams.set(
    "fields",
    nivel === "campaign" ? `${CAMPOS_INSIGHTS},campaign_id,campaign_name` : CAMPOS_INSIGHTS,
  );
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: opts.desde, until: opts.ate }),
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", opts.token);

  const linhas: LinhaInsight[] = [];
  let proxima: string | undefined = url.toString();

  for (let pagina = 0; proxima && pagina < MAX_PAGINAS; pagina++) {
    const corpo: Resposta<LinhaInsight> = await pedir<LinhaInsight>(proxima);
    linhas.push(...(corpo.data ?? []));
    proxima = corpo.paging?.next;
  }

  return linhas;
}

function converter(linha: LinhaInsight): InsightDiario {
  const acoes: Record<string, number> = {};
  for (const acao of linha.actions ?? []) {
    if (acao.action_type) acoes[acao.action_type] = numero(acao.value);
  }
  return {
    data: linha.date_start as string,
    investimento: numero(linha.spend),
    impressoes: numero(linha.impressions),
    cliques: numero(linha.clicks),
    acoes,
    alcance: numero(linha.reach),
    cliquesUnicos: numero(linha.unique_clicks),
    cliquesLink: numero(linha.inline_link_clicks),
    cliquesLinkUnicos: numero(linha.unique_inline_link_clicks),
    cliquesSaida: somarAcoes(linha.outbound_clicks),
    video25: somarAcoes(linha.video_p25_watched_actions),
    video50: somarAcoes(linha.video_p50_watched_actions),
    video75: somarAcoes(linha.video_p75_watched_actions),
    video95: somarAcoes(linha.video_p95_watched_actions),
    video100: somarAcoes(linha.video_p100_watched_actions),
    videoThruplay: somarAcoes(linha.video_thruplay_watched_actions),
    video15s: somarAcoes(linha.video_15_sec_watched_actions),
    videoContinuo2s: somarAcoes(linha.video_continuous_2_sec_watched_actions),
    videoTempoMedio: somarAcoes(linha.video_avg_time_watched_actions),
    reconhecimentoEst: numero(linha.estimated_ad_recallers),
  };
}

export async function buscarInsightsDiarios(opts: Periodo): Promise<InsightDiario[]> {
  const linhas = await coletarInsights(opts, "account");
  return linhas.filter((l) => Boolean(l.date_start)).map(converter);
}

/** Mesmos números, quebrados por campanha — base do filtro do dashboard. */
export async function buscarInsightsPorCampanha(opts: Periodo): Promise<InsightCampanha[]> {
  const linhas = await coletarInsights(opts, "campaign");
  return linhas
    .filter((l) => Boolean(l.date_start) && Boolean(l.campaign_id))
    .map((linha) => ({
      ...converter(linha),
      campanhaId: linha.campaign_id as string,
      campanhaNome: linha.campaign_name ?? "",
    }));
}

const STATUS_PT: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  DELETED: "Excluída",
  ARCHIVED: "Arquivada",
  IN_PROCESS: "Em processamento",
  WITH_ISSUES: "Com problemas",
  CAMPAIGN_PAUSED: "Pausada",
  ADSET_PAUSED: "Conjunto pausado",
  PENDING_REVIEW: "Em revisão",
  DISAPPROVED: "Reprovada",
};

/**
 * Situação atual de cada campanha. Os insights não trazem status, então é uma
 * chamada à parte; o resultado é indexado por id da campanha.
 */
export async function buscarStatusCampanhas(
  adAccountId: string,
  token: string,
): Promise<Record<string, string>> {
  const conta = normalizarConta(adAccountId);
  const url = new URL(`${BASE}/${conta}/campaigns`);
  url.searchParams.set("fields", "name,effective_status");
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", token);

  const status: Record<string, string> = {};
  let proxima: string | undefined = url.toString();

  for (let pagina = 0; proxima && pagina < MAX_PAGINAS; pagina++) {
    const corpo: Resposta<{ id?: string; effective_status?: string }> = await pedir<{
      id?: string;
      effective_status?: string;
    }>(proxima);
    for (const campanha of corpo.data ?? []) {
      if (campanha.id) {
        const bruto = campanha.effective_status ?? "";
        status[campanha.id] = STATUS_PT[bruto] ?? bruto;
      }
    }
    proxima = corpo.paging?.next;
  }

  return status;
}

// --- segmentações (idade, gênero, plataforma, posicionamento, dispositivo, região, hora) ---

export type DimensaoSegmentacao =
  | "age"
  | "gender"
  | "publisher_platform"
  | "platform_position"
  | "impression_device"
  | "region"
  | "hourly_stats_aggregated_by_advertiser_time_zone";

export type LinhaSegmentada = { valor: string; investimento: number; impressoes: number; cliques: number; leads: number };

const ACOES_LEAD_PADRAO_SERVER = [
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
];

/**
 * Uma chamada por dimensão: a Meta não deixa combinar `hourly_stats_...` com
 * as demais, e manter uma dimensão por chamada evita cruzar combinações que
 * ninguém pediu (idade × gênero × plataforma...).
 */
export async function buscarSegmentacao(
  opts: Periodo,
  dimensao: DimensaoSegmentacao,
  acaoLead: string | null,
): Promise<LinhaSegmentada[]> {
  const conta = normalizarConta(opts.adAccountId);
  const url = new URL(`${BASE}/${conta}/insights`);
  url.searchParams.set("level", "account");
  url.searchParams.set("breakdowns", dimensao);
  url.searchParams.set("fields", "spend,impressions,clicks,actions");
  url.searchParams.set("time_range", JSON.stringify({ since: opts.desde, until: opts.ate }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", opts.token);

  type LinhaSeg = LinhaInsight & {
    age?: string;
    gender?: string;
    publisher_platform?: string;
    platform_position?: string;
    impression_device?: string;
    region?: string;
    hourly_stats_aggregated_by_advertiser_time_zone?: string;
  };

  const linhas: LinhaSeg[] = [];
  let proxima: string | undefined = url.toString();
  for (let pagina = 0; proxima && pagina < MAX_PAGINAS; pagina++) {
    const corpo: Resposta<LinhaSeg> = await pedir<LinhaSeg>(proxima);
    linhas.push(...(corpo.data ?? []));
    proxima = corpo.paging?.next;
  }

  const acumulado = new Map<string, LinhaSegmentada>();
  for (const linha of linhas) {
    const valor = (linha[dimensao] as string | undefined) ?? "Não informado";
    const atual = acumulado.get(valor) ?? { valor, investimento: 0, impressoes: 0, cliques: 0, leads: 0 };
    const acoes: Record<string, number> = {};
    for (const acao of linha.actions ?? []) {
      if (acao.action_type) acoes[acao.action_type] = numero(acao.value);
    }
    let leads = 0;
    if (acaoLead) leads = acoes[acaoLead] ?? 0;
    else {
      for (const tipo of ACOES_LEAD_PADRAO_SERVER) {
        if (acoes[tipo] !== undefined) {
          leads = acoes[tipo];
          break;
        }
      }
    }
    atual.investimento += numero(linha.spend);
    atual.impressoes += numero(linha.impressions);
    atual.cliques += numero(linha.clicks);
    atual.leads += leads;
    acumulado.set(valor, atual);
  }

  return [...acumulado.values()];
}

// A escolha de qual ação conta como lead vive em `@/lib/metricas`, junto do
// dashboard: como `acoes` guarda todos os tipos, ela é aplicada na leitura e
// trocá-la não exige puxar o histórico de novo.
