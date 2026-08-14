import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PeopleLogo } from "@/components/PeopleLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import type { Perfil } from "@/hooks/use-auth";

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

  return (
    <header className="bg-shell">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <Link to={equipe ? "/agencia" : "/cliente"}>
            <PeopleLogo />
          </Link>
        </div>


        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            to={equipe ? "/agencia/menu" : "/cliente/menu"}
            title="Abrir menu"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-shell-foreground/70 transition-colors hover:bg-shell-2 hover:text-shell-foreground sm:text-sm"
          >
            <Menu className="size-4" />
            <span className="hidden sm:inline">Abrir menu</span>
          </Link>
          {equipe ? (
            <Link
              to="/agencia/visualizar"
              title="Área do Cliente"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-shell-foreground/70 transition-colors hover:bg-shell-2 hover:text-shell-foreground sm:text-sm"
            >
              <LayoutDashboard className="size-4" />
              <span className="hidden sm:inline">Área do Cliente</span>
            </Link>
          ) : null}
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
