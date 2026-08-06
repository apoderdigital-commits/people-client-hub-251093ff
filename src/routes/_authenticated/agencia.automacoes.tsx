import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Instagram as InstagramIcon,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ehAdminEquipe } from "@/lib/equipe";
import { executarAutomacaoAgora } from "@/lib/automacoes.functions";

export const Route = createFileRoute("/_authenticated/agencia/automacoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Automações — people" },
      {
        name: "description",
        content: "Monte rotinas automáticas: sincronizar métricas, mover cartões vencidos.",
      },
      { property: "og:title", content: "Automações — people" },
      {
        property: "og:description",
        content: "Automações do time people: gatilhos e ações que rodam sozinhas.",
      },
    ],
  }),
  component: AutomacoesPagina,
});

const db = supabase as unknown as SupabaseClient;

type TipoNo = "gatilho_horario" | "acao_sync_meta" | "acao_sync_instagram" | "acao_cartoes_vencidos";

const TIPOS: Record<
  TipoNo,
  { label: string; grupo: "gatilho" | "acao"; Icone: typeof Clock; icone: string; borda: string }
> = {
  gatilho_horario: {
    label: "Gatilho: Horário",
    grupo: "gatilho",
    Icone: Clock,
    icone: "bg-card-indigo",
    borda: "border-card-indigo/40",
  },
  acao_sync_meta: {
    label: "Sincronizar Meta Ads",
    grupo: "acao",
    Icone: RefreshCw,
    icone: "bg-card-violet",
    borda: "border-card-violet/40",
  },
  acao_sync_instagram: {
    label: "Sincronizar Instagram",
    grupo: "acao",
    Icone: InstagramIcon,
    icone: "bg-card-pink",
    borda: "border-card-pink/40",
  },
  acao_cartoes_vencidos: {
    label: "Mover cartões vencidos",
    grupo: "acao",
    Icone: AlertTriangle,
    icone: "bg-card-amber",
    borda: "border-card-amber/40",
  },
};

type DadosNo = { tipo: TipoNo; hora?: string; onHoraChange?: (id: string, hora: string) => void };

function NoCustomizado({ id, data }: NodeProps) {
  const dados = data as DadosNo;
  const info = TIPOS[dados.tipo];
  return (
    <div className={cn("min-w-[210px] rounded-2xl border-2 bg-card p-3 shadow-card", info.borda)}>
      {info.grupo === "acao" ? (
        <Handle type="target" position={Position.Left} className="!size-2.5 !bg-ink-muted" />
      ) : null}
      <div className="flex items-center gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", info.icone)}>
          <info.Icone className="size-4 text-brand-foreground" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{info.label}</p>
      </div>
      {dados.tipo === "gatilho_horario" ? (
        <input
          type="time"
          value={dados.hora ?? "09:00"}
          onChange={(e) => dados.onHoraChange?.(id, e.target.value)}
          className="nodrag mt-2 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        />
      ) : (
        <p className="mt-1 text-[11px] text-ink-muted">
          {dados.tipo === "acao_sync_meta"
            ? "Todos os clientes com token Meta configurado."
            : dados.tipo === "acao_sync_instagram"
              ? "Todos os clientes com Instagram Business configurado."
              : 'Cartões com prazo vencido, fora de "Concluído"/"Atrasado".'}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!size-2.5 !bg-ink-muted" />
    </div>
  );
}

const NODE_TYPES = { padrao: NoCustomizado };

type Automacao = {
  id: string;
  nome: string;
  ativo: boolean;
  nos: { id: string; tipo: TipoNo; posicao: { x: number; y: number }; config?: { hora?: string } }[];
  conexoes: { origem: string; destino: string }[];
  ultima_execucao: string | null;
};

type Execucao = {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  status: string;
  resultado: Record<string, unknown> | null;
  erro: string | null;
};

function quando(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AutomacoesPagina() {
  return (
    <ProtectedRoute role="agencia">
      {(perfil) => (
        <div className="min-h-screen bg-background">
          <AppHeader perfil={perfil} />
          <main className="w-full py-8">
            <div className="pl-4 pr-4 sm:pl-6">
              <Link
                to="/agencia"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <ArrowLeft className="size-4" />
                Voltar ao menu
              </Link>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card-indigo">
                  <Zap className="size-5 text-brand-foreground" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold text-ink">Automações</h1>
                  <p className="text-sm text-ink-muted">
                    Gatilho de horário + ações que rodam sozinhas todo dia.
                  </p>
                </div>
              </div>
            </div>

            {!ehAdminEquipe(perfil.equipe_role) ? (
              <p className="mx-4 mt-7 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card sm:mx-6">
                Apenas super admin e admin podem acessar Automações.
              </p>
            ) : (
              <Quadro />
            )}
          </main>
        </div>
      )}
    </ProtectedRoute>
  );
}

function Quadro() {
  const executarAgora = useServerFn(executarAutomacaoAgora);

  const [lista, setLista] = useState<Automacao[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);

  const carregarLista = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await db
      .from("automacoes")
      .select("id, nome, ativo, nos, conexoes, ultima_execucao")
      .order("nome");
    if (error) setErro("Não foi possível carregar as automações.");
    else setLista((data as Automacao[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  const atualizarHoraNo = useCallback((id: string, hora: string) => {
    setNodes((atual) =>
      atual.map((n) => (n.id === id ? { ...n, data: { ...n.data, hora } } : n)),
    );
  }, []);

  const carregarNaTela = useCallback(
    (automacao: Automacao | null) => {
      if (!automacao) {
        setNome("");
        setAtivo(true);
        setNodes([]);
        setEdges([]);
        setExecucoes([]);
        return;
      }
      setNome(automacao.nome);
      setAtivo(automacao.ativo);
      setNodes(
        (automacao.nos ?? []).map((n) => ({
          id: n.id,
          type: "padrao",
          position: n.posicao ?? { x: 100, y: 100 },
          data: { tipo: n.tipo, hora: n.config?.hora, onHoraChange: atualizarHoraNo },
        })),
      );
      setEdges(
        (automacao.conexoes ?? []).map((c, i) => ({
          id: `e-${i}-${c.origem}-${c.destino}`,
          source: c.origem,
          target: c.destino,
        })),
      );
    },
    [atualizarHoraNo],
  );

  const carregarExecucoes = useCallback(async (automacaoId: string) => {
    const { data } = await db
      .from("automacoes_execucoes")
      .select("id, iniciado_em, finalizado_em, status, resultado, erro")
      .eq("automacao_id", automacaoId)
      .order("iniciado_em", { ascending: false })
      .limit(10);
    setExecucoes((data as Execucao[]) ?? []);
  }, []);

  function selecionar(automacao: Automacao) {
    setSelecionadaId(automacao.id);
    carregarNaTela(automacao);
    void carregarExecucoes(automacao.id);
    setAviso(null);
    setErro(null);
  }

  function novaAutomacao() {
    setSelecionadaId(null);
    carregarNaTela(null);
    setAviso(null);
    setErro(null);
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conexao: Connection) => setEdges((eds) => addEdge(conexao, eds)),
    [],
  );

  function adicionarNo(tipo: TipoNo) {
    if (tipo === "gatilho_horario" && nodes.some((n) => (n.data as DadosNo).tipo === "gatilho_horario")) {
      setErro("Só é permitido um gatilho de horário por automação.");
      return;
    }
    const id = `no-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const indice = nodes.length;
    setNodes((atual) => [
      ...atual,
      {
        id,
        type: "padrao",
        position: { x: 80 + (indice % 3) * 260, y: 80 + Math.floor(indice / 3) * 140 },
        data: { tipo, hora: tipo === "gatilho_horario" ? "09:00" : undefined, onHoraChange: atualizarHoraNo },
      },
    ]);
  }

  async function salvar() {
    if (!nome.trim()) {
      setErro("Dê um nome pra automação.");
      return;
    }
    if (!nodes.some((n) => (n.data as DadosNo).tipo === "gatilho_horario")) {
      setErro('Adicione o nó "Gatilho: Horário" — sem ele, nada dispara.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setAviso(null);

    const nos = nodes.map((n) => ({
      id: n.id,
      tipo: (n.data as DadosNo).tipo,
      posicao: n.position,
      config: (n.data as DadosNo).tipo === "gatilho_horario" ? { hora: (n.data as DadosNo).hora ?? "09:00" } : {},
    }));
    const conexoes = edges.map((e) => ({ origem: e.source, destino: e.target }));

    if (selecionadaId) {
      const { error } = await db
        .from("automacoes")
        .update({ nome: nome.trim(), ativo, nos, conexoes })
        .eq("id", selecionadaId);
      if (error) setErro("Não foi possível salvar.");
      else setAviso("Salvo.");
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("automacoes")
        .insert({ nome: nome.trim(), ativo, nos, conexoes, criado_por: user?.id ?? null })
        .select("id")
        .single();
      if (error || !data) setErro("Não foi possível criar.");
      else {
        setSelecionadaId((data as { id: string }).id);
        setAviso("Automação criada.");
      }
    }
    await carregarLista();
    setSalvando(false);
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir essa automação?")) return;
    const { error } = await db.from("automacoes").delete().eq("id", id);
    if (error) return setErro("Não foi possível excluir.");
    if (selecionadaId === id) novaAutomacao();
    await carregarLista();
  }

  async function testarAgora() {
    if (!selecionadaId) return;
    setTestando(true);
    setErro(null);
    setAviso(null);
    try {
      await executarAgora({ data: { automacaoId: selecionadaId } });
      setAviso("Executado. Veja o resultado no histórico abaixo.");
      await carregarExecucoes(selecionadaId);
      await carregarLista();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível executar.");
    }
    setTestando(false);
  }

  const gruposPaleta = useMemo(
    () => ({
      gatilho: (Object.keys(TIPOS) as TipoNo[]).filter((t) => TIPOS[t].grupo === "gatilho"),
      acao: (Object.keys(TIPOS) as TipoNo[]).filter((t) => TIPOS[t].grupo === "acao"),
    }),
    [],
  );

  if (carregando) {
    return (
      <div className="mt-10 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4 px-4 sm:px-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64">
        <button
          type="button"
          onClick={novaAutomacao}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          Nova automação
        </button>
        <div className="mt-3 flex flex-col gap-1.5">
          {lista.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selecionar(a)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                selecionadaId === a.id
                  ? "border-brand bg-brand/10 text-ink"
                  : "border-border bg-card text-ink-muted hover:border-brand/40",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", a.ativo ? "bg-success" : "bg-ink-muted")}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{a.nome}</span>
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-muted">
                última: {quando(a.ultima_execucao)}
              </span>
            </button>
          ))}
          {lista.length === 0 ? (
            <p className="px-1 py-2 text-xs text-ink-muted">Nenhuma automação ainda.</p>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da automação"
            className="min-w-[220px] flex-1 rounded-xl border border-input bg-card px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand"
          />
          <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Ativa
          </label>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Salvar
          </button>
          {selecionadaId ? (
            <>
              <button
                type="button"
                onClick={() => void testarAgora()}
                disabled={testando}
                className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
              >
                {testando ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Testar agora
              </button>
              <button
                type="button"
                onClick={() => void excluir(selecionadaId)}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                Excluir
              </button>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-ink-muted">Adicionar:</span>
          {gruposPaleta.gatilho.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => adicionarNo(t)}
              className="inline-flex items-center gap-1 rounded-full border border-card-indigo/40 bg-card-indigo/10 px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-card-indigo/20"
            >
              + {TIPOS[t].label}
            </button>
          ))}
          {gruposPaleta.acao.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => adicionarNo(t)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-brand hover:text-ink"
            >
              + {TIPOS[t].label}
            </button>
          ))}
        </div>

        {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
        {aviso ? <p className="mt-2 text-sm text-success">{aviso}</p> : null}

        <div className="mt-3 h-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {selecionadaId ? (
          <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card">
            <h2 className="text-sm font-bold text-ink">Histórico de execuções</h2>
            {execucoes.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Ainda não rodou.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {execucoes.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide",
                          e.status === "sucesso"
                            ? "bg-success/15 text-success"
                            : e.status === "erro"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-muted text-ink-muted",
                        )}
                      >
                        {e.status}
                      </span>
                      <span className="text-ink-muted">{quando(e.iniciado_em)}</span>
                    </div>
                    {e.erro ? <p className="mt-1 text-destructive">{e.erro}</p> : null}
                    {e.resultado ? (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-ink-muted">
                        {JSON.stringify(e.resultado)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
