import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
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
import { sincronizarMetricasInstagram } from "@/lib/clientes.functions";
import {
  lerMetricasInstagramConfig,
  METRICAS_INSTAGRAM,
  type MetricaInstagramId,
} from "@/lib/metricas-instagram";

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
  contas_engajadas: number;
  visualizacoes: number;
  cliques_site: number;
  cliques_ligar: number;
  cliques_email: number;
  cliques_rota: number;
};

type Publicacao = {
  media_id: string;
  tipo: string;
  legenda: string;
  publicado_em: string;
  alcance: number;
  curtidas: number;
  comentarios: number;
  salvamentos: number;
  interacoes_totais: number;
  reproducoes: number;
  tempo_medio_exibicao: number;
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
  const [kpis, setKpis] = useState<MetricaInstagramId[]>([]);
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

    const [metricas, posts, cliente] = await Promise.all([
      db
        .from("metricas_instagram_diarias")
        .select(
          "data, seguidores, alcance, visitas_perfil, curtidas, comentarios, compartilhamentos, " +
            "contas_engajadas, visualizacoes, cliques_site, cliques_ligar, cliques_email, cliques_rota",
        )
        .eq("cliente_id", clienteId)
        .gte("data", janelaAnt.desde)
        .lte("data", janela.ate)
        .order("data"),
      db
        .from("metricas_instagram_posts")
        .select(
          "media_id, tipo, legenda, publicado_em, alcance, curtidas, comentarios, salvamentos, interacoes_totais, reproducoes, tempo_medio_exibicao",
        )
        .eq("cliente_id", clienteId)
        .order("publicado_em", { ascending: false })
        .limit(8),
      db.from("clientes").select("instagram_kpis").eq("id", clienteId).maybeSingle(),
    ]);

    if (metricas.error) setErro(metricas.error.message);
    else {
      setErro(null);
      setLinhas((metricas.data as LinhaInstagram[]) ?? []);
    }
    setPublicacoes((posts.data as Publicacao[]) ?? []);
    setKpis(
      lerMetricasInstagramConfig(
        (cliente.data as { instagram_kpis?: unknown } | null)?.instagram_kpis,
      ),
    );
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
      chave:
        | "alcance"
        | "visitas_perfil"
        | "curtidas"
        | "comentarios"
        | "compartilhamentos"
        | "contas_engajadas"
        | "visualizacoes"
        | "cliques_site"
        | "cliques_ligar"
        | "cliques_email"
        | "cliques_rota",
    ) => ls.reduce((acc, d) => acc + d[chave], 0);

    const seguidoresAtual = daJanela.at(-1)?.seguidores ?? 0;
    const seguidoresInicio = daJanela[0]?.seguidores ?? seguidoresAtual;
    const seguidoresAnteriorFim = daAnterior.at(-1)?.seguidores ?? seguidoresInicio;

    const alcance = somar(daJanela, "alcance");
    const curtidas = somar(daJanela, "curtidas");
    const comentarios = somar(daJanela, "comentarios");
    const compartilhamentos = somar(daJanela, "compartilhamentos");
    const alcanceAnterior = somar(daAnterior, "alcance");
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
        visitas_perfil: somar(daJanela, "visitas_perfil"),
        curtidas,
        comentarios,
        engajamento,
        contas_engajadas: somar(daJanela, "contas_engajadas"),
        visualizacoes: somar(daJanela, "visualizacoes"),
        cliques_site: somar(daJanela, "cliques_site"),
        cliques_ligar: somar(daJanela, "cliques_ligar"),
        cliques_email: somar(daJanela, "cliques_email"),
        cliques_rota: somar(daJanela, "cliques_rota"),
      } as Record<MetricaInstagramId, number>,
      anterior: {
        seguidores: seguidoresAnteriorFim,
        alcance: alcanceAnterior,
        visitas_perfil: somar(daAnterior, "visitas_perfil"),
        curtidas: curtidasAnterior,
        comentarios: comentariosAnterior,
        engajamento: engajamentoAnterior,
        contas_engajadas: somar(daAnterior, "contas_engajadas"),
        visualizacoes: somar(daAnterior, "visualizacoes"),
        cliques_site: somar(daAnterior, "cliques_site"),
        cliques_ligar: somar(daAnterior, "cliques_ligar"),
        cliques_email: somar(daAnterior, "cliques_email"),
        cliques_rota: somar(daAnterior, "cliques_rota"),
      } as Record<MetricaInstagramId, number>,
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
            {kpis.map((id) => {
              const meta = METRICAS_INSTAGRAM.find((m) => m.id === id);
              if (!meta) return null;
              const valor = atual[id];
              return (
                <KpiCard
                  key={id}
                  rotulo={meta.label}
                  valor={meta.formato === "pct" ? `${valor.toFixed(2)}%` : num.format(valor)}
                  variacao={variacao(valor, anterior[id])}
                />
              );
            })}
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
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-muted">
                      <th className="pb-2 font-medium">Legenda</th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Data</th>
                      <th className="pb-2 font-medium">Alcance</th>
                      <th className="pb-2 font-medium">Curtidas</th>
                      <th className="pb-2 font-medium">Comentários</th>
                      <th className="pb-2 font-medium">Salvamentos</th>
                      <th className="pb-2 font-medium">Interações</th>
                      <th className="pb-2 font-medium">Reproduções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicacoes.map((p) => (
                      <tr key={p.media_id} className="border-t border-border">
                        <td className="max-w-[200px] truncate py-3 font-medium text-ink">
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
                        <td className="py-3 text-ink">{num.format(p.salvamentos)}</td>
                        <td className="py-3 text-ink">{num.format(p.interacoes_totais)}</td>
                        <td className="py-3 text-ink">
                          {p.tipo === "Reels" ? num.format(p.reproducoes) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <AudienciaInstagram clienteId={clienteId} />
        </>
      )}
    </>
  );
}

type ValorDemografia = { valor: string; quantidade: number };
type Demografia = { genero: ValorDemografia[]; idade: ValorDemografia[]; cidade: ValorDemografia[]; pais: ValorDemografia[] };

const ABAS_DEMOGRAFIA: { id: keyof Demografia; label: string }[] = [
  { id: "genero", label: "Gênero" },
  { id: "idade", label: "Faixa etária" },
  { id: "cidade", label: "Cidades" },
  { id: "pais", label: "Países" },
];

/**
 * Demografia e horários ativos: dados de melhor esforço, gravados só na
 * sincronização manual (a API muda com frequência nessa parte e nem toda
 * conta libera o dado) — se estiver vazio, é porque a Meta não devolveu nada
 * ainda pra essa conta, não um erro.
 */
function AudienciaInstagram({ clienteId }: { clienteId: string }) {
  const [aba, setAba] = useState<keyof Demografia>("genero");
  const [demografia, setDemografia] = useState<Demografia>({ genero: [], idade: [], cidade: [], pais: [] });
  const [horarios, setHorarios] = useState<{ hora: number; quantidade: number }[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      db.from("metricas_instagram_demografia").select("dimensao, valor, quantidade").eq("cliente_id", clienteId),
      db.from("metricas_instagram_horarios").select("hora, quantidade").eq("cliente_id", clienteId).order("hora"),
    ]).then(([demoRes, horaRes]) => {
      if (!ativo) return;
      const agrupado: Demografia = { genero: [], idade: [], cidade: [], pais: [] };
      for (const linha of (demoRes.data as { dimensao: string; valor: string; quantidade: number }[]) ?? []) {
        if (linha.dimensao in agrupado) {
          agrupado[linha.dimensao as keyof Demografia].push({ valor: linha.valor, quantidade: linha.quantidade });
        }
      }
      for (const chave of Object.keys(agrupado) as (keyof Demografia)[]) {
        agrupado[chave].sort((a, b) => b.quantidade - a.quantidade);
      }
      setDemografia(agrupado);
      setHorarios((horaRes.data as { hora: number; quantidade: number }[]) ?? []);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [clienteId]);

  const dadosAba = demografia[aba].slice(0, 10);
  const dadosHorarios = horarios.map((h) => ({ hora: `${String(h.hora).padStart(2, "0")}h`, quantidade: h.quantidade }));

  if (carregando) {
    return (
      <div className="mt-6 grid place-items-center py-6">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <>
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-bold text-ink">Demografia da audiência</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ABAS_DEMOGRAFIA.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={
                aba === a.id
                  ? "rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                  : "rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
              }
            >
              {a.label}
            </button>
          ))}
        </div>
        {dadosAba.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-background px-4 py-6 text-center text-sm text-ink-muted">
            Sem dados de demografia ainda — use Sincronizar (nem toda conta tem esse dado liberado pela Meta).
          </p>
        ) : (
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosAba} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }} stroke="var(--color-border)" />
                <YAxis
                  type="category"
                  dataKey="valor"
                  width={90}
                  tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
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
                <Bar dataKey="quantidade" name="Seguidores" fill="var(--color-card-pink)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-bold text-ink">Horários mais ativos dos seguidores</h2>
        <p className="text-sm text-ink-muted">Melhores horários pra postar, por hora do dia.</p>
        {dadosHorarios.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-background px-4 py-6 text-center text-sm text-ink-muted">
            Sem esse dado ainda — use Sincronizar.
          </p>
        ) : (
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosHorarios} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="hora" tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} stroke="var(--color-border)" />
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
                <Bar dataKey="quantidade" name="Seguidores online" fill="var(--color-card-violet)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </>
  );
}
