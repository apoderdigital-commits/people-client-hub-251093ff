// Edge Function: executa automações.
//
// Três formas de chamar:
//   1. Corpo vazio (pg_cron, a cada 5 min)      -- checa gatilhos de horário
//   2. { forcarId }  ("Testar agora" no painel)  -- roda essa automação na hora
//   3. { evento, cartaoId, colunaId, ... }        -- trigger do Postgres em
//      fluxo_cartoes (cartão criado/movido), chamado via pg_net em tempo real
//
// Nós suportados (conjunto fechado):
//   gatilho_horario        -- dispara 1x/dia no horário configurado
//   gatilho_cartao_criado  -- dispara quando um cartão novo é criado
//   gatilho_cartao_movido  -- dispara quando um cartão entra na coluna configurada
//   logica_se              -- compara um campo do cartão/contexto, ramifica true/false
//   acao_sync_meta         -- sincroniza metricas_campanhas de todos os clientes com token
//   acao_sync_instagram    -- sincroniza metricas_instagram_* de todos os clientes
//   acao_cartoes_vencidos  -- move cartões com prazo vencido para "Atrasado"
//   acao_mover_cartao      -- move o cartão do contexto para a coluna configurada
//   acao_criar_cartao      -- cria um cartão novo numa coluna
//   acao_whatsapp          -- envia mensagem via Evolution API (credencial configurada)
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERSAO_API = "v21.0";
const BASE_META = `https://graph.facebook.com/${VERSAO_API}`;

type DB = ReturnType<typeof createClient>;

type No = { id: string; tipo: string; config?: Record<string, unknown> };
type Conexao = { origem: string; origemHandle?: string; destino: string };
type Automacao = {
  id: string;
  nos: No[];
  conexoes: Conexao[];
  criado_por: string | null;
};

type Contexto = {
  cartaoId?: string;
  cartaoTitulo?: string;
  colunaId?: string;
  colunaNome?: string;
  colunaAnteriorId?: string;
  clienteId?: string | null;
  clienteNome?: string;
};

function numero(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function somarAcoes(lista: { value?: string }[] | undefined): number {
  return (lista ?? []).reduce((acc, a) => acc + numero(a.value), 0);
}

function normalizarConta(id: string): string {
  const limpo = id.trim();
  return limpo.startsWith("act_") ? limpo : `act_${limpo}`;
}

function isoDiasAtras(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function horaBrasilAgora(): { hora: string; dataISO: string } {
  const brasil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hh = String(brasil.getUTCHours()).padStart(2, "0");
  const mm = String(brasil.getUTCMinutes()).padStart(2, "0");
  return { hora: `${hh}:${mm}`, dataISO: brasil.toISOString().slice(0, 10) };
}

function bucketDe5min(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Math.floor((h * 60 + m) / 5);
}

function preencherTemplate(template: string, contexto: Contexto): string {
  return template
    .replaceAll("{{titulo}}", contexto.cartaoTitulo ?? "")
    .replaceAll("{{coluna}}", contexto.colunaNome ?? "")
    .replaceAll("{{cliente}}", contexto.clienteNome ?? "");
}

// --- ação: sincronizar Meta Ads (metricas_campanhas) ---

async function sincronizarMetaDoCliente(
  db: DB,
  cliente: { id: string; ad_account_id: string; acao_lead: string | null; acao_conversao: string | null },
  token: string,
): Promise<{ linhas: number }> {
  const conta = normalizarConta(cliente.ad_account_id);
  const desde = isoDiasAtras(3);
  const ate = isoDiasAtras(1);

  const url = new URL(`${BASE_META}/${conta}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set(
    "fields",
    "spend,impressions,clicks,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,campaign_id,campaign_name",
  );
  url.searchParams.set("time_range", JSON.stringify({ since: desde, until: ate }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", token);

  const resp = await fetch(url.toString());
  const corpo = await resp.json();
  if (corpo.error) throw new Error(corpo.error.message ?? "Erro da Meta");

  const statusUrl = new URL(`${BASE_META}/${conta}/campaigns`);
  statusUrl.searchParams.set("fields", "effective_status");
  statusUrl.searchParams.set("limit", "500");
  statusUrl.searchParams.set("access_token", token);
  const statusResp = await fetch(statusUrl.toString());
  const statusCorpo = await statusResp.json();
  const statusPorId: Record<string, string> = {};
  for (const c of statusCorpo.data ?? []) {
    if (c.id) statusPorId[c.id] = c.effective_status ?? "";
  }

  const ACOES_LEAD = [
    "onsite_conversion.lead_grouped",
    "leadgen_grouped",
    "lead",
    "offsite_conversion.fb_pixel_lead",
  ];
  const ACOES_CONVERSAO = ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"];

  function contarAcao(acoes: Record<string, number>, configurada: string | null, padroes: string[]): number {
    if (configurada) return acoes[configurada] ?? 0;
    for (const tipo of padroes) if (acoes[tipo] !== undefined) return acoes[tipo];
    return 0;
  }

  const linhas = (corpo.data ?? [])
    .filter((l: { date_start?: string; campaign_id?: string }) => l.date_start && l.campaign_id)
    .map((l: Record<string, unknown>) => {
      const acoes: Record<string, number> = {};
      for (const a of (l.actions as { action_type?: string; value?: string }[]) ?? []) {
        if (a.action_type) acoes[a.action_type] = numero(a.value);
      }
      return {
        cliente_id: cliente.id,
        campanha_id: l.campaign_id,
        campanha_nome: l.campaign_name ?? "",
        status: statusPorId[l.campaign_id as string] ?? "",
        data: l.date_start,
        investimento: numero(l.spend as string),
        impressoes: numero(l.impressions as string),
        cliques: numero(l.clicks as string),
        acoes,
        leads: contarAcao(acoes, cliente.acao_lead, ACOES_LEAD),
        conversoes: contarAcao(acoes, cliente.acao_conversao, ACOES_CONVERSAO),
        video_p25: somarAcoes(l.video_p25_watched_actions as never),
        video_p50: somarAcoes(l.video_p50_watched_actions as never),
        video_p75: somarAcoes(l.video_p75_watched_actions as never),
        video_p100: somarAcoes(l.video_p100_watched_actions as never),
        atualizado_em: new Date().toISOString(),
      };
    });

  if (linhas.length > 0) {
    const { error } = await db.from("metricas_campanhas").upsert(linhas, {
      onConflict: "cliente_id,campanha_id,data",
    });
    if (error) throw new Error(error.message);
  }

  await db
    .from("clientes")
    .update({ ultima_sincronizacao: new Date().toISOString(), erro_sincronizacao: null })
    .eq("id", cliente.id);

  return { linhas: linhas.length };
}

async function acaoSyncMeta(db: DB): Promise<Record<string, unknown>> {
  const { data: clientes } = await db
    .from("clientes")
    .select("id, ad_account_id, acao_lead, acao_conversao")
    .not("token_atualizado_em", "is", null)
    .neq("ad_account_id", "");

  const resultado: Record<string, unknown> = { processados: 0, falhas: [] as string[] };
  for (const cliente of (clientes ?? []) as {
    id: string;
    ad_account_id: string;
    acao_lead: string | null;
    acao_conversao: string | null;
  }[]) {
    try {
      const { data: segredo } = await db
        .from("clientes_secrets")
        .select("meta_token")
        .eq("cliente_id", cliente.id)
        .maybeSingle();
      const token = (segredo as { meta_token?: string } | null)?.meta_token ?? "";
      if (!token) continue;
      await sincronizarMetaDoCliente(db, cliente, token);
      resultado.processados = ((resultado.processados as number) ?? 0) + 1;
    } catch (err) {
      (resultado.falhas as string[]).push(`${cliente.id}: ${err instanceof Error ? err.message : String(err)}`);
      await db.from("clientes").update({ erro_sincronizacao: String(err) }).eq("id", cliente.id);
    }
  }
  return resultado;
}

// --- ação: sincronizar Instagram Business ---

async function sincronizarInstagramDoCliente(
  db: DB,
  clienteId: string,
  igId: string,
  token: string,
): Promise<{ dias: number; publicacoes: number }> {
  const desde = isoDiasAtras(2);
  const ate = isoDiasAtras(1);

  const contaUrl = new URL(`${BASE_META}/${igId}`);
  contaUrl.searchParams.set("fields", "followers_count");
  contaUrl.searchParams.set("access_token", token);
  const contaResp = await fetch(contaUrl.toString());
  const contaCorpo = await contaResp.json();
  if (contaCorpo.error) throw new Error(contaCorpo.error.message ?? "Erro da Meta");
  const seguidoresAtuais = numero(String(contaCorpo.followers_count ?? 0));

  const insightsUrl = new URL(`${BASE_META}/${igId}/insights`);
  insightsUrl.searchParams.set("metric", "reach,follower_count");
  insightsUrl.searchParams.set("period", "day");
  insightsUrl.searchParams.set("metric_type", "time_series");
  insightsUrl.searchParams.set("since", desde);
  insightsUrl.searchParams.set("until", ate);
  insightsUrl.searchParams.set("access_token", token);
  const insightsResp = await fetch(insightsUrl.toString());
  const insightsCorpo = await insightsResp.json();
  if (insightsCorpo.error) throw new Error(insightsCorpo.error.message ?? "Erro da Meta");

  const alcancePorDia = new Map<string, number>();
  const deltasSeguidores = new Map<string, number>();
  for (const metrica of insightsCorpo.data ?? []) {
    const alvo = metrica.name === "reach" ? alcancePorDia : metrica.name === "follower_count" ? deltasSeguidores : null;
    if (!alvo) continue;
    for (const v of metrica.values ?? []) alvo.set(String(v.end_time).slice(0, 10), v.value ?? 0);
  }

  const dias = [...new Set([...alcancePorDia.keys(), ...deltasSeguidores.keys()])].sort();
  const seguidoresPorDia = new Map<string, number>();
  let acumulado = seguidoresAtuais;
  for (let i = dias.length - 1; i >= 0; i--) {
    seguidoresPorDia.set(dias[i], acumulado);
    acumulado -= deltasSeguidores.get(dias[i]) ?? 0;
  }

  const mediaUrl = new URL(`${BASE_META}/${igId}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count",
  );
  mediaUrl.searchParams.set("limit", "25");
  mediaUrl.searchParams.set("access_token", token);
  const mediaResp = await fetch(mediaUrl.toString());
  const mediaCorpo = await mediaResp.json();
  const midias = (mediaCorpo.data ?? []) as {
    id: string;
    caption?: string;
    media_type?: string;
    media_product_type?: string;
    timestamp?: string;
    permalink?: string;
    like_count?: number;
    comments_count?: number;
  }[];

  const engajamentoPorDia = new Map<string, { curtidas: number; comentarios: number }>();
  const linhasPosts = midias.map((m) => {
    const dia = (m.timestamp ?? "").slice(0, 10);
    const atual = engajamentoPorDia.get(dia) ?? { curtidas: 0, comentarios: 0 };
    atual.curtidas += m.like_count ?? 0;
    atual.comentarios += m.comments_count ?? 0;
    engajamentoPorDia.set(dia, atual);
    return {
      cliente_id: clienteId,
      media_id: m.id,
      tipo:
        m.media_product_type === "REELS" ? "Reels" : m.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : "Foto",
      legenda: (m.caption ?? "").slice(0, 200),
      permalink: m.permalink ?? null,
      publicado_em: m.timestamp ?? new Date().toISOString(),
      alcance: 0,
      curtidas: m.like_count ?? 0,
      comentarios: m.comments_count ?? 0,
      compartilhamentos: 0,
      atualizado_em: new Date().toISOString(),
    };
  });

  const linhasDiarias = dias.map((data) => {
    const eng = engajamentoPorDia.get(data) ?? { curtidas: 0, comentarios: 0 };
    return {
      cliente_id: clienteId,
      data,
      seguidores: seguidoresPorDia.get(data) ?? seguidoresAtuais,
      alcance: alcancePorDia.get(data) ?? 0,
      visitas_perfil: 0,
      curtidas: eng.curtidas,
      comentarios: eng.comentarios,
      compartilhamentos: 0,
      atualizado_em: new Date().toISOString(),
    };
  });

  if (linhasDiarias.length > 0) {
    const { error } = await db
      .from("metricas_instagram_diarias")
      .upsert(linhasDiarias, { onConflict: "cliente_id,data" });
    if (error) throw new Error(error.message);
  }
  if (linhasPosts.length > 0) {
    const { error } = await db
      .from("metricas_instagram_posts")
      .upsert(linhasPosts, { onConflict: "cliente_id,media_id" });
    if (error) throw new Error(error.message);
  }

  await db
    .from("clientes")
    .update({ instagram_ultima_sincronizacao: new Date().toISOString(), instagram_erro_sincronizacao: null })
    .eq("id", clienteId);

  return { dias: linhasDiarias.length, publicacoes: linhasPosts.length };
}

async function acaoSyncInstagram(db: DB): Promise<Record<string, unknown>> {
  const { data: clientes } = await db
    .from("clientes")
    .select("id, instagram_business_account_id")
    .not("instagram_business_account_id", "is", null);

  const resultado: Record<string, unknown> = { processados: 0, falhas: [] as string[] };
  for (const cliente of (clientes ?? []) as { id: string; instagram_business_account_id: string }[]) {
    try {
      const { data: segredo } = await db
        .from("clientes_secrets")
        .select("meta_token")
        .eq("cliente_id", cliente.id)
        .maybeSingle();
      const token = (segredo as { meta_token?: string } | null)?.meta_token ?? "";
      if (!token) continue;
      await sincronizarInstagramDoCliente(db, cliente.id, cliente.instagram_business_account_id, token);
      resultado.processados = ((resultado.processados as number) ?? 0) + 1;
    } catch (err) {
      (resultado.falhas as string[]).push(`${cliente.id}: ${err instanceof Error ? err.message : String(err)}`);
      await db
        .from("clientes")
        .update({ instagram_erro_sincronizacao: String(err) })
        .eq("id", cliente.id);
    }
  }
  return resultado;
}

// --- ação: mover cartões vencidos ---

async function buscarColunas(db: DB): Promise<{ id: string; nome: string }[]> {
  const { data } = await db.from("fluxo_colunas").select("id, nome");
  return (data ?? []) as { id: string; nome: string }[];
}

async function acaoCartoesVencidos(db: DB, autorId: string | null): Promise<Record<string, unknown>> {
  const listaColunas = await buscarColunas(db);
  const colunaAtrasado = listaColunas.find((c) => c.nome.trim().toLowerCase() === "atrasado");
  if (!colunaAtrasado) throw new Error('Coluna "Atrasado" não encontrada no Fluxo People.');

  const idsExcluidos = listaColunas
    .filter((c) => ["atrasado", "concluído", "concluido"].includes(c.nome.trim().toLowerCase()))
    .map((c) => c.id);

  const hoje = new Date().toISOString().slice(0, 10);
  let query = db.from("fluxo_cartoes").select("id, titulo, coluna_id").lt("prazo", hoje);
  if (idsExcluidos.length > 0) query = query.not("coluna_id", "in", `(${idsExcluidos.join(",")})`);

  const { data: cartoes, error } = await query;
  if (error) throw new Error(error.message);

  const lista = (cartoes ?? []) as { id: string; titulo: string; coluna_id: string }[];
  for (const cartao of lista) {
    await db.from("fluxo_cartoes").update({ coluna_id: colunaAtrasado.id }).eq("id", cartao.id);
    if (autorId) {
      await db.from("fluxo_comentarios").insert({
        cartao_id: cartao.id,
        autor_id: autorId,
        texto: "Prazo vencido — movido automaticamente para Atrasado.",
      });
    }
  }

  return { movidos: lista.length };
}

// --- ação: mover cartão (genérica, usa o cartão do contexto) ---

async function acaoMoverCartao(
  db: DB,
  config: Record<string, unknown> | undefined,
  contexto: Contexto,
): Promise<Record<string, unknown>> {
  const colunaDestino = config?.colunaDestino as string | undefined;
  if (!colunaDestino) throw new Error('Nó "Mover cartão" sem coluna de destino configurada.');
  if (!contexto.cartaoId) throw new Error('Nó "Mover cartão" precisa de um cartão no contexto (use após um gatilho de cartão).');

  const { error } = await db.from("fluxo_cartoes").update({ coluna_id: colunaDestino }).eq("id", contexto.cartaoId);
  if (error) throw new Error(error.message);
  return { moveu: contexto.cartaoId, para: colunaDestino };
}

// --- ação: criar cartão ---

async function acaoCriarCartao(
  db: DB,
  config: Record<string, unknown> | undefined,
  contexto: Contexto,
): Promise<Record<string, unknown>> {
  const colunaId = config?.colunaCriacao as string | undefined;
  if (!colunaId) throw new Error('Nó "Criar cartão" sem coluna configurada.');
  const tituloTemplate = (config?.tituloTemplate as string | undefined) ?? "Novo cartão";
  const titulo = preencherTemplate(tituloTemplate, contexto);

  const { count } = await db
    .from("fluxo_cartoes")
    .select("id", { count: "exact", head: true })
    .eq("coluna_id", colunaId);

  const { data, error } = await db
    .from("fluxo_cartoes")
    .insert({ coluna_id: colunaId, titulo, ordem: count ?? 0, cliente_id: contexto.clienteId ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { criado: (data as { id: string }).id };
}

// --- ação: enviar WhatsApp via Evolution API ---

async function acaoWhatsapp(
  db: DB,
  config: Record<string, unknown> | undefined,
  contexto: Contexto,
): Promise<Record<string, unknown>> {
  const credencialId = config?.credencialId as string | undefined;
  if (!credencialId) throw new Error('Nó "Enviar WhatsApp" sem credencial configurada.');

  const { data: cred } = await db
    .from("automacoes_credenciais")
    .select("config")
    .eq("id", credencialId)
    .maybeSingle();
  const credConfig = (cred as { config?: Record<string, unknown> } | null)?.config;
  const baseUrl = credConfig?.baseUrl as string | undefined;
  const apiKey = credConfig?.apiKey as string | undefined;
  const instance = credConfig?.instance as string | undefined;
  if (!baseUrl || !apiKey || !instance) throw new Error("Credencial da Evolution API incompleta.");

  const numeroTemplate = (config?.numeroTemplate as string | undefined) ?? "";
  const mensagemTemplate = (config?.mensagemTemplate as string | undefined) ?? "";
  const numero = preencherTemplate(numeroTemplate, contexto).replace(/\D/g, "");
  const mensagem = preencherTemplate(mensagemTemplate, contexto);
  if (!numero || !mensagem) throw new Error('Nó "Enviar WhatsApp" sem número ou mensagem preenchidos.');

  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: numero, text: mensagem }),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Evolution API respondeu ${resp.status}: ${JSON.stringify(corpo)}`);

  return { enviado_para: numero };
}

// --- lógica: SE ---

async function avaliarLogicaSe(
  db: DB,
  config: Record<string, unknown> | undefined,
  contexto: Contexto,
): Promise<boolean> {
  const campo = config?.campo as string | undefined;
  const operador = (config?.operador as string | undefined) ?? "igual";
  const valorEsperado = ((config?.valor as string | undefined) ?? "").trim().toLowerCase();

  let valorReal = "";
  if (campo === "coluna") valorReal = (contexto.colunaNome ?? "").toLowerCase();
  else if (campo === "cliente") valorReal = (contexto.clienteNome ?? "").toLowerCase();
  else if (campo === "titulo") valorReal = (contexto.cartaoTitulo ?? "").toLowerCase();
  else return false;

  if (operador === "igual") return valorReal === valorEsperado;
  if (operador === "diferente") return valorReal !== valorEsperado;
  if (operador === "contem") return valorReal.includes(valorEsperado);
  return false;
}

// --- orquestração: caminha o grafo a partir de um nó, respeitando ramos do SE ---

async function executarAPartirDe(
  db: DB,
  nos: No[],
  conexoes: Conexao[],
  idInicial: string,
  contexto: Contexto,
  autorId: string | null,
  resultado: Record<string, unknown>,
): Promise<void> {
  const fila = [idInicial];
  const visitados = new Set<string>();

  while (fila.length > 0) {
    const id = fila.shift()!;
    if (visitados.has(id)) continue;
    visitados.add(id);

    const no = nos.find((n) => n.id === id);
    if (!no) continue;

    if (no.tipo === "logica_se") {
      const passou = await avaliarLogicaSe(db, no.config, contexto);
      resultado[`logica_se:${id}`] = passou;
      const handleAlvo = passou ? "true" : "false";
      const proximos = conexoes
        .filter((c) => c.origem === id && (c.origemHandle ?? "true") === handleAlvo)
        .map((c) => c.destino);
      fila.push(...proximos);
      continue;
    }

    if (no.tipo.startsWith("gatilho_")) {
      // gatilhos não "executam" — só o ponto de partida do grafo.
    } else {
      const executor = ACOES[no.tipo];
      if (executor) {
        resultado[`${no.tipo}:${id}`] = await executor(db, no.config, contexto, autorId);
      }
    }

    const proximos = conexoes.filter((c) => c.origem === id).map((c) => c.destino);
    fila.push(...proximos);
  }
}

type ExecutorAcao = (
  db: DB,
  config: Record<string, unknown> | undefined,
  contexto: Contexto,
  autorId: string | null,
) => Promise<Record<string, unknown>>;

const ACOES: Record<string, ExecutorAcao> = {
  acao_sync_meta: (db) => acaoSyncMeta(db),
  acao_sync_instagram: (db) => acaoSyncInstagram(db),
  acao_cartoes_vencidos: (db, _c, _ctx, autorId) => acaoCartoesVencidos(db, autorId),
  acao_mover_cartao: (db, config, contexto) => acaoMoverCartao(db, config, contexto),
  acao_criar_cartao: (db, config, contexto) => acaoCriarCartao(db, config, contexto),
  acao_whatsapp: (db, config, contexto) => acaoWhatsapp(db, config, contexto),
};

async function registrarExecucao(
  db: DB,
  automacao: Automacao,
  gatilhoId: string,
  contexto: Contexto,
): Promise<void> {
  const { data: execucao } = await db
    .from("automacoes_execucoes")
    .insert({ automacao_id: automacao.id, status: "executando" })
    .select("id")
    .single();
  const execucaoId = (execucao as { id: string } | null)?.id;

  const resultado: Record<string, unknown> = {};
  let erro: string | null = null;
  try {
    await executarAPartirDe(db, automacao.nos, automacao.conexoes, gatilhoId, contexto, automacao.criado_por, resultado);
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err);
  }

  if (execucaoId) {
    await db
      .from("automacoes_execucoes")
      .update({ finalizado_em: new Date().toISOString(), status: erro ? "erro" : "sucesso", resultado, erro })
      .eq("id", execucaoId);
  }

  await db.from("automacoes").update({ ultima_execucao: new Date().toISOString() }).eq("id", automacao.id);
}

async function contextoDoCartao(db: DB, cartaoId: string, colunaId?: string): Promise<Contexto> {
  const { data: cartao } = await db
    .from("fluxo_cartoes")
    .select("id, titulo, coluna_id, cliente_id")
    .eq("id", cartaoId)
    .maybeSingle();
  const c = cartao as { id: string; titulo: string; coluna_id: string; cliente_id: string | null } | null;
  if (!c) return { cartaoId };

  const [{ data: coluna }, { data: cliente }] = await Promise.all([
    db.from("fluxo_colunas").select("nome").eq("id", colunaId ?? c.coluna_id).maybeSingle(),
    c.cliente_id ? db.from("clientes").select("nome").eq("id", c.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return {
    cartaoId: c.id,
    cartaoTitulo: c.titulo,
    colunaId: colunaId ?? c.coluna_id,
    colunaNome: (coluna as { nome?: string } | null)?.nome ?? "",
    clienteId: c.cliente_id,
    clienteNome: (cliente as { nome?: string } | null)?.nome ?? "",
  };
}

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: config } = await db.from("automacoes_config").select("segredo").maybeSingle();
  const segredoEsperado = (config as { segredo?: string } | null)?.segredo;
  const segredoRecebido = req.headers.get("x-automacao-secret");
  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio (chamada do pg_cron) — segue em modo agendamento.
  }

  const forcarId = typeof corpo.forcarId === "string" ? corpo.forcarId : null;
  const evento = typeof corpo.evento === "string" ? corpo.evento : null;

  // --- modo 2: forçar execução (Testar agora) ---
  if (forcarId) {
    const { data: automacao } = await db
      .from("automacoes")
      .select("id, nos, conexoes, criado_por")
      .eq("id", forcarId)
      .maybeSingle();
    if (!automacao) return new Response(JSON.stringify({ ok: false, error: "Automação não encontrada." }), { status: 404 });

    const a = automacao as Automacao;
    const gatilho = a.nos.find((n) => n.tipo.startsWith("gatilho_"));
    if (!gatilho) return new Response(JSON.stringify({ ok: false, error: "Sem gatilho." }), { status: 400 });

    let contexto: Contexto = {};
    if (gatilho.tipo !== "gatilho_horario" && typeof corpo.cartaoId === "string") {
      contexto = await contextoDoCartao(db, corpo.cartaoId as string);
    }
    await registrarExecucao(db, a, gatilho.id, contexto);
    return new Response(JSON.stringify({ ok: true, executadas: [a.id] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- modo 3: evento do Fluxo People (cartão criado/movido) ---
  if (evento) {
    const cartaoId = typeof corpo.cartaoId === "string" ? corpo.cartaoId : null;
    const colunaId = typeof corpo.colunaId === "string" ? corpo.colunaId : null;
    if (!cartaoId || !colunaId) {
      return new Response(JSON.stringify({ ok: false, error: "Evento sem cartaoId/colunaId." }), { status: 400 });
    }

    const tipoGatilho = evento === "cartao_criado" ? "gatilho_cartao_criado" : "gatilho_cartao_movido";
    const { data: automacoesAtivas } = await db.from("automacoes").select("id, nos, conexoes, criado_por").eq("ativo", true);

    const contexto = await contextoDoCartao(db, cartaoId, colunaId);
    const executadas: string[] = [];

    for (const automacao of (automacoesAtivas ?? []) as Automacao[]) {
      const gatilho = automacao.nos.find((n) => n.tipo === tipoGatilho);
      if (!gatilho) continue;
      if (tipoGatilho === "gatilho_cartao_movido") {
        const colunaEsperada = gatilho.config?.colunaDestino as string | undefined;
        if (!colunaEsperada || colunaEsperada !== colunaId) continue;
      }
      await registrarExecucao(db, automacao, gatilho.id, contexto);
      executadas.push(automacao.id);
    }

    return new Response(JSON.stringify({ ok: true, executadas }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- modo 1: polling do gatilho de horário (pg_cron a cada 5 min) ---
  const { hora, dataISO } = horaBrasilAgora();
  const bucketAtual = bucketDe5min(hora);

  const { data: automacoesAtivas } = await db
    .from("automacoes")
    .select("id, nos, conexoes, ultima_execucao, criado_por")
    .eq("ativo", true);

  const executadas: string[] = [];
  for (const automacao of (automacoesAtivas ?? []) as (Automacao & { ultima_execucao: string | null })[]) {
    const gatilho = automacao.nos.find((n) => n.tipo === "gatilho_horario");
    const horaConfigurada = gatilho?.config?.hora as string | undefined;
    if (!gatilho || !horaConfigurada) continue;
    if (bucketDe5min(horaConfigurada) !== bucketAtual) continue;

    const ultimaExecucaoBrasil = automacao.ultima_execucao
      ? new Date(new Date(automacao.ultima_execucao).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;
    if (ultimaExecucaoBrasil === dataISO) continue;

    await registrarExecucao(db, automacao, gatilho.id, {});
    executadas.push(automacao.id);
  }

  return new Response(JSON.stringify({ ok: true, executadas }), {
    headers: { "Content-Type": "application/json" },
  });
});
