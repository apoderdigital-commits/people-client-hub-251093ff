import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleHelp,
  Clock,
  FilePlus2,
  GitBranch,
  Instagram as InstagramIcon,
  Loader2,
  MessageCircle,
  MoveRight,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  executarAutomacaoAgora,
  listarCredenciais,
  salvarCredencial,
} from "@/lib/automacoes.functions";
import type { Perfil } from "@/hooks/use-auth";

const db = supabase as unknown as SupabaseClient;

export type TipoNo =
  | "gatilho_horario"
  | "gatilho_cartao_criado"
  | "gatilho_cartao_movido"
  | "logica_se"
  | "acao_sync_meta"
  | "acao_sync_instagram"
  | "acao_cartoes_vencidos"
  | "acao_mover_cartao"
  | "acao_criar_cartao"
  | "acao_whatsapp";

const TIPOS: Record<
  TipoNo,
  { label: string; grupo: "gatilho" | "logica" | "acao"; Icone: typeof Clock; icone: string; borda: string }
> = {
  gatilho_horario: {
    label: "Gatilho: Horário",
    grupo: "gatilho",
    Icone: Clock,
    icone: "bg-card-indigo",
    borda: "border-card-indigo/40",
  },
  gatilho_cartao_criado: {
    label: "Gatilho: Cartão criado",
    grupo: "gatilho",
    Icone: FilePlus2,
    icone: "bg-card-indigo",
    borda: "border-card-indigo/40",
  },
  gatilho_cartao_movido: {
    label: "Gatilho: Cartão movido",
    grupo: "gatilho",
    Icone: MoveRight,
    icone: "bg-card-indigo",
    borda: "border-card-indigo/40",
  },
  logica_se: {
    label: "Lógica: SE",
    grupo: "logica",
    Icone: GitBranch,
    icone: "bg-card-teal",
    borda: "border-card-teal/40",
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
  acao_mover_cartao: {
    label: "Mover cartão",
    grupo: "acao",
    Icone: MoveRight,
    icone: "bg-card-amber",
    borda: "border-card-amber/40",
  },
  acao_criar_cartao: {
    label: "Criar cartão",
    grupo: "acao",
    Icone: FilePlus2,
    icone: "bg-card-amber",
    borda: "border-card-amber/40",
  },
  acao_whatsapp: {
    label: "Enviar WhatsApp",
    grupo: "acao",
    Icone: MessageCircle,
    icone: "bg-card-pink",
    borda: "border-card-pink/40",
  },
};

type DadosNo = { tipo: TipoNo; config: Record<string, unknown>; resumo: string };

function resumoDoNo(tipo: TipoNo, config: Record<string, unknown>, colunas: Coluna[]): string {
  const nomeColuna = (id: unknown) => colunas.find((c) => c.id === id)?.nome ?? "?";
  switch (tipo) {
    case "gatilho_horario":
      return (config["hora"] as string) ?? "09:00";
    case "gatilho_cartao_movido":
      return config["colunaDestino"] ? `entra em "${nomeColuna(config["colunaDestino"])}"` : "configure a coluna";
    case "gatilho_cartao_criado":
      return "qualquer cartão novo";
    case "logica_se":
      return config["campo"] ? `${config["campo"]} ${config["operador"] ?? "igual"} "${config["valor"] ?? ""}"` : "configure a condição";
    case "acao_mover_cartao":
      return config["colunaDestino"] ? `para "${nomeColuna(config["colunaDestino"])}"` : "configure a coluna";
    case "acao_criar_cartao":
      return config["colunaCriacao"] ? `em "${nomeColuna(config["colunaCriacao"])}"` : "configure a coluna";
    case "acao_whatsapp":
      return config["credencialId"] ? "credencial configurada" : "configure a credencial";
    default:
      return "";
  }
}

function NoCustomizado({ id, data, selected }: NodeProps) {
  const dados = data as unknown as DadosNo;
  const info = TIPOS[dados.tipo];
  const ehLogica = dados.tipo === "logica_se";
  return (
    <div
      className={cn(
        "min-w-[220px] rounded-2xl border-2 bg-card p-3 shadow-card transition-shadow",
        info.borda,
        selected && "ring-2 ring-brand",
      )}
    >
      {info.grupo !== "gatilho" ? (
        <Handle type="target" position={Position.Left} className="!size-2.5 !bg-ink-muted" />
      ) : null}
      <div className="flex items-center gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", info.icone)}>
          <info.Icone className="size-4 text-brand-foreground" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{info.label}</p>
      </div>
      <p className="mt-1 truncate text-[11px] text-ink-muted">{dados.resumo || "clique para configurar"}</p>

      {ehLogica ? (
        <>
          <span className="absolute right-1 top-[38%] text-[10px] font-semibold text-success">Sim</span>
          <span className="absolute right-1 top-[68%] text-[10px] font-semibold text-destructive">Não</span>
          <Handle type="source" id="true" position={Position.Right} style={{ top: "42%" }} className="!size-2.5 !bg-success" />
          <Handle type="source" id="false" position={Position.Right} style={{ top: "72%" }} className="!size-2.5 !bg-destructive" />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="!size-2.5 !bg-ink-muted" />
      )}
      <div id={`no-editar-${id}`} />
    </div>
  );
}

const NODE_TYPES = { padrao: NoCustomizado };

type Coluna = { id: string; nome: string };
type Credencial = { id: string; nome: string; tipo: string };
type Automacao = {
  id: string;
  nome: string;
  ativo: boolean;
  nos: { id: string; tipo: TipoNo; posicao: { x: number; y: number }; config: Record<string, unknown> }[];
  conexoes: { origem: string; origemHandle?: string; destino: string }[];
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

export function AutomacaoEditor({ perfil, automacaoId }: { perfil: Perfil; automacaoId: string | null }) {
  const navigate = useNavigate();
  const executarAgora = useServerFn(executarAutomacaoAgora);

  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [credenciais, setCredenciais] = useState<Credencial[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [noEmEdicao, setNoEmEdicao] = useState<Node | null>(null);

  const listar = useServerFn(listarCredenciais);
  const recarregarCredenciais = useCallback(async () => {
    const res = await listar({ data: {} });
    setCredenciais(res.credenciais as Credencial[]);
  }, [listar]);

  useEffect(() => {
    let ativoEfeito = true;
    async function carregar() {
      setCarregando(true);
      const [colunasRes, credenciaisRes] = await Promise.all([
        db.from("fluxo_colunas").select("id, nome").order("ordem"),
        listar({ data: {} }),
      ]);
      if (!ativoEfeito) return;
      setColunas((colunasRes.data as Coluna[]) ?? []);
      setCredenciais((credenciaisRes.credenciais as Credencial[]) ?? []);

      if (automacaoId) {
        const { data } = await db
          .from("automacoes")
          .select("id, nome, ativo, nos, conexoes")
          .eq("id", automacaoId)
          .maybeSingle();
        if (!ativoEfeito) return;
        if (data) {
          const a = data as Automacao;
          setNome(a.nome);
          setAtivo(a.ativo);
          const colunasCarregadas = (colunasRes.data as Coluna[]) ?? [];
          setNodes(
            a.nos.map((n) => ({
              id: n.id,
              type: "padrao",
              position: n.posicao,
              data: { tipo: n.tipo, config: n.config ?? {}, resumo: resumoDoNo(n.tipo, n.config ?? {}, colunasCarregadas) },
            })),
          );
          setEdges(
            a.conexoes.map((c, i) => ({
              id: `e-${i}-${c.origem}-${c.destino}`,
              source: c.origem,
              target: c.destino,
              sourceHandle: c.origemHandle ?? null,
            })),
          );
        }
        const { data: exec } = await db
          .from("automacoes_execucoes")
          .select("id, iniciado_em, finalizado_em, status, resultado, erro")
          .eq("automacao_id", automacaoId)
          .order("iniciado_em", { ascending: false })
          .limit(10);
        if (ativoEfeito) setExecucoes((exec as Execucao[]) ?? []);
      }
      setCarregando(false);
    }
    void carregar();
    return () => {
      ativoEfeito = false;
    };
  }, [automacaoId, listar]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback((conexao: Connection) => setEdges((eds) => addEdge(conexao, eds)), []);
  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => setNoEmEdicao(node), []);

  function adicionarNo(tipo: TipoNo) {
    const grupo = TIPOS[tipo].grupo;
    if (grupo === "gatilho" && nodes.some((n) => TIPOS[(n.data as unknown as DadosNo).tipo].grupo === "gatilho")) {
      setErro("Só é permitido um gatilho por automação.");
      return;
    }
    const id = `no-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const indice = nodes.length;
    const novoNo: Node = {
      id,
      type: "padrao",
      position: { x: 80 + (indice % 3) * 260, y: 80 + Math.floor(indice / 3) * 150 },
      data: { tipo, config: {}, resumo: resumoDoNo(tipo, {}, colunas) },
    };
    setNodes((atual) => [...atual, novoNo]);
    setNoEmEdicao(novoNo);
  }

  function salvarConfigDoNo(id: string, config: Record<string, unknown>) {
    setNodes((atual) =>
      atual.map((n) => {
        if (n.id !== id) return n;
        const tipo = (n.data as unknown as DadosNo).tipo;
        return { ...n, data: { tipo, config, resumo: resumoDoNo(tipo, config, colunas) } };
      }),
    );
    setNoEmEdicao(null);
  }

  function removerNo(id: string) {
    setNodes((atual) => atual.filter((n) => n.id !== id));
    setEdges((atual) => atual.filter((e) => e.source !== id && e.target !== id));
    setNoEmEdicao(null);
  }

  async function salvar() {
    if (!nome.trim()) return setErro("Dê um nome pra automação.");
    if (!nodes.some((n) => TIPOS[(n.data as unknown as DadosNo).tipo].grupo === "gatilho")) {
      return setErro("Adicione um gatilho — sem ele, nada dispara.");
    }
    setSalvando(true);
    setErro(null);
    setAviso(null);

    const nos = nodes.map((n) => {
      const d = n.data as unknown as DadosNo;
      return { id: n.id, tipo: d.tipo, posicao: n.position, config: d.config };
    });
    const conexoes = edges.map((e) => ({ origem: e.source, origemHandle: e.sourceHandle ?? undefined, destino: e.target }));

    if (automacaoId) {
      const { error } = await db.from("automacoes").update({ nome: nome.trim(), ativo, nos, conexoes }).eq("id", automacaoId);
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
        setAviso("Automação criada.");
        navigate({ to: "/agencia/automacoes/$automacaoId", params: { automacaoId: (data as { id: string }).id } });
        return;
      }
    }
    setSalvando(false);
  }

  async function excluir() {
    if (!automacaoId || !window.confirm("Excluir essa automação?")) return;
    const { error } = await db.from("automacoes").delete().eq("id", automacaoId);
    if (error) return setErro("Não foi possível excluir.");
    navigate({ to: "/agencia/automacoes" });
  }

  async function testarAgora() {
    if (!automacaoId) return;
    setTestando(true);
    setErro(null);
    setAviso(null);
    try {
      await executarAgora({ data: { automacaoId } });
      setAviso("Executado. Veja o resultado no histórico abaixo.");
      const { data: exec } = await db
        .from("automacoes_execucoes")
        .select("id, iniciado_em, finalizado_em, status, resultado, erro")
        .eq("automacao_id", automacaoId)
        .order("iniciado_em", { ascending: false })
        .limit(10);
      setExecucoes((exec as Execucao[]) ?? []);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível executar.");
    }
    setTestando(false);
  }

  const gruposPaleta = useMemo(
    () => ({
      gatilho: (Object.keys(TIPOS) as TipoNo[]).filter((t) => TIPOS[t].grupo === "gatilho"),
      logica: (Object.keys(TIPOS) as TipoNo[]).filter((t) => TIPOS[t].grupo === "logica"),
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
    <div className="min-h-screen bg-background">
      <AppHeader perfil={perfil} />
      <main className="w-full py-8">
        <div className="pl-4 pr-4 sm:pl-6">
          <Link
            to="/agencia/automacoes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Voltar pra lista
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 px-4 sm:px-6">
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
          {automacaoId ? (
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
                onClick={() => void excluir()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                Excluir
              </button>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 px-4 sm:px-6">
          <span className="text-xs font-medium text-ink-muted">Adicionar:</span>
          {[...gruposPaleta.gatilho, ...gruposPaleta.logica, ...gruposPaleta.acao].map((t) => (
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

        {erro ? <p className="mt-2 px-4 text-sm text-destructive sm:px-6">{erro}</p> : null}
        {aviso ? <p className="mt-2 px-4 text-sm text-success sm:px-6">{aviso}</p> : null}

        <div className="mx-4 mt-3 h-[440px] overflow-hidden rounded-2xl border border-border bg-card shadow-card sm:mx-6">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {automacaoId ? (
          <section className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:mx-6">
            <h2 className="text-sm font-bold text-ink">Histórico de execuções</h2>
            {execucoes.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Ainda não rodou.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {execucoes.map((e) => (
                  <div key={e.id} className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
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
      </main>

      {noEmEdicao ? (
        <ModalConfigNo
          no={noEmEdicao}
          colunas={colunas}
          credenciais={credenciais}
          onSalvar={salvarConfigDoNo}
          onRemover={removerNo}
          onFechar={() => setNoEmEdicao(null)}
          onCredencialCriada={recarregarCredenciais}
        />
      ) : null}
    </div>
  );
}

function ModalConfigNo({
  no,
  colunas,
  credenciais,
  onSalvar,
  onRemover,
  onFechar,
  onCredencialCriada,
}: {
  no: Node;
  colunas: Coluna[];
  credenciais: Credencial[];
  onSalvar: (id: string, config: Record<string, unknown>) => void;
  onRemover: (id: string) => void;
  onFechar: () => void;
  onCredencialCriada: () => void;
}) {
  const dados = no.data as unknown as DadosNo;
  const info = TIPOS[dados.tipo];
  const [config, setConfig] = useState<Record<string, unknown>>(dados.config ?? {});
  const [criandoCredencial, setCriandoCredencial] = useState(false);

  function campo(chave: string, valor: unknown) {
    setConfig((atual) => ({ ...atual, [chave]: valor }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onFechar}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", info.icone)}>
              <info.Icone className="size-4 text-brand-foreground" strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">{info.label}</h2>
          </div>
          <button type="button" onClick={onFechar} className="rounded p-1 text-ink-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {dados.tipo === "gatilho_horario" ? (
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">Horário (Brasília)</span>
              <input
                type="time"
                value={(config["hora"] as string) ?? "09:00"}
                onChange={(e) => campo("hora", e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </label>
          ) : null}

          {dados.tipo === "gatilho_cartao_movido" || dados.tipo === "acao_mover_cartao" ? (
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {dados.tipo === "gatilho_cartao_movido" ? "Quando o cartão entrar em" : "Mover o cartão para"}
              </span>
              <select
                value={(config["colunaDestino"] as string) ?? ""}
                onChange={(e) => campo("colunaDestino", e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">Selecione a coluna</option>
                {colunas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {dados.tipo === "gatilho_cartao_criado" ? (
            <p className="text-xs text-ink-muted">Dispara sempre que um cartão novo é criado no Fluxo People, em qualquer coluna.</p>
          ) : null}

          {dados.tipo === "logica_se" ? (
            <>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Campo</span>
                <select
                  value={(config["campo"] as string) ?? ""}
                  onChange={(e) => campo("campo", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">Selecione</option>
                  <option value="coluna">Coluna atual do cartão</option>
                  <option value="cliente">Cliente do cartão</option>
                  <option value="titulo">Título do cartão</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Condição</span>
                <select
                  value={(config["operador"] as string) ?? "igual"}
                  onChange={(e) => campo("operador", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="igual">É igual a</option>
                  <option value="diferente">É diferente de</option>
                  <option value="contem">Contém</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Valor</span>
                <input
                  value={(config["valor"] as string) ?? ""}
                  onChange={(e) => campo("valor", e.target.value)}
                  placeholder="Ex.: Unid Imóveis"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
              <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
                <CircleHelp className="mt-0.5 size-3.5 shrink-0" />
                A saída "Sim" segue pelas conexões que saem do topo do nó; "Não" pelas de baixo.
              </p>
            </>
          ) : null}

          {dados.tipo === "acao_criar_cartao" ? (
            <>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Criar na coluna</span>
                <select
                  value={(config["colunaCriacao"] as string) ?? ""}
                  onChange={(e) => campo("colunaCriacao", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">Selecione a coluna</option>
                  {colunas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Título do cartão</span>
                <input
                  value={(config["tituloTemplate"] as string) ?? ""}
                  onChange={(e) => campo("tituloTemplate", e.target.value)}
                  placeholder="Ex.: Novo pedido — {{cliente}}"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Use {"{{titulo}}"}, {"{{coluna}}"} ou {"{{cliente}}"} do cartão que disparou o gatilho.
                </span>
              </label>
            </>
          ) : null}

          {dados.tipo === "acao_whatsapp" ? (
            <>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Credencial (Evolution API)</span>
                <select
                  value={(config["credencialId"] as string) ?? ""}
                  onChange={(e) => campo("credencialId", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">Selecione</option>
                  {credenciais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCriandoCredencial((v) => !v)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  <Plus className="size-3.5" />
                  Nova credencial
                </button>
              </label>

              {criandoCredencial ? (
                <FormNovaCredencial
                  onCriada={(id) => {
                    campo("credencialId", id);
                    setCriandoCredencial(false);
                    onCredencialCriada();
                  }}
                />
              ) : null}

              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Número (com DDI/DDD, só dígitos)</span>
                <input
                  value={(config["numeroTemplate"] as string) ?? ""}
                  onChange={(e) => campo("numeroTemplate", e.target.value)}
                  placeholder="Ex.: 5511999999999"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Mensagem</span>
                <textarea
                  value={(config["mensagemTemplate"] as string) ?? ""}
                  onChange={(e) => campo("mensagemTemplate", e.target.value)}
                  rows={3}
                  placeholder="Ex.: Novo conteúdo aguardando aprovação: {{titulo}}"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Use {"{{titulo}}"}, {"{{coluna}}"} ou {"{{cliente}}"} pra puxar dados do cartão.
                </span>
              </label>
            </>
          ) : null}

          {["acao_sync_meta", "acao_sync_instagram", "acao_cartoes_vencidos"].includes(dados.tipo) ? (
            <p className="text-xs text-ink-muted">
              {dados.tipo === "acao_sync_meta"
                ? "Todos os clientes com token Meta configurado."
                : dados.tipo === "acao_sync_instagram"
                  ? "Todos os clientes com Instagram Business configurado."
                  : 'Cartões com prazo vencido, fora de "Concluído"/"Atrasado".'}
              {" "}Sem configuração adicional.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSalvar(no.id, config)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
          >
            <Check className="size-4" />
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => onRemover(no.id)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
            Remover nó
          </button>
        </div>
      </div>
    </div>
  );
}

function FormNovaCredencial({ onCriada }: { onCriada: (id: string) => void }) {
  const salvar = useServerFn(salvarCredencial);
  const [nome, setNome] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [instance, setInstance] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (!nome.trim() || !baseUrl.trim() || !apiKey.trim() || !instance.trim()) {
      return setErro("Preencha todos os campos.");
    }
    setSalvando(true);
    setErro(null);
    try {
      const res = await salvar({
        data: { nome: nome.trim(), tipo: "evolution_whatsapp", baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), instance: instance.trim() },
      });
      onCriada(res.id);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
    setSalvando(false);
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Nova credencial Evolution API</p>
      <div className="mt-2 flex flex-col gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: WhatsApp Equipe)"
          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="URL base (ex.: https://sua-evolution.com)"
          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
        />
        <input
          value={instance}
          onChange={(e) => setInstance(e.target.value)}
          placeholder="Nome da instância"
          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
        />
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => void criar()}
          disabled={salvando}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Salvar credencial
        </button>
        {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
      </div>
    </div>
  );
}
