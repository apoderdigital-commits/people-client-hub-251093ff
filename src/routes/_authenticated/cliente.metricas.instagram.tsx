import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { KpiCard } from "@/components/KpiCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";
import { supabase } from "@/integrations/supabase/client";
import type { Perfil } from "@/hooks/use-auth";
import { useClienteSelecionado } from "@/lib/visao-cliente";
import { sincronizarMetricasInstagram } from "@/lib/clientes.functions";

export const Route = createFileRoute("/_authenticated/cliente/metricas/instagram")({
  head: () => ({
    meta: [
      { title: "Instagram Business — people" },
      {
        name: "description",
        content: "Alcance, engajamento e crescimento orgânico do seu perfil no Instagram.",
      },
      { property: "og:title", content: "Instagram Business — people" },
      {
        property: "og:description",
        content: "Acompanhe o desempenho orgânico do seu Instagram.",
      },
    ],
  }),
  component: InstagramPage,
});

const num = new Intl.NumberFormat("pt-BR");

type PeriodoId = "7d" | "30d";
const PERIODOS: { id: PeriodoId; label: string; dias: number }[] = [
  { id: "7d", label: "7 dias", dias: 7 },
  { id: "30d", label: "30 dias", dias: 30 },
];

type LinhaInstagram = {
  data: string;
  seguidores: number;
  alcance: number;
  visitas_perfil: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
};

type Publicacao = {
  media_id: string;
  tipo: string;
  legenda: string;
  publicado_em: string;
  alcance: number;
  curtidas: number;
  comentarios: number;
};

/** types.ts é gerado pelo Lovable e ainda não conhece estas tabelas. */
const db = supabase as unknown as SupabaseClient;

function diaCurto(data: string): string {
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function variacao(atual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

/** Janela de N dias terminando ontem — mesmo critério do Meta Ads. */
function intervalo(dias: number): { desde: string; ate: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ate = new Date();
  ate.setDate(ate.getDate() - 1);
  const desde = new Date(ate);
  desde.setDate(ate.getDate() - (dias - 1));
  return { desde: iso(desde), ate: iso(ate) };
}

function janelaAnterior(janela: { desde: string; ate: string }, dias: number): { desde: string; ate: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const novoAte = new Date(`${janela.desde}T12:00:00`);
  novoAte.setDate(novoAte.getDate() - 1);
  const novoDesde = new Date(novoAte);
  novoDesde.setDate(novoAte.getDate() - (dias - 1));
  return { desde: iso(novoDesde), ate: iso(novoAte) };
}

function InstagramPage() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            <VisaoClienteBanner perfil={perfil} />
            <main className="mx-auto w-full max-w-6xl px-4 py-8">
              <Link
                to="/cliente/metricas"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-brand"
              >
                <ChevronLeft className="size-4" />
                Voltar
              </Link>
              <Painel perfil={perfil} />
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}

function Painel({ perfil }: { perfil: Perfil }) {
  const { cliente: selecionado, pronto } = useClienteSelecionado();
  const sincronizar = useServerFn(sincronizarMetricasInstagram);

  const [periodo, setPeriodo] = useState<PeriodoId>("30d");
  const [linhas, setLinhas] = useState<LinhaInstagram[]>([]);
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const clienteId = perfil.role === "agencia" ? (selecionado?.cliente_id ?? null) : perfil.cliente_id;
  const podeSincronizar = perfil.role === "agencia";
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 30;

  const janela = useMemo(() => intervalo(dias), [dias]);
  const janelaAnt = useMemo(() => janelaAnterior(janela, dias), [janela, dias]);

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);

    const [metricas, posts] = await Promise.all([
      db
        .from("metricas_instagram_diarias")
        .select("data, seguidores, alcance, visitas_perfil, curtidas, comentarios, compartilhamentos")
        .eq("cliente_id", clienteId)
        .gte("data", janelaAnt.desde)
        .lte("data", janela.ate)
        .order("data"),
      db
        .from("metricas_instagram_posts")
        .select("media_id, tipo, legenda, publicado_em, alcance, curtidas, comentarios")
        .eq("cliente_id", clienteId)
        .order("publicado_em", { ascending: false })
        .limit(8),
    ]);

    if (metricas.error) setErro(metricas.error.message);
    else {
      setErro(null);
      setLinhas((metricas.data as LinhaInstagram[]) ?? []);
    }
    setPublicacoes((posts.data as Publicacao[]) ?? []);
    setCarregando(false);
  }, [clienteId, janela, janelaAnt]);

  useEffect(() => {
    if (!pronto) return;
    void carregar();
  }, [carregar, pronto]);

  async function puxarDoInstagram() {
    if (!clienteId) return;
    setSincronizando(true);
    setAviso(null);
    setErro(null);
    try {
      const res = await sincronizar({
        data: { clienteId, desde: janela.desde, ate: janela.ate },
      });
      setAviso(
        `${res.dias} dias e ${res.publicacoes} publicações atualizados direto do Instagram.`,
      );
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível sincronizar.");
    }
    setSincronizando(false);
  }

  const { atual, anterior, grafico } = useMemo(() => {
    const daJanela = linhas.filter((l) => l.data >= janela.desde && l.data <= janela.ate);
    const daAnterior = linhas.filter((l) => l.data < janela.desde);

    const somar = (
      ls: LinhaInstagram[],
      chave: "alcance" | "visitas_perfil" | "curtidas" | "comentarios" | "compartilhamentos",
    ) => ls.reduce((acc, d) => acc + d[chave], 0);

    const seguidoresAtual = daJanela.at(-1)?.seguidores ?? 0;
    const seguidoresInicio = daJanela[0]?.seguidores ?? seguidoresAtual;
    const seguidoresAnteriorFim = daAnterior.at(-1)?.seguidores ?? seguidoresInicio;

    const alcance = somar(daJanela, "alcance");
    const visitasPerfil = somar(daJanela, "visitas_perfil");
    const curtidas = somar(daJanela, "curtidas");
    const comentarios = somar(daJanela, "comentarios");
    const compartilhamentos = somar(daJanela, "compartilhamentos");

    const alcanceAnterior = somar(daAnterior, "alcance");
    const visitasAnterior = somar(daAnterior, "visitas_perfil");
    const curtidasAnterior = somar(daAnterior, "curtidas");
    const comentariosAnterior = somar(daAnterior, "comentarios");
    const compartilhamentosAnterior = somar(daAnterior, "compartilhamentos");

    const engajamento = alcance
      ? ((curtidas + comentarios + compartilhamentos) / alcance) * 100
      : 0;
    const engajamentoAnterior = alcanceAnterior
      ? ((curtidasAnterior + comentariosAnterior + compartilhamentosAnterior) / alcanceAnterior) *
        100
      : 0;

    return {
      atual: {
        seguidores: seguidoresAtual,
        alcance,
        visitasPerfil,
        curtidas,
        comentarios,
        engajamento,
      },
      anterior: {
        seguidores: seguidoresAnteriorFim,
        alcance: alcanceAnterior,
        visitasPerfil: visitasAnterior,
        curtidas: curtidasAnterior,
        comentarios: comentariosAnterior,
        engajamento: engajamentoAnterior,
      },
      grafico: daJanela.map((d) => ({
        data: diaCurto(d.data),
        seguidores: d.seguidores,
        alcance: d.alcance,
      })),
    };
  }, [linhas, janela]);

  if (!clienteId) {
    return (
      <p className="mt-8 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
        Sua conta ainda não está vinculada a um cliente. Fale com a agência.
      </p>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Instagram Business</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={
                periodo === p.id
                  ? "rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
              }
            >
              {p.label}
            </button>
          ))}
          {podeSincronizar ? (
            <button
              type="button"
              onClick={() => void puxarDoInstagram()}
              disabled={sincronizando}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar"}
            </button>
          ) : null}
        </div>
      </div>

      {erro ? <p className="mt-4 text-sm text-destructive">{erro}</p> : null}
      {aviso ? <p className="mt-4 text-sm text-success">{aviso}</p> : null}

      {carregando ? (
        <div className="mt-10 grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : linhas.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-ink-muted">
            Nenhuma métrica importada do Instagram para este período.
          </p>
          {podeSincronizar ? (
            <p className="mt-2 text-sm text-ink-muted">
              Configure a conta do Instagram Business em Clientes e use o botão Sincronizar acima.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              rotulo="Seguidores"
              valor={num.format(atual.seguidores)}
              variacao={variacao(atual.seguidores, anterior.seguidores)}
            />
            <KpiCard
              rotulo="Alcance"
              valor={num.format(atual.alcance)}
              variacao={variacao(atual.alcance, anterior.alcance)}
            />
            <KpiCard
              rotulo="Taxa de Engajamento"
              valor={`${atual.engajamento.toFixed(2)}%`}
              variacao={variacao(atual.engajamento, anterior.engajamento)}
            />
            <KpiCard
              rotulo="Visitas ao Perfil"
              valor={num.format(atual.visitasPerfil)}
              variacao={variacao(atual.visitasPerfil, anterior.visitasPerfil)}
            />
            <KpiCard
              rotulo="Curtidas"
              valor={num.format(atual.curtidas)}
              variacao={variacao(atual.curtidas, anterior.curtidas)}
            />
            <KpiCard
              rotulo="Comentários"
              valor={num.format(atual.comentarios)}
              variacao={variacao(atual.comentarios, anterior.comentarios)}
            />
          </div>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Seguidores x Alcance</h2>
            <p className="text-sm text-ink-muted">Evolução diária no período selecionado.</p>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={grafico} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="data"
                    tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }}
                    stroke="var(--color-border)"
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }}
                    stroke="var(--color-border)"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }}
                    stroke="var(--color-border)"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      color: "var(--color-ink)",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="seguidores"
                    name="Seguidores"
                    stroke="var(--color-card-pink)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="alcance"
                    name="Alcance"
                    stroke="var(--color-card-violet)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Publicações recentes</h2>
            {publicacoes.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nenhuma publicação sincronizada ainda.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-muted">
                      <th className="pb-2 font-medium">Legenda</th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Data</th>
                      <th className="pb-2 font-medium">Alcance</th>
                      <th className="pb-2 font-medium">Curtidas</th>
                      <th className="pb-2 font-medium">Comentários</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicacoes.map((p) => (
                      <tr key={p.media_id} className="border-t border-border">
                        <td className="max-w-[240px] truncate py-3 font-medium text-ink">
                          {p.legenda || "—"}
                        </td>
                        <td className="py-3">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                            {p.tipo}
                          </span>
                        </td>
                        <td className="py-3 text-ink">{diaCurto(p.publicado_em.slice(0, 10))}</td>
                        <td className="py-3 text-ink">{num.format(p.alcance)}</td>
                        <td className="py-3 text-ink">{num.format(p.curtidas)}</td>
                        <td className="py-3 text-ink">{num.format(p.comentarios)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
