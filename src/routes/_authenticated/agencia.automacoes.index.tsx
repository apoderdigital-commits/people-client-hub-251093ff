import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Plus, Zap } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ehAdminEquipe } from "@/lib/equipe";

export const Route = createFileRoute("/_authenticated/agencia/automacoes/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Automações — people" },
      {
        name: "description",
        content: "Gatilhos e ações que rodam sozinhas: horário, cartões do Fluxo, WhatsApp.",
      },
    ],
  }),
  component: AutomacoesLista,
});

const db = supabase as unknown as SupabaseClient;

type Automacao = { id: string; nome: string; ativo: boolean; ultima_execucao: string | null };

function quando(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AutomacoesLista() {
  return (
    <ProtectedRoute role="agencia">
      {(perfil) => (
        <div className="min-h-screen bg-background">
          <AppHeader perfil={perfil} />
          <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
            <Link
              to="/agencia"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              Voltar ao menu
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card-pink">
                <Zap className="size-5 text-brand-foreground" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-ink">Automações</h1>
                <p className="text-sm text-ink-muted">Rotinas que rodam sozinhas, sem precisar clicar em nada.</p>
              </div>
            </div>

            {!ehAdminEquipe(perfil.equipe_role) ? (
              <p className="mt-7 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
                Apenas super admin e admin podem acessar Automações.
              </p>
            ) : (
              <Lista />
            )}
          </main>
        </div>
      )}
    </ProtectedRoute>
  );
}

function Lista() {
  const [lista, setLista] = useState<Automacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    db.from("automacoes")
      .select("id, nome, ativo, ultima_execucao")
      .order("nome")
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro("Não foi possível carregar as automações.");
        else setLista((data as Automacao[]) ?? []);
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="mt-7">
      <Link
        to="/agencia/automacoes/$automacaoId"
        params={{ automacaoId: "novo" }}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
      >
        <Plus className="size-4" />
        Nova automação
      </Link>

      {erro ? <p className="mt-4 text-sm text-destructive">{erro}</p> : null}

      {carregando ? (
        <div className="mt-8 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : lista.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-ink-muted">Nenhuma automação criada ainda.</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          {lista.map((a) => (
            <Link
              key={a.id}
              to="/agencia/automacoes/$automacaoId"
              params={{ automacaoId: a.id }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-card transition-colors hover:border-brand/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", a.ativo ? "bg-success" : "bg-ink-muted")} />
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{a.nome}</span>
              </div>
              <span className="shrink-0 text-xs text-ink-muted">última: {quando(a.ultima_execucao)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
