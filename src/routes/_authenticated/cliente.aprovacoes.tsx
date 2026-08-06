import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronLeft, FileText, Loader2, XCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";
import { listarAprovacoesPendentes, responderAprovacao } from "@/lib/aprovacao.functions";

export const Route = createFileRoute("/_authenticated/cliente/aprovacoes")({
  head: () => ({
    meta: [
      { title: "Aprovação de Conteúdos — people" },
      {
        name: "description",
        content: "Aprove ou peça ajustes nos conteúdos preparados para você.",
      },
      { property: "og:title", content: "Aprovação de Conteúdos — people" },
      {
        property: "og:description",
        content: "Revise e aprove os conteúdos da sua conta antes de irem ao ar.",
      },
    ],
  }),
  component: AprovacoesPage,
});

type CartaoAprovacao = {
  id: string;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
};

type Anexo = { id: string; cartao_id: string; nome: string; url: string };

function ehImagem(nome: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(nome);
}

function AprovacoesPage() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            <VisaoClienteBanner perfil={perfil} />
            <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
              <Link
                to="/cliente"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-brand"
              >
                <ChevronLeft className="size-4" />
                Voltar
              </Link>
              <Painel />
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}

function Painel() {
  const listar = useServerFn(listarAprovacoesPendentes);
  const [cartoes, setCartoes] = useState<CartaoAprovacao[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await listar({ data: {} });
      setCartoes(res.cartoes as CartaoAprovacao[]);
      setAnexos(res.anexos as Anexo[]);
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar.");
    }
    setCarregando(false);
  }, [listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function remover(id: string) {
    setCartoes((atual) => atual.filter((c) => c.id !== id));
  }

  return (
    <>
      <h1 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">Aprovação de Conteúdos</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Revise o que a equipe preparou e aprove ou peça ajustes.
      </p>

      {erro ? <p className="mt-4 text-sm text-destructive">{erro}</p> : null}

      {carregando ? (
        <div className="mt-10 grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : cartoes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-ink-muted">
            Nenhum conteúdo aguardando sua aprovação no momento.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {cartoes.map((cartao) => (
            <CartaoAprovacaoCard
              key={cartao.id}
              cartao={cartao}
              anexos={anexos.filter((a) => a.cartao_id === cartao.id)}
              onRespondido={() => remover(cartao.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CartaoAprovacaoCard({
  cartao,
  anexos,
  onRespondido,
}: {
  cartao: CartaoAprovacao;
  anexos: Anexo[];
  onRespondido: () => void;
}) {
  const responder = useServerFn(responderAprovacao);
  const [enviando, setEnviando] = useState<"aprovado" | "reprovado" | null>(null);
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(decisao: "aprovado" | "reprovado") {
    setEnviando(decisao);
    setErro(null);
    try {
      await responder({
        data: { cartaoId: cartao.id, decisao, motivo: motivo.trim() || undefined },
      });
      onRespondido();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar sua resposta.");
      setEnviando(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="text-base font-bold text-ink">{cartao.titulo}</h2>
      {cartao.descricao ? (
        <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{cartao.descricao}</p>
      ) : null}
      {cartao.prazo ? (
        <p className="mt-2 text-xs text-ink-muted">
          Prazo: {new Date(`${cartao.prazo}T12:00:00`).toLocaleDateString("pt-BR")}
        </p>
      ) : null}

      {anexos.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {anexos.map((a) =>
            ehImagem(a.nome) ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block size-28 overflow-hidden rounded-xl border border-border"
              >
                <img src={a.url} alt={a.nome} className="size-full object-cover" />
              </a>
            ) : (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-28 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted px-2 text-center"
              >
                <FileText className="size-6 text-ink-muted" />
                <span className="line-clamp-2 text-[10px] text-ink-muted">{a.nome}</span>
              </a>
            ),
          )}
        </div>
      ) : null}

      {reprovando ? (
        <div className="mt-4">
          <label className="block">
            <span className="text-xs font-medium text-ink-muted">
              O que precisa ajustar? (opcional, ajuda a equipe)
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
              placeholder="Ex.: trocar a cor do fundo, ajustar o texto..."
            />
          </label>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!reprovando ? (
          <>
            <button
              type="button"
              onClick={() => void enviar("aprovado")}
              disabled={enviando !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {enviando === "aprovado" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => setReprovando(true)}
              disabled={enviando !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-destructive hover:text-destructive disabled:opacity-60"
            >
              <XCircle className="size-4" />
              Pedir ajuste
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void enviar("reprovado")}
              disabled={enviando !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {enviando === "reprovado" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => {
                setReprovando(false);
                setMotivo("");
              }}
              disabled={enviando !== null}
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
    </div>
  );
}
