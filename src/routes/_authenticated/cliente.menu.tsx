import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, ClipboardCheck, FileText, MessageCircle, Wallet } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MenuCard } from "@/components/MenuCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";

export const Route = createFileRoute("/_authenticated/cliente/menu")({
  head: () => ({
    meta: [
      { title: "Menu — people" },
      {
        name: "description",
        content: "Escolha o que analisar hoje: métricas, aprovações, relatórios, financeiro e suporte.",
      },
      { property: "og:title", content: "Menu — people" },
      {
        property: "og:description",
        content: "Portal do Cliente people: acompanhe campanhas e resultados.",
      },
    ],
  }),
  component: ClienteMenu,
});

function ClienteMenu() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
        <div className="min-h-screen bg-background">
          <AppHeader perfil={perfil} />
          <VisaoClienteBanner perfil={perfil} />
          <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
            <p className="text-sm text-ink-muted">Menu</p>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
              O que vamos analisar hoje?
            </h1>

            <div className="mt-7 flex flex-col gap-4">
              <MenuCard
                titulo="Dashboard de Métricas"
                descricao="Acompanhe os resultados das suas campanhas e o desempenho do seu investimento em tempo real."
                icone={BarChart3}
                cor="violet"
                badge="Ativo"
                to="/cliente/metricas"
              />
              <MenuCard
                titulo="Aprovação de Conteúdos"
                descricao="Revise os conteúdos preparados pela equipe e aprove ou peça ajustes."
                icone={ClipboardCheck}
                cor="pink"
                badge="Ativo"
                to="/cliente/aprovacoes"
              />
              <MenuCard
                comingSoon
                titulo="Relatórios"
                descricao="Baixe relatórios consolidados de performance por período."
                icone={FileText}
                cor="teal"
              />
              <MenuCard
                comingSoon
                titulo="Financeiro"
                descricao="Consulte faturas, investimentos e comprovantes."
                icone={Wallet}
                cor="amber"
              />
              <MenuCard
                comingSoon
                titulo="Suporte"
                descricao="Fale com o time responsável pela sua conta."
                icone={MessageCircle}
                cor="indigo"
              />
            </div>
          </main>
        </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}
