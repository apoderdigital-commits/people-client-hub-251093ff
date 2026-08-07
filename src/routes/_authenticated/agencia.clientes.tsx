import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Instagram as InstagramIcon,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";
import { permissoesEfetivas, podeEditar, podeVer } from "@/lib/equipe";
import { supabase } from "@/integrations/supabase/client";
import {
  criarClienteComMeta,
  criarLoginCliente,
  salvarConfigMetricas,
  salvarConfigMetricasInstagram,
  salvarInstagramBusinessId,
  salvarTokenMeta,
  sincronizarMetricasInstagram,
  sincronizarMetricasMeta,
} from "@/lib/clientes.functions";
import {
  intervalo,
  lerMetricasConfig,
  tiposDeAcao,
  METRICAS,
  type MetricaId,
} from "@/lib/metricas";
import {
  lerMetricasInstagramConfig,
  METRICAS_INSTAGRAM,
  type MetricaInstagramId,
} from "@/lib/metricas-instagram";

export const Route = createFileRoute("/_authenticated/agencia/clientes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configurar Clientes — people" },
      {
        name: "description",
        content: "Cadastre clientes people e configure conta de anúncio, token, Instagram e acesso.",
      },
      { property: "og:title", content: "Configurar Clientes — people" },
      {
        property: "og:description",
        content: "Painel da agência people para cadastrar e configurar as contas dos clientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfigurarClientes,
});

/**
 * O token da Meta não aparece aqui de propósito: ele vive em `clientes_secrets`,
 * fora do alcance do PostgREST, e só o servidor o lê. A tela mostra apenas se
 * existe token configurado e permite substituí-lo.
 */
type Cliente = {
  id: string;
  nome: string;
  identificador: string;
  ad_account_id: string;
  investimento_mensal: number;
  meta_faturamento: number;
  token_atualizado_em: string | null;
  ultima_sincronizacao: string | null;
  erro_sincronizacao: string | null;
  metricas_kpis: unknown;
  acao_lead: string | null;
  acao_conversao: string | null;
  instagram_business_account_id: string | null;
  instagram_ultima_sincronizacao: string | null;
  instagram_erro_sincronizacao: string | null;
  instagram_kpis: unknown;
  servico_grs: boolean;
  servico_meta_ads: boolean;
  servico_google_ads: boolean;
  servico_gmn: boolean;
};

const COLUNAS =
  "id, nome, identificador, ad_account_id, investimento_mensal, meta_faturamento, token_atualizado_em, ultima_sincronizacao, erro_sincronizacao, metricas_kpis, acao_lead, acao_conversao, instagram_business_account_id, instagram_ultima_sincronizacao, instagram_erro_sincronizacao, instagram_kpis, servico_grs, servico_meta_ads, servico_google_ads, servico_gmn";

/** types.ts é gerado pelo Lovable e ainda não conhece as colunas novas. */
const db = supabase as unknown as SupabaseClient;

const vazio = {
  nome: "",
  identificador: "",
  ad_account_id: "",
  meta_token: "",
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

function ConfigurarClientes() {
  return (
    <ProtectedRoute role="agencia">
      {(perfil) => (
        <div className="min-h-screen bg-background">
          <AppHeader perfil={perfil} />
          <main className="mx-auto w-full max-w-[880px] px-4 py-8 sm:py-12">
            <Link
              to="/agencia"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              Voltar ao menu
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card-violet">
                <Users className="size-5 text-brand-foreground" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-ink">Configurar Clientes</h1>
                <p className="text-sm text-ink-muted">
                  Cadastre clientes e configure conta de anúncio, Instagram e acesso.
                </p>
              </div>
            </div>

            {(() => {
              const permissoes = permissoesEfetivas(perfil.equipe_role, perfil.permissoes);
              if (!podeVer(permissoes, "clientes")) {
                return (
                  <p className="mt-7 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
                    Você não tem permissão para visualizar esta aba.
                  </p>
                );
              }
              const somenteLeitura = !podeEditar(permissoes, "clientes");
              return (
                <>
                  {somenteLeitura ? (
                    <p className="mt-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-ink-muted">
                      Seu acesso a esta aba é somente de visualização.
                    </p>
                  ) : null}
                  <fieldset disabled={somenteLeitura} className="min-w-0 border-0 p-0">
                    <Painel />
                  </fieldset>
                </>
              );
            })()}

          </main>
        </div>
      )}
    </ProtectedRoute>
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  tipo = "text",
  ajuda,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tipo?: string;
  ajuda?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
      />
      {ajuda ? <span className="mt-1 block text-[11px] text-ink-muted">{ajuda}</span> : null}
    </label>
  );
}

function Painel() {
  const criarCliente = useServerFn(criarClienteComMeta);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [logins, setLogins] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState(vazio);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      db.from("clientes").select(COLUNAS).order("nome"),
      db.from("profiles").select("email, cliente_id").eq("role", "cliente").not("cliente_id", "is", null),
    ]).then(([resClientes, resPerfis]) => {
      if (!ativo) return;
      if (resClientes.error) setErro("Não foi possível carregar os clientes.");
      else setClientes((resClientes.data as Cliente[]) ?? []);

      const mapa: Record<string, string> = {};
      for (const p of (resPerfis.data as { email: string; cliente_id: string }[] | null) ?? []) {
        mapa[p.cliente_id] = p.email;
      }
      setLogins(mapa);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.identificador.toLowerCase().includes(termo) ||
        c.ad_account_id.toLowerCase().includes(termo),
    );
  }, [clientes, busca]);

  function atualizarNaLista(id: string, mudancas: Partial<Cliente>) {
    setClientes((atual) => atual.map((c) => (c.id === id ? { ...c, ...mudancas } : c)));
  }

  async function criar() {
    if (!novo.nome.trim() || !novo.identificador.trim()) {
      return setErro("Informe nome e identificador do cliente.");
    }
    setSalvandoNovo(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await criarCliente({
        data: {
          nome: novo.nome.trim(),
          identificador: novo.identificador.trim().toLowerCase(),
          ad_account_id: novo.ad_account_id.trim(),
          meta_token: novo.meta_token.trim(),
          investimento_mensal: 0,
          meta_faturamento: 0,
        },
      });

      const agora = new Date().toISOString();
      const temMeta = Boolean(novo.ad_account_id.trim() && novo.meta_token.trim());
      setClientes((atual) =>
        [
          ...atual,
          {
            id: res.id,
            nome: novo.nome.trim(),
            identificador: novo.identificador.trim().toLowerCase(),
            ad_account_id: novo.ad_account_id.trim(),
            investimento_mensal: 0,
            meta_faturamento: 0,
            token_atualizado_em: temMeta ? agora : null,
            ultima_sincronizacao: res.sincronizado > 0 ? agora : null,
            erro_sincronizacao: null,
            metricas_kpis: null,
            acao_lead: null,
            acao_conversao: null,
            instagram_business_account_id: null,
            instagram_ultima_sincronizacao: null,
            instagram_erro_sincronizacao: null,
            instagram_kpis: null,
          },
        ].sort((a, b) => a.nome.localeCompare(b.nome)),
      );

      setAviso(
        res.sincronizado > 0
          ? `Cliente criado e ${res.sincronizado} dias de métricas importados da Meta.`
          : temMeta
            ? "Cliente criado, mas nenhuma métrica veio da Meta. Use Sincronizar no card para ver o motivo."
            : "Cliente criado. Expanda o card para configurar conta de anúncio, token e acesso.",
      );
      setNovo(vazio);
      setCriando(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o cliente.");
    }
    setSalvandoNovo(false);
  }

  async function excluir(cliente: Cliente) {
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"? Isso remove todas as métricas dele.`)) {
      return;
    }
    setExcluindoId(cliente.id);
    setErro(null);
    const { error } = await db.from("clientes").delete().eq("id", cliente.id);
    setExcluindoId(null);
    if (error) {
      return setErro(
        error.code === "42501"
          ? "Só um super admin pode excluir clientes."
          : "Não foi possível excluir. Verifique suas permissões.",
      );
    }
    setClientes((atual) => atual.filter((c) => c.id !== cliente.id));
  }

  if (carregando) {
    return (
      <div className="mt-10 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mt-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 py-2">
          <Search className="size-4 shrink-0 text-ink-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, identificador ou conta de anúncio"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          Novo cliente
        </button>
      </div>

      {erro ? <p className="mt-4 text-sm text-destructive">{erro}</p> : null}
      {aviso ? (
        <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-success">
          {aviso}
        </p>
      ) : null}

      {criando ? (
        <div className="mt-5 rounded-2xl border border-brand/40 bg-card p-5 shadow-card">
          <h2 className="text-sm font-bold text-ink">Novo cliente</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Com a conta de anúncio e o token preenchidos, as métricas dos últimos 30 dias são
            importadas da Meta na hora do cadastro.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Campo
              label="Nome do cliente"
              valor={novo.nome}
              onChange={(v) => setNovo((n) => ({ ...n, nome: v }))}
              placeholder="Acme Ltda"
            />
            <Campo
              label="Identificador"
              valor={novo.identificador}
              onChange={(v) => setNovo((n) => ({ ...n, identificador: v }))}
              placeholder="acme"
              ajuda="Apenas letras minúsculas, números e hífen."
            />
            <Campo
              label="ID da conta de anúncio"
              valor={novo.ad_account_id}
              onChange={(v) => setNovo((n) => ({ ...n, ad_account_id: v }))}
              placeholder="act_123456789"
            />
            <Campo
              label="Token Meta"
              valor={novo.meta_token}
              onChange={(v) => setNovo((n) => ({ ...n, meta_token: v }))}
              placeholder="EAAG..."
              tipo="password"
              ajuda="Guardado no servidor; não volta a ser exibido."
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void criar()}
              disabled={salvandoNovo}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {salvandoNovo ? <Loader2 className="size-4 animate-spin" /> : null}
              {salvandoNovo ? "Validando com a Meta…" : "Criar cliente"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCriando(false);
                setNovo(vazio);
              }}
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {filtrados.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-ink-muted">
            Nenhum cliente cadastrado ainda. Use “Novo cliente” para começar.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {filtrados.map((cliente) => (
            <ClienteCard
              key={cliente.id}
              cliente={cliente}
              loginAtual={logins[cliente.id] ?? null}
              excluindo={excluindoId === cliente.id}
              onAtualizar={(mudancas) => atualizarNaLista(cliente.id, mudancas)}
              onLoginCriado={(email) =>
                setLogins((atual) => ({ ...atual, [cliente.id]: email }))
              }
              onExcluir={() => void excluir(cliente)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Card recolhido por padrão: só nome, identificador e status do login. */
function ClienteCard({
  cliente,
  loginAtual,
  excluindo,
  onAtualizar,
  onLoginCriado,
  onExcluir,
}: {
  cliente: Cliente;
  loginAtual: string | null;
  excluindo: boolean;
  onAtualizar: (mudancas: Partial<Cliente>) => void;
  onLoginCriado: (email: string) => void;
  onExcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(cliente.nome);
  const [identificador, setIdentificador] = useState(cliente.identificador);
  const [adAccountId, setAdAccountId] = useState(cliente.ad_account_id);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    const { error } = await db
      .from("clientes")
      .update({ nome, identificador, ad_account_id: adAccountId })
      .eq("id", cliente.id);
    setSalvando(false);
    if (error) return setErro("Não foi possível salvar. Verifique suas permissões.");
    onAtualizar({ nome, identificador, ad_account_id: adAccountId });
    setSalvo(true);
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{cliente.nome}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {cliente.identificador}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-ink-muted">
            {loginAtual ? `Login: ${loginAtual}` : "Sem login criado"}
            {cliente.token_atualizado_em ? " · Meta configurada" : " · Meta pendente"}
            {cliente.instagram_business_account_id ? " · Instagram configurado" : ""}
          </p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-muted transition-transform", aberto && "rotate-180")}
        />
      </button>

      {aberto ? (
        <div className="border-t border-border p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome do cliente" valor={nome} onChange={setNome} />
            <Campo label="Identificador" valor={identificador} onChange={setIdentificador} />
            <Campo label="ID da conta de anúncio" valor={adAccountId} onChange={setAdAccountId} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </button>
            {salvo ? (
              <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                <Check className="size-4" />
                Salvo
              </span>
            ) : null}
            <button
              type="button"
              onClick={onExcluir}
              disabled={excluindo}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              {excluindo ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Excluir cliente
            </button>
          </div>

          {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}

          <Servicos cliente={cliente} onAtualizar={onAtualizar} />

          <Meta
            cliente={{ ...cliente, ad_account_id: adAccountId }}
            onAtualizar={onAtualizar}
          />

          <Instagram cliente={cliente} onAtualizar={onAtualizar} />

          <AcessoCliente cliente={cliente} loginAtual={loginAtual} onLoginCriado={onLoginCriado} />

          <ConfigMetricas cliente={cliente} onAtualizar={onAtualizar} />

          <ConfigMetricasInstagram cliente={cliente} onAtualizar={onAtualizar} />
        </div>
      ) : null}
    </div>
  );
}

type ServicoChave = "servico_grs" | "servico_meta_ads" | "servico_google_ads" | "servico_gmn";

const SERVICOS: { chave: ServicoChave; label: string }[] = [
  { chave: "servico_grs", label: "GRS" },
  { chave: "servico_meta_ads", label: "Meta Ads" },
  { chave: "servico_google_ads", label: "Google Ads" },
  { chave: "servico_gmn", label: "GMN" },
];

/**
 * Marca quais serviços o cliente contratou. Hoje só o Google Ads trava algo
 * (o dashboard de métricas do cliente), mas os quatro ficam registrados aqui
 * porque é essa a lista que a agência pediu para controlar.
 */
function Servicos({
  cliente,
  onAtualizar,
}: {
  cliente: Cliente;
  onAtualizar: (mudancas: Partial<Cliente>) => void;
}) {
  const [salvandoChave, setSalvandoChave] = useState<ServicoChave | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar(chave: ServicoChave) {
    const valor = !cliente[chave];
    setSalvandoChave(chave);
    setErro(null);
    onAtualizar({ [chave]: valor });
    const { error } = await db
      .from("clientes")
      .update({ [chave]: valor })
      .eq("id", cliente.id);
    if (error) {
      onAtualizar({ [chave]: !valor });
      setErro("Não foi possível salvar os serviços contratados.");
    }
    setSalvandoChave(null);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Serviços contratados
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SERVICOS.map(({ chave, label }) => {
          const marcado = cliente[chave];
          return (
            <button
              key={chave}
              type="button"
              onClick={() => void alternar(chave)}
              disabled={salvandoChave === chave}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
                marcado
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-input text-ink-muted hover:border-brand hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "grid size-3.5 place-items-center rounded border",
                  marcado ? "border-brand bg-brand" : "border-input",
                )}
              >
                {marcado ? <Check className="size-2.5 text-brand-foreground" /> : null}
              </span>
              {label}
            </button>
          );
        })}
      </div>
      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
    </div>
  );
}

/**
 * Escolhe quais indicadores o dashboard mostra, em que ordem, e qual ação da
 * Meta conta como lead e como conversão. Os tipos de ação oferecidos são os que
 * realmente aparecem nos dados já importados — é assim que se descobre qual
 * deles bate com o número que o Gerenciador de Anúncios exibe.
 */
function ConfigMetricas({
  cliente,
  onAtualizar,
}: {
  cliente: Cliente;
  onAtualizar: (mudancas: Partial<Cliente>) => void;
}) {
  const salvarConfig = useServerFn(salvarConfigMetricas);
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<MetricaId[]>(() =>
    lerMetricasConfig(cliente.metricas_kpis),
  );
  const [acaoLead, setAcaoLead] = useState(cliente.acao_lead ?? "");
  const [acaoConversao, setAcaoConversao] = useState(cliente.acao_conversao ?? "");
  const [acoes, setAcoes] = useState<{ tipo: string; total: number }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const janela = intervalo("30d");
    let ativo = true;
    db.from("metricas_campanhas")
      .select("acoes")
      .eq("cliente_id", cliente.id)
      .gte("data", janela.desde)
      .lte("data", janela.ate)
      .then(({ data }) => {
        if (!ativo) return;
        setAcoes(tiposDeAcao((data as { acoes: Record<string, number> | null }[]) ?? []));
      });
    return () => {
      ativo = false;
    };
  }, [aberto, cliente.id]);

  function alternar(id: MetricaId) {
    setEscolhidas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
    setOk(false);
  }

  function mover(id: MetricaId, direcao: -1 | 1) {
    setEscolhidas((atual) => {
      const i = atual.indexOf(id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const nova = [...atual];
      [nova[i], nova[j]] = [nova[j]!, nova[i]!];
      return nova;
    });
    setOk(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      await salvarConfig({
        data: {
          clienteId: cliente.id,
          metricas: escolhidas,
          acao_lead: acaoLead || null,
          acao_conversao: acaoConversao || null,
        },
      });
      onAtualizar({
        metricas_kpis: escolhidas,
        acao_lead: acaoLead || null,
        acao_conversao: acaoConversao || null,
      });
      setOk(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
    setSalvando(false);
  }

  const naoEscolhidas = METRICAS.filter((m) => !escolhidas.includes(m.id));

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
      >
        <SlidersHorizontal className="size-4" />
        Configurar métricas — Meta Ads
      </button>

      {aberto ? (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Indicadores do dashboard
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            A ordem aqui é a ordem dos cards na tela do cliente.
          </p>

          <div className="mt-3 flex flex-col gap-1.5">
            {escolhidas.map((id, i) => {
              const meta = METRICAS.find((m) => m.id === id);
              if (!meta) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-xs font-semibold text-ink-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{meta.label}</span>
                  <button
                    type="button"
                    onClick={() => mover(id, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                    aria-label={`Subir ${meta.label}`}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(id, 1)}
                    disabled={i === escolhidas.length - 1}
                    className="rounded p-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                    aria-label={`Descer ${meta.label}`}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternar(id)}
                    className="rounded px-2 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-destructive"
                  >
                    Remover
                  </button>
                </div>
              );
            })}
          </div>

          {naoEscolhidas.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-ink-muted">Disponíveis</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {naoEscolhidas.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => alternar(m.id)}
                    className="rounded-full border border-input px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-brand hover:text-ink"
                  >
                    + {m.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            O que conta como lead e conversão
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Os totais são dos últimos 30 dias já importados — escolha o que bate com o número do
            Gerenciador de Anúncios.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">Ação de lead</span>
              <select
                value={acaoLead}
                onChange={(e) => {
                  setAcaoLead(e.target.value);
                  setOk(false);
                }}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">Detectar automaticamente</option>
                {acoes.map((a) => (
                  <option key={a.tipo} value={a.tipo}>
                    {a.tipo} ({a.total})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">Ação de conversão</span>
              <select
                value={acaoConversao}
                onChange={(e) => {
                  setAcaoConversao(e.target.value);
                  setOk(false);
                }}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">Detectar automaticamente</option>
                {acoes.map((a) => (
                  <option key={a.tipo} value={a.tipo}>
                    {a.tipo} ({a.total})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {acoes.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">
              Nenhuma ação encontrada nos dados. Sincronize primeiro para poder escolher.
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || escolhidas.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar configuração
            </button>
            {ok ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="size-4" />
                Salvo
              </span>
            ) : null}
          </div>

          {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Mesma ideia de `ConfigMetricas`, mas para os KPIs do dashboard de Instagram. */
function ConfigMetricasInstagram({
  cliente,
  onAtualizar,
}: {
  cliente: Cliente;
  onAtualizar: (mudancas: Partial<Cliente>) => void;
}) {
  const salvarConfig = useServerFn(salvarConfigMetricasInstagram);
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<MetricaInstagramId[]>(() =>
    lerMetricasInstagramConfig(cliente.instagram_kpis),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function alternar(id: MetricaInstagramId) {
    setEscolhidas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
    setOk(false);
  }

  function mover(id: MetricaInstagramId, direcao: -1 | 1) {
    setEscolhidas((atual) => {
      const i = atual.indexOf(id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const nova = [...atual];
      [nova[i], nova[j]] = [nova[j]!, nova[i]!];
      return nova;
    });
    setOk(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      await salvarConfig({ data: { clienteId: cliente.id, metricas: escolhidas } });
      onAtualizar({ instagram_kpis: escolhidas });
      setOk(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
    setSalvando(false);
  }

  const naoEscolhidas = METRICAS_INSTAGRAM.filter((m) => !escolhidas.includes(m.id));

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
      >
        <SlidersHorizontal className="size-4" />
        Configurar métricas — Instagram
      </button>

      {aberto ? (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Indicadores do dashboard
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            A ordem aqui é a ordem dos cards na tela do cliente.
          </p>

          <div className="mt-3 flex flex-col gap-1.5">
            {escolhidas.map((id, i) => {
              const meta = METRICAS_INSTAGRAM.find((m) => m.id === id);
              if (!meta) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-xs font-semibold text-ink-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{meta.label}</span>
                  <button
                    type="button"
                    onClick={() => mover(id, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                    aria-label={`Subir ${meta.label}`}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(id, 1)}
                    disabled={i === escolhidas.length - 1}
                    className="rounded p-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                    aria-label={`Descer ${meta.label}`}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternar(id)}
                    className="rounded px-2 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-destructive"
                  >
                    Remover
                  </button>
                </div>
              );
            })}
          </div>

          {naoEscolhidas.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-ink-muted">Disponíveis</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {naoEscolhidas.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => alternar(m.id)}
                    className="rounded-full border border-input px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-brand hover:text-ink"
                  >
                    + {m.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || escolhidas.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar configuração
            </button>
            {ok ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="size-4" />
                Salvo
              </span>
            ) : null}
          </div>

          {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Bloco de integração com a Meta: estado da credencial e sincronização. */
function Meta({
  cliente,
  onAtualizar,
}: {
  cliente: Cliente;
  onAtualizar: (mudancas: Partial<Cliente>) => void;
}) {
  const salvarToken = useServerFn(salvarTokenMeta);
  const sincronizar = useServerFn(sincronizarMetricasMeta);
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const configurado = Boolean(cliente.token_atualizado_em);

  async function enviarToken() {
    if (!cliente.ad_account_id.trim()) {
      return setErro("Informe o ID da conta de anúncio e salve antes de cadastrar o token.");
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const res = await salvarToken({
        data: {
          clienteId: cliente.id,
          ad_account_id: cliente.ad_account_id.trim(),
          meta_token: token.trim(),
        },
      });
      setToken("");
      onAtualizar({ token_atualizado_em: new Date().toISOString(), erro_sincronizacao: null });
      setOk(`Token validado na conta "${res.conta}".`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o token.");
    }
    setSalvando(false);
  }

  async function puxar() {
    setSincronizando(true);
    setErro(null);
    setOk(null);
    try {
      const janela = intervalo("30d");
      const res = await sincronizar({
        data: { clienteId: cliente.id, desde: janela.desde, ate: janela.ate },
      });
      onAtualizar({
        ultima_sincronizacao: new Date().toISOString(),
        erro_sincronizacao: null,
      });
      setOk(
        res.dias > 0
          ? `${res.dias} dias de métricas atualizados.`
          : "A Meta não devolveu dados para este período.",
      );
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Falha ao sincronizar.";
      setErro(mensagem);
      onAtualizar({ erro_sincronizacao: mensagem });
    }
    setSincronizando(false);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Meta Ads</p>
        <span className="text-[11px] text-ink-muted">
          {configurado ? "Token configurado" : "Sem token"} · última sincronização:{" "}
          {quando(cliente.ultima_sincronizacao)}
        </span>
      </div>

      {cliente.erro_sincronizacao ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {cliente.erro_sincronizacao}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1">
          <span className="text-xs font-medium text-ink-muted">
            {configurado ? "Substituir token" : "Token Meta"}
          </span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={configurado ? "••••••••  (deixe em branco para manter)" : "EAAG..."}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={() => void enviarToken()}
          disabled={salvando || token.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
        >
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {salvando ? "Validando…" : "Salvar token"}
        </button>
        <button
          type="button"
          onClick={() => void puxar()}
          disabled={sincronizando || !configurado}
          className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? "Sincronizando…" : "Sincronizar"}
        </button>
      </div>

      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
      {ok ? <p className="mt-2 text-sm text-success">{ok}</p> : null}
    </div>
  );
}

/**
 * Bloco de integração com o Instagram Business: reaproveita o token da Meta
 * salvo acima, só pede o ID da conta.
 */
function Instagram({
  cliente,
  onAtualizar,
}: {
  cliente: Cliente;
  onAtualizar: (mudancas: Partial<Cliente>) => void;
}) {
  const salvarId = useServerFn(salvarInstagramBusinessId);
  const sincronizar = useServerFn(sincronizarMetricasInstagram);
  const [id, setId] = useState(cliente.instagram_business_account_id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const configurado = Boolean(cliente.instagram_business_account_id);

  async function salvar() {
    if (!id.trim()) return setErro("Informe o ID da conta do Instagram Business.");
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const res = await salvarId({
        data: { clienteId: cliente.id, instagram_business_account_id: id.trim() },
      });
      onAtualizar({
        instagram_business_account_id: id.trim(),
        instagram_ultima_sincronizacao:
          res.sincronizado > 0 ? new Date().toISOString() : cliente.instagram_ultima_sincronizacao,
        instagram_erro_sincronizacao: null,
      });
      setOk(
        res.sincronizado > 0
          ? `Conta "@${res.username}" validada e ${res.sincronizado} dias importados.`
          : `Conta "@${res.username}" validada. Use Sincronizar para importar as métricas.`,
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
    setSalvando(false);
  }

  async function puxar() {
    setSincronizando(true);
    setErro(null);
    setOk(null);
    try {
      const janela = intervalo("30d");
      const res = await sincronizar({
        data: { clienteId: cliente.id, desde: janela.desde, ate: janela.ate },
      });
      onAtualizar({
        instagram_ultima_sincronizacao: new Date().toISOString(),
        instagram_erro_sincronizacao: null,
      });
      setOk(
        res.dias > 0
          ? `${res.dias} dias e ${res.publicacoes} publicações atualizados.`
          : "O Instagram não devolveu dados para este período.",
      );
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Falha ao sincronizar.";
      setErro(mensagem);
      onAtualizar({ instagram_erro_sincronizacao: mensagem });
    }
    setSincronizando(false);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Instagram Business
        </p>
        <span className="text-[11px] text-ink-muted">
          {configurado ? "Conta configurada" : "Sem conta"} · última sincronização:{" "}
          {quando(cliente.instagram_ultima_sincronizacao)}
        </span>
      </div>

      <p className="mt-2 text-[11px] text-ink-muted">
        Reaproveita o token da Meta acima — o Usuário do Sistema precisa ter os escopos
        instagram_basic e instagram_manage_insights.
      </p>

      {cliente.instagram_erro_sincronizacao ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {cliente.instagram_erro_sincronizacao}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1">
          <span className="text-xs font-medium text-ink-muted">
            ID da conta do Instagram Business
          </span>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="17841400000000000"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || id.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <InstagramIcon className="size-4" />
          )}
          {salvando ? "Validando…" : "Salvar conta"}
        </button>
        <button
          type="button"
          onClick={() => void puxar()}
          disabled={sincronizando || !configurado}
          className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? "Sincronizando…" : "Sincronizar"}
        </button>
      </div>

      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
      {ok ? <p className="mt-2 text-sm text-success">{ok}</p> : null}
    </div>
  );
}

/**
 * Cria/atualiza o login do cliente (e-mail + senha) e vincula ao cadastro.
 * Ao entrar, o cliente cai direto em `/cliente` — o redirecionamento por role
 * na tela de login já lê `profiles.cliente_id`, só faltava esse vínculo.
 */
function AcessoCliente({
  cliente,
  loginAtual,
  onLoginCriado,
}: {
  cliente: Cliente;
  loginAtual: string | null;
  onLoginCriado: (email: string) => void;
}) {
  const criarLogin = useServerFn(criarLoginCliente);
  const [email, setEmail] = useState(loginAtual ?? "");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function salvar() {
    if (!email.trim() || senha.trim().length < 6) {
      return setErro("Informe um e-mail válido e uma senha com pelo menos 6 caracteres.");
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const res = await criarLogin({
        data: { clienteId: cliente.id, email: email.trim(), senha: senha.trim() },
      });
      onLoginCriado(res.email);
      setSenha("");
      setOk(
        res.criouConta
          ? `Login criado. O cliente já pode entrar com ${res.email}.`
          : `Conta existente vinculada e senha atualizada para ${res.email}.`,
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o login.");
    }
    setSalvando(false);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Acesso do Cliente
        </p>
        <span className="text-[11px] text-ink-muted">
          {loginAtual ? `Login: ${loginAtual}` : "Nenhum login criado ainda"}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        Ao entrar em <strong>people</strong> com esse e-mail e senha, o cliente cai direto na área
        dele — não precisa confirmar e-mail.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1">
          <span className="text-xs font-medium text-ink-muted">E-mail do cliente</span>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@empresa.com.br"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
          />
        </label>
        <label className="min-w-[160px] flex-1">
          <span className="text-xs font-medium text-ink-muted">
            {loginAtual ? "Nova senha" : "Senha"}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
        >
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
          {salvando ? "Salvando…" : loginAtual ? "Atualizar login" : "Criar login"}
        </button>
      </div>

      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
      {ok ? <p className="mt-2 text-sm text-success">{ok}</p> : null}
    </div>
  );
}
