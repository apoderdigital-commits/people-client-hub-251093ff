import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronRight, ClipboardCheck, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";
import { listarAprovacoesPendentes } from "@/lib/aprovacao.functions";
import { useClienteSelecionado } from "@/lib/visao-cliente";
import type { Perfil } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/cliente/")({
  head: () => ({
    meta: [
      { title: "Área do Cliente — people" },
      {
        name: "description",
        content: "O que está pendente pra você hoje: aprovações, métricas e mais.",
      },
      { property: "og:title", content: "Área do Cliente — people" },
      {
        property: "og:description",
        content: "Portal do Cliente people: acompanhe campanhas e resultados.",
      },
    ],
  }),
  component: ClienteInicio,
});

type CartaoAprovacao = { id: string; titulo: string; prazo: string | null };

function ClienteInicio() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            <VisaoClienteBanner perfil={perfil} />
            <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
              <p className="text-sm text-ink-muted">
                Bem-vindo(a) de volta, {(perfil.nome || perfil.email).split(" ")[0]}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
                O que está pendente pra você
              </h1>

              <Pendencias perfil={perfil} />
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}

function Pendencias({ perfil }: { perfil: Perfil }) {
  const { cliente: selecionado, pronto } = useClienteSelecionado();
  const listar = useServerFn(listarAprovacoesPendentes);
  const [cartoes, setCartoes] = useState<CartaoAprovacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const clienteId = perfil.role === "agencia" ? (selecionado?.cliente_id ?? null) : perfil.cliente_id;
  const clienteIdParaServidor = perfil.role === "agencia" ? (clienteId ?? undefined) : undefined;

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const res = await listar({ data: { clienteId: clienteIdParaServidor } });
      setCartoes(res.cartoes as CartaoAprovacao[]);
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar.");
    }
    setCarregando(false);
  }, [listar, clienteId, clienteIdParaServidor]);

  useEffect(() => {
    if (!pronto) return;
    void carregar();
  }, [carregar, pronto]);

  if (!clienteId) return null;

  return (
    <div className="mt-7">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-ink-muted" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          Aguardando sua aprovação
        </h2>
      </div>

      {erro ? <p className="mt-3 text-sm text-destructive">{erro}</p> : null}

      {carregando ? (
        <div className="mt-6 grid place-items-center py-6">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : cartoes.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
          Nada pendente por aqui. Tudo certo!
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {cartoes.slice(0, 3).map((cartao) => (
            <div
              key={cartao.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {cartao.titulo}
              </span>
              {cartao.prazo ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted">
                  <CalendarDays className="size-3.5" />
                  {new Date(`${cartao.prazo}T12:00:00`).toLocaleDateString("pt-BR")}
                </span>
              ) : null}
            </div>
          ))}
          <Link
            to="/cliente/aprovacoes"
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            Ver {cartoes.length > 3 ? `todas as ${cartoes.length} aprovações` : "aprovações"} pendentes
            <ChevronRight className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
