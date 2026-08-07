import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Instagram, Lock, Megaphone, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { MenuCard } from "@/components/MenuCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";
import { supabase } from "@/integrations/supabase/client";
import { useClienteSelecionado } from "@/lib/visao-cliente";
import type { Perfil } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/cliente/metricas/")({
  head: () => ({
    meta: [
      { title: "Dashboard de Métricas — people" },
      {
        name: "description",
        content: "Escolha a origem que você quer analisar: Meta Ads ou Instagram Business.",
      },
      { property: "og:title", content: "Dashboard de Métricas — people" },
      {
        property: "og:description",
        content: "Acompanhe o desempenho pago e orgânico das suas redes.",
      },
    ],
  }),
  component: MetricasMenu,
});

/** types.ts é gerado pelo Lovable e ainda não conhece as colunas de serviços. */
const db = supabase as unknown as SupabaseClient;

function MetricasMenu() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            <VisaoClienteBanner perfil={perfil} />
            <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
              <Link
                to="/cliente"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-brand"
              >
                <ChevronLeft className="size-4" />
                Voltar
              </Link>

              <h1 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">
                Dashboard de Métricas
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Escolha a origem que você quer analisar.
              </p>

              <Menu perfil={perfil} />
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}

function Menu({ perfil }: { perfil: Perfil }) {
  const { cliente: selecionado, pronto } = useClienteSelecionado();
  const [googleAdsContratado, setGoogleAdsContratado] = useState(false);

  const clienteId = perfil.role === "agencia" ? (selecionado?.cliente_id ?? null) : perfil.cliente_id;

  useEffect(() => {
    if (!pronto || !clienteId) return;
    let ativo = true;
    db.from("clientes")
      .select("servico_google_ads")
      .eq("id", clienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) {
          setGoogleAdsContratado(
            Boolean((data as { servico_google_ads?: boolean } | null)?.servico_google_ads),
          );
        }
      });
    return () => {
      ativo = false;
    };
  }, [clienteId, pronto]);

  return (
    <div className="mt-7 flex flex-col gap-4">
      <MenuCard
        titulo="Meta Ads"
        descricao="Investimento, leads e desempenho das suas campanhas pagas no Facebook e Instagram."
        icone={Megaphone}
        cor="violet"
        badge="Ativo"
        to="/cliente/metricas/meta-ads"
      />
      <MenuCard
        titulo="Instagram Business"
        descricao="Alcance, engajamento e crescimento orgânico do seu perfil no Instagram."
        icone={Instagram}
        cor="pink"
        badge="Ativo"
        to="/cliente/metricas/instagram"
      />
      {googleAdsContratado ? (
        <MenuCard
          titulo="Google Ads"
          descricao="Investimento, cliques e conversões das suas campanhas de pesquisa e display no Google."
          icone={Search}
          cor="teal"
          badge="Ativo"
          to="/cliente/metricas/google-ads"
        />
      ) : (
        <CardGoogleAdsBloqueado />
      )}
    </div>
  );
}

function CardGoogleAdsBloqueado() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="relative block w-full rounded-2xl border border-card-teal/30 bg-card p-5 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-card-teal">
            <Search className="size-6 text-brand-foreground" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-ink">Google Ads</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <Lock className="size-3" />
                Bloqueado
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
              Investimento, cliques e conversões das suas campanhas de pesquisa e display no
              Google.
            </p>
          </div>
        </div>
      </button>

      {aberto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-card-hover"
          >
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-card-teal">
              <Lock className="size-5 text-brand-foreground" />
            </span>
            <h3 className="mt-3 text-base font-bold text-ink">
              Google Ads ainda não faz parte do seu plano
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Leve seu tráfego pago também para o Google: pesquisa, display e muito mais. Fale
              com a sua agência para contratar o Google Ads e liberar esse dashboard.
            </p>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              Entendi
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
