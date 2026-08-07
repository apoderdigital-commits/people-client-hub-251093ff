import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Lock, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";
import { supabase } from "@/integrations/supabase/client";
import { useClienteSelecionado } from "@/lib/visao-cliente";
import type { Perfil } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/cliente/metricas/google-ads")({
  head: () => ({
    meta: [
      { title: "Google Ads — people" },
      {
        name: "description",
        content: "Dashboard de métricas do Google Ads.",
      },
    ],
  }),
  component: GoogleAdsPagina,
});

/** types.ts é gerado pelo Lovable e ainda não conhece as colunas de serviços. */
const db = supabase as unknown as SupabaseClient;

function GoogleAdsPagina() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            <VisaoClienteBanner perfil={perfil} />
            <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
              <Link
                to="/cliente/metricas"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-brand"
              >
                <ChevronLeft className="size-4" />
                Voltar
              </Link>

              <Conteudo perfil={perfil} />
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}

function Conteudo({ perfil }: { perfil: Perfil }) {
  const { cliente: selecionado, pronto } = useClienteSelecionado();
  const [contratado, setContratado] = useState<boolean | null>(null);

  const clienteId = perfil.role === "agencia" ? (selecionado?.cliente_id ?? null) : perfil.cliente_id;

  useEffect(() => {
    if (!pronto) return;
    if (!clienteId) {
      setContratado(false);
      return;
    }
    let ativo = true;
    db.from("clientes")
      .select("servico_google_ads")
      .eq("id", clienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) {
          setContratado(
            Boolean((data as { servico_google_ads?: boolean } | null)?.servico_google_ads),
          );
        }
      });
    return () => {
      ativo = false;
    };
  }, [clienteId, pronto]);

  if (contratado === null) return null;

  if (!contratado) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-card-teal">
          <Lock className="size-5 text-brand-foreground" />
        </span>
        <h1 className="mt-3 text-lg font-bold text-ink">
          Google Ads ainda não faz parte do seu plano
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Fale com a sua agência para contratar o Google Ads e liberar esse dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-card-teal">
        <Search className="size-5 text-brand-foreground" />
      </span>
      <h1 className="mt-3 text-lg font-bold text-ink">Dashboard do Google Ads em construção</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Estamos preparando a integração com o Google Ads. Em breve você vai poder acompanhar aqui
        o investimento, cliques e conversões das suas campanhas.
      </p>
    </div>
  );
}
