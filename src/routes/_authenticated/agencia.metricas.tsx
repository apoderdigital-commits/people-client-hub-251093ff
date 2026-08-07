import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SeletorDeCliente } from "@/components/SeletorDeCliente";

export const Route = createFileRoute("/_authenticated/agencia/metricas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard de Métricas — people" },
      {
        name: "description",
        content: "Escolha um cliente people e abra o dashboard de métricas dele direto.",
      },
      { property: "og:title", content: "Dashboard de Métricas — people" },
      {
        property: "og:description",
        content: "Atalho para abrir o dashboard de métricas de qualquer cliente people.",
      },
    ],
  }),
  component: SelecionarClienteMetricas,
});

function SelecionarClienteMetricas() {
  return (
    <ProtectedRoute role="agencia">
      {(perfil) => (
        <div className="min-h-screen bg-background">
          <AppHeader perfil={perfil} />
          <main className="mx-auto w-full max-w-[720px] px-4 py-8 sm:py-12">
            <Link
              to="/agencia"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              Voltar ao menu
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card-violet">
                <BarChart3 className="size-5 text-brand-foreground" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-ink">Dashboard de Métricas</h1>
                <p className="text-sm text-ink-muted">
                  Escolha a empresa para abrir direto o dashboard de métricas dela.
                </p>
              </div>
            </div>

            <SeletorDeCliente destino="/cliente/metricas" />
          </main>
        </div>
      )}
    </ProtectedRoute>
  );
}
