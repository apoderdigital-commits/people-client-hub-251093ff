import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MenuCard } from "@/components/MenuCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ehAdminEquipe, permissoesEfetivas, podeVer } from "@/lib/equipe";

export const Route = createFileRoute("/_authenticated/agencia/")({
  head: () => ({
    meta: [
      { title: "Área da Agência — people" },
      {
        name: "description",
        content: "Painel interno da agência people: configure clientes e acompanhe as contas.",
      },
      { property: "og:title", content: "Área da Agência — people" },
      {
        property: "og:description",
        content: "Painel interno da agência people: configuração de clientes e gestão de contas.",
      },
    ],
  }),
  component: AgenciaMenu,
});

function AgenciaMenu() {
  return (
    <ProtectedRoute role="agencia">
      {(perfil) => {
        const permissoes = permissoesEfetivas(perfil.equipe_role, perfil.permissoes);
        return (
        <div className="min-h-screen bg-background">
          <AppHeader perfil={perfil} />
          <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
            <p className="text-sm text-ink-muted">
              Olá, {(perfil.nome || perfil.email).split(" ")[0]}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Área da Agência</h1>

            <div className="mt-7 flex flex-col gap-4">
              {podeVer(permissoes, "clientes") ? (
                <MenuCard
                  titulo="Configurar Clientes"
                  descricao="Cadastre e ajuste as contas dos clientes, defina o identificador de cliente e o nível de acesso."
                  icone={Users}
                  cor="violet"
                  badge="Ativo"
                  to="/agencia/clientes"
                />
              ) : null}
              {podeVer(permissoes, "area_cliente") ? (
                <MenuCard
                  titulo="Área do Cliente"
                  descricao="Selecione um cliente e abra o portal dele para ver o menu e o dashboard de métricas."
                  icone={LayoutDashboard}
                  cor="indigo"
                  badge="Ativo"
                  to="/agencia/visualizar"
                />
              ) : null}
              {podeVer(permissoes, "fluxo") ? (
                <MenuCard
                  titulo="Fluxo People"
                  descricao="Quadro de produção do time: acompanhe cada peça da criação até a campanha no ar."
                  icone={LayoutGrid}
                  cor="amber"
                  badge="Ativo"
                  to="/agencia/fluxo"
                />
              ) : null}
              {ehAdminEquipe(perfil.equipe_role) ? (
                <MenuCard
                  titulo="Equipe"
                  descricao="Configure credenciais, níveis de acesso e permissões por aba do time people."
                  icone={ShieldCheck}
                  cor="teal"
                  badge="Ativo"
                  to="/agencia/equipe"
                />
              ) : null}
              {ehAdminEquipe(perfil.equipe_role) ? (
                <MenuCard
                  titulo="Automações"
                  descricao="Monte rotinas com gatilhos e ações que rodam sozinhas, sem precisar clicar em nada."
                  icone={Zap}
                  cor="pink"
                  badge="Ativo"
                  to="/agencia/automacoes"
                />
              ) : null}



              <MenuCard
                comingSoon
                titulo="Campanhas"
                descricao="Gerencie campanhas e verbas de todos os clientes da carteira."
                icone={Megaphone}
                cor="pink"
              />
              <MenuCard
                comingSoon
                titulo="Métricas Consolidadas"
                descricao="Visão agregada de performance de toda a base de clientes."
                icone={BarChart3}
                cor="teal"
              />
              <MenuCard
                comingSoon
                titulo="Relatórios Internos"
                descricao="Relatórios operacionais e entregáveis do time."
                icone={FileText}
                cor="amber"
              />
            </div>
          </main>
        </div>
        );
      }}
    </ProtectedRoute>

  );
}
