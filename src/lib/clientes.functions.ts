import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { permissoesEfetivas, podeEditar, type EquipeRole } from "@/lib/equipe";
import {
  ACOES_CONVERSAO_PADRAO,
  ACOES_LEAD_PADRAO,
  contarAcao,
  ehMetricaValida,
} from "@/lib/metricas";
import { ehMetricaInstagramValida } from "@/lib/metricas-instagram";

const clienteSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  identificador: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  ad_account_id: z.string().trim().max(60).default(""),
  meta_token: z.string().trim().max(500).default(""),
  investimento_mensal: z.number().nonnegative().default(0),
  meta_faturamento: z.number().nonnegative().default(0),
});

const tokenSchema = z.object({
  clienteId: z.string().uuid(),
  ad_account_id: z.string().trim().min(1).max(60),
  meta_token: z.string().trim().min(1).max(500),
});

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const sincronizarSchema = z
  .object({
    clienteId: z.string().uuid(),
    desde: dataISO,
    ate: dataISO,
  })
  .refine((v) => v.desde <= v.ate, { message: "A data inicial deve vir antes da final." });

const configSchema = z.object({
  clienteId: z.string().uuid(),
  metricas: z.array(z.string()).max(20),
  acao_lead: z.string().max(120).nullable(),
  acao_conversao: z.string().max(120).nullable(),
});

const configInstagramSchema = z.object({
  clienteId: z.string().uuid(),
  metricas: z.array(z.string()).max(20),
});

const instagramIdSchema = z.object({
  clienteId: z.string().uuid(),
  instagram_business_account_id: z.string().trim().min(1).max(60),
});

const sincronizarInstagramSchema = z
  .object({
    clienteId: z.string().uuid(),
    desde: dataISO,
    ate: dataISO,
  })
  .refine((v) => v.desde <= v.ate, { message: "A data inicial deve vir antes da final." });

const loginClienteSchema = z.object({
  clienteId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  senha: z.string().min(6).max(200),
});

/**
 * O client tipado é gerado pelo Lovable a partir do schema; enquanto os tipos
 * não são regerados, `clientes_secrets` e as colunas novas não existem para o
 * TypeScript. O cast solta a tipagem apenas dentro destas funções.
 */
async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/**
 * Erros do PostgREST chegam com code/message/details. Engolir isso numa
 * mensagem genérica torna qualquer diagnóstico impossível, então o texto real
 * vai junto — estas telas só são acessíveis à equipe.
 */
function erroDoBanco(
  error: { code?: string; message?: string; details?: string } | null,
  padrao: string,
): string {
  if (!error) return padrao;
  if (error.code === "23505") return "Já existe um cliente com esse identificador.";
  if (error.code === "42703" || error.code === "42P01") {
    return `A migração da integração com a Meta ainda não foi aplicada no banco (${error.message ?? error.code}).`;
  }
  const detalhe = [error.message, error.details].filter(Boolean).join(" — ");
  return detalhe ? `${padrao} ${detalhe}` : padrao;
}

/** Só integrantes com permissão de edição na aba Clientes podem mexer aqui. */
async function exigirEdicaoDeClientes(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("role, equipe_role, permissoes")
    .eq("id", userId)
    .maybeSingle();

  const perfil = data as {
    role?: string;
    equipe_role?: EquipeRole | null;
    permissoes?: unknown;
  } | null;

  if (!perfil || perfil.role !== "agencia") {
    throw new Error("Apenas a equipe pode configurar clientes.");
  }
  const permissoes = permissoesEfetivas(perfil.equipe_role ?? null, perfil.permissoes);
  if (!podeEditar(permissoes, "clientes")) {
    throw new Error("Seu acesso à aba Clientes é somente de visualização.");
  }
}

/**
 * Janela padrão da primeira carga: 30 dias terminando ontem, como o
 * Gerenciador de Anúncios. O dia corrente está incompleto e incluí-lo faz os
 * números divergirem do que a Meta mostra.
 */
function janelaPadrao(): { desde: string; ate: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ate = new Date();
  ate.setDate(ate.getDate() - 1);
  const desde = new Date(ate);
  desde.setDate(ate.getDate() - 29);
  return { desde: iso(desde), ate: iso(ate) };
}

/**
 * Puxa os insights da Meta e grava um registro por dia. Guardamos todas as
 * ações devolvidas em `acoes`, e só então derivamos leads e conversões — assim
 * trocar o que conta como lead não exige puxar o histórico de novo.
 */
async function sincronizar(
  db: SupabaseClient,
  clienteId: string,
  janela: { desde: string; ate: string },
): Promise<{ dias: number; campanhas: number }> {
  const { data: cliente } = await db
    .from("clientes")
    .select("ad_account_id, acao_lead, acao_conversao")
    .eq("id", clienteId)
    .maybeSingle();

  const conta = (cliente as { ad_account_id?: string } | null)?.ad_account_id ?? "";
  if (!conta) throw new Error("Cliente sem conta de anúncio configurada.");

  const { data: segredo } = await db
    .from("clientes_secrets")
    .select("meta_token")
    .eq("cliente_id", clienteId)
    .maybeSingle();

  const token = (segredo as { meta_token?: string } | null)?.meta_token ?? "";
  if (!token) throw new Error("Cliente sem token da Meta configurado.");

  const meta = await import("@/lib/meta.server");
  const { desde, ate } = janela;

  let insights: Awaited<ReturnType<typeof meta.buscarInsightsDiarios>>;
  let porCampanha: Awaited<ReturnType<typeof meta.buscarInsightsPorCampanha>>;
  let statusCampanhas: Record<string, string>;
  try {
    const janela = { adAccountId: conta, token, desde, ate };
    [insights, porCampanha, statusCampanhas] = await Promise.all([
      meta.buscarInsightsDiarios(janela),
      meta.buscarInsightsPorCampanha(janela),
      meta.buscarStatusCampanhas(conta, token),
    ]);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha ao sincronizar.";
    await db
      .from("clientes")
      .update({ erro_sincronizacao: mensagem })
      .eq("id", clienteId);
    throw err;
  }

  const config = cliente as { acao_lead?: string | null; acao_conversao?: string | null } | null;

  const linhas = insights.map((dia) => ({
    cliente_id: clienteId,
    data: dia.data,
    investimento: dia.investimento,
    impressoes: dia.impressoes,
    cliques: dia.cliques,
    acoes: dia.acoes,
    leads: contarAcao(dia.acoes, config?.acao_lead ?? null, ACOES_LEAD_PADRAO),
    conversoes: contarAcao(dia.acoes, config?.acao_conversao ?? null, ACOES_CONVERSAO_PADRAO),
    video_p25: dia.video25,
    video_p50: dia.video50,
    video_p75: dia.video75,
    video_p100: dia.video100,
    atualizado_em: new Date().toISOString(),
  }));

  if (linhas.length > 0) {
    const { error } = await db
      .from("metricas_diarias")
      .upsert(linhas, { onConflict: "cliente_id,data" });
    if (error) throw new Error(erroDoBanco(error, "Métricas obtidas, mas não foi possível gravá-las."));
  }

  const linhasCampanha = porCampanha.map((dia) => ({
    cliente_id: clienteId,
    campanha_id: dia.campanhaId,
    campanha_nome: dia.campanhaNome,
    status: statusCampanhas[dia.campanhaId] ?? "",
    data: dia.data,
    investimento: dia.investimento,
    impressoes: dia.impressoes,
    cliques: dia.cliques,
    acoes: dia.acoes,
    leads: contarAcao(dia.acoes, config?.acao_lead ?? null, ACOES_LEAD_PADRAO),
    conversoes: contarAcao(dia.acoes, config?.acao_conversao ?? null, ACOES_CONVERSAO_PADRAO),
    video_p25: dia.video25,
    video_p50: dia.video50,
    video_p75: dia.video75,
    video_p100: dia.video100,
    atualizado_em: new Date().toISOString(),
  }));

  if (linhasCampanha.length > 0) {
    const { error } = await db
      .from("metricas_campanhas")
      .upsert(linhasCampanha, { onConflict: "cliente_id,campanha_id,data" });
    if (error) {
      throw new Error(erroDoBanco(error, "Não foi possível gravar as métricas por campanha."));
    }
  }

  await db
    .from("clientes")
    .update({ ultima_sincronizacao: new Date().toISOString(), erro_sincronizacao: null })
    .eq("id", clienteId);

  const campanhas = new Set(porCampanha.map((c) => c.campanhaId)).size;
  return { dias: linhas.length, campanhas };
}

/**
 * Puxa seguidores, alcance, visitas ao perfil e publicações recentes do
 * Instagram Business e grava um registro por dia + um por publicação.
 *
 * `follower_count` da Graph API é uma variação diária, não um total — o total
 * atual (`conta.seguidores`) é reconstruído dia a dia para trás, subtraindo a
 * variação de cada dia a partir de hoje.
 */
async function sincronizarInstagram(
  db: SupabaseClient,
  clienteId: string,
  janela: { desde: string; ate: string },
): Promise<{ dias: number; publicacoes: number }> {
  const { data: cliente } = await db
    .from("clientes")
    .select("instagram_business_account_id")
    .eq("id", clienteId)
    .maybeSingle();

  const igId =
    (cliente as { instagram_business_account_id?: string } | null)
      ?.instagram_business_account_id ?? "";
  if (!igId) throw new Error("Cliente sem conta do Instagram Business configurada.");

  const { data: segredo } = await db
    .from("clientes_secrets")
    .select("meta_token")
    .eq("cliente_id", clienteId)
    .maybeSingle();

  const token = (segredo as { meta_token?: string } | null)?.meta_token ?? "";
  if (!token) {
    throw new Error(
      "Cliente sem token da Meta configurado (o Instagram reaproveita o token do Meta Ads).",
    );
  }

  const instagram = await import("@/lib/instagram.server");

  let conta: Awaited<ReturnType<typeof instagram.buscarConta>>;
  let insights: Awaited<ReturnType<typeof instagram.buscarInsightsConta>>;
  let publicacoes: Awaited<ReturnType<typeof instagram.buscarPublicacoesRecentes>>;
  try {
    [conta, insights, publicacoes] = await Promise.all([
      instagram.buscarConta(igId, token),
      instagram.buscarInsightsConta(igId, token, janela.desde, janela.ate),
      instagram.buscarPublicacoesRecentes(igId, token, 25),
    ]);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha ao sincronizar o Instagram.";
    await db
      .from("clientes")
      .update({ instagram_erro_sincronizacao: mensagem })
      .eq("id", clienteId);
    throw err;
  }

  const dias = insights.diarios.map((d) => d.data).sort();
  const seguidoresPorDia = new Map<string, number>();
  let acumulado = conta.seguidores;
  for (let i = dias.length - 1; i >= 0; i--) {
    const dia = dias[i]!;
    seguidoresPorDia.set(dia, acumulado);
    acumulado -= insights.deltasSeguidores[dia] ?? 0;
  }

  const engajamentoPorDia = new Map<
    string,
    { curtidas: number; comentarios: number; compartilhamentos: number }
  >();
  for (const p of publicacoes) {
    const dia = p.publicadoEm.slice(0, 10);
    const atual = engajamentoPorDia.get(dia) ?? { curtidas: 0, comentarios: 0, compartilhamentos: 0 };
    atual.curtidas += p.curtidas;
    atual.comentarios += p.comentarios;
    atual.compartilhamentos += p.compartilhamentos;
    engajamentoPorDia.set(dia, atual);
  }

  const linhas = insights.diarios.map((d) => {
    const eng = engajamentoPorDia.get(d.data) ?? { curtidas: 0, comentarios: 0, compartilhamentos: 0 };
    return {
      cliente_id: clienteId,
      data: d.data,
      seguidores: seguidoresPorDia.get(d.data) ?? conta.seguidores,
      alcance: d.alcance,
      visitas_perfil: d.visitasPerfil,
      curtidas: eng.curtidas,
      comentarios: eng.comentarios,
      compartilhamentos: eng.compartilhamentos,
      atualizado_em: new Date().toISOString(),
    };
  });

  if (linhas.length > 0) {
    const { error } = await db
      .from("metricas_instagram_diarias")
      .upsert(linhas, { onConflict: "cliente_id,data" });
    if (error) {
      throw new Error(erroDoBanco(error, "Métricas do Instagram obtidas, mas não foi possível gravá-las."));
    }
  }

  const linhasPosts = publicacoes.map((p) => ({
    cliente_id: clienteId,
    media_id: p.mediaId,
    tipo: p.tipo,
    legenda: p.legenda,
    permalink: p.permalink,
    publicado_em: p.publicadoEm,
    alcance: p.alcance,
    curtidas: p.curtidas,
    comentarios: p.comentarios,
    compartilhamentos: p.compartilhamentos,
    atualizado_em: new Date().toISOString(),
  }));

  if (linhasPosts.length > 0) {
    const { error } = await db
      .from("metricas_instagram_posts")
      .upsert(linhasPosts, { onConflict: "cliente_id,media_id" });
    if (error) throw new Error(erroDoBanco(error, "Publicações obtidas, mas não foi possível gravá-las."));
  }

  await db
    .from("clientes")
    .update({
      instagram_ultima_sincronizacao: new Date().toISOString(),
      instagram_erro_sincronizacao: null,
    })
    .eq("id", clienteId);

  return { dias: linhas.length, publicacoes: linhasPosts.length };
}

/**
 * Cria o cliente e, se token e conta de anúncio vierem preenchidos, valida a
 * credencial na Meta e já faz a primeira carga de métricas.
 */
export const criarClienteComMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => clienteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const temMeta = Boolean(data.ad_account_id && data.meta_token);

    // Valida antes de inserir: nada de cliente cadastrado com credencial morta.
    if (temMeta) {
      const meta = await import("@/lib/meta.server");
      await meta.validarCredenciais(data.ad_account_id, data.meta_token);
    }

    const { data: criado, error } = await db
      .from("clientes")
      .insert({
        nome: data.nome,
        identificador: data.identificador.toLowerCase(),
        ad_account_id: data.ad_account_id,
        investimento_mensal: data.investimento_mensal,
        meta_faturamento: data.meta_faturamento,
        token_atualizado_em: temMeta ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error || !criado) {
      throw new Error(erroDoBanco(error, "Não foi possível criar o cliente."));
    }

    const clienteId = (criado as { id: string }).id;

    if (!temMeta) return { id: clienteId, sincronizado: 0 };

    const { error: erroSegredo } = await db
      .from("clientes_secrets")
      .upsert(
        { cliente_id: clienteId, meta_token: data.meta_token, updated_at: new Date().toISOString() },
        { onConflict: "cliente_id" },
      );
    if (erroSegredo) {
      throw new Error(erroDoBanco(erroSegredo, "Cliente criado, mas o token não pôde ser guardado."));
    }

    // O cliente já existe; uma falha aqui não deve desfazer o cadastro. Ela
    // fica registrada em erro_sincronizacao e o botão Sincronizar resolve.
    try {
      const { dias } = await sincronizar(db, clienteId, janelaPadrao());
      return { id: clienteId, sincronizado: dias };
    } catch {
      return { id: clienteId, sincronizado: 0 };
    }
  });

/** Substitui o token da Meta de um cliente já cadastrado. */
export const salvarTokenMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const meta = await import("@/lib/meta.server");
    const conta = await meta.validarCredenciais(data.ad_account_id, data.meta_token);

    const { error } = await db.from("clientes_secrets").upsert(
      { cliente_id: data.clienteId, meta_token: data.meta_token, updated_at: new Date().toISOString() },
      { onConflict: "cliente_id" },
    );
    if (error) throw new Error(erroDoBanco(error, "Não foi possível guardar o token."));

    await db
      .from("clientes")
      .update({
        ad_account_id: data.ad_account_id,
        token_atualizado_em: new Date().toISOString(),
        erro_sincronizacao: null,
      })
      .eq("id", data.clienteId);

    return { conta: conta.nome };
  });

/** Puxa novamente as métricas de um cliente, na janela informada. */
export const sincronizarMetricasMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sincronizarSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();
    return await sincronizar(db, data.clienteId, { desde: data.desde, ate: data.ate });
  });

/**
 * Quais métricas o dashboard mostra, em que ordem, e qual ação da Meta conta
 * como lead e como conversão. Aplicado na leitura, então vale imediatamente
 * para todo o histórico já importado.
 */
export const salvarConfigMetricas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const metricas = data.metricas.filter(ehMetricaValida);

    const { error } = await db
      .from("clientes")
      .update({
        metricas_kpis: metricas,
        acao_lead: data.acao_lead || null,
        acao_conversao: data.acao_conversao || null,
      })
      .eq("id", data.clienteId);

    if (error) throw new Error(erroDoBanco(error, "Não foi possível salvar a configuração."));
    return { metricas };
  });

/** Mesma ideia de `salvarConfigMetricas`, para os KPIs do dashboard de Instagram. */
export const salvarConfigMetricasInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configInstagramSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const metricas = data.metricas.filter(ehMetricaInstagramValida);

    const { error } = await db
      .from("clientes")
      .update({ instagram_kpis: metricas })
      .eq("id", data.clienteId);

    if (error) throw new Error(erroDoBanco(error, "Não foi possível salvar a configuração."));
    return { metricas };
  });

/**
 * Guarda o ID da conta do Instagram Business, valida com o token da Meta já
 * salvo (é o mesmo token, sem campo próprio) e faz a primeira carga.
 */
export const salvarInstagramBusinessId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => instagramIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const { data: segredo } = await db
      .from("clientes_secrets")
      .select("meta_token")
      .eq("cliente_id", data.clienteId)
      .maybeSingle();
    const token = (segredo as { meta_token?: string } | null)?.meta_token ?? "";
    if (!token) {
      throw new Error(
        "Salve o token da Meta (bloco Meta Ads) antes de configurar o Instagram — ele reaproveita o mesmo token.",
      );
    }

    const instagram = await import("@/lib/instagram.server");
    const conta = await instagram.validarCredenciais(data.instagram_business_account_id, token);

    const { error } = await db
      .from("clientes")
      .update({
        instagram_business_account_id: data.instagram_business_account_id,
        instagram_erro_sincronizacao: null,
      })
      .eq("id", data.clienteId);
    if (error) throw new Error(erroDoBanco(error, "Não foi possível salvar a conta do Instagram."));

    // O cadastro já existe; uma falha aqui não deve desfazê-lo. Ela fica
    // registrada em instagram_erro_sincronizacao e o botão Sincronizar resolve.
    try {
      const { dias } = await sincronizarInstagram(db, data.clienteId, janelaPadrao());
      return { username: conta.username, sincronizado: dias };
    } catch {
      return { username: conta.username, sincronizado: 0 };
    }
  });

/** Puxa novamente as métricas do Instagram de um cliente, na janela informada. */
export const sincronizarMetricasInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sincronizarInstagramSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();
    return await sincronizarInstagram(db, data.clienteId, { desde: data.desde, ate: data.ate });
  });

/**
 * Cria (ou reaproveita) o login do cliente e o vincula ao registro em
 * `clientes` — é assim que, ao entrar, ele cai direto na área dele: o
 * redirecionamento por role já lê `profiles.cliente_id`.
 *
 * `auth.admin.createUser` cria a conta já confirmada (a agência está
 * configurando em nome do cliente, não faz sentido exigir clique de e-mail).
 * Se o e-mail já tiver conta, atualiza a senha e só vincula o cliente_id.
 */
export const criarLoginCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => loginClienteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const { data: cliente } = await db
      .from("clientes")
      .select("nome")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (!cliente) throw new Error("Cliente não encontrado.");
    const nomeCliente = (cliente as { nome: string }).nome;

    const criacao = await db.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: nomeCliente },
    });

    let userId: string;
    let criouConta: boolean;

    if (criacao.error) {
      const jaExiste = /already|existe/i.test(criacao.error.message ?? "");
      if (!jaExiste) {
        throw new Error(`Não foi possível criar o login: ${criacao.error.message}`);
      }

      const { data: perfisExistentes } = await db
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .limit(1);
      const perfilExistente = (perfisExistentes as { id: string }[] | null)?.[0];
      if (!perfilExistente) {
        throw new Error("Já existe uma conta com esse e-mail, mas não foi possível localizá-la.");
      }
      userId = perfilExistente.id;
      criouConta = false;

      const { error: erroSenha } = await db.auth.admin.updateUserById(userId, {
        password: data.senha,
      });
      if (erroSenha) throw new Error(`Não foi possível atualizar a senha: ${erroSenha.message}`);
    } else {
      userId = criacao.data.user.id;
      criouConta = true;
    }

    const { error: erroPerfil } = await db
      .from("profiles")
      .update({ cliente_id: data.clienteId, role: "cliente" })
      .eq("id", userId);
    if (erroPerfil) {
      throw new Error(erroDoBanco(erroPerfil, "Login criado, mas não foi possível vincular ao cliente."));
    }

    return { criouConta, email: data.email };
  });
