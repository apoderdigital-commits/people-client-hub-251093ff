import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, FileDown, ImageDown, Loader2, RefreshCw } from "lucide-react";
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
import { sincronizarMetricasGA4 } from "@/lib/integracoes-google.functions";
import { baixarComoPng } from "@/lib/exportar-relatorio";
import { agruparCanal, CANAIS, type CanalId } from "@/lib/metricas-ga4";
import { intervalo, janelaAnterior, variacao, PERIODOS, type Janela, type PeriodoId } from "@/lib/metricas";

export const Route = createFileRoute("/_authenticated/cliente/metricas/ga4")({
  head: () => ({
    meta: [
      { title: "Google Analytics (GA4) — people" },
      {
        name: "description",
        content: "Sessões do seu site por canal: Meta, Google Ads, orgânico e outras origens.",
      },
      { property: "og:title", content: "Google Analytics (GA4) — people" },
      {
        property: "og:description",
        content: "Acompanhe de onde vem o tráfego do seu site.",
      },
    ],
  }),
  component: Ga4Pagina,
});

const num = new Intl.NumberFormat("pt-BR");

/** types.ts é gerado pelo Lovable e ainda não conhece as tabelas do GA4. */
const db = supabase as unknown as SupabaseClient;

type LinhaDiaria = {
  data: string;
  sessoes: number;
  usuarios: number;
  novos_usuarios: number;
  taxa_engajamento: number;
  duracao_media_sessao: number;
};

type LinhaCanal = { data: string; canal: string; fonte: string; sessoes: number };

type Totais = {
  sessoes: number;
  usuarios: number;
  novosUsuarios: number;
  meta: number;
  googleAds: number;
  organico: number;
  outros: number;
};

function diaCurto(data: string): string {
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function Ga4Pagina() {
  return (
    <ProtectedRoute role="cliente">
      {(perfil) => (
        <VisaoClienteGate perfil={perfil}>
          <div className="min-h-screen bg-background">
            <div className="no-print">
              <AppHeader perfil={perfil} />
              <VisaoClienteBanner perfil={perfil} />
            </div>
            <main className="mx-auto w-full max-w-6xl px-4 py-8">
              <Link
                to="/cliente/metricas"
                className="no-print inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-brand"
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
  const sincronizar = useServerFn(sincronizarMetricasGA4);
  const relatorioRef = useRef<HTMLDivElement>(null);

  const [periodo, setPeriodo] = useState<PeriodoId>("30d");
  const [personalizado, setPersonalizado] = useState<Janela>(() => intervalo("30d"));
  const [diarias, setDiarias] = useState<LinhaDiaria[]>([]);
  const [canais, setCanais] = useState<LinhaCanal[]>([]);
  const [contratado, setContratado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [exportandoPng, setExportandoPng] = useState(false);

  const clienteId = perfil.role === "agencia" ? (selecionado?.cliente_id ?? null) : perfil.cliente_id;
  const podeSincronizar = perfil.role === "agencia";

  const janela = useMemo(() => intervalo(periodo, personalizado), [periodo, personalizado]);
  const anterior = useMemo(() => janelaAnterior(janela), [janela]);

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);

    const [diariasRes, canaisRes, clienteRes] = await Promise.all([
      db
        .from("metricas_ga4")
        .select("data, sessoes, usuarios, novos_usuarios, taxa_engajamento, duracao_media_sessao")
        .eq("cliente_id", clienteId)
        .gte("data", anterior.desde)
        .lte("data", janela.ate),
      db
        .from("metricas_ga4_canais")
        .select("data, canal, fonte, sessoes")
        .eq("cliente_id", clienteId)
        .gte("data", anterior.desde)
        .lte("data", janela.ate),
      db.from("clientes").select("servico_ga4").eq("id", clienteId).maybeSingle(),
    ]);

    if (diariasRes.error) setErro(diariasRes.error.message);
    else {
      setErro(null);
      setDiarias((diariasRes.data as LinhaDiaria[]) ?? []);
    }
    setCanais((canaisRes.data as LinhaCanal[]) ?? []);
    setContratado(
      Boolean((clienteRes.data as { servico_ga4?: boolean } | null)?.servico_ga4),
    );

    setCarregando(false);
  }, [clienteId, janela, anterior]);

  useEffect(() => {
    if (!pronto) return;
    void carregar();
  }, [carregar, pronto]);

  async function exportarPng() {
    if (!relatorioRef.current) return;
    setExportandoPng(true);
    try {
      await baixarComoPng(relatorioRef.current, `ga4-${clienteId ?? "relatorio"}-${janela.desde}-a-${janela.ate}`);
    } finally {
      setExportandoPng(false);
    }
  }

  async function puxarDoGA4() {
    if (!clienteId) return;
    setSincronizando(true);
    setAviso(null);
    setErro(null);
    try {
      const res = await sincronizar({ data: { clienteId, desde: janela.desde, ate: janela.ate } });
      setAviso(`${res.dias} dias de métricas atualizados direto do GA4.`);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível sincronizar.");
    }
    setSincronizando(false);
  }

  const { atual, anteriorTotais, grafico, canalGrafico } = useMemo(() => {
    const daJanela = diarias.filter((l) => l.data >= janela.desde && l.data <= janela.ate);
    const daAnteriorLinhas = diarias.filter((l) => l.data < janela.desde);
    const canalDaJanela = canais.filter((l) => l.data >= janela.desde && l.data <= janela.ate);
    const canalDaAnterior = canais.filter((l) => l.data < janela.desde);

    function somarDiarias(ls: LinhaDiaria[]): Omit<Totais, "meta" | "googleAds" | "organico" | "outros"> {
      return ls.reduce(
        (acc, l) => ({
          sessoes: acc.sessoes + l.sessoes,
          usuarios: acc.usuarios + l.usuarios,
          novosUsuarios: acc.novosUsuarios + l.novos_usuarios,
        }),
        { sessoes: 0, usuarios: 0, novosUsuarios: 0 },
      );
    }

    function somarCanais(ls: LinhaCanal[]): Record<CanalId, number> {
      const base: Record<CanalId, number> = { meta: 0, google_ads: 0, organico: 0, outros: 0 };
      for (const l of ls) base[agruparCanal(l.fonte, l.canal)] += l.sessoes;
      return base;
    }

    const canalAtual = somarCanais(canalDaJanela);
    const canalAnterior = somarCanais(canalDaAnterior);

    const atualCalc: Totais = {
      ...somarDiarias(daJanela),
      meta: canalAtual.meta,
      googleAds: canalAtual.google_ads,
      organico: canalAtual.organico,
      outros: canalAtual.outros,
    };
    const anteriorCalc: Totais = {
      ...somarDiarias(daAnteriorLinhas),
      meta: canalAnterior.meta,
      googleAds: canalAnterior.google_ads,
      organico: canalAnterior.organico,
      outros: canalAnterior.outros,
    };

    const graficoLinhas = daJanela
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((l) => ({ data: diaCurto(l.data), sessoes: l.sessoes }));

    const canalGraficoLinhas = CANAIS.map((c) => ({
      canal: c.label,
      sessoes: canalAtual[c.id],
    }));

    return {
      atual: atualCalc,
      anteriorTotais: anteriorCalc,
      grafico: graficoLinhas,
      canalGrafico: canalGraficoLinhas,
    };
  }, [diarias, canais, janela]);

  if (!clienteId) {
    return (
      <p className="mt-8 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
        Sua conta ainda não está vinculada a um cliente. Fale com a agência.
      </p>
    );
  }

  if (contratado === false) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <h1 className="text-lg font-bold text-ink">Google Analytics (GA4) ainda não faz parte do seu plano</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Fale com a sua agência para contratar o GA4 e liberar esse dashboard.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="no-print mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Google Analytics (GA4)</h1>
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
              onClick={() => void puxarDoGA4()}
              disabled={sincronizando}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <FileDown className="size-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => void exportarPng()}
            disabled={exportandoPng}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-60"
          >
            {exportandoPng ? <Loader2 className="size-3.5 animate-spin" /> : <ImageDown className="size-3.5" />}
            PNG
          </button>
        </div>
      </div>

      {periodo === "personalizado" ? (
        <div className="no-print mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card px-4 py-3">
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
        </div>
      ) : null}

      {erro ? <p className="no-print mt-4 text-sm text-destructive">{erro}</p> : null}
      {aviso ? <p className="no-print mt-4 text-sm text-success">{aviso}</p> : null}

      {carregando ? (
        <div className="mt-10 grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : diarias.length === 0 && canais.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-ink-muted">Nenhuma métrica importada para este período.</p>
          {podeSincronizar ? (
            <p className="mt-2 text-sm text-ink-muted">
              Use o botão Sincronizar acima para puxar os dados do GA4.
            </p>
          ) : null}
        </div>
      ) : (
        <div ref={relatorioRef}>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              rotulo="Sessões total"
              valor={num.format(atual.sessoes)}
              variacao={variacao(atual.sessoes, anteriorTotais.sessoes)}
            />
            <KpiCard
              rotulo="Sessões Meta"
              valor={num.format(atual.meta)}
              variacao={variacao(atual.meta, anteriorTotais.meta)}
            />
            <KpiCard
              rotulo="Sessões Google Ads"
              valor={num.format(atual.googleAds)}
              variacao={variacao(atual.googleAds, anteriorTotais.googleAds)}
            />
            <KpiCard
              rotulo="Sessões orgânicas"
              valor={num.format(atual.organico)}
              variacao={variacao(atual.organico, anteriorTotais.organico)}
            />
            <KpiCard
              rotulo="Outros canais"
              valor={num.format(atual.outros)}
              variacao={variacao(atual.outros, anteriorTotais.outros)}
            />
            <KpiCard
              rotulo="Usuários"
              valor={num.format(atual.usuarios)}
              variacao={variacao(atual.usuarios, anteriorTotais.usuarios)}
            />
            <KpiCard
              rotulo="Novos usuários"
              valor={num.format(atual.novosUsuarios)}
              variacao={variacao(atual.novosUsuarios, anteriorTotais.novosUsuarios)}
            />
          </div>

          <section className="card-relatorio mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Sessões ao longo do tempo</h2>
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
                  <Line
                    type="monotone"
                    dataKey="sessoes"
                    name="Sessões"
                    stroke="var(--color-brand)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card-relatorio mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Sessões por canal</h2>
            <p className="text-sm text-ink-muted">Total do período selecionado, por origem do tráfego.</p>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={canalGrafico} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="canal"
                    tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }}
                    stroke="var(--color-border)"
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
                  <Bar dataKey="sessoes" name="Sessões" fill="var(--color-brand)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
