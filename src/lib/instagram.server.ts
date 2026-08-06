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

export type InsightContaDiario = { data: string; alcance: number; visitasPerfil: number };

/**
 * Alcance e Visitas ao Perfil já vêm como valores absolutos do próprio dia.
 * `follower_count` é diferente: cada valor é a variação líquida de seguidores
 * naquele dia, não o total — por isso volta à parte, para ser reconstruído em
 * um total diário por quem chama (a partir do total atual da conta).
 */
export async function buscarInsightsConta(
  igUserId: string,
  token: string,
  desde: string,
  ate: string,
): Promise<{ diarios: InsightContaDiario[]; deltasSeguidores: Record<string, number> }> {
  const url = new URL(`${BASE}/${igUserId}/insights`);
  url.searchParams.set("metric", "reach,profile_views,follower_count");
  url.searchParams.set("period", "day");
  url.searchParams.set("since", desde);
  url.searchParams.set("until", ate);
  url.searchParams.set("access_token", token);

  const corpo = await pedir<{ data?: InsightMetrico[] }>(url.toString());

  const porMetrica = new Map<string, Map<string, number>>();
  for (const metrica of corpo.data ?? []) {
    const porDia = new Map<string, number>();
    for (const v of metrica.values ?? []) {
      porDia.set(v.end_time.slice(0, 10), v.value ?? 0);
    }
    porMetrica.set(metrica.name, porDia);
  }

  const alcancePorDia = porMetrica.get("reach") ?? new Map<string, number>();
  const visitasPorDia = porMetrica.get("profile_views") ?? new Map<string, number>();
  const deltasSeguidores = Object.fromEntries(porMetrica.get("follower_count") ?? new Map());

  const dias = new Set<string>([
    ...alcancePorDia.keys(),
    ...visitasPorDia.keys(),
    ...Object.keys(deltasSeguidores),
  ]);

  const diarios = [...dias].sort().map((data) => ({
    data,
    alcance: alcancePorDia.get(data) ?? 0,
    visitasPerfil: visitasPorDia.get(data) ?? 0,
  }));

  return { diarios, deltasSeguidores };
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

/**
 * Alcance (e compartilhamentos, só em Reels) por mídia, via insights.
 * Best-effort: nem toda mídia tem esse dado disponível (posts antigos,
 * Stories expiradas), então uma falha aqui não derruba a sincronização — a
 * publicação continua indo pra tabela com curtidas/comentários reais e
 * alcance/compartilhamentos zerados.
 */
async function buscarAlcanceEShares(
  mediaId: string,
  token: string,
  ehReels: boolean,
): Promise<{ alcance: number; compartilhamentos: number }> {
  const tentativas = ehReels ? ["reach,shares", "reach"] : ["reach"];
  for (const metricas of tentativas) {
    try {
      const url = new URL(`${BASE}/${mediaId}/insights`);
      url.searchParams.set("metric", metricas);
      url.searchParams.set("access_token", token);
      const corpo = await pedir<{ data?: { name: string; values: { value: number }[] }[] }>(
        url.toString(),
      );
      const valores: Record<string, number> = {};
      for (const m of corpo.data ?? []) valores[m.name] = m.values?.[0]?.value ?? 0;
      return { alcance: valores.reach ?? 0, compartilhamentos: valores.shares ?? 0 };
    } catch {
      continue;
    }
  }
  return { alcance: 0, compartilhamentos: 0 };
}

/**
 * Publicações recentes com curtidas e comentários direto do objeto da mídia
 * (sempre disponível) e alcance/compartilhamentos best-effort via insights.
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
    const { alcance, compartilhamentos } = await buscarAlcanceEShares(midia.id, token, ehReels);
    publicacoes.push({
      mediaId: midia.id,
      tipo: ehReels ? "Reels" : midia.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : "Foto",
      legenda: (midia.caption ?? "").slice(0, 200),
      permalink: midia.permalink ?? null,
      publicadoEm: midia.timestamp ?? new Date().toISOString(),
      curtidas: midia.like_count ?? 0,
      comentarios: midia.comments_count ?? 0,
      alcance,
      compartilhamentos,
    });
  }
  return publicacoes;
}
