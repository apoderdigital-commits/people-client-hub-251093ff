/**
 * Catálogo de indicadores do dashboard de Instagram Business — mesmo padrão
 * de `@/lib/metricas`, mas para as métricas orgânicas do Instagram.
 */

export type MetricaInstagramId =
  | "seguidores"
  | "alcance"
  | "visitas_perfil"
  | "curtidas"
  | "comentarios"
  | "engajamento";

export const METRICAS_INSTAGRAM: {
  id: MetricaInstagramId;
  label: string;
  formato: "num" | "pct";
}[] = [
  { id: "seguidores", label: "Seguidores", formato: "num" },
  { id: "alcance", label: "Alcance", formato: "num" },
  { id: "visitas_perfil", label: "Visitas ao Perfil", formato: "num" },
  { id: "curtidas", label: "Curtidas", formato: "num" },
  { id: "comentarios", label: "Comentários", formato: "num" },
  { id: "engajamento", label: "Taxa de Engajamento", formato: "pct" },
];

export const METRICAS_INSTAGRAM_PADRAO: MetricaInstagramId[] = METRICAS_INSTAGRAM.map(
  (m) => m.id,
);

export function ehMetricaInstagramValida(valor: unknown): valor is MetricaInstagramId {
  return typeof valor === "string" && METRICAS_INSTAGRAM.some((m) => m.id === valor);
}

/** Normaliza o que veio do banco, caindo no padrão (todas) quando estiver vazio. */
export function lerMetricasInstagramConfig(valor: unknown): MetricaInstagramId[] {
  if (!Array.isArray(valor)) return METRICAS_INSTAGRAM_PADRAO;
  const ids = valor.filter(ehMetricaInstagramValida);
  return ids.length > 0 ? ids : METRICAS_INSTAGRAM_PADRAO;
}
