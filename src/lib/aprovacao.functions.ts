import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehAdminEquipe, type EquipeRole } from "@/lib/equipe";

/**
 * Tudo aqui passa pela service role de propósito: o cliente não tem (e não
 * deve ter) acesso direto a `fluxo_cartoes` via RLS — só a equipe. Em vez de
 * abrir uma política nova e arriscar alguém enxergar ou mover cartões que não
 * são dele, cada ação valida explicitamente o dono do cartão aqui.
 */
async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

const NOME_COLUNA_REVISAO = "Revisão do Cliente";
const NOME_COLUNA_APROVADO = "Agendar";
const NOME_COLUNA_REPROVADO = "Apresentação";

const listarSchema = z.object({ clienteId: z.string().uuid().optional() });

const responderSchema = z.object({
  cartaoId: z.string().uuid(),
  decisao: z.enum(["aprovado", "reprovado"]),
  motivo: z.string().trim().max(2000).optional(),
  clienteId: z.string().uuid().optional(),
});

type PerfilBruto = {
  id: string;
  role: string;
  cliente_id: string | null;
  equipe_role: EquipeRole | null;
};

/**
 * Resolve de qual cliente a pessoa logada pode ver/mexer nas aprovações:
 * - conta de cliente → sempre o próprio `cliente_id`, nunca o que vier do
 *   front (evita um cliente pedir o `clienteId` de outro);
 * - super admin / admin da equipe → o cliente que escolheram visualizar em
 *   "Visualizar como cliente" (`clienteId` vem do front, mas só esses dois
 *   níveis passam);
 * - qualquer outro papel da equipe → sem acesso, como pedido.
 */
async function resolverAcesso(
  db: SupabaseClient,
  userId: string,
  clienteIdSolicitado: string | undefined,
): Promise<{ clienteId: string; perfilId: string }> {
  const { data } = await db
    .from("profiles")
    .select("id, role, cliente_id, equipe_role")
    .eq("id", userId)
    .maybeSingle();
  const perfil = data as PerfilBruto | null;
  if (!perfil) throw new Error("Perfil não encontrado.");

  if (perfil.role === "cliente") {
    if (!perfil.cliente_id) throw new Error("Sua conta ainda não está vinculada a um cliente.");
    return { clienteId: perfil.cliente_id, perfilId: perfil.id };
  }

  if (perfil.role === "agencia") {
    if (!ehAdminEquipe(perfil.equipe_role)) {
      throw new Error("Apenas super admin e admin podem acessar as aprovações dos clientes.");
    }
    if (!clienteIdSolicitado) throw new Error("Selecione um cliente para ver as aprovações.");
    return { clienteId: clienteIdSolicitado, perfilId: perfil.id };
  }

  throw new Error("Sem acesso às aprovações.");
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

/** Cartões aguardando aprovação do cliente informado (ou do próprio cliente logado). */
export const listarAprovacoesPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listarSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const acesso = await resolverAcesso(db, context.userId, data.clienteId);
    const colunaId = await idDaColuna(db, NOME_COLUNA_REVISAO);

    const { data: cartoesBrutos, error } = await db
      .from("fluxo_cartoes")
      .select("id, titulo, descricao, prazo, created_at")
      .eq("cliente_id", acesso.clienteId)
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
 * Aprova ou reprova um conteúdo, movendo o cartão pro destino certo. Se
 * reprovado, o motivo (opcional) vira um comentário no cartão, pra quem for
 * ajustar já saber o que mudar sem precisar perguntar de novo.
 */
export const responderAprovacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => responderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const acesso = await resolverAcesso(db, context.userId, data.clienteId);

    const { data: cartaoBruto } = await db
      .from("fluxo_cartoes")
      .select("id, cliente_id, coluna_id")
      .eq("id", data.cartaoId)
      .maybeSingle();
    const cartao = cartaoBruto as { id: string; cliente_id: string | null; coluna_id: string } | null;
    if (!cartao) throw new Error("Conteúdo não encontrado.");
    if (cartao.cliente_id !== acesso.clienteId) {
      throw new Error("Esse conteúdo não pertence a este cliente.");
    }

    const colunaRevisao = await idDaColuna(db, NOME_COLUNA_REVISAO);
    if (cartao.coluna_id !== colunaRevisao) {
      throw new Error("Esse conteúdo não está mais aguardando aprovação.");
    }

    const destino =
      data.decisao === "aprovado"
        ? await idDaColuna(db, NOME_COLUNA_APROVADO)
        : await idDaColuna(db, NOME_COLUNA_REPROVADO);

    const { error } = await db.from("fluxo_cartoes").update({ coluna_id: destino }).eq("id", cartao.id);
    if (error) throw new Error("Não foi possível registrar a resposta.");

    const textoBase =
      data.decisao === "aprovado" ? "Conteúdo aprovado pelo cliente." : "Conteúdo reprovado pelo cliente.";
    const texto = data.motivo ? `${textoBase}\n\n${data.motivo}` : textoBase;
    await db.from("fluxo_comentarios").insert({
      cartao_id: cartao.id,
      autor_id: acesso.perfilId,
      texto,
    });

    return { ok: true };
  });
