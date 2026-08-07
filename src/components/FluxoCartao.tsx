import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  Check,
  CheckSquare,
  Download,
  Loader2,
  Paperclip,
  Plus,
  Quote,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  classeDaCor,
  iniciais,
  nomeSeguro,
  tamanhoLegivel,
  CAMPOS_DATA,
  CORES_DISPONIVEIS,
  PRIORIDADES,
  TIPOS_POST,
  type Anexo,
  type Cartao,
  type ClienteRef,
  type Coluna,
  type Comentario,
  type Etiqueta,
  type ItemChecklist,
  type Membro,
} from "@/lib/fluxo";

/** types.ts é gerado pelo Lovable e ainda não conhece as tabelas do fluxo. */
const db = supabase as unknown as SupabaseClient;
const BUCKET = "fluxo-anexos";

type Props = {
  cartao: Cartao;
  colunas: Coluna[];
  membros: Membro[];
  clientes: ClienteRef[];
  etiquetas: Etiqueta[];
  responsaveis: string[];
  etiquetasDoCartao: string[];
  perfilId: string;
  editavel: boolean;
  onFechar: () => void;
  onAtualizar: (id: string, campos: Partial<Cartao>) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
  onMover: (id: string, colunaDestino: string, indice: number | null) => Promise<void>;
  onDefinirResponsaveis: (cartaoId: string, ids: string[]) => Promise<void>;
  onDefinirEtiquetas: (cartaoId: string, ids: string[]) => Promise<void>;
  onCriarEtiqueta: (nome: string, cor: string) => Promise<Etiqueta | null>;
  onContadores: () => void;
};

export function FluxoCartao(props: Props) {
  const { cartao, editavel, onFechar } = props;
  const [titulo, setTitulo] = useState(cartao.titulo);
  const [descricao, setDescricao] = useState(cartao.descricao ?? "");
  const [legenda, setLegenda] = useState(cartao.legenda ?? "");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setTitulo(cartao.titulo);
    setDescricao(cartao.descricao ?? "");
    setLegenda(cartao.legenda ?? "");
  }, [cartao.id, cartao.titulo, cartao.descricao, cartao.legenda]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-2xl border border-border bg-card shadow-card-hover"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          {editavel ? (
            <select
              value={cartao.coluna_id}
              onChange={(e) => void props.onMover(cartao.id, e.target.value, null)}
              className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink outline-none focus:border-brand"
            >
              {props.colunas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {props.colunas.find((c) => c.id === cartao.coluna_id)?.nome}
            </span>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-muted hover:text-ink"
            aria-label="Fechar cartão"
          >
            <X className="size-5" />
          </button>
        </div>

        {erro ? (
          <p className="mx-5 mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        ) : null}

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {editavel ? (
              <textarea
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => {
                  const limpo = titulo.trim();
                  if (limpo && limpo !== cartao.titulo) {
                    void props.onAtualizar(cartao.id, { titulo: limpo });
                  } else setTitulo(cartao.titulo);
                }}
                rows={1}
                className="w-full resize-none rounded-lg bg-transparent px-1 text-xl font-bold text-ink outline-none transition-colors hover:bg-muted focus:bg-muted"
              />
            ) : (
              <h2 className="px-1 text-xl font-bold text-ink">{cartao.titulo}</h2>
            )}

            <Membros {...props} />
            <Etiquetas {...props} />

            <Secao icone={AlignLeft} titulo="Descrição">
              {editavel ? (
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  onBlur={() => {
                    const valor = descricao.trim();
                    if (valor !== (cartao.descricao ?? "")) {
                      void props.onAtualizar(cartao.id, { descricao: valor || null });
                    }
                  }}
                  rows={4}
                  placeholder="Adicione uma descrição mais detalhada…"
                  className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-ink-muted">
                  {cartao.descricao || "Sem descrição."}
                </p>
              )}
            </Secao>

            <Secao icone={Quote} titulo="Legenda (visível na aprovação do cliente)">
              {editavel ? (
                <textarea
                  value={legenda}
                  onChange={(e) => setLegenda(e.target.value)}
                  onBlur={() => {
                    const valor = legenda.trim();
                    if (valor !== (cartao.legenda ?? "")) {
                      void props.onAtualizar(cartao.id, { legenda: valor || null });
                    }
                  }}
                  rows={4}
                  placeholder="Escreva a legenda que vai junto com a arte no post…"
                  className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-ink-muted">
                  {cartao.legenda || "Sem legenda."}
                </p>
              )}
            </Secao>

            <CamposPersonalizados {...props} />
            <Checklist cartaoId={cartao.id} editavel={editavel} onContadores={props.onContadores} onErro={setErro} />
            <Anexos
              cartaoId={cartao.id}
              perfilId={props.perfilId}
              editavel={editavel}
              onContadores={props.onContadores}
              onErro={setErro}
            />

            {editavel ? (
              <div className="mt-6 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => void props.onRemover(cartao.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Excluir cartão
                </button>
              </div>
            ) : null}
          </div>

          <Comentarios
            cartaoId={cartao.id}
            perfilId={props.perfilId}
            membros={props.membros}
            onContadores={props.onContadores}
            onErro={setErro}
          />
        </div>
      </div>
    </div>
  );
}

function Secao({
  icone: Icone,
  titulo,
  acao,
  children,
}: {
  icone: typeof AlignLeft;
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <Icone className="size-4 text-ink-muted" />
        <h3 className="flex-1 text-sm font-bold text-ink">{titulo}</h3>
        {acao}
      </div>
      {children}
    </div>
  );
}

function Membros({ cartao, membros, responsaveis, editavel, onDefinirResponsaveis }: Props) {
  const [aberto, setAberto] = useState(false);
  const escolhidos = membros.filter((m) => responsaveis.includes(m.id));

  return (
    <Secao icone={Users} titulo="Membros">
      <div className="flex flex-wrap items-center gap-1.5">
        {escolhidos.map((m) => (
          <span
            key={m.id}
            title={m.nome || m.email}
            className="grid size-8 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground"
          >
            {iniciais(m.nome || m.email)}
          </span>
        ))}
        {escolhidos.length === 0 ? (
          <span className="text-xs text-ink-muted">Ninguém atribuído.</span>
        ) : null}
        {editavel ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="grid size-8 place-items-center rounded-full border border-dashed border-input text-ink-muted transition-colors hover:border-brand hover:text-ink"
              aria-label="Adicionar membro"
            >
              <Plus className="size-4" />
            </button>
            {aberto ? (
              <div className="absolute left-0 z-10 mt-1 max-h-56 w-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-card-hover">
                {membros.map((m) => {
                  const marcado = responsaveis.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        void onDefinirResponsaveis(
                          cartao.id,
                          marcado
                            ? responsaveis.filter((id) => id !== m.id)
                            : [...responsaveis, m.id],
                        )
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <span
                        className={
                          marcado
                            ? "grid size-4 shrink-0 place-items-center rounded border border-brand bg-brand"
                            : "grid size-4 shrink-0 place-items-center rounded border border-input"
                        }
                      >
                        {marcado ? <Check className="size-3 text-brand-foreground" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">
                        {m.nome || m.email}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Secao>
  );
}

function Etiquetas({
  cartao,
  etiquetas,
  etiquetasDoCartao,
  editavel,
  onDefinirEtiquetas,
  onCriarEtiqueta,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<string>(CORES_DISPONIVEIS[0]);
  const escolhidas = etiquetas.filter((e) => etiquetasDoCartao.includes(e.id));

  async function criar() {
    const limpo = nome.trim();
    if (!limpo) return;
    const nova = await onCriarEtiqueta(limpo, cor);
    setNome("");
    if (nova) void onDefinirEtiquetas(cartao.id, [...etiquetasDoCartao, nova.id]);
  }

  return (
    <Secao icone={Tag} titulo="Etiquetas">
      <div className="flex flex-wrap items-center gap-1.5">
        {escolhidas.map((e) => (
          <span
            key={e.id}
            className={`rounded-md px-2 py-1 text-xs font-semibold text-brand-foreground ${classeDaCor(e.cor)}`}
          >
            {e.nome}
          </span>
        ))}
        {escolhidas.length === 0 ? (
          <span className="text-xs text-ink-muted">Sem etiquetas.</span>
        ) : null}
        {editavel ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="grid size-7 place-items-center rounded-md border border-dashed border-input text-ink-muted transition-colors hover:border-brand hover:text-ink"
              aria-label="Adicionar etiqueta"
            >
              <Plus className="size-3.5" />
            </button>
            {aberto ? (
              <div className="absolute left-0 z-10 mt-1 w-64 rounded-xl border border-border bg-card p-2 shadow-card-hover">
                <div className="max-h-44 overflow-y-auto">
                  {etiquetas.map((e) => {
                    const marcada = etiquetasDoCartao.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() =>
                          void onDefinirEtiquetas(
                            cartao.id,
                            marcada
                              ? etiquetasDoCartao.filter((id) => id !== e.id)
                              : [...etiquetasDoCartao, e.id],
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
                      >
                        <span className={`h-5 flex-1 rounded ${classeDaCor(e.cor)}`} />
                        <span className="min-w-0 flex-1 truncate text-left text-xs text-ink">
                          {e.nome}
                        </span>
                        {marcada ? <Check className="size-3.5 shrink-0 text-brand" /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 border-t border-border pt-2">
                  <input
                    value={nome}
                    onChange={(ev) => setNome(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") void criar();
                    }}
                    placeholder="Nova etiqueta"
                    className="w-full rounded-lg border border-input bg-background px-2 py-1 text-xs text-ink outline-none focus:border-brand"
                  />
                  <div className="mt-1.5 flex items-center gap-1">
                    {CORES_DISPONIVEIS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCor(c)}
                        aria-label={`Cor ${c}`}
                        className={`size-5 rounded ${classeDaCor(c)} ${
                          cor === c ? "ring-2 ring-ink ring-offset-1 ring-offset-card" : ""
                        }`}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => void criar()}
                      className="ml-auto rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-brand-foreground"
                    >
                      Criar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Secao>
  );
}

function CamposPersonalizados({ cartao, clientes, editavel, onAtualizar }: Props) {
  return (
    <Secao icone={CheckSquare} titulo="Campos personalizados">
      <div className="grid gap-3 sm:grid-cols-3">
        {CAMPOS_DATA.map(({ campo, label }) => (
          <label key={campo} className="block">
            <span className="text-[11px] font-medium text-ink-muted">{label}</span>
            <input
              type="date"
              disabled={!editavel}
              value={(cartao[campo] as string | null) ?? ""}
              onChange={(e) => void onAtualizar(cartao.id, { [campo]: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
            />
          </label>
        ))}

        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted">Prioridade</span>
          <select
            disabled={!editavel}
            value={cartao.prioridade ?? ""}
            onChange={(e) => void onAtualizar(cartao.id, { prioridade: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
          >
            <option value="">Selecione…</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted">Tipo de post</span>
          <select
            disabled={!editavel}
            value={cartao.tipo_post ?? ""}
            onChange={(e) => void onAtualizar(cartao.id, { tipo_post: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
          >
            <option value="">Selecione…</option>
            {TIPOS_POST.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted">Cliente</span>
          <select
            disabled={!editavel}
            value={cartao.cliente_id ?? ""}
            onChange={(e) => void onAtualizar(cartao.id, { cliente_id: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
          >
            <option value="">Sem cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Secao>
  );
}

function Checklist({
  cartaoId,
  editavel,
  onContadores,
  onErro,
}: {
  cartaoId: string;
  editavel: boolean;
  onContadores: () => void;
  onErro: (m: string) => void;
}) {
  const [itens, setItens] = useState<ItemChecklist[]>([]);
  const [novo, setNovo] = useState("");

  useEffect(() => {
    let ativo = true;
    db.from("fluxo_checklist")
      .select("id, cartao_id, texto, feito, ordem")
      .eq("cartao_id", cartaoId)
      .order("ordem")
      .then(({ data }) => {
        if (ativo) setItens((data as ItemChecklist[]) ?? []);
      });
    return () => {
      ativo = false;
    };
  }, [cartaoId]);

  async function adicionar() {
    const texto = novo.trim();
    if (!texto) return;
    setNovo("");
    const { data, error } = await db
      .from("fluxo_checklist")
      .insert({ cartao_id: cartaoId, texto, ordem: itens.length })
      .select("id, cartao_id, texto, feito, ordem")
      .single();
    if (error) return onErro("Não foi possível adicionar o item.");
    setItens((a) => [...a, data as ItemChecklist]);
    onContadores();
  }

  async function alternar(item: ItemChecklist) {
    setItens((a) => a.map((i) => (i.id === item.id ? { ...i, feito: !i.feito } : i)));
    const { error } = await db
      .from("fluxo_checklist")
      .update({ feito: !item.feito })
      .eq("id", item.id);
    if (error) onErro("Não foi possível atualizar o item.");
    else onContadores();
  }

  async function remover(id: string) {
    setItens((a) => a.filter((i) => i.id !== id));
    const { error } = await db.from("fluxo_checklist").delete().eq("id", id);
    if (error) onErro("Não foi possível remover o item.");
    else onContadores();
  }

  const feitos = itens.filter((i) => i.feito).length;

  return (
    <Secao
      icone={CheckSquare}
      titulo="Checklist"
      acao={
        itens.length > 0 ? (
          <span className="text-xs font-semibold text-ink-muted">
            {feitos}/{itens.length}
          </span>
        ) : null
      }
    >
      {itens.length > 0 ? (
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${itens.length ? (feitos / itens.length) * 100 : 0}%` }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        {itens.map((item) => (
          <div key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted">
            <button
              type="button"
              disabled={!editavel}
              onClick={() => void alternar(item)}
              className={
                item.feito
                  ? "grid size-4 shrink-0 place-items-center rounded border border-brand bg-brand"
                  : "grid size-4 shrink-0 place-items-center rounded border border-input"
              }
              aria-label={item.feito ? "Desmarcar item" : "Marcar item"}
            >
              {item.feito ? <Check className="size-3 text-brand-foreground" /> : null}
            </button>
            <span
              className={`min-w-0 flex-1 text-sm ${
                item.feito ? "text-ink-muted line-through" : "text-ink"
              }`}
            >
              {item.texto}
            </span>
            {editavel ? (
              <button
                type="button"
                onClick={() => void remover(item.id)}
                className="shrink-0 text-ink-muted opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="Remover item"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {editavel ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void adicionar();
            }}
            placeholder="Adicionar um item"
            className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => void adicionar()}
            disabled={!novo.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      ) : null}
    </Secao>
  );
}

function Anexos({
  cartaoId,
  perfilId,
  editavel,
  onContadores,
  onErro,
}: {
  cartaoId: string;
  perfilId: string;
  editavel: boolean;
  onContadores: () => void;
  onErro: (m: string) => void;
}) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await db
      .from("fluxo_anexos")
      .select("id, cartao_id, nome, caminho, tamanho, enviado_por, created_at")
      .eq("cartao_id", cartaoId)
      .order("created_at", { ascending: false });
    setAnexos((data as Anexo[]) ?? []);
  }, [cartaoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(arquivo: File) {
    setEnviando(true);
    const caminho = `${cartaoId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
    const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, arquivo);
    if (erroUpload) {
      setEnviando(false);
      return onErro(`Falha no upload: ${erroUpload.message}`);
    }
    const { error } = await db.from("fluxo_anexos").insert({
      cartao_id: cartaoId,
      nome: arquivo.name,
      caminho,
      tamanho: arquivo.size,
      enviado_por: perfilId,
    });
    if (error) onErro("Arquivo enviado, mas não foi possível registrá-lo.");
    await carregar();
    onContadores();
    setEnviando(false);
  }

  /** O bucket é privado: o acesso se dá por URL assinada, válida por 60 s. */
  async function baixar(anexo: Anexo) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(anexo.caminho, 60);
    if (error || !data) return onErro("Não foi possível gerar o link do arquivo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remover(anexo: Anexo) {
    setAnexos((a) => a.filter((x) => x.id !== anexo.id));
    await supabase.storage.from(BUCKET).remove([anexo.caminho]);
    const { error } = await db.from("fluxo_anexos").delete().eq("id", anexo.id);
    if (error) onErro("Não foi possível remover o anexo.");
    onContadores();
  }

  return (
    <Secao
      icone={Paperclip}
      titulo="Anexos"
      acao={
        editavel ? (
          <button
            type="button"
            onClick={() => campo.current?.click()}
            disabled={enviando}
            className="inline-flex items-center gap-1 rounded-lg border border-input px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-brand disabled:opacity-60"
          >
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {enviando ? "Enviando…" : "Adicionar"}
          </button>
        ) : null
      }
    >
      <input
        ref={campo}
        type="file"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void enviar(arquivo);
          e.target.value = "";
        }}
      />

      {anexos.length === 0 ? (
        <p className="text-xs text-ink-muted">Nenhum arquivo anexado.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {anexos.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <Paperclip className="size-3.5 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.nome}</span>
              <span className="shrink-0 text-[11px] text-ink-muted">
                {tamanhoLegivel(a.tamanho)}
              </span>
              <button
                type="button"
                onClick={() => void baixar(a)}
                className="shrink-0 text-ink-muted transition-colors hover:text-brand"
                aria-label="Baixar anexo"
              >
                <Download className="size-3.5" />
              </button>
              {editavel ? (
                <button
                  type="button"
                  onClick={() => void remover(a)}
                  className="shrink-0 text-ink-muted transition-colors hover:text-destructive"
                  aria-label="Remover anexo"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Secao>
  );
}

function Comentarios({
  cartaoId,
  perfilId,
  membros,
  onContadores,
  onErro,
}: {
  cartaoId: string;
  perfilId: string;
  membros: Membro[];
  onContadores: () => void;
  onErro: (m: string) => void;
}) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    db.from("fluxo_comentarios")
      .select("id, cartao_id, autor_id, texto, created_at")
      .eq("cartao_id", cartaoId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (ativo) setComentarios((data as Comentario[]) ?? []);
      });
    return () => {
      ativo = false;
    };
  }, [cartaoId]);

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo) return;
    setEnviando(true);
    const { data, error } = await db
      .from("fluxo_comentarios")
      .insert({ cartao_id: cartaoId, autor_id: perfilId, texto: limpo })
      .select("id, cartao_id, autor_id, texto, created_at")
      .single();
    setEnviando(false);
    if (error) return onErro("Não foi possível publicar o comentário.");
    setTexto("");
    setComentarios((a) => [data as Comentario, ...a]);
    onContadores();
  }

  async function remover(id: string) {
    setComentarios((a) => a.filter((c) => c.id !== id));
    const { error } = await db.from("fluxo_comentarios").delete().eq("id", id);
    if (error) onErro("Só o autor pode remover o próprio comentário.");
    else onContadores();
  }

  function nomeDe(id: string): string {
    const m = membros.find((x) => x.id === id);
    return m ? m.nome || m.email : "Alguém";
  }

  return (
    <div className="min-w-0 lg:border-l lg:border-border lg:pl-6">
      <h3 className="text-sm font-bold text-ink">Comentários e atividade</h3>

      <div className="mt-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Escrever um comentário…"
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
        >
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Comentar
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {comentarios.length === 0 ? (
          <p className="text-xs text-ink-muted">Nenhum comentário ainda.</p>
        ) : null}
        {comentarios.map((c) => (
          <div key={c.id} className="flex gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
              {iniciais(nomeDe(c.autor_id))}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">{nomeDe(c.autor_id)}</p>
              <p className="text-[11px] text-ink-muted">
                {new Date(c.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-sm text-ink">
                {c.texto}
              </p>
              {c.autor_id === perfilId ? (
                <button
                  type="button"
                  onClick={() => void remover(c.id)}
                  className="mt-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-destructive"
                >
                  Excluir
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
