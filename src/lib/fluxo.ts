/** Tipos e constantes do Fluxo People, compartilhados entre o quadro e o cartão. */

export type Coluna = { id: string; nome: string; ordem: number };

export type Cartao = {
  id: string;
  coluna_id: string;
  titulo: string;
  cliente_id: string | null;
  prazo: string | null;
  ordem: number;
  descricao: string | null;
  entrega_texto: string | null;
  entrega_arte: string | null;
  agendamento: string | null;
  publicacao: string | null;
  prioridade: string | null;
  tipo_post: string | null;
};

export const COLUNAS_CARTAO =
  "id, coluna_id, titulo, cliente_id, prazo, ordem, descricao, entrega_texto, entrega_arte, agendamento, publicacao, prioridade, tipo_post";

export type Vinculo = { cartao_id: string; perfil_id: string };
export type Membro = { id: string; nome: string | null; email: string };
export type ClienteRef = { id: string; nome: string };

export type Etiqueta = { id: string; nome: string; cor: string };
export type CartaoEtiqueta = { cartao_id: string; etiqueta_id: string };

export type ItemChecklist = {
  id: string;
  cartao_id: string;
  texto: string;
  feito: boolean;
  ordem: number;
};

export type Comentario = {
  id: string;
  cartao_id: string;
  autor_id: string;
  texto: string;
  created_at: string;
};

export type Anexo = {
  id: string;
  cartao_id: string;
  nome: string;
  caminho: string;
  tamanho: number;
  enviado_por: string | null;
  created_at: string;
};

/**
 * Classes literais para o Tailwind conseguir enxergá-las na varredura — cor
 * montada em tempo de execução não entra no CSS final.
 */
export const CORES_ETIQUETA: Record<string, string> = {
  pink: "bg-card-pink",
  violet: "bg-card-violet",
  indigo: "bg-card-indigo",
  teal: "bg-card-teal",
  amber: "bg-card-amber",
};

export const CORES_DISPONIVEIS = ["pink", "violet", "indigo", "teal", "amber"] as const;

export function classeDaCor(cor: string): string {
  return CORES_ETIQUETA[cor] ?? "bg-card-amber";
}

export const PRIORIDADES = ["Baixa", "Média", "Alta", "Urgente"] as const;

export const TIPOS_POST = [
  "Feed",
  "Reels",
  "Story",
  "Carrossel",
  "Vídeo",
  "Anúncio",
] as const;

/** Campos de data personalizados, na ordem em que aparecem no cartão. */
export const CAMPOS_DATA: { campo: keyof Cartao; label: string }[] = [
  { campo: "entrega_texto", label: "Entrega do texto" },
  { campo: "entrega_arte", label: "Entrega da arte" },
  { campo: "agendamento", label: "Agendamento" },
  { campo: "publicacao", label: "Publicação" },
  { campo: "prazo", label: "Prazo geral" },
];

export function iniciais(texto: string): string {
  const limpo = texto.trim();
  if (!limpo) return "?";
  const partes = limpo.split(/\s+/);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dataCurta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Chaves do Storage não aceitam qualquer caractere; o nome original fica no banco. */
export function nomeSeguro(nome: string): string {
  return nome.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}
