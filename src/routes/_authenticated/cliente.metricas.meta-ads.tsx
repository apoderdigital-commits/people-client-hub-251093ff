import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
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
import { sincronizarMetricasMeta } from "@/lib/clientes.functions";
import {
  campanhasDe,
  intervalo,
  janelaAnterior,
  lerMetricasConfig,
  porCampanha,
  porDia,
  porDiaDaSemana,
  porMes,
  totais,
  variacao,
  METRICAS,
  PERIODOS,
  type Campanha,
  type Janela,
  type LinhaCampanha,
  type MetricaId,
  type PeriodoId,
} from "@/lib/metricas";

export const Route = createFileRoute("/_authenticated/cliente/metricas/meta-ads")({
  head: () => ({
    meta: [
      { title: "Meta Ads — people" },
      {
        name: "description",
        content:
          "Investimento, impressões, cliques, CTR, CPC, leads, CPL e conversões das suas campanhas.",
      },
      { property: "og:title", content: "Meta Ads — people" },
      {
        property: "og:description",
        content: "Acompanhe em tempo real o desempenho do seu investimento em mídia.",
      },
    ],
  }),
  component: MetricasPage,
});

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");

const COLUNAS =
  "campanha_id, campanha_nome, status, data, investimento, impressoes, cliques, leads, conversoes, acoes, " +
  "video_p25, video_p50, video_p75, video_p95, video_p100, alcance, cliques_unicos, cliques_link, " +
  "cliques_link_unicos, cliques_saida, video_thruplay, video_15s, video_continuo_2s, video_tempo_medio, reconhecimento_est";

/** types.ts é gerado pelo Lovable e ainda não conhece as tabelas novas. */
const db = supabase as unknown as SupabaseClient;

type Config = {
  nome: string;
  metricas: MetricaId[];
  acao_lead: string | null;
  acao_conversao: string | null;
};

function formatar(valor: number, formato: "brl" | "num" | "pct" | "dec"): string {
  if (formato === "brl") return brl.format(valor);
  if (formato === "pct") return `${valor.toFixed(2)}%`;
  if (formato === "dec") return valor.toFixed(2);
  return num.format(valor);
}

function diaCurto(data: string): string {
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function MetricasPage() {
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
  const sincronizar = useServerFn(sincronizarMetricasMeta);

  const [periodo, setPeriodo] = useState<PeriodoId>("30d");
  const [personalizado, setPersonalizado] = useState<Janela>(() => intervalo("30d"));
  const [linhas, setLinhas] = useState<LinhaCampanha[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<string[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const clienteId = perfil.role === "agencia" ? (selecionado?.cliente_id ?? null) : perfil.cliente_id;
  const podeSincronizar = perfil.role === "agencia";

  const janela = useMemo(
    () => intervalo(periodo, personalizado),
    [periodo, personalizado],
  );

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const anterior = janelaAnterior(janela);

    const [metricas, cliente] = await Promise.all([
      db
        .from("metricas_campanhas")
        .select(COLUNAS)
        .eq("cliente_id", clienteId)
        .gte("data", anterior.desde)
        .lte("data", janela.ate),
      db
        .from("clientes")
        .select("nome, metricas_kpis, acao_lead, acao_conversao")
        .eq("id", clienteId)
        .maybeSingle(),
    ]);

    if (metricas.error) setErro(metricas.error.message);
    else {
      setErro(null);
      setLinhas((metricas.data as LinhaCampanha[]) ?? []);
    }

    const c = cliente.data as {
      nome?: string;
      metricas_kpis?: unknown;
      acao_lead?: string | null;
      acao_conversao?: string | null;
    } | null;
    setConfig({
      nome: c?.nome ?? "",
      metricas: lerMetricasConfig(c?.metricas_kpis),
      acao_lead: c?.acao_lead ?? null,
      acao_conversao: c?.acao_conversao ?? null,
    });

    setCarregando(false);
  }, [clienteId, janela]);

  useEffect(() => {
    if (!pronto) return;
    void carregar();
  }, [carregar, pronto]);

  async function puxarDaMeta() {
    if (!clienteId) return;
    setSincronizando(true);
    setAviso(null);
    setErro(null);
    try {
      const res = await sincronizar({
        data: { clienteId, desde: janela.desde, ate: janela.ate },
      });
      setAviso(
        `${res.dias} dias e ${res.campanhas} campanhas atualizados direto da Meta.`,
      );
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível sincronizar.");
    }
    setSincronizando(false);
  }

  const acaoLead = config?.acao_lead ?? null;
  const acaoConversao = config?.acao_conversao ?? null;

  const { campanhas, atual, anterior, grafico, tabela } = useMemo(() => {
    const daJanela = linhas.filter((l) => l.data >= janela.desde && l.data <= janela.ate);
    const daAnterior = linhas.filter((l) => l.data < janela.desde);
    const filtrar = (ls: LinhaCampanha[]) =>
      selecionadas === null ? ls : ls.filter((l) => selecionadas.includes(l.campanha_id));

    const filtradas = filtrar(daJanela);
    return {
      campanhas: campanhasDe(daJanela),
      atual: totais(filtradas, acaoLead, acaoConversao),
      anterior: totais(filtrar(daAnterior), acaoLead, acaoConversao),
      grafico: porDia(filtradas, acaoLead).map((d) => ({ ...d, data: diaCurto(d.data) })),
      tabela: porCampanha(filtradas, acaoLead),
    };
  }, [linhas, janela, selecionadas, acaoLead, acaoConversao]);

  if (!clienteId) {
    return (
      <p className="mt-8 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
        Sua conta ainda não está vinculada a um cliente. Fale com a agência.
      </p>
    );
  }

  const kpis = config?.metricas ?? [];

  return (
    <>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Meta Ads</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <FiltroCampanhas
            campanhas={campanhas}
            selecionadas={selecionadas}
            onChange={setSelecionadas}
          />
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
              onClick={() => void puxarDaMeta()}
              disabled={sincronizando}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar"}
            </button>
          ) : null}
        </div>
      </div>

      {periodo === "personalizado" ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <label className="text-xs font-medium text-ink-muted">
            De
            <input
              type="date"
              value={personalizado.desde}
              max={personalizado.ate}
              onChange={(e) => setPersonalizado((j) => ({ ...j, desde: e.target.value }))}
              className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Até
            <input
              type="date"
              value={personalizado.ate}
              min={personalizado.desde}
              onChange={(e) => setPersonalizado((j) => ({ ...j, ate: e.target.value }))}
              className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
          </label>
          {podeSincronizar ? (
            <p className="text-xs text-ink-muted">
              Escolha o intervalo e clique em Sincronizar para puxar exatamente esse período.
            </p>
          ) : null}
        </div>
      ) : null}

      {erro ? <p className="mt-4 text-sm text-destructive">{erro}</p> : null}
      {aviso ? <p className="mt-4 text-sm text-success">{aviso}</p> : null}

      {carregando ? (
        <div className="mt-10 grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : linhas.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-ink-muted">
            Nenhuma métrica importada para este período.
          </p>
          {podeSincronizar ? (
            <p className="mt-2 text-sm text-ink-muted">
              Use o botão Sincronizar acima para puxar os dados da Meta.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((id) => {
              const meta = METRICAS.find((m) => m.id === id);
              if (!meta) return null;
              return (
                <KpiCard
                  key={id}
                  rotulo={meta.label}
                  valor={formatar(atual[id], meta.formato)}
                  variacao={variacao(atual[id], anterior[id])}
                  inverso={meta.inverso ?? false}
                />
              );
            })}
          </div>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Leads x Investimento</h2>
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
                    dataKey="leads"
                    name="Leads"
                    stroke="var(--color-brand)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="investimento"
                    name="Investimento (R$)"
                    stroke="var(--color-card-violet)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Campanhas</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-2 font-medium">Nome</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Investimento</th>
                    <th className="pb-2 font-medium">Leads</th>
                    <th className="pb-2 font-medium">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {tabela.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-3 font-medium text-ink">{c.nome}</td>
                      <td className="py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                          {c.status || "—"}
                        </span>
                      </td>
                      <td className="py-3 text-ink">{brl.format(c.investimento)}</td>
                      <td className="py-3 text-ink">{num.format(c.leads)}</td>
                      <td className="py-3 text-ink">
                        {brl.format(c.leads ? c.investimento / c.leads : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <SegmentacaoDashboard clienteId={clienteId} linhas={linhas} />

          <p className="mt-4 text-xs text-ink-muted">
            Período: {diaCurto(janela.desde)} a {diaCurto(janela.ate)}.
            {periodo === "7d" || periodo === "30d"
              ? " Presets terminam ontem, como no Gerenciador de Anúncios."
              : ""}
          </p>
        </>
      )}
    </>
  );
}

type Segmento = { valor: string; investimento: number; impressoes: number; cliques: number; leads: number };
type SegmentacaoDb = Segmento & { data: string };

const DIMENSOES_SEGMENTACAO: { id: string; label: string; fonteBanco: boolean }[] = [
  { id: "dia_semana", label: "Dia da semana", fonteBanco: false },
  { id: "mes", label: "Mês", fonteBanco: false },
  { id: "idade", label: "Idade", fonteBanco: true },
  { id: "genero", label: "Gênero", fonteBanco: true },
  { id: "plataforma", label: "Plataforma", fonteBanco: true },
  { id: "posicionamento", label: "Posicionamento", fonteBanco: true },
  { id: "dispositivo", label: "Dispositivo", fonteBanco: true },
  { id: "regiao", label: "Região", fonteBanco: true },
  { id: "hora", label: "Hora do dia", fonteBanco: true },
];

/**
 * Dia da semana e mês vêm dos dados diários já sincronizados (sem chamada
 * nova à Meta). As demais dimensões dependem de `metricas_campanhas_segmentadas`,
 * gravada só na sincronização manual — mostra o snapshot mais recente.
 */
function SegmentacaoDashboard({ clienteId, linhas }: { clienteId: string; linhas: LinhaCampanha[] }) {
  const [dimensao, setDimensao] = useState("dia_semana");
  const [segmentado, setSegmentado] = useState<Segmento[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const atual = DIMENSOES_SEGMENTACAO.find((d) => d.id === dimensao);
    if (!atual?.fonteBanco) return;
    let ativo = true;
    setCarregando(true);
    db.from("metricas_campanhas_segmentadas")
      .select("valor, investimento, impressoes, cliques, leads, data")
      .eq("cliente_id", clienteId)
      .eq("dimensao", dimensao)
      .order("data", { ascending: false })
      .then(({ data }) => {
        if (!ativo) return;
        const linhasDb = (data as SegmentacaoDb[]) ?? [];
        const maisRecente = linhasDb[0]?.data;
        const filtradas = linhasDb.filter((l) => l.data === maisRecente);
        setSegmentado(
          filtradas.map((l) => ({
            valor: l.valor,
            investimento: l.investimento,
            impressoes: l.impressoes,
            cliques: l.cliques,
            leads: l.leads,
          })),
        );
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [clienteId, dimensao]);

  const dados = useMemo(() => {
    if (dimensao === "dia_semana") {
      return porDiaDaSemana(linhas).map((d) => ({ valor: d.rotulo, investimento: Math.round(d.investimento) }));
    }
    if (dimensao === "mes") {
      return porMes(linhas).map((d) => ({ valor: d.rotulo, investimento: Math.round(d.investimento) }));
    }
    return segmentado
      .map((s) => ({ valor: s.valor, investimento: Math.round(s.investimento) }))
      .sort((a, b) => b.investimento - a.investimento)
      .slice(0, 12);
  }, [dimensao, linhas, segmentado]);

  const semDados = dimensao !== "dia_semana" && dimensao !== "mes" && segmentado.length === 0;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="text-base font-bold text-ink">Segmentações</h2>
      <p className="text-sm text-ink-muted">Investimento por segmento no período.</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {DIMENSOES_SEGMENTACAO.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDimensao(d.id)}
            className={
              dimensao === d.id
                ? "rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                : "rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
            }
          >
            {d.label}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="mt-6 grid place-items-center py-8">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : semDados ? (
        <p className="mt-4 rounded-xl border border-border bg-background px-4 py-6 text-center text-sm text-ink-muted">
          Sem dados dessa segmentação ainda — use Sincronizar (ela roda junto com a Meta Ads).
        </p>
      ) : (
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 24, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="valor"
                tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                stroke="var(--color-border)"
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }} stroke="var(--color-border)" />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-card)",
                  color: "var(--color-ink)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="investimento" name="Investimento (R$)" fill="var(--color-brand)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/** Menu de campanhas: nenhuma seleção explícita significa "todas". */
function FiltroCampanhas({
  campanhas,
  selecionadas,
  onChange,
}: {
  campanhas: Campanha[];
  selecionadas: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const rotulo = (() => {
    if (selecionadas === null || selecionadas.length === campanhas.length) {
      return "Todas as campanhas";
    }
    if (selecionadas.length === 0) return "Nenhuma campanha";
    if (selecionadas.length === 1) {
      return campanhas.find((c) => c.id === selecionadas[0])?.nome ?? "1 campanha";
    }
    return `${selecionadas.length} campanhas`;
  })();

  function alternar(id: string) {
    const base = selecionadas ?? campanhas.map((c) => c.id);
    const nova = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange(nova);
  }

  if (campanhas.length === 0) return null;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand"
      >
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-muted" />
      </button>

      {aberto ? (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-card-hover">
          <div className="flex items-center justify-between px-2 pb-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-ink-muted hover:text-ink"
            >
              Limpar
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {campanhas.map((c) => {
              const marcada = selecionadas === null || selecionadas.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => alternar(c.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className={
                      marcada
                        ? "mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-brand bg-brand"
                        : "mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-input"
                    }
                  >
                    {marcada ? <Check className="size-3 text-brand-foreground" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{c.nome}</span>
                    {c.status ? (
                      <span className="block truncate text-[11px] text-ink-muted">{c.status}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
