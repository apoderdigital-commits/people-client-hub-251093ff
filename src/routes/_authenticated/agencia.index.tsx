import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Loader2,
  PenTool,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { permissoesEfetivas, podeVer, type EquipeRole } from "@/lib/equipe";
import { hojeISO } from "@/lib/fluxo";
import type { Perfil } from "@/hooks/use-auth";

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

/** Nomes das colunas fixas do fluxo, usadas pra saber o que sinalizar pra cada função. */
const COL_APRESENTACAO = "apresentação";
const COL_REVISAO_INTERNA = "revisão interna";
const COL_REVISAO_CLIENTE = "revisão do cliente";

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
                <PainelFluxo perfil={perfil} />
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

type ColunaInfo = { id: string; nome: string; ordem: number };
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
type VinculoBruto = { cartao_id: string; perfil_id: string; created_at?: string };
type ClienteRef = { id: string; nome: string };
type MembroRef = { id: string; nome: string | null; email: string };

function normalizarNomeColuna(nome: string): string {
  return nome.trim().toLowerCase();
}

function PainelFluxo({ perfil }: { perfil: Perfil }) {
  const [colunas, setColunas] = useState<ColunaInfo[]>([]);
  const [cartoes, setCartoes] = useState<CartaoBruto[]>([]);
  const [responsaveis, setResponsaveis] = useState<VinculoBruto[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [membros, setMembros] = useState<MembroRef[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [colunasRes, cartoesRes, respRes, clientesRes, membrosRes] = await Promise.all([
        db.from("fluxo_colunas").select("id, nome, ordem").order("ordem"),
        db
          .from("fluxo_cartoes")
          .select(
            "id, titulo, cliente_id, coluna_id, prazo, entrega_texto, entrega_arte, agendamento, publicacao",
          ),
        db.from("fluxo_responsaveis").select("cartao_id, perfil_id, created_at"),
        db.from("clientes").select("id, nome"),
        db.from("profiles").select("id, nome, email").eq("role", "agencia"),
      ]);
      if (!ativo) return;

      const falha =
        colunasRes.error ?? cartoesRes.error ?? respRes.error ?? clientesRes.error ?? membrosRes.error;
      if (falha) {
        setErro(falha.message);
        setCarregando(false);
        return;
      }

      setColunas((colunasRes.data as ColunaInfo[]) ?? []);
      setCartoes((cartoesRes.data as CartaoBruto[]) ?? []);
      setResponsaveis((respRes.data as VinculoBruto[]) ?? []);
      setClientes((clientesRes.data as ClienteRef[]) ?? []);
      setMembros((membrosRes.data as MembroRef[]) ?? []);
      setErro(null);
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const dados = useMemo(() => {
    const hoje = hojeISO();
    const ultimaColuna = colunas.length > 0 ? colunas[colunas.length - 1] : undefined;
    const colApresentacao = colunas.find((c) => normalizarNomeColuna(c.nome) === COL_APRESENTACAO);
    const colRevisaoInterna = colunas.find(
      (c) => normalizarNomeColuna(c.nome) === COL_REVISAO_INTERNA,
    );
    const colRevisaoCliente = colunas.find(
      (c) => normalizarNomeColuna(c.nome) === COL_REVISAO_CLIENTE,
    );

    const colunaPorId = new Map(colunas.map((c) => [c.id, c]));
    const clientePorId = new Map(clientes.map((c) => [c.id, c.nome]));
    const membroPorId = new Map(membros.map((m) => [m.id, m.nome || m.email]));
    const cartaoPorId = new Map(cartoes.map((c) => [c.id, c]));

    function estaAtrasado(c: CartaoBruto): boolean {
      const datas = [c.prazo, c.entrega_texto, c.entrega_arte, c.agendamento, c.publicacao].filter(
        (d): d is string => Boolean(d),
      );
      return datas.some((d) => d < hoje) && c.coluna_id !== ultimaColuna?.id;
    }

    const meusVinculos = responsaveis.filter((v) => v.perfil_id === perfil.id);
    const meusCartaoIds = new Set(meusVinculos.map((v) => v.cartao_id));
    const criadoEmPorCartao = new Map(meusVinculos.map((v) => [v.cartao_id, v.created_at ?? ""]));
    const meusCartoes = cartoes.filter((c) => meusCartaoIds.has(c.id));

    const limiteNovo = new Date();
    limiteNovo.setDate(limiteNovo.getDate() - 3);

    return {
      colunaPorId,
      clientePorId,
      membroPorId,
      cartaoPorId,
      estaAtrasado,
      ultimaColuna,
      colApresentacao,
      colRevisaoInterna,
      colRevisaoCliente,
      meusCartoes,
      criadoEmPorCartao,
      limiteNovo,
    };
  }, [colunas, cartoes, responsaveis, clientes, membros, perfil.id]);

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

  return <PainelPorFuncao perfil={perfil} cartoes={cartoes} responsaveis={responsaveis} {...dados} />;
}

function PainelPorFuncao({
  perfil,
  cartoes,
  responsaveis,
  colunaPorId,
  clientePorId,
  membroPorId,
  cartaoPorId,
  estaAtrasado,
  colApresentacao,
  colRevisaoInterna,
  colRevisaoCliente,
  meusCartoes,
  criadoEmPorCartao,
  limiteNovo,
}: {
  perfil: Perfil;
  cartoes: CartaoBruto[];
  responsaveis: VinculoBruto[];
  colunaPorId: Map<string, ColunaInfo>;
  clientePorId: Map<string, string>;
  membroPorId: Map<string, string>;
  cartaoPorId: Map<string, CartaoBruto>;
  estaAtrasado: (c: CartaoBruto) => boolean;
  colApresentacao: ColunaInfo | undefined;
  colRevisaoInterna: ColunaInfo | undefined;
  colRevisaoCliente: ColunaInfo | undefined;
  meusCartoes: CartaoBruto[];
  criadoEmPorCartao: Map<string, string>;
  limiteNovo: Date;
}) {
  const cargo: EquipeRole | null = perfil.equipe_role;
  const atrasados = meusCartoes.filter(estaAtrasado);

  const secaoAtrasados =
    atrasados.length > 0 ? (
      <Secao icone={AlertTriangle} titulo="Demandas atrasadas">
        {atrasados.map((c) => (
          <LinhaCartao
            key={c.id}
            titulo={c.titulo}
            clienteNome={c.cliente_id ? clientePorId.get(c.cliente_id) : null}
            atrasado
          />
        ))}
      </Secao>
    ) : null;

  let conteudo: React.ReactNode;
  let temAlgo = false;

  if (cargo === "designer" || cargo === "editor_video") {
    const producao = meusCartoes.filter(
      (c) =>
        c.coluna_id !== colApresentacao?.id &&
        c.coluna_id !== colRevisaoInterna?.id &&
        c.coluna_id !== colRevisaoCliente?.id &&
        !estaAtrasado(c),
    );
    temAlgo = producao.length > 0 || atrasados.length > 0;
    conteudo = (
      <>
        {producao.length > 0 ? (
          <Secao icone={PenTool} titulo="Sua produção">
            {producao.map((c) => {
              const criadoEm = criadoEmPorCartao.get(c.id) ?? "";
              const novo = Boolean(criadoEm) && new Date(criadoEm) >= limiteNovo;
              return (
                <LinhaCartao
                  key={c.id}
                  titulo={c.titulo}
                  clienteNome={c.cliente_id ? clientePorId.get(c.cliente_id) : null}
                  extra={colunaPorId.get(c.coluna_id)?.nome}
                  novo={novo}
                />
              );
            })}
          </Secao>
        ) : null}
        {secaoAtrasados}
      </>
    );
  } else if (cargo === "social_media") {
    const paraAprovar = colApresentacao
      ? cartoes.filter((c) => c.coluna_id === colApresentacao.id)
      : [];
    const aguardandoCliente = colRevisaoCliente
      ? cartoes.filter((c) => c.coluna_id === colRevisaoCliente.id)
      : [];
    temAlgo = paraAprovar.length > 0 || aguardandoCliente.length > 0 || atrasados.length > 0;
    conteudo = (
      <>
        {paraAprovar.length > 0 ? (
          <Secao icone={Eye} titulo="Aguardando sua revisão">
            {paraAprovar.map((c) => (
              <LinhaCartao
                key={c.id}
                titulo={c.titulo}
                clienteNome={c.cliente_id ? clientePorId.get(c.cliente_id) : null}
                extra="Produção pronta ou ajuste pedido pelo cliente"
              />
            ))}
          </Secao>
        ) : null}
        {aguardandoCliente.length > 0 ? (
          <Secao icone={ClipboardCheck} titulo="Aguardando aprovação do cliente">
            {aguardandoCliente.map((c) => (
              <LinhaCartao
                key={c.id}
                titulo={c.titulo}
                clienteNome={c.cliente_id ? clientePorId.get(c.cliente_id) : null}
              />
            ))}
          </Secao>
        ) : null}
        {secaoAtrasados}
      </>
    );
  } else if (cargo === "gerente_projeto") {
    const paraRevisar = colRevisaoInterna
      ? cartoes.filter((c) => c.coluna_id === colRevisaoInterna.id)
      : [];
    const equipeTemAlgo = responsaveis.some((v) => cartaoPorId.has(v.cartao_id));
    temAlgo = paraRevisar.length > 0 || atrasados.length > 0 || equipeTemAlgo;
    conteudo = (
      <>
        {paraRevisar.length > 0 ? (
          <Secao icone={CheckCircle2} titulo="Aguardando sua revisão interna">
            {paraRevisar.map((c) => (
              <LinhaCartao
                key={c.id}
                titulo={c.titulo}
                clienteNome={c.cliente_id ? clientePorId.get(c.cliente_id) : null}
              />
            ))}
          </Secao>
        ) : null}
        {secaoAtrasados}
        <SecaoEquipe
          responsaveis={responsaveis}
          cartaoPorId={cartaoPorId}
          membroPorId={membroPorId}
          estaAtrasado={estaAtrasado}
        />
      </>
    );
  } else if (cargo === "admin" || cargo === "super_admin") {
    temAlgo = responsaveis.some((v) => cartaoPorId.has(v.cartao_id));
    conteudo = (
      <SecaoEquipe
        responsaveis={responsaveis}
        cartaoPorId={cartaoPorId}
        membroPorId={membroPorId}
        estaAtrasado={estaAtrasado}
      />
    );
  } else {
    const aguardandoCliente = colRevisaoCliente
      ? cartoes.filter((c) => c.coluna_id === colRevisaoCliente.id)
      : [];
    const contagemPorCliente = new Map<string, number>();
    for (const c of aguardandoCliente) {
      if (!c.cliente_id) continue;
      contagemPorCliente.set(c.cliente_id, (contagemPorCliente.get(c.cliente_id) ?? 0) + 1);
    }
    temAlgo = meusCartoes.length > 0 || contagemPorCliente.size > 0;
    conteudo = (
      <>
        {meusCartoes.length > 0 ? (
          <Secao icone={Sparkles} titulo="Atribuído a você">
            {meusCartoes.slice(0, 8).map((c) => (
              <LinhaCartao
                key={c.id}
                titulo={c.titulo}
                clienteNome={c.cliente_id ? clientePorId.get(c.cliente_id) : null}
                extra={colunaPorId.get(c.coluna_id)?.nome}
                atrasado={estaAtrasado(c)}
              />
            ))}
            <Link
              to="/agencia/fluxo"
              className="mt-1 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Ver Fluxo People
            </Link>
          </Secao>
        ) : null}
        {contagemPorCliente.size > 0 ? (
          <Secao icone={ClipboardCheck} titulo="Aguardando aprovação do cliente">
            {Array.from(contagemPorCliente.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([clienteId, total]) => (
                <LinhaCartao
                  key={clienteId}
                  titulo={clientePorId.get(clienteId) ?? "Cliente"}
                  extra={`${total} ${total === 1 ? "pendente" : "pendentes"}`}
                />
              ))}
          </Secao>
        ) : null}
      </>
    );
  }

  return (
    <div className="mt-7 flex flex-col gap-8">
      {!temAlgo ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card">
          Tudo em dia por aqui.
        </p>
      ) : (
        conteudo
      )}
    </div>
  );
}

function SecaoEquipe({
  responsaveis,
  cartaoPorId,
  membroPorId,
  estaAtrasado,
}: {
  responsaveis: VinculoBruto[];
  cartaoPorId: Map<string, CartaoBruto>;
  membroPorId: Map<string, string>;
  estaAtrasado: (c: CartaoBruto) => boolean;
}) {
  const porColaborador = new Map<string, { total: number; atrasados: number }>();
  for (const v of responsaveis) {
    const cartao = cartaoPorId.get(v.cartao_id);
    if (!cartao) continue;
    const atual = porColaborador.get(v.perfil_id) ?? { total: 0, atrasados: 0 };
    atual.total += 1;
    if (estaAtrasado(cartao)) atual.atrasados += 1;
    porColaborador.set(v.perfil_id, atual);
  }

  const linhas = Array.from(porColaborador.entries())
    .map(([perfilId, c]) => ({ perfilId, nome: membroPorId.get(perfilId) ?? "—", ...c }))
    .sort((a, b) => b.atrasados - a.atrasados || b.total - a.total);

  if (linhas.length === 0) return null;

  return (
    <Secao icone={Users} titulo="Pendências por colaborador">
      {linhas.map((l) => (
        <div
          key={l.perfilId}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{l.nome}</span>
          {l.atrasados > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              <AlertTriangle className="size-3" />
              {l.atrasados} {l.atrasados === 1 ? "atrasado" : "atrasados"}
            </span>
          ) : null}
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
            {l.total} {l.total === 1 ? "cartão" : "cartões"}
          </span>
        </div>
      ))}
    </Secao>
  );
}

function Secao({
  icone: Icone,
  titulo,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icone className="size-4 text-ink-muted" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">{titulo}</h2>
      </div>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function LinhaCartao({
  titulo,
  clienteNome,
  extra,
  atrasado,
  novo,
}: {
  titulo: string;
  clienteNome?: string | null;
  extra?: string | null;
  atrasado?: boolean;
  novo?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{titulo}</span>
      {clienteNome ? (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
          {clienteNome}
        </span>
      ) : null}
      {extra ? <span className="shrink-0 text-[11px] text-ink-muted">{extra}</span> : null}
      {atrasado ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="size-3" />
          Atrasado
        </span>
      ) : novo ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
          <Sparkles className="size-3" />
          Novo
        </span>
      ) : null}
    </div>
  );
}
