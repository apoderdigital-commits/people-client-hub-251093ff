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
  video25: number;
  video50: number;
  video75: number;
  video100: number;
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
  video_p25_watched_actions?: AcaoBruta[];
  video_p50_watched_actions?: AcaoBruta[];
  video_p75_watched_actions?: AcaoBruta[];
  video_p100_watched_actions?: AcaoBruta[];
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

async function coletarInsights(
  opts: Periodo,
  nivel: "account" | "campaign",
): Promise<LinhaInsight[]> {
  const conta = normalizarConta(opts.adAccountId);
  const url = new URL(`${BASE}/${conta}/insights`);
  url.searchParams.set("level", nivel);
  url.searchParams.set("time_increment", "1");
  const camposComuns =
    "spend,impressions,clicks,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions";
  url.searchParams.set(
    "fields",
    nivel === "campaign" ? `${camposComuns},campaign_id,campaign_name` : camposComuns,
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
    video25: somarAcoes(linha.video_p25_watched_actions),
    video50: somarAcoes(linha.video_p50_watched_actions),
    video75: somarAcoes(linha.video_p75_watched_actions),
    video100: somarAcoes(linha.video_p100_watched_actions),
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

// A escolha de qual ação conta como lead vive em `@/lib/metricas`, junto do
// dashboard: como `acoes` guarda todos os tipos, ela é aplicada na leitura e
// trocá-la não exige puxar o histórico de novo.
