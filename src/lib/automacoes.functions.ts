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
