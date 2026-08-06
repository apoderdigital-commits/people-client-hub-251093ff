import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AutomacaoEditor } from "@/components/AutomacaoCanvas";
import { ehAdminEquipe } from "@/lib/equipe";

export const Route = createFileRoute("/_authenticated/agencia/automacoes/$automacaoId")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Automações — people" }],
  }),
  component: AutomacaoEditorPagina,
});

function AutomacaoEditorPagina() {
  const { automacaoId } = Route.useParams();
  return (
    <ProtectedRoute role="agencia">
      {(perfil) =>
        !ehAdminEquipe(perfil.equipe_role) ? (
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            <main className="mx-auto w-full max-w-4xl px-4 py-10">
              <p className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
                Apenas super admin e admin podem acessar Automações.
              </p>
            </main>
          </div>
        ) : (
          <AutomacaoEditor perfil={perfil} automacaoId={automacaoId === "novo" ? null : automacaoId} />
        )
      }
    </ProtectedRoute>
  );
}
