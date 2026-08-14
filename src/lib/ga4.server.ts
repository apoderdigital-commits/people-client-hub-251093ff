/**
 * Cliente da Google Analytics Data API (GA4). Segue o mesmo desenho do
 * meta.server.ts / google-ads.server.ts: fetch puro, só importável dentro de
 * server functions.
 */

import { normalizarId, obterAccessToken, type IntegracaoGoogle } from "@/lib/google.server";

const BASE = "https://analyticsdata.googleapis.com/v1beta";

export type InsightDiarioGA4 = {
  data: string;
  sessoes: number;
  usuarios: number;
  novosUsuarios: number;
  visualizacoesPagina: number;
  taxaEngajamento: number;
  duracaoMediaSessao: number;
  conversoes: number;
};

type LinhaRelatorio = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };

type ErroGA4 = { error?: { message?: string; status?: string } };

function numero(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Formata YYYYMMDD (formato que o GA4 devolve) como YYYY-MM-DD. */
function formatarData(bruta: string | undefined): string {
  if (!bruta || bruta.length !== 8) return bruta ?? "";
  return `${bruta.slice(0, 4)}-${bruta.slice(4, 6)}-${bruta.slice(6, 8)}`;
}

function traduzirErro(status: number, corpo: ErroGA4 | null): string {
  const mensagem = corpo?.error?.message ?? "";
  if (status === 401) {
    return "Autenticação com o Google Analytics falhou. Gere um novo refresh token e salve de novo.";
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(corpo?.error?.status ?? "")) {
    return "Sem permissão pra acessar essa propriedade do GA4. Confira se a conta autorizada tem acesso de leitor nela.";
  }
  if (status === 404 || /not found/i.test(mensagem)) {
    return "Propriedade do GA4 não encontrada. Confira o Property ID (só números).";
  }
  return mensagem ? `Erro do Google Analytics: ${mensagem}` : "O Google Analytics recusou a requisição.";
}

async function relatorio(
  config: IntegracaoGoogle,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<LinhaRelatorio[]> {
  const accessToken = await obterAccessToken(config);
  const propriedadeLimpa = normalizarId(propertyId);

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}/properties/${propriedadeLimpa}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Não foi possível alcançar o Google Analytics. Verifique a conexão.");
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(traduzirErro(resposta.status, corpo as ErroGA4 | null));
  }

  return ((corpo as { rows?: LinhaRelatorio[] } | null)?.rows ?? []) as LinhaRelatorio[];
}

/** Confirma que o Property ID existe e está acessível com essas credenciais. */
export async function validarPropertyId(
  config: IntegracaoGoogle,
  propertyId: string,
): Promise<{ ok: true }> {
  await relatorio(config, propertyId, {
    dateRanges: [{ startDate: "yesterday", endDate: "today" }],
    metrics: [{ name: "sessions" }],
  });
  return { ok: true };
}

/** Métricas diárias da propriedade, no intervalo informado. */
export async function buscarInsightsDiarios(
  config: IntegracaoGoogle,
  propertyId: string,
  desde: string,
  ate: string,
): Promise<InsightDiarioGA4[]> {
  const linhas = await relatorio(config, propertyId, {
    dateRanges: [{ startDate: desde, endDate: ate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "screenPageViews" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
      { name: "conversions" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  return linhas.map((l) => ({
    data: formatarData(l.dimensionValues?.[0]?.value),
    sessoes: numero(l.metricValues?.[0]?.value),
    usuarios: numero(l.metricValues?.[1]?.value),
    novosUsuarios: numero(l.metricValues?.[2]?.value),
    visualizacoesPagina: numero(l.metricValues?.[3]?.value),
    taxaEngajamento: numero(l.metricValues?.[4]?.value),
    duracaoMediaSessao: numero(l.metricValues?.[5]?.value),
    conversoes: numero(l.metricValues?.[6]?.value),
  }));
}
