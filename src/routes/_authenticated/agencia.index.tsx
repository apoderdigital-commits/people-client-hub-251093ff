import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, ClipboardCheck, LayoutGrid, Loader2, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { permissoesEfetivas, podeVer } from "@/lib/equipe";
import { hojeISO } from "@/lib/fluxo";

export const Route = createFileRoute("/_authenticated/agencia/")({
  head: () => ({
    meta: [
      { title: "Área da Agência — people" },
      {
        name: "description",
        content: "O que está pendente pra você hoje: cartões atribuídos e aprovações de clientes.",
      },
      { property: "og:title", content: "Área da Agência — people" },
      {
        property: "og:description",
        content: "Painel interno da agência people: pendências do dia.",
      },
    ],
  }),
  component: AgenciaInicio,
});

/** types.ts é gerado pelo Lovable e ainda não conhece as tabelas do fluxo. */
const db = supabase as unknown as SupabaseClient;

const NOME_COLUNA_REVISAO = "revisão do cliente";

function AgenciaInicio() {
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
              <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
                O que está pendente pra você
              </h1>

              {podeVer(permissoes, "fluxo") ? (
                <Pendencias perfilId={perfil.id} />
              ) : (
                <p className="mt-7 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
                  Sem pendências pra mostrar por aqui no momento.
                </p>
              )}
            </main>
          </div>
        );
      }}
    </ProtectedRoute>
  );
}

type CartaoAtribuido = {
  id: string;
  titulo: string;
  clienteNome: string | null;
  colunaNome: string;
  atrasado: boolean;
  novo: boolean;
  criadoEm: string;
};

type PendenciaAprovacao = { clienteId: string; clienteNome: string; total: number };

function Pendencias({ perfilId }: { perfilId: string }) {
  const [atribuidos, setAtribuidos] = useState<CartaoAtribuido[]>([]);
  const [aprovacoes, setAprovacoes] = useState<PendenciaAprovacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    (async () => {
      const [colunasRes, respRes] = await Promise.all([
        db.from("fluxo_colunas").select("id, nome, ordem").order("ordem"),
        db.from("fluxo_responsaveis").select("cartao_id, created_at").eq("perfil_id", perfilId),
      ]);
      if (!ativo) return;

      const falhaInicial = colunasRes.error ?? respRes.error;
      if (falhaInicial) {
        setErro(falhaInicial.message);
        setCarregando(false);
        return;
      }

      const colunas = (colunasRes.data as { id: string; nome: string; ordem: number }[]) ?? [];
      const ultimaColuna = colunas.length > 0 ? colunas[colunas.length - 1] : null;
      const colunaRevisao = colunas.find(
        (c) => c.nome.trim().toLowerCase() === NOME_COLUNA_REVISAO,
      );

      const vinculos = (respRes.data as { cartao_id: string; created_at?: string }[]) ?? [];
      const cartaoIds = vinculos.map((v) => v.cartao_id);

      const [cartoesRes, clientesRes, revisaoRes] = await Promise.all([
        cartaoIds.length > 0
          ? db
              .from("fluxo_cartoes")
              .select(
                "id, titulo, cliente_id, coluna_id, prazo, entrega_texto, entrega_arte, agendamento, publicacao",
              )
              .in("id", cartaoIds)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        db.from("clientes").select("id, nome"),
        colunaRevisao
          ? db.from("fluxo_cartoes").select("cliente_id").eq("coluna_id", colunaRevisao.id)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      if (!ativo) return;

      if (cartoesRes.error) {
        setErro(cartoesRes.error.message);
        setCarregando(false);
        return;
      }

      const clientesMapa = new Map(
        ((clientesRes.data as { id: string; nome: string }[]) ?? []).map((c) => [c.id, c.nome]),
      );
      const colunasMapa = new Map(colunas.map((c) => [c.id, c.nome]));
      const criadoEmMapa = new Map(vinculos.map((v) => [v.cartao_id, v.created_at ?? ""]));

      const hoje = hojeISO();
      const limiteNovo = new Date();
      limiteNovo.setDate(limiteNovo.getDate() - 3);

      type CartaoBruto = {
        id: string;
        titulo: string;
        cliente_id: string | null;
        coluna_id: string;
        prazo: string | null;
        entrega_texto: string | null;
        entrega_arte: string | null;
        agendamento: string | null;
        publicacao: string | null;
      };

      const lista: CartaoAtribuido[] = ((cartoesRes.data as CartaoBruto[]) ?? []).map((c) => {
        const datas = [c.prazo, c.entrega_texto, c.entrega_arte, c.agendamento, c.publicacao].filter(
          (d): d is string => Boolean(d),
        );
        const atrasado = datas.some((d) => d < hoje) && c.coluna_id !== ultimaColuna?.id;
        const criadoEm = criadoEmMapa.get(c.id) ?? "";
        const novo = Boolean(criadoEm) && new Date(criadoEm) >= limiteNovo;
        return {
          id: c.id,
          titulo: c.titulo,
          clienteNome: c.cliente_id ? (clientesMapa.get(c.cliente_id) ?? null) : null,
          colunaNome: colunasMapa.get(c.coluna_id) ?? "",
          atrasado,
          novo,
          criadoEm,
        };
      });

      lista.sort((a, b) => {
        if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
        return b.criadoEm.localeCompare(a.criadoEm);
      });
      setAtribuidos(lista);

      const contagem = new Map<string, number>();
      for (const linha of (revisaoRes.data as { cliente_id: string | null }[]) ?? []) {
        if (!linha.cliente_id) continue;
        contagem.set(linha.cliente_id, (contagem.get(linha.cliente_id) ?? 0) + 1);
      }
      setAprovacoes(
        Array.from(contagem.entries())
          .map(([clienteId, total]) => ({
            clienteId,
            clienteNome: clientesMapa.get(clienteId) ?? "Cliente",
            total,
          }))
          .sort((a, b) => b.total - a.total),
      );

      setErro(null);
      setCarregando(false);
    })();

    return () => {
      ativo = false;
    };
  }, [perfilId]);

  if (carregando) {
    return (
      <div className="mt-10 grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  if (erro) {
    return <p className="mt-7 text-sm text-destructive">{erro}</p>;
  }

  const semNada = atribuidos.length === 0 && aprovacoes.length === 0;

  return (
    <div className="mt-7 flex flex-col gap-8">
      {semNada ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
          Tudo em dia por aqui.
        </p>
      ) : null}

      {atribuidos.length > 0 ? (
        <section>
          <div className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-ink-muted" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
              Atribuído a você
            </h2>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {atribuidos.slice(0, 8).map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {c.titulo}
                </span>
                {c.clienteNome ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                    {c.clienteNome}
                  </span>
                ) : null}
                <span className="shrink-0 text-[11px] text-ink-muted">{c.colunaNome}</span>
                {c.atrasado ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                    <AlertTriangle className="size-3" />
                    Atrasado
                  </span>
                ) : c.novo ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    <Sparkles className="size-3" />
                    Novo
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <Link
            to="/agencia/fluxo"
            className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Ver Fluxo People
          </Link>
        </section>
      ) : null}

      {aprovacoes.length > 0 ? (
        <section>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-ink-muted" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
              Aguardando aprovação do cliente
            </h2>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {aprovacoes.map((a) => (
              <div
                key={a.clienteId}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {a.clienteNome}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                  {a.total} {a.total === 1 ? "pendente" : "pendentes"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
