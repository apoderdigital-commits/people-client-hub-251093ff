import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PeopleLogo } from "@/components/PeopleLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import type { Perfil } from "@/hooks/use-auth";
import { ehAdminEquipe, permissoesEfetivas, podeVer } from "@/lib/equipe";

const linkBase =
  "rounded-md px-2.5 py-1.5 text-xs font-medium text-shell-foreground/70 transition-colors hover:bg-shell-2 hover:text-shell-foreground sm:text-sm";

export function AppHeader({ perfil }: { perfil: Perfil | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const iniciais = (perfil?.nome || perfil?.email || "?").trim().charAt(0).toUpperCase();
  const equipe = perfil?.role === "agencia";
  const permissoes = permissoesEfetivas(perfil?.equipe_role ?? null, perfil?.permissoes);
  const verEquipe = ehAdminEquipe(perfil?.equipe_role ?? null);
  const verClientes = podeVer(permissoes, "clientes");

  return (
    <header className="bg-shell">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <PeopleLogo />
          {equipe ? (
            <nav className="flex items-center gap-0.5 overflow-x-auto sm:gap-1">
              <Link
                to="/agencia"
                activeOptions={{ exact: true }}
                activeProps={{ className: "bg-shell-2 text-shell-foreground" }}
                className={linkBase}
              >
                Menu
              </Link>
              {verClientes ? (
                <Link
                  to="/agencia/clientes"
                  activeProps={{ className: "bg-shell-2 text-shell-foreground" }}
                  className={linkBase}
                >
                  Clientes
                </Link>
              ) : null}
              {verEquipe ? (
                <Link
                  to="/agencia/equipe"
                  activeProps={{ className: "bg-shell-2 text-shell-foreground" }}
                  className={linkBase}
                >
                  Equipe
                </Link>
              ) : null}
              {verEquipe ? (
                <Link
                  to="/agencia/automacoes"
                  activeProps={{ className: "bg-shell-2 text-shell-foreground" }}
                  className={linkBase}
                >
                  Automações
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>


        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={sair}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-shell-foreground/70 transition-colors hover:bg-shell-2 hover:text-shell-foreground sm:text-sm"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
          <div className="ml-1 flex min-w-0 items-center gap-2 border-l border-shell-foreground/15 pl-2 sm:pl-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
              {iniciais}
            </span>
            <span className="hidden max-w-[160px] truncate text-sm text-shell-foreground/80 sm:inline">
              {perfil?.nome || perfil?.email}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
