/**
 * Cliente da Google Ads API (REST + GAQL). Segue o mesmo desenho do
 * meta.server.ts: fetch puro, sem SDK, só importável dentro de server
 * functions.
 */

import { normalizarId, obterAccessToken, type IntegracaoGoogle } from "@/lib/google.server";

const VERSAO_API = "v18";
const BASE = `https://googleads.googleapis.com/${VERSAO_API}`;

export type InsightCampanhaGoogleAds = {
  campanhaId: string;
  campanhaNome: string;
  status: string;
  data: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  valorConversoes: number;
  ctr: number;
  cpc: number;
};

type LinhaGoogleAds = {
  campaign?: { id?: string; name?: string; status?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
    ctr?: number;
    averageCpc?: string;
  };
};

type ErroGoogleAds = { error?: { message?: string; status?: string } };

function numero(valor: string | number | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function microsParaValor(valor: string | undefined): number {
  return numero(valor) / 1_000_000;
}

/**
 * Mensagens da Google Ads API chegam técnicas; adicionamos uma pista em cima,
 * mas sempre mostrando a mensagem original da Google no final — sem isso, um
 * erro mal categorizado aqui vira um beco sem saída pra debugar.
 */
function traduzirErro(status: number, corpo: ErroGoogleAds | null): string {
  const mensagem = corpo?.error?.message ?? "";
  const statusGoogle = corpo?.error?.status ?? "";
  const sufixo = mensagem ? ` (Google: "${mensagem}"${statusGoogle ? ` / ${statusGoogle}` : ""})` : "";

  if (status === 401 || /UNAUTHENTICATED/i.test(statusGoogle)) {
    return `Autenticação com o Google Ads falhou. Confira o developer token e o refresh token.${sufixo}`;
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(statusGoogle)) {
    return `Sem permissão pra acessar essa conta do Google Ads. Confira se ela está vinculada à conta gerenciadora.${sufixo}`;
  }
  if (/NOT_FOUND/i.test(statusGoogle) || status === 404) {
    return `Conta do Google Ads não encontrada. Confira o Customer ID (formato 123-456-7890).${sufixo}`;
  }
  if (/CUSTOMER_NOT_ENABLED/i.test(mensagem)) {
    return `Essa conta do Google Ads não está ativa.${sufixo}`;
  }
  return mensagem ? `Erro do Google Ads: ${mensagem}` : "O Google Ads recusou a requisição.";
}

async function consultar(
  config: IntegracaoGoogle,
  customerId: string,
  gaql: string,
): Promise<LinhaGoogleAds[]> {
  const accessToken = await obterAccessToken(config);
  const customerLimpo = normalizarId(customerId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": config.developer_token,
    "Content-Type": "application/json",
  };
  if (config.login_customer_id) {
    headers["login-customer-id"] = normalizarId(config.login_customer_id);
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}/customers/${customerLimpo}/googleAds:search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gaql, pageSize: 10000 }),
    });
  } catch {
    throw new Error("Não foi possível alcançar o Google Ads. Verifique a conexão.");
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(traduzirErro(resposta.status, corpo as ErroGoogleAds | null));
  }

  return ((corpo as { results?: LinhaGoogleAds[] } | null)?.results ?? []) as LinhaGoogleAds[];
}

/** Confirma que o Customer ID existe e está acessível com essas credenciais. */
export async function validarCustomerId(
  config: IntegracaoGoogle,
  customerId: string,
): Promise<{ nome: string }> {
  const linhas = await consultar(
    config,
    customerId,
    "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
  );
  const nome = (linhas[0] as unknown as { customer?: { descriptiveName?: string } } | undefined)
    ?.customer?.descriptiveName;
  return { nome: nome ?? customerId };
}

/** Métricas diárias por campanha, no intervalo informado (datas no formato YYYY-MM-DD). */
export async function buscarInsightsPorCampanha(
  config: IntegracaoGoogle,
  customerId: string,
  desde: string,
  ate: string,
): Promise<InsightCampanhaGoogleAds[]> {
  const gaql = `
    SELECT
      campaign.id, campaign.name, campaign.status, segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${desde}' AND '${ate}'
    ORDER BY segments.date
  `.trim();

  const linhas = await consultar(config, customerId, gaql);

  return linhas.map((l) => ({
    campanhaId: l.campaign?.id ?? "",
    campanhaNome: l.campaign?.name ?? "",
    status: l.campaign?.status ?? "",
    data: l.segments?.date ?? "",
    investimento: microsParaValor(l.metrics?.costMicros),
    impressoes: numero(l.metrics?.impressions),
    cliques: numero(l.metrics?.clicks),
    conversoes: numero(l.metrics?.conversions),
    valorConversoes: numero(l.metrics?.conversionsValue),
    ctr: numero(l.metrics?.ctr),
    cpc: microsParaValor(l.metrics?.averageCpc),
  }));
}
