import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FluxoCartao } from "@/components/FluxoCartao";
import { supabase } from "@/integrations/supabase/client";
import { permissoesEfetivas, podeEditar, podeVer } from "@/lib/equipe";
import {
  classeDaCor,
  dataCurta,
  hojeISO,
  iniciais,
  COLUNAS_CARTAO,
  type Cartao,
  type CartaoEtiqueta,
  type ClienteRef,
  type Coluna,
  type Etiqueta,
  type Membro,
  type Vinculo,
} from "@/lib/fluxo";

export const Route = createFileRoute("/_authenticated/agencia/fluxo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fluxo People — Quadro de produção" },
      {
        name: "description",
        content:
          "Quadro de produção do time people: acompanhe cada peça da criação até a campanha no ar.",
      },
      { property: "og:title", content: "Fluxo People — Quadro de produção" },
      {
        property: "og:description",
        content: "Kanban interno do time people, com responsáveis, prazos e cliente por cartão.",
      },
    ],
  }),
  component: FluxoPagina,
});

/** types.ts é gerado pelo Lovable e ainda não conhece as tabelas do fluxo. */
const db = supabase as unknown as SupabaseClient;

type Contadores = {
  checklist: Map<string, { feitos: number; total: number }>;
  comentarios: Map<string, number>;
  anexos: Map<string, number>;
};

function FluxoPagina() {
  return (
    <ProtectedRoute role="agencia">
      {(perfil) => {
        const permissoes = permissoesEfetivas(perfil.equipe_role, perfil.permissoes);
        return (
          <div className="min-h-screen bg-background">
            <AppHeader perfil={perfil} />
            {/* Sem container centralizado: o quadro precisa correr até a borda
                direita, senão a área de rolagem fica menor que a tela. */}
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
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card-amber">
                    <LayoutGrid className="size-5 text-brand-foreground" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <h1 className="truncate text-2xl font-bold text-ink">Fluxo People</h1>
                    <p className="text-sm text-ink-muted">
                      Quadro de produção do time, da criação à campanha no ar.
                    </p>
                  </div>
                </div>
              </div>

              {!podeVer(permissoes, "fluxo") ? (
                <p className="mx-4 mt-7 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-ink-muted shadow-card sm:mx-6">
                  Você não tem permissão para visualizar esta aba.
                </p>
              ) : (
                <Quadro editavel={podeEditar(permissoes, "fluxo")} perfilId={perfil.id} />
              )}
            </main>
          </div>
        );
      }}
    </ProtectedRoute>
  );
}

function Quadro({ editavel, perfilId }: { editavel: boolean; perfilId: string }) {
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [cartaoEtiquetas, setCartaoEtiquetas] = useState<CartaoEtiqueta[]>([]);
  const [contadores, setContadores] = useState<Contadores>({
    checklist: new Map(),
    comentarios: new Map(),
    anexos: new Map(),
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [novaColuna, setNovaColuna] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const carregarContadores = useCallback(async () => {
    const [ck, cm, ax] = await Promise.all([
      db.from("fluxo_checklist").select("cartao_id, feito"),
      db.from("fluxo_comentarios").select("cartao_id"),
      db.from("fluxo_anexos").select("cartao_id"),
    ]);

    const checklist = new Map<string, { feitos: number; total: number }>();
    for (const item of (ck.data as { cartao_id: string; feito: boolean }[]) ?? []) {
      const atual = checklist.get(item.cartao_id) ?? { feitos: 0, total: 0 };
      atual.total += 1;
      if (item.feito) atual.feitos += 1;
      checklist.set(item.cartao_id, atual);
    }

    const contar = (linhas: { cartao_id: string }[] | null) => {
      const mapa = new Map<string, number>();
      for (const l of linhas ?? []) mapa.set(l.cartao_id, (mapa.get(l.cartao_id) ?? 0) + 1);
      return mapa;
    };

    setContadores({
      checklist,
      comentarios: contar(cm.data as { cartao_id: string }[] | null),
      anexos: contar(ax.data as { cartao_id: string }[] | null),
    });
  }, []);

  const carregar = useCallback(async () => {
    const [c, k, v, m, cl, et, ce] = await Promise.all([
      db.from("fluxo_colunas").select("id, nome, ordem").order("ordem"),
      db.from("fluxo_cartoes").select(COLUNAS_CARTAO).order("ordem"),
      db.from("fluxo_responsaveis").select("cartao_id, perfil_id"),
      db.from("profiles").select("id, nome, email").eq("role", "agencia").order("nome"),
      db.from("clientes").select("id, nome").order("nome"),
      db.from("fluxo_etiquetas").select("id, nome, cor").order("nome"),
      db.from("fluxo_cartao_etiquetas").select("cartao_id, etiqueta_id"),
    ]);

    const falha = c.error ?? k.error ?? v.error ?? m.error ?? cl.error ?? et.error ?? ce.error;
    setErro(falha ? falha.message : null);

    setColunas((c.data as Coluna[]) ?? []);
    setCartoes((k.data as Cartao[]) ?? []);
    setVinculos((v.data as Vinculo[]) ?? []);
    setMembros((m.data as Membro[]) ?? []);
    setClientes((cl.data as ClienteRef[]) ?? []);
    setEtiquetas((et.data as Etiqueta[]) ?? []);
    setCartaoEtiquetas((ce.data as CartaoEtiqueta[]) ?? []);
    await carregarContadores();
    setCarregando(false);
  }, [carregarContadores]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, Cartao[]>();
    for (const coluna of colunas) mapa.set(coluna.id, []);
    for (const cartao of cartoes) {
      const lista = mapa.get(cartao.coluna_id);
      if (lista) lista.push(cartao);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [colunas, cartoes]);

  // --- colunas ---

  async function criarColuna() {
    const nome = novaColuna.trim();
    if (!nome) return;
    setNovaColuna("");
    const { data, error } = await db
      .from("fluxo_colunas")
      .insert({ nome, ordem: colunas.length })
      .select("id, nome, ordem")
      .single();
    if (error) return setErro("Não foi possível criar a coluna.");
    setColunas((atual) => [...atual, data as Coluna]);
  }

  async function renomearColuna(id: string, nome: string) {
    setColunas((atual) => atual.map((c) => (c.id === id ? { ...c, nome } : c)));
    const { error } = await db.from("fluxo_colunas").update({ nome }).eq("id", id);
    if (error) setErro("Não foi possível renomear a coluna.");
  }

  async function removerColuna(id: string) {
    if ((porColuna.get(id) ?? []).length > 0) {
      return setErro("Mova ou exclua os cartões antes de remover a coluna.");
    }
    setColunas((atual) => atual.filter((c) => c.id !== id));
    const { error } = await db.from("fluxo_colunas").delete().eq("id", id);
    if (error) {
      setErro("Não foi possível remover a coluna.");
      void carregar();
    }
  }

  async function moverColuna(id: string, direcao: -1 | 1) {
    const i = colunas.findIndex((c) => c.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= colunas.length) return;
    const nova = [...colunas];
    [nova[i], nova[j]] = [nova[j]!, nova[i]!];
    const reordenadas = nova.map((c, idx) => ({ ...c, ordem: idx }));
    setColunas(reordenadas);
    await Promise.all(
      [reordenadas[i]!, reordenadas[j]!].map((c) =>
        db.from("fluxo_colunas").update({ ordem: c.ordem }).eq("id", c.id),
      ),
    );
  }

  // --- cartões ---

  async function criarCartao(colunaId: string, titulo: string) {
    const { data, error } = await db
      .from("fluxo_cartoes")
      .insert({ coluna_id: colunaId, titulo, ordem: (porColuna.get(colunaId) ?? []).length })
      .select(COLUNAS_CARTAO)
      .single();
    if (error) return setErro("Não foi possível criar o cartão.");
    setCartoes((atual) => [...atual, data as Cartao]);
  }

  async function atualizarCartao(id: string, campos: Partial<Cartao>) {
    setCartoes((atual) => atual.map((c) => (c.id === id ? { ...c, ...campos } : c)));
    const { error } = await db.from("fluxo_cartoes").update(campos).eq("id", id);
    if (error) setErro("Não foi possível salvar o cartão.");
  }

  async function removerCartao(id: string) {
    setAbertoId(null);
    setCartoes((atual) => atual.filter((c) => c.id !== id));
    setVinculos((atual) => atual.filter((v) => v.cartao_id !== id));
    const { error } = await db.from("fluxo_cartoes").delete().eq("id", id);
    if (error) {
      setErro("Não foi possível excluir o cartão.");
      void carregar();
    }
  }

  /**
   * Move o cartão para outra coluna (ou outra posição na mesma) e regrava a
   * ordem das colunas afetadas. O quadro é pequeno, então reindexar tudo é
   * mais simples e previsível do que calcular ordens fracionárias.
   */
  async function moverCartao(cartaoId: string, colunaDestino: string, indice: number | null) {
    const cartao = cartoes.find((c) => c.id === cartaoId);
    if (!cartao) return;

    const listaOrigem = porColuna.get(cartao.coluna_id) ?? [];
    const indiceOriginal = listaOrigem.findIndex((c) => c.id === cartaoId);
    const origem = listaOrigem.filter((c) => c.id !== cartaoId);
    const destino =
      cartao.coluna_id === colunaDestino ? origem : [...(porColuna.get(colunaDestino) ?? [])];

    let posicao = indice === null ? destino.length : indice;
    // Na mesma coluna o cartão já saiu da lista, então os índices abaixo dele
    // subiram um: arrastar para baixo cairia uma posição acima do pretendido.
    if (cartao.coluna_id === colunaDestino && indiceOriginal >= 0 && indiceOriginal < posicao) {
      posicao -= 1;
    }
    posicao = Math.max(0, Math.min(posicao, destino.length));

    // Inserido sem alterar o coluna_id: é essa diferença que faz a comparação
    // abaixo reconhecer que o cartão mudou de coluna e precisa ser gravado.
    destino.splice(posicao, 0, cartao);

    const atualizacoes: { id: string; coluna_id: string; ordem: number }[] = [];
    destino.forEach((c, idx) => {
      if (c.coluna_id !== colunaDestino || c.ordem !== idx) {
        atualizacoes.push({ id: c.id, coluna_id: colunaDestino, ordem: idx });
      }
    });
    if (cartao.coluna_id !== colunaDestino) {
      origem.forEach((c, idx) => {
        if (c.ordem !== idx) atualizacoes.push({ id: c.id, coluna_id: c.coluna_id, ordem: idx });
      });
    }

    setCartoes((atual) =>
      atual.map((c) => {
        const novo = atualizacoes.find((a) => a.id === c.id);
        return novo ? { ...c, coluna_id: novo.coluna_id, ordem: novo.ordem } : c;
      }),
    );

    // Um update por linha: o upsert exigiria repetir todas as colunas NOT NULL.
    const resultados = await Promise.all(
      atualizacoes.map((a) =>
        db.from("fluxo_cartoes").update({ coluna_id: a.coluna_id, ordem: a.ordem }).eq("id", a.id),
      ),
    );
    if (resultados.some((r) => r.error)) {
      setErro("Não foi possível mover o cartão.");
      void carregar();
    }
  }

  async function definirResponsaveis(cartaoId: string, ids: string[]) {
    const atuais = vinculos.filter((v) => v.cartao_id === cartaoId).map((v) => v.perfil_id);
    const adicionar = ids.filter((id) => !atuais.includes(id));
    const remover = atuais.filter((id) => !ids.includes(id));

    setVinculos((atual) => [
      ...atual.filter((v) => v.cartao_id !== cartaoId),
      ...ids.map((perfil_id) => ({ cartao_id: cartaoId, perfil_id })),
    ]);

    if (adicionar.length > 0) {
      const { error } = await db
        .from("fluxo_responsaveis")
        .insert(adicionar.map((perfil_id) => ({ cartao_id: cartaoId, perfil_id })));
      if (error) setErro("Não foi possível salvar os responsáveis.");
    }
    if (remover.length > 0) {
      const { error } = await db
        .from("fluxo_responsaveis")
        .delete()
        .eq("cartao_id", cartaoId)
        .in("perfil_id", remover);
      if (error) setErro("Não foi possível remover os responsáveis.");
    }
  }

  async function definirEtiquetas(cartaoId: string, ids: string[]) {
    const atuais = cartaoEtiquetas
      .filter((v) => v.cartao_id === cartaoId)
      .map((v) => v.etiqueta_id);
    const adicionar = ids.filter((id) => !atuais.includes(id));
    const remover = atuais.filter((id) => !ids.includes(id));

    setCartaoEtiquetas((atual) => [
      ...atual.filter((v) => v.cartao_id !== cartaoId),
      ...ids.map((etiqueta_id) => ({ cartao_id: cartaoId, etiqueta_id })),
    ]);

    if (adicionar.length > 0) {
      const { error } = await db
        .from("fluxo_cartao_etiquetas")
        .insert(adicionar.map((etiqueta_id) => ({ cartao_id: cartaoId, etiqueta_id })));
      if (error) setErro("Não foi possível aplicar a etiqueta.");
    }
    if (remover.length > 0) {
      const { error } = await db
        .from("fluxo_cartao_etiquetas")
        .delete()
        .eq("cartao_id", cartaoId)
        .in("etiqueta_id", remover);
      if (error) setErro("Não foi possível remover a etiqueta.");
    }
  }

  async function criarEtiqueta(nome: string, cor: string): Promise<Etiqueta | null> {
    const { data, error } = await db
      .from("fluxo_etiquetas")
      .insert({ nome, cor })
      .select("id, nome, cor")
      .single();
    if (error) {
      setErro("Não foi possível criar a etiqueta.");
      return null;
    }
    const nova = data as Etiqueta;
    setEtiquetas((atual) => [...atual, nova].sort((a, b) => a.nome.localeCompare(b.nome)));
    return nova;
  }

  if (carregando) {
    return (
      <div className="mt-10 grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  const aberto = cartoes.find((c) => c.id === abertoId) ?? null;

  return (
    <div className="mt-7">
      {erro ? (
        <p className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive sm:mx-6">
          {erro}
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X className="size-4" />
          </button>
        </p>
      ) : null}

      {!editavel ? (
        <p className="mx-4 mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-ink-muted sm:mx-6">
          Seu acesso a esta aba é somente de visualização.
        </p>
      ) : null}

      {/* pl na esquerda, nada na direita: as colunas seguem até a borda. */}
      <div className="flex gap-4 overflow-x-auto pb-4 pl-4 sm:pl-6">
        {colunas.map((coluna, i) => (
          <ColunaKanban
            key={coluna.id}
            coluna={coluna}
            primeira={i === 0}
            ultima={i === colunas.length - 1}
            cartoes={porColuna.get(coluna.id) ?? []}
            membros={membros}
            clientes={clientes}
            etiquetas={etiquetas}
            cartaoEtiquetas={cartaoEtiquetas}
            vinculos={vinculos}
            contadores={contadores}
            editavel={editavel}
            arrastando={arrastando}
            onArrastar={setArrastando}
            onAbrir={setAbertoId}
            onCriarCartao={criarCartao}
            onMoverCartao={moverCartao}
            onRenomear={renomearColuna}
            onRemover={removerColuna}
            onMoverColuna={moverColuna}
          />
        ))}

        {editavel ? (
          <div className="w-72 shrink-0">
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-3">
              <input
                value={novaColuna}
                onChange={(e) => setNovaColuna(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void criarColuna();
                }}
                placeholder="Nome da nova coluna"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => void criarColuna()}
                disabled={!novaColuna.trim()}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Adicionar coluna
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {aberto ? (
        <FluxoCartao
          cartao={aberto}
          colunas={colunas}
          membros={membros}
          clientes={clientes}
          etiquetas={etiquetas}
          responsaveis={vinculos.filter((v) => v.cartao_id === aberto.id).map((v) => v.perfil_id)}
          etiquetasDoCartao={cartaoEtiquetas
            .filter((v) => v.cartao_id === aberto.id)
            .map((v) => v.etiqueta_id)}
          perfilId={perfilId}
          editavel={editavel}
          onFechar={() => setAbertoId(null)}
          onAtualizar={atualizarCartao}
          onRemover={removerCartao}
          onMover={moverCartao}
          onDefinirResponsaveis={definirResponsaveis}
          onDefinirEtiquetas={definirEtiquetas}
          onCriarEtiqueta={criarEtiqueta}
          onContadores={() => void carregarContadores()}
        />
      ) : null}
    </div>
  );
}

function ColunaKanban({
  coluna,
  primeira,
  ultima,
  cartoes,
  membros,
  clientes,
  etiquetas,
  cartaoEtiquetas,
  vinculos,
  contadores,
  editavel,
  arrastando,
  onArrastar,
  onAbrir,
  onCriarCartao,
  onMoverCartao,
  onRenomear,
  onRemover,
  onMoverColuna,
}: {
  coluna: Coluna;
  primeira: boolean;
  ultima: boolean;
  cartoes: Cartao[];
  membros: Membro[];
  clientes: ClienteRef[];
  etiquetas: Etiqueta[];
  cartaoEtiquetas: CartaoEtiqueta[];
  vinculos: Vinculo[];
  contadores: Contadores;
  editavel: boolean;
  arrastando: string | null;
  onArrastar: (id: string | null) => void;
  onAbrir: (id: string) => void;
  onCriarCartao: (colunaId: string, titulo: string) => Promise<void>;
  onMoverCartao: (id: string, colunaDestino: string, indice: number | null) => Promise<void>;
  onRenomear: (id: string, nome: string) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
  onMoverColuna: (id: string, direcao: -1 | 1) => Promise<void>;
}) {
  const [novo, setNovo] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [nome, setNome] = useState(coluna.nome);
  const [sobre, setSobre] = useState(false);

  useEffect(() => {
    setNome(coluna.nome);
  }, [coluna.nome]);

  /**
   * O id vem do próprio evento (`dataTransfer`), não do estado: é o canal que
   * o HTML5 usa para carregar o que está sendo arrastado, e sem ele o Firefox
   * sequer inicia o arrasto.
   */
  function soltar(id: string, indice: number | null) {
    if (!id) return;
    void onMoverCartao(id, coluna.id, indice);
    onArrastar(null);
    setSobre(false);
  }

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-card p-3 transition-colors ${
        sobre ? "border-brand" : "border-border"
      }`}
      onDragEnter={(e) => {
        if (!editavel) return;
        e.preventDefault();
      }}
      onDragOver={(e) => {
        if (!editavel) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setSobre(true);
      }}
      onDragLeave={(e) => {
        // Sair para um filho dispara dragleave na coluna; ignoramos esse caso.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false);
      }}
      onDrop={(e) => {
        if (!editavel) return;
        e.preventDefault();
        soltar(e.dataTransfer.getData("text/plain"), null);
      }}
    >
      <div className="flex items-center gap-1">
        {editavel ? (
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => {
              const limpo = nome.trim();
              if (limpo && limpo !== coluna.nome) void onRenomear(coluna.id, limpo);
              else setNome(coluna.nome);
            }}
            className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs font-bold uppercase tracking-wide text-ink outline-none transition-colors hover:bg-muted focus:bg-muted"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-bold uppercase tracking-wide text-ink">
            {coluna.nome}
          </span>
        )}
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-semibold text-ink-muted">
          {cartoes.length}
        </span>
      </div>

      {editavel ? (
        <div className="mt-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void onMoverColuna(coluna.id, -1)}
            disabled={primeira}
            className="rounded p-0.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
            aria-label="Mover coluna para a esquerda"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void onMoverColuna(coluna.id, 1)}
            disabled={ultima}
            className="rounded p-0.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
            aria-label="Mover coluna para a direita"
          >
            <ChevronRight className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void onRemover(coluna.id)}
            className="ml-auto rounded p-0.5 text-ink-muted transition-colors hover:text-destructive"
            aria-label="Remover coluna"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="mt-2 flex min-h-[40px] flex-col gap-2">
        {cartoes.map((cartao, i) => (
          <MiniCartao
            key={cartao.id}
            cartao={cartao}
            membros={membros}
            clientes={clientes}
            etiquetas={etiquetas.filter((e) =>
              cartaoEtiquetas.some((v) => v.cartao_id === cartao.id && v.etiqueta_id === e.id),
            )}
            responsaveis={vinculos
              .filter((v) => v.cartao_id === cartao.id)
              .map((v) => v.perfil_id)}
            contadores={contadores}
            editavel={editavel}
            arrastando={arrastando}
            onArrastar={onArrastar}
            onAbrir={onAbrir}
            onSoltarAntes={(id) => soltar(id, i)}
          />
        ))}
      </div>

      {editavel ? (
        adicionando ? (
          <div className="mt-2">
            <textarea
              autoFocus
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const titulo = novo.trim();
                  if (titulo) {
                    void onCriarCartao(coluna.id, titulo);
                    setNovo("");
                  }
                }
                if (e.key === "Escape") setAdicionando(false);
              }}
              rows={2}
              placeholder="Título do cartão"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const titulo = novo.trim();
                  if (titulo) {
                    void onCriarCartao(coluna.id, titulo);
                    setNovo("");
                  }
                }}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdicionando(false);
                  setNovo("");
                }}
                className="text-xs font-medium text-ink-muted hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink"
          >
            <Plus className="size-3.5" />
            Adicionar um cartão
          </button>
        )
      ) : null}
    </div>
  );
}

function MiniCartao({
  cartao,
  membros,
  clientes,
  etiquetas,
  responsaveis,
  contadores,
  editavel,
  arrastando,
  onArrastar,
  onAbrir,
  onSoltarAntes,
}: {
  cartao: Cartao;
  membros: Membro[];
  clientes: ClienteRef[];
  etiquetas: Etiqueta[];
  responsaveis: string[];
  contadores: Contadores;
  editavel: boolean;
  arrastando: string | null;
  onArrastar: (id: string | null) => void;
  onAbrir: (id: string) => void;
  onSoltarAntes: (id: string) => void;
}) {
  const cliente = clientes.find((c) => c.id === cartao.cliente_id);
  const equipe = membros.filter((m) => responsaveis.includes(m.id));
  const check = contadores.checklist.get(cartao.id);
  const comentarios = contadores.comentarios.get(cartao.id) ?? 0;
  const anexos = contadores.anexos.get(cartao.id) ?? 0;

  const hoje = hojeISO();
  const data = cartao.entrega_arte ?? cartao.prazo;
  const atrasado = Boolean(data && data < hoje);
  const hojeMesmo = data === hoje;

  return (
    <div
      draggable={editavel}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", cartao.id);
        e.dataTransfer.effectAllowed = "move";
        // Adiado de propósito: mudar estado dentro do dragstart re-renderiza o
        // quadro no instante em que o arrasto começa, e o navegador o cancela.
        setTimeout(() => onArrastar(cartao.id), 0);
      }}
      onDragEnd={() => onArrastar(null)}
      onDragOver={(e) => {
        if (!editavel) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        if (!editavel) return;
        e.preventDefault();
        e.stopPropagation();
        onSoltarAntes(e.dataTransfer.getData("text/plain"));
      }}
      onClick={() => onAbrir(cartao.id)}
      // select-none: sem isso o navegador inicia uma seleção de texto em vez do
      // arrasto, e o clique acaba apenas abrindo o cartão.
      className={`cursor-grab select-none rounded-xl border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-card active:cursor-grabbing ${
        arrastando === cartao.id ? "opacity-40" : ""
      }`}
    >
      {etiquetas.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {etiquetas.map((e) => (
            <span
              key={e.id}
              title={e.nome}
              className={`h-2 w-10 rounded-full ${classeDaCor(e.cor)}`}
            />
          ))}
        </div>
      ) : null}

      <p className="text-sm font-medium text-ink">{cartao.titulo}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {cliente ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
            {cliente.nome}
          </span>
        ) : null}
        {data ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              atrasado
                ? "bg-destructive/10 text-destructive"
                : hojeMesmo
                  ? "bg-brand/10 text-brand"
                  : "bg-muted text-ink-muted"
            }`}
          >
            <CalendarDays className="size-3" />
            {dataCurta(data)}
          </span>
        ) : null}
        {check && check.total > 0 ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              check.feitos === check.total ? "bg-success/10 text-success" : "bg-muted text-ink-muted"
            }`}
          >
            <CheckSquare className="size-3" />
            {check.feitos}/{check.total}
          </span>
        ) : null}
        {comentarios > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
            <MessageSquare className="size-3" />
            {comentarios}
          </span>
        ) : null}
        {anexos > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
            <Paperclip className="size-3" />
            {anexos}
          </span>
        ) : null}
        {equipe.length > 0 ? (
          <span className="ml-auto flex -space-x-1.5">
            {equipe.slice(0, 3).map((m) => (
              <span
                key={m.id}
                title={m.nome || m.email}
                className="grid size-6 place-items-center rounded-full border border-card bg-brand text-[10px] font-bold text-brand-foreground"
              >
                {iniciais(m.nome || m.email)}
              </span>
            ))}
            {equipe.length > 3 ? (
              <span className="grid size-6 place-items-center rounded-full border border-card bg-muted text-[10px] font-bold text-ink-muted">
                +{equipe.length - 3}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
