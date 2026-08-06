/**
 * Cliente da Instagram Graph API (Meta). Usa o mesmo token guardado em
 * `clientes_secrets.meta_token` já validado para o Marketing API — desde que
 * o Usuário do Sistema tenha os escopos instagram_basic e
 * instagram_manage_insights, o mesmo token enxerga a conta do Instagram
 * Business vinculada à Página do Facebook.
 *
 * Este módulo só pode ser importado dentro de handlers de server function, via
 * `await import(...)`: o token nunca deve chegar ao navegador.
 */

const VERSAO_API = "v21.0";
const BASE = `https://graph.facebook.com/${VERSAO_API}`;

type ErroMeta = { message?: string; type?: string; code?: number; error_subcode?: number };
type Resposta<T> = T & { error?: ErroMeta };

/** Mensagens da Meta chegam em inglês e sem contexto; traduzimos as comuns. */
function traduzirErro(erro: ErroMeta): string {
  const codigo = erro.code;
  if (codigo === 190) {
    return "Token da Meta inválido ou expirado. Gere um novo token e salve novamente.";
  }
  if (codigo === 100) {
    // A Meta devolve este código tanto para ID inválido quanto para falta de
    // permissão sobre a conta — a mensagem genérica escondia qual dos dois
    // era. Repassar o texto original é o único jeito confiável de diferenciar.
    const detalhe = erro.message ? ` (${erro.message})` : "";
    return `A Meta recusou o pedido${detalhe}. Confira o ID e se o Usuário do Sistema tem acesso a esta conta do Instagram na Central de Negócios.`;
  }
  if (codigo === 200 || codigo === 10) {
    return "O token não tem permissão para ler esta conta do Instagram (são necessários os escopos instagram_basic e instagram_manage_insights, e o Usuário do Sistema precisa estar atribuído a essa conta do Instagram na Central de Negócios).";
  }
  if (codigo === 17 || codigo === 4 || codigo === 613) {
    return "Limite de requisições da Meta atingido. Tente novamente em alguns minutos.";
  }
  return erro.message ? `Erro da Meta: ${erro.message}` : "Não foi possível falar com o Instagram.";
}

async function pedir<T>(url: string): Promise<T> {
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
  return corpo as T;
}

export type ContaInstagram = { username: string; seguidores: number; midias: number };

export async function buscarConta(igUserId: string, token: string): Promise<ContaInstagram> {
  const url = new URL(`${BASE}/${igUserId}`);
  url.searchParams.set("fields", "username,followers_count,media_count");
  url.searchParams.set("access_token", token);

  const corpo = await pedir<{ username?: string; followers_count?: number; media_count?: number }>(
    url.toString(),
  );
  return {
    username: corpo.username ?? igUserId,
    seguidores: corpo.followers_count ?? 0,
    midias: corpo.media_count ?? 0,
  };
}

/** Confirma que o par ID da conta + token funciona, devolvendo o perfil. */
export async function validarCredenciais(igUserId: string, token: string): Promise<ContaInstagram> {
  return buscarConta(igUserId, token);
}

type ValorDiario = { end_time: string; value: number };
type InsightMetrico = { name: string; values: ValorDiario[] };

export type InsightContaDiario = {
  data: string;
  alcance: number;
  visitasPerfil: number;
  contasEngajadas: number;
  visualizacoes: number;
  cliquesSite: number;
  cliquesLigar: number;
  cliquesEmail: number;
  cliquesRota: number;
};

/**
 * A Insights API da Meta recusa qualquer consulta com `period=day` cobrindo
 * mais de 30 dias entre `since` e `until` (erro #100). Períodos personalizados
 * mais longos precisam ser quebrados em pedaços de até 30 dias corridos —
 * essa função faz essa divisão pra qualquer chamada que use `since`/`until`.
 */
function dividirEmJanelas(desde: string, ate: string, maxDiasPorJanela = 30): { desde: string; ate: string }[] {
  const janelas: { desde: string; ate: string }[] = [];
  let inicio = new Date(`${desde}T00:00:00Z`);
  const fim = new Date(`${ate}T00:00:00Z`);

  while (inicio <= fim) {
    const fimJanela = new Date(inicio);
    fimJanela.setUTCDate(fimJanela.getUTCDate() + maxDiasPorJanela - 1);
    const fimReal = fimJanela > fim ? fim : fimJanela;
    janelas.push({
      desde: inicio.toISOString().slice(0, 10),
      ate: fimReal.toISOString().slice(0, 10),
    });
    inicio = new Date(fimReal);
    inicio.setUTCDate(inicio.getUTCDate() + 1);
  }

  return janelas.length > 0 ? janelas : [{ desde, ate }];
}

/**
 * Uma métrica `total_value` isolada — falha aqui nunca derruba as demais.
 * Períodos longos são somados pedaço por pedaço (ver `dividirEmJanelas`).
 */
async function buscarTotalValue(igUserId: string, token: string, metrica: string, desde: string, ate: string): Promise<number> {
  const janelas = dividirEmJanelas(desde, ate);
  let total = 0;
  for (const janela of janelas) {
    try {
      const url = new URL(`${BASE}/${igUserId}/insights`);
      url.searchParams.set("metric", metrica);
      url.searchParams.set("period", "day");
      url.searchParams.set("metric_type", "total_value");
      url.searchParams.set("since", janela.desde);
      url.searchParams.set("until", janela.ate);
      url.searchParams.set("access_token", token);
      const corpo = await pedir<{ data?: { total_value?: { value?: number } }[] }>(url.toString());
      total += corpo.data?.[0]?.total_value?.value ?? 0;
    } catch {
      // best-effort — o pedaço que falhar só não soma, os outros continuam.
    }
  }
  return total;
}

/**
 * Alcance e Visitas ao Perfil já vêm como valores absolutos do próprio dia.
 * `follower_count` é diferente: cada valor é a variação líquida de seguidores
 * naquele dia, não o total — por isso volta à parte, para ser reconstruído em
 * um total diário por quem chama (a partir do total atual da conta).
 *
 * `profile_views` e o conjunto de cliques de contato (site/ligar/e-mail/rota)
 * só aceitam `total_value` (um número pro período inteiro, não série diária)
 * — cada bloco é buscado isolado, então uma métrica que a conta não tenha
 * disponível não derruba as outras.
 */
export async function buscarInsightsConta(
  igUserId: string,
  token: string,
  desde: string,
  ate: string,
): Promise<{ diarios: InsightContaDiario[]; deltasSeguidores: Record<string, number> }> {
  const porMetrica = new Map<string, Map<string, number>>();

  for (const janela of dividirEmJanelas(desde, ate)) {
    const url = new URL(`${BASE}/${igUserId}/insights`);
    url.searchParams.set("metric", "reach,follower_count");
    url.searchParams.set("period", "day");
    url.searchParams.set("metric_type", "time_series");
    url.searchParams.set("since", janela.desde);
    url.searchParams.set("until", janela.ate);
    url.searchParams.set("access_token", token);

    const corpo = await pedir<{ data?: InsightMetrico[] }>(url.toString());
    for (const metrica of corpo.data ?? []) {
      const porDia = porMetrica.get(metrica.name) ?? new Map<string, number>();
      for (const v of metrica.values ?? []) {
        porDia.set(v.end_time.slice(0, 10), v.value ?? 0);
      }
      porMetrica.set(metrica.name, porDia);
    }
  }

  const alcancePorDia = porMetrica.get("reach") ?? new Map<string, number>();
  const deltasSeguidores = Object.fromEntries(porMetrica.get("follower_count") ?? new Map());

  const dias = new Set<string>([...alcancePorDia.keys(), ...Object.keys(deltasSeguidores)]);
  if (dias.size === 0) dias.add(ate);

  const [visitasTotal, contasEngajadas, visualizacoes, cliquesSite, cliquesLigar, cliquesEmail, cliquesRota] =
    await Promise.all([
      buscarTotalValue(igUserId, token, "profile_views", desde, ate),
      buscarTotalValue(igUserId, token, "accounts_engaged", desde, ate),
      buscarTotalValue(igUserId, token, "views", desde, ate),
      buscarTotalValue(igUserId, token, "website_clicks", desde, ate),
      buscarTotalValue(igUserId, token, "call_clicks", desde, ate),
      buscarTotalValue(igUserId, token, "email_contacts", desde, ate),
      buscarTotalValue(igUserId, token, "get_directions_clicks", desde, ate),
    ]);

  const ultimoDia = [...dias].sort().at(-1) ?? ate;

  const diarios = [...dias].sort().map((data) => ({
    data,
    alcance: alcancePorDia.get(data) ?? 0,
    // Métricas total_value só existem pro período inteiro, não por dia — o
    // total fica no último dia da janela; os cards de KPI somam o período
    // inteiro mesmo, então o total bate certo lá.
    visitasPerfil: data === ultimoDia ? visitasTotal : 0,
    contasEngajadas: data === ultimoDia ? contasEngajadas : 0,
    visualizacoes: data === ultimoDia ? visualizacoes : 0,
    cliquesSite: data === ultimoDia ? cliquesSite : 0,
    cliquesLigar: data === ultimoDia ? cliquesLigar : 0,
    cliquesEmail: data === ultimoDia ? cliquesEmail : 0,
    cliquesRota: data === ultimoDia ? cliquesRota : 0,
  }));

  return { diarios, deltasSeguidores };
}

export type ValorDemografia = { valor: string; quantidade: number };

/**
 * Demografia da audiência (gênero, idade, cidade, país). Best-effort de
 * propósito: essa parte da API muda com frequência e uma conta pode não ter
 * seguidores suficientes pra Meta liberar o dado — cada dimensão falha
 * isolada, sem afetar as demais nem o resto da sincronização.
 */
export async function buscarDemografia(
  igUserId: string,
  token: string,
): Promise<{ genero: ValorDemografia[]; idade: ValorDemografia[]; cidade: ValorDemografia[]; pais: ValorDemografia[] }> {
  async function buscarBreakdown(breakdown: string): Promise<ValorDemografia[]> {
    try {
      const url = new URL(`${BASE}/${igUserId}/insights`);
      url.searchParams.set("metric", "follower_demographics");
      url.searchParams.set("period", "lifetime");
      url.searchParams.set("metric_type", "total_value");
      url.searchParams.set("breakdown", breakdown);
      url.searchParams.set("access_token", token);
      const corpo = await pedir<{
        data?: { total_value?: { breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] } }[];
      }>(url.toString());
      const resultados = corpo.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      return resultados
        .map((r) => ({ valor: r.dimension_values?.[0] ?? "?", quantidade: r.value ?? 0 }))
        .sort((a, b) => b.quantidade - a.quantidade);
    } catch {
      return [];
    }
  }

  const [genero, idade, cidade, pais] = await Promise.all([
    buscarBreakdown("gender"),
    buscarBreakdown("age"),
    buscarBreakdown("city"),
    buscarBreakdown("country"),
  ]);

  return { genero, idade, cidade, pais };
}

/**
 * Distribuição de seguidores online por hora do dia (0–23, fuso da conta).
 * Best-effort: métrica antiga da API, nem sempre disponível.
 */
export async function buscarHorariosAtivos(igUserId: string, token: string): Promise<Record<number, number>> {
  try {
    const url = new URL(`${BASE}/${igUserId}/insights`);
    url.searchParams.set("metric", "online_followers");
    url.searchParams.set("period", "lifetime");
    url.searchParams.set("access_token", token);
    const corpo = await pedir<{ data?: { values?: { value?: Record<string, number> }[] }[] }>(url.toString());
    const valor = corpo.data?.[0]?.values?.[0]?.value ?? {};
    const porHora: Record<number, number> = {};
    for (const [hora, qtd] of Object.entries(valor)) {
      const h = Number(hora);
      if (Number.isFinite(h)) porHora[h] = qtd;
    }
    return porHora;
  } catch {
    return {};
  }
}

export type PublicacaoInstagram = {
  mediaId: string;
  tipo: string;
  legenda: string;
  permalink: string | null;
  publicadoEm: string;
  curtidas: number;
  comentarios: number;
  alcance: number;
  compartilhamentos: number;
  salvamentos: number;
  interacoesTotais: number;
  reproducoes: number;
  tempoMedioExibicao: number;
};

type MidiaBruta = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
};

type InsightsMidia = {
  alcance: number;
  compartilhamentos: number;
  salvamentos: number;
  interacoesTotais: number;
  reproducoes: number;
  tempoMedioExibicao: number;
};

/**
 * Métricas por mídia via insights. Best-effort: nem toda mídia tem esse dado
 * disponível (posts antigos, Stories expiradas), então uma falha aqui não
 * derruba a sincronização — a publicação continua indo pra tabela com
 * curtidas/comentários reais (vêm do objeto da mídia, não de insights) e o
 * resto zerado.
 */
async function buscarInsightsMidia(mediaId: string, token: string, ehReels: boolean): Promise<InsightsMidia> {
  const base: InsightsMidia = {
    alcance: 0,
    compartilhamentos: 0,
    salvamentos: 0,
    interacoesTotais: 0,
    reproducoes: 0,
    tempoMedioExibicao: 0,
  };

  const tentativas = ehReels
    ? ["reach,shares,saved,total_interactions,plays,ig_reels_avg_watch_time", "reach,saved,total_interactions", "reach"]
    : ["reach,shares,saved,total_interactions", "reach,saved", "reach"];

  for (const metricas of tentativas) {
    try {
      const url = new URL(`${BASE}/${mediaId}/insights`);
      url.searchParams.set("metric", metricas);
      url.searchParams.set("access_token", token);
      const corpo = await pedir<{ data?: { name: string; values: { value: number }[] }[] }>(url.toString());
      const valores: Record<string, number> = {};
      for (const m of corpo.data ?? []) valores[m.name] = m.values?.[0]?.value ?? 0;
      return {
        alcance: valores["reach"] ?? 0,
        compartilhamentos: valores["shares"] ?? 0,
        salvamentos: valores["saved"] ?? 0,
        interacoesTotais: valores["total_interactions"] ?? 0,
        reproducoes: valores["plays"] ?? 0,
        tempoMedioExibicao: valores["ig_reels_avg_watch_time"] ?? 0,
      };
    } catch {
      continue;
    }
  }
  return base;
}

/**
 * Publicações recentes com curtidas e comentários direto do objeto da mídia
 * (sempre disponível) e o restante best-effort via insights.
 */
export async function buscarPublicacoesRecentes(
  igUserId: string,
  token: string,
  limite = 25,
): Promise<PublicacaoInstagram[]> {
  const url = new URL(`${BASE}/${igUserId}/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count",
  );
  url.searchParams.set("limit", String(limite));
  url.searchParams.set("access_token", token);

  const corpo = await pedir<{ data?: MidiaBruta[] }>(url.toString());
  const midias = corpo.data ?? [];

  const publicacoes: PublicacaoInstagram[] = [];
  for (const midia of midias) {
    const ehReels = midia.media_product_type === "REELS";
    const insights = await buscarInsightsMidia(midia.id, token, ehReels);
    publicacoes.push({
      mediaId: midia.id,
      tipo: ehReels ? "Reels" : midia.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : "Foto",
      legenda: (midia.caption ?? "").slice(0, 200),
      permalink: midia.permalink ?? null,
      publicadoEm: midia.timestamp ?? new Date().toISOString(),
      curtidas: midia.like_count ?? 0,
      comentarios: midia.comments_count ?? 0,
      ...insights,
    });
  }
  return publicacoes;
}
