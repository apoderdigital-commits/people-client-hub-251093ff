import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Tudo aqui passa pela service role de propósito: o cliente não tem (e não
 * deve ter) acesso direto a `fluxo_cartoes` via RLS — só a equipe. Em vez de
 * abrir uma política nova e arriscar o cliente enxergar ou mover cartões que
 * não são dele, cada ação valida explicitamente o dono do cartão aqui.
 */
async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

const NOME_COLUNA_REVISAO = "Revisão do Cliente";
const NOME_COLUNA_APROVADO = "Agendar";
const NOME_COLUNA_REPROVADO = "Apresentação";

const vazioSchema = z.object({}).optional();

const responderSchema = z.object({
  cartaoId: z.string().uuid(),
  decisao: z.enum(["aprovado", "reprovado"]),
  motivo: z.string().trim().max(2000).optional(),
});

type Perfil = { id: string; role: string; cliente_id: string | null };

async function perfilDoCliente(db: SupabaseClient, userId: string): Promise<Perfil> {
  const { data } = await db
    .from("profiles")
    .select("id, role, cliente_id")
    .eq("id", userId)
    .maybeSingle();
  const perfil = data as Perfil | null;
  if (!perfil || perfil.role !== "cliente" || !perfil.cliente_id) {
    throw new Error("Apenas contas de cliente vinculadas a um cliente têm aprovações.");
  }
  return perfil;
}

async function idDaColuna(db: SupabaseClient, nome: string): Promise<string> {
  const { data } = await db.from("fluxo_colunas").select("id").ilike("nome", nome).maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (!id) {
    throw new Error(
      `A coluna "${nome}" não foi encontrada no Fluxo People. Confira o nome exato da coluna no quadro.`,
    );
  }
  return id;
}

/** Cartões do cliente autenticado que estão aguardando aprovação dele. */
export const listarAprovacoesPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => vazioSchema.parse(data))
  .handler(async ({ context }) => {
    const db = await admin();
    const perfil = await perfilDoCliente(db, context.userId);
    const colunaId = await idDaColuna(db, NOME_COLUNA_REVISAO);

    const { data: cartoesBrutos, error } = await db
      .from("fluxo_cartoes")
      .select("id, titulo, descricao, prazo, created_at")
      .eq("cliente_id", perfil.cliente_id)
      .eq("coluna_id", colunaId)
      .order("created_at");
    if (error) throw new Error("Não foi possível carregar os conteúdos para aprovação.");

    const cartoes =
      (cartoesBrutos as { id: string; titulo: string; descricao: string | null; prazo: string | null }[]) ??
      [];
    if (cartoes.length === 0) return { cartoes: [], anexos: [] };

    const { data: anexosBrutos } = await db
      .from("fluxo_anexos")
      .select("id, cartao_id, nome, caminho")
      .in(
        "cartao_id",
        cartoes.map((c) => c.id),
      );

    const anexos: { id: string; cartao_id: string; nome: string; url: string }[] = [];
    for (const a of (anexosBrutos as
      | { id: string; cartao_id: string; nome: string; caminho: string }[]
      | null) ?? []) {
      const { data: assinado } = await db.storage.from("fluxo-anexos").createSignedUrl(a.caminho, 300);
      if (assinado?.signedUrl) {
        anexos.push({ id: a.id, cartao_id: a.cartao_id, nome: a.nome, url: assinado.signedUrl });
      }
    }

    return { cartoes, anexos };
  });

/**
 * Aprova ou reprova um conteúdo, movendo o cartão pro destino certo. Se o
 * cliente reprovar, o motivo (opcional) vira um comentário no cartão, pra
 * quem for ajustar já saber o que mudar sem precisar perguntar de novo.
 */
export const responderAprovacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => responderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const perfil = await perfilDoCliente(db, context.userId);

    const { data: cartaoBruto } = await db
      .from("fluxo_cartoes")
      .select("id, cliente_id, coluna_id")
      .eq("id", data.cartaoId)
      .maybeSingle();
    const cartao = cartaoBruto as { id: string; cliente_id: string | null; coluna_id: string } | null;
    if (!cartao) throw new Error("Conteúdo não encontrado.");
    if (cartao.cliente_id !== perfil.cliente_id) {
      throw new Error("Esse conteúdo não pertence à sua conta.");
    }

    const colunaRevisao = await idDaColuna(db, NOME_COLUNA_REVISAO);
    if (cartao.coluna_id !== colunaRevisao) {
      throw new Error("Esse conteúdo não está mais aguardando sua aprovação.");
    }

    const destino =
      data.decisao === "aprovado"
        ? await idDaColuna(db, NOME_COLUNA_APROVADO)
        : await idDaColuna(db, NOME_COLUNA_REPROVADO);

    const { error } = await db.from("fluxo_cartoes").update({ coluna_id: destino }).eq("id", cartao.id);
    if (error) throw new Error("Não foi possível registrar sua resposta.");

    const textoBase =
      data.decisao === "aprovado" ? "Conteúdo aprovado pelo cliente." : "Conteúdo reprovado pelo cliente.";
    const texto = data.motivo ? `${textoBase}\n\n${data.motivo}` : textoBase;
    await db.from("fluxo_comentarios").insert({
      cartao_id: cartao.id,
      autor_id: perfil.id,
      texto,
    });

    return { ok: true };
  });
