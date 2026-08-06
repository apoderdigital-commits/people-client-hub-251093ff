import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { KpiCard } from "@/components/KpiCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VisaoClienteBanner, VisaoClienteGate } from "@/components/VisaoCliente";
import { POSTAGENS_RECENTES, SERIE_INSTAGRAM } from "@/mocks/instagram";

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
              <Painel />
            </main>
          </div>
        </VisaoClienteGate>
      )}
    </ProtectedRoute>
  );
}

type Chave =
  | "alcance"
  | "impressoes"
  | "curtidas"
  | "comentarios"
  | "compartilhamentos"
  | "visitas_perfil";

function Painel() {
  const [periodo, setPeriodo] = useState<PeriodoId>("30d");
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 30;

  const { atual, anterior, grafico } = useMemo(() => {
    const janela = SERIE_INSTAGRAM.slice(-dias);
    const anteriorJanela = SERIE_INSTAGRAM.slice(-dias * 2, -dias);

    const somar = (linhas: typeof janela, chave: Chave) =>
      linhas.reduce((acc, d) => acc + d[chave], 0);

    const seguidoresAtual = janela.at(-1)?.seguidores ?? 0;
    const seguidoresInicio = janela[0]?.seguidores ?? seguidoresAtual;
    const seguidoresAnteriorFim = anteriorJanela.at(-1)?.seguidores ?? seguidoresInicio;

    const alcance = somar(janela, "alcance");
    const impressoes = somar(janela, "impressoes");
    const curtidas = somar(janela, "curtidas");
    const comentarios = somar(janela, "comentarios");
    const compartilhamentos = somar(janela, "compartilhamentos");
    const visitasPerfil = somar(janela, "visitas_perfil");

    const alcanceAnterior = somar(anteriorJanela, "alcance");
    const impressoesAnterior = somar(anteriorJanela, "impressoes");
    const curtidasAnterior = somar(anteriorJanela, "curtidas");
    const comentariosAnterior = somar(anteriorJanela, "comentarios");
    const compartilhamentosAnterior = somar(anteriorJanela, "compartilhamentos");
    const visitasAnterior = somar(anteriorJanela, "visitas_perfil");

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
        impressoes,
        curtidas,
        comentarios,
        visitasPerfil,
        engajamento,
      },
      anterior: {
        seguidores: seguidoresAnteriorFim,
        alcance: alcanceAnterior,
        impressoes: impressoesAnterior,
        curtidas: curtidasAnterior,
        comentarios: comentariosAnterior,
        visitasPerfil: visitasAnterior,
        engajamento: engajamentoAnterior,
      },
      grafico: janela.map((d) => ({
        data: diaCurto(d.data),
        seguidores: d.seguidores,
        alcance: d.alcance,
      })),
    };
  }, [dias]);

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
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Dados de exemplo — a sincronização automática via Instagram Graph API entra em breve.
      </p>

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
          rotulo="Impressões"
          valor={num.format(atual.impressoes)}
          variacao={variacao(atual.impressoes, anterior.impressoes)}
        />
        <KpiCard
          rotulo="Taxa de Engajamento"
          valor={`${atual.engajamento.toFixed(2)}%`}
          variacao={variacao(atual.engajamento, anterior.engajamento)}
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
        <KpiCard
          rotulo="Visitas ao Perfil"
          valor={num.format(atual.visitasPerfil)}
          variacao={variacao(atual.visitasPerfil, anterior.visitasPerfil)}
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
              {POSTAGENS_RECENTES.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="max-w-[240px] truncate py-3 font-medium text-ink">
                    {p.legenda}
                  </td>
                  <td className="py-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                      {p.tipo}
                    </span>
                  </td>
                  <td className="py-3 text-ink">{diaCurto(p.data)}</td>
                  <td className="py-3 text-ink">{num.format(p.alcance)}</td>
                  <td className="py-3 text-ink">{num.format(p.curtidas)}</td>
                  <td className="py-3 text-ink">{num.format(p.comentarios)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
