import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { permissoesEfetivas, podeEditar, type EquipeRole } from "@/lib/equipe";
import type { IntegracaoGoogle } from "@/lib/google.server";

/**
 * Os 4 segredos aceitam vazio de propósito: em branco significa "manter o
 * valor já salvo" (o formulário nunca reexibe o que já está guardado), não
 * "apagar". A validação de que pelo menos um valor (novo ou existente) precisa
 * existir acontece no handler, depois de mesclar com o que já está no banco.
 */
const integracaoSchema = z.object({
  client_id: z.string().trim().max(200).default(""),
  client_secret: z.string().trim().max(200).default(""),
  refresh_token: z.string().trim().max(500).default(""),
  developer_token: z.string().trim().max(200).default(""),
  login_customer_id: z.string().trim().max(60).default(""),
});

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const customerIdSchema = z.object({
  clienteId: z.string().uuid(),
  customerId: z.string().trim().min(1).max(60),
});

const propertyIdSchema = z.object({
  clienteId: z.string().uuid(),
  propertyId: z.string().trim().min(1).max(60),
});

const sincronizarSchema = z
  .object({ clienteId: z.string().uuid(), desde: dataISO, ate: dataISO })
  .refine((v) => v.desde <= v.ate, { message: "A data inicial deve vir antes da final." });

/** types.ts é gerado pelo Lovable e ainda não conhece as tabelas da integração Google. */
async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function exigirEdicaoDeClientes(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("role, equipe_role, permissoes")
    .eq("id", userId)
    .maybeSingle();

  const perfil = data as { role?: string; equipe_role?: EquipeRole | null; permissoes?: unknown } | null;
  if (!perfil || perfil.role !== "agencia") {
    throw new Error("Apenas a equipe pode configurar integrações.");
  }
  const permissoes = permissoesEfetivas(perfil.equipe_role ?? null, perfil.permissoes);
  if (!podeEditar(permissoes, "clientes")) {
    throw new Error("Você não tem permissão para configurar integrações.");
  }
}

function erroDoBanco(error: { code?: string; message?: string } | null, padrao: string): string {
  if (!error) return padrao;
  if (error.code === "42703" || error.code === "42P01") {
    return `A migração da integração com o Google ainda não foi aplicada no banco (${error.message ?? error.code}).`;
  }
  return error.message ? `${padrao} ${error.message}` : padrao;
}

async function carregarIntegracao(db: SupabaseClient): Promise<IntegracaoGoogle> {
  const { data } = await db
    .from("integracoes_google")
    .select("client_id, client_secret, refresh_token, developer_token, login_customer_id")
    .eq("id", true)
    .maybeSingle();
  const config = data as IntegracaoGoogle | null;
  if (!config) {
    throw new Error("A integração com o Google ainda não foi configurada.");
  }
  return config;
}

/** Salva (ou substitui) as credenciais compartilhadas da agência pro Google Ads + GA4. */
export const salvarIntegracaoGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => integracaoSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const { data: existente } = await db
      .from("integracoes_google")
      .select("client_id, client_secret, refresh_token, developer_token")
      .eq("id", true)
      .maybeSingle();
    const atual = existente as Partial<IntegracaoGoogle> | null;

    const config: IntegracaoGoogle = {
      client_id: data.client_id || atual?.client_id || "",
      client_secret: data.client_secret || atual?.client_secret || "",
      refresh_token: data.refresh_token || atual?.refresh_token || "",
      developer_token: data.developer_token || atual?.developer_token || "",
      login_customer_id: data.login_customer_id || null,
    };

    if (!config.client_id || !config.client_secret || !config.refresh_token || !config.developer_token) {
      throw new Error(
        "Preencha Client ID, Client Secret, Refresh Token e Developer Token na primeira configuração.",
      );
    }

    // Valida antes de salvar: sem isso, um valor errado só apareceria no
    // primeiro cliente que tentasse sincronizar.
    const google = await import("@/lib/google.server");
    await google.obterAccessToken(config);

    const { error } = await db.from("integracoes_google").upsert(
      { id: true, ...config, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) throw new Error(erroDoBanco(error, "Não foi possível salvar a integração."));

    return { ok: true };
  });

/** Diz se a integração está configurada, sem devolver nenhum segredo. */
export const statusIntegracaoGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();

    const { data } = await db
      .from("integracoes_google")
      .select("updated_at, login_customer_id")
      .eq("id", true)
      .maybeSingle();
    const config = data as { updated_at?: string; login_customer_id?: string | null } | null;

    return {
      configurado: Boolean(config),
      atualizadoEm: config?.updated_at ?? null,
      loginCustomerId: config?.login_customer_id ?? null,
    };
  });

/** Guarda o Customer ID do Google Ads de um cliente, validando antes com a API. */
export const salvarGoogleAdsCustomerId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => customerIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();
    const config = await carregarIntegracao(db);

    const googleAds = await import("@/lib/google-ads.server");
    const conta = await googleAds.validarCustomerId(config, data.customerId);

    const { error } = await db
      .from("clientes")
      .update({
        google_ads_customer_id: data.customerId,
        google_ads_erro_sincronizacao: null,
      })
      .eq("id", data.clienteId);
    if (error) throw new Error(erroDoBanco(error, "Não foi possível salvar o Customer ID."));

    return { conta: conta.nome };
  });

/** Guarda o Property ID do GA4 de um cliente, validando antes com a API. */
export const salvarGa4PropertyId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => propertyIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();
    const config = await carregarIntegracao(db);

    const ga4 = await import("@/lib/ga4.server");
    await ga4.validarPropertyId(config, data.propertyId);

    const { error } = await db
      .from("clientes")
      .update({ ga4_property_id: data.propertyId, ga4_erro_sincronizacao: null })
      .eq("id", data.clienteId);
    if (error) throw new Error(erroDoBanco(error, "Não foi possível salvar o Property ID."));

    return { ok: true };
  });

/** Puxa (ou repuxa) as métricas de Google Ads de um cliente, na janela informada. */
export const sincronizarMetricasGoogleAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sincronizarSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();
    const config = await carregarIntegracao(db);

    const { data: cliente } = await db
      .from("clientes")
      .select("google_ads_customer_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    const customerId = (cliente as { google_ads_customer_id?: string | null } | null)
      ?.google_ads_customer_id;
    if (!customerId) throw new Error("Cliente sem Customer ID do Google Ads configurado.");

    const googleAds = await import("@/lib/google-ads.server");

    let linhas: Awaited<ReturnType<typeof googleAds.buscarInsightsPorCampanha>>;
    try {
      linhas = await googleAds.buscarInsightsPorCampanha(config, customerId, data.desde, data.ate);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Falha ao sincronizar.";
      await db
        .from("clientes")
        .update({ google_ads_erro_sincronizacao: mensagem })
        .eq("id", data.clienteId);
      throw err;
    }

    const paraGravar = linhas.map((l) => ({
      cliente_id: data.clienteId,
      campanha_id: l.campanhaId,
      campanha_nome: l.campanhaNome,
      status: l.status,
      data: l.data,
      investimento: l.investimento,
      impressoes: l.impressoes,
      cliques: l.cliques,
      conversoes: l.conversoes,
      valor_conversoes: l.valorConversoes,
      ctr: l.ctr,
      cpc: l.cpc,
      atualizado_em: new Date().toISOString(),
    }));

    if (paraGravar.length > 0) {
      const { error } = await db
        .from("metricas_google_ads")
        .upsert(paraGravar, { onConflict: "cliente_id,campanha_id,data" });
      if (error) {
        throw new Error(erroDoBanco(error, "Métricas obtidas, mas não foi possível gravá-las."));
      }
    }

    await db
      .from("clientes")
      .update({
        google_ads_ultima_sincronizacao: new Date().toISOString(),
        google_ads_erro_sincronizacao: null,
      })
      .eq("id", data.clienteId);

    const campanhas = new Set(linhas.map((l) => l.campanhaId)).size;
    return { dias: paraGravar.length, campanhas };
  });

/** Puxa (ou repuxa) as métricas do GA4 de um cliente, na janela informada. */
export const sincronizarMetricasGA4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sincronizarSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEdicaoDeClientes(context.supabase as unknown as SupabaseClient, context.userId);
    const db = await admin();
    const config = await carregarIntegracao(db);

    const { data: cliente } = await db
      .from("clientes")
      .select("ga4_property_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    const propertyId = (cliente as { ga4_property_id?: string | null } | null)?.ga4_property_id;
    if (!propertyId) throw new Error("Cliente sem Property ID do GA4 configurado.");

    const ga4 = await import("@/lib/ga4.server");

    let linhas: Awaited<ReturnType<typeof ga4.buscarInsightsDiarios>>;
    try {
      linhas = await ga4.buscarInsightsDiarios(config, propertyId, data.desde, data.ate);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Falha ao sincronizar.";
      await db.from("clientes").update({ ga4_erro_sincronizacao: mensagem }).eq("id", data.clienteId);
      throw err;
    }

    const paraGravar = linhas.map((l) => ({
      cliente_id: data.clienteId,
      data: l.data,
      sessoes: l.sessoes,
      usuarios: l.usuarios,
      novos_usuarios: l.novosUsuarios,
      visualizacoes_pagina: l.visualizacoesPagina,
      taxa_engajamento: l.taxaEngajamento,
      duracao_media_sessao: l.duracaoMediaSessao,
      conversoes: l.conversoes,
      atualizado_em: new Date().toISOString(),
    }));

    if (paraGravar.length > 0) {
      const { error } = await db
        .from("metricas_ga4")
        .upsert(paraGravar, { onConflict: "cliente_id,data" });
      if (error) {
        throw new Error(erroDoBanco(error, "Métricas obtidas, mas não foi possível gravá-las."));
      }
    }

    // Sessões por canal: consulta separada, então uma falha aqui não deve
    // derrubar a sincronização principal — o painel só fica sem essa quebra.
    try {
      const porCanal = await ga4.buscarSessoesPorCanal(config, propertyId, data.desde, data.ate);
      const paraGravarCanal = porCanal.map((l) => ({
        cliente_id: data.clienteId,
        canal: l.canal,
        fonte: l.fonte,
        data: l.data,
        sessoes: l.sessoes,
        atualizado_em: new Date().toISOString(),
      }));
      if (paraGravarCanal.length > 0) {
        await db
          .from("metricas_ga4_canais")
          .upsert(paraGravarCanal, { onConflict: "cliente_id,canal,fonte,data" });
      }
    } catch {
      // best-effort
    }

    await db
      .from("clientes")
      .update({ ga4_ultima_sincronizacao: new Date().toISOString(), ga4_erro_sincronizacao: null })
      .eq("id", data.clienteId);

    return { dias: paraGravar.length };
  });
