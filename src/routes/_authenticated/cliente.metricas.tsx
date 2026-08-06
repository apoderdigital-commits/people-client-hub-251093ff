import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Instagram, Megaphone } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MenuCard } from "@/components/MenuCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";

export const Route = createFileRoute("/_authenticated/cliente/metricas")({
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
              </div>
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}
