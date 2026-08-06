import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehAdminEquipe, type EquipeRole } from "@/lib/equipe";

async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function exigirAdminEquipe(db: SupabaseClient, userId: string): Promise<void> {
  const { data } = await db.from("profiles").select("role, equipe_role").eq("id", userId).maybeSingle();
  const perfil = data as { role?: string; equipe_role?: EquipeRole | null } | null;
  if (!perfil || perfil.role !== "agencia" || !ehAdminEquipe(perfil.equipe_role ?? null)) {
    throw new Error("Apenas super admin e admin podem usar Automações.");
  }
}

const executarSchema = z.object({ automacaoId: z.string().uuid() });

/**
 * Dispara a Edge Function pro app inteiro (ela decide sozinha quais
 * automações estão no horário) — "testar agora" e a execução agendada usam
 * exatamente o mesmo código, então testar aqui garante que o agendamento vai
 * se comportar igual.
 */
export const executarAutomacaoAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => executarSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await exigirAdminEquipe(db, context.userId);

    const { data: automacao } = await db
      .from("automacoes")
      .select("id, nos, conexoes, criado_por")
      .eq("id", data.automacaoId)
      .maybeSingle();
    if (!automacao) throw new Error("Automação não encontrada.");

    const { data: config } = await db.from("automacoes_config").select("segredo").maybeSingle();
    const segredo = (config as { segredo?: string } | null)?.segredo;
    if (!segredo) throw new Error("Configuração de automações não encontrada.");

    const SUPABASE_URL = process.env["SUPABASE_URL"];
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL não configurada.");

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/executar-automacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-automacao-secret": segredo },
      body: JSON.stringify({ forcarId: data.automacaoId }),
    });

    if (!resp.ok) {
      const texto = await resp.text().catch(() => "");
      throw new Error(`A Edge Function respondeu ${resp.status}: ${texto || "sem detalhes"}`);
    }

    return (await resp.json()) as { ok: boolean; executadas: string[] };
  });

const salvarCredencialSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(120),
  tipo: z.literal("evolution_whatsapp"),
  baseUrl: z.string().trim().min(1).max(300),
  apiKey: z.string().trim().min(1).max(500),
  instance: z.string().trim().min(1).max(200),
});

const idSchema = z.object({ id: z.string().uuid() });

/**
 * Lista só nome/tipo/id — o `config` (com a API key da Evolution) nunca sai
 * do servidor depois de salvo, mesmo padrão do token da Meta.
 */
export const listarCredenciais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const db = await admin();
    await exigirAdminEquipe(db, context.userId);

    const { data, error } = await db
      .from("automacoes_credenciais")
      .select("id, nome, tipo, created_at")
      .order("nome");
    if (error) throw new Error("Não foi possível carregar as credenciais.");
    return { credenciais: data ?? [] };
  });

export const salvarCredencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => salvarCredencialSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await exigirAdminEquipe(db, context.userId);

    const config = { baseUrl: data.baseUrl, apiKey: data.apiKey, instance: data.instance };

    if (data.id) {
      const { error } = await db
        .from("automacoes_credenciais")
        .update({ nome: data.nome, config })
        .eq("id", data.id);
      if (error) throw new Error("Não foi possível salvar a credencial.");
      return { id: data.id };
    }

    const { data: criado, error } = await db
      .from("automacoes_credenciais")
      .insert({ nome: data.nome, tipo: data.tipo, config, criado_por: context.userId })
      .select("id")
      .single();
    if (error || !criado) throw new Error("Não foi possível criar a credencial.");
    return { id: (criado as { id: string }).id };
  });

export const excluirCredencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await exigirAdminEquipe(db, context.userId);

    const { error } = await db.from("automacoes_credenciais").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir a credencial.");
    return { ok: true };
  });
