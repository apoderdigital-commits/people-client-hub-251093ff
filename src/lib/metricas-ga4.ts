/** Agrupamento de canais do GA4 pro dashboard do cliente. */

export type CanalId = "meta" | "google_ads" | "organico" | "outros";

export const CANAIS: { id: CanalId; label: string }[] = [
  { id: "meta", label: "Meta" },
  { id: "google_ads", label: "Google Ads" },
  { id: "organico", label: "Orgânico" },
  { id: "outros", label: "Outros canais" },
];

/**
 * Mapeia o `sessionDefaultChannelGroup` bruto do GA4 pros 4 grupos do
 * dashboard. "Paid Social" vira Meta assumindo que Meta é o único canal pago
 * de social do cliente — se algum dia rodar anúncio pago em outra rede
 * social, ele cairia aqui também.
 */
export function agruparCanal(canalBruto: string): CanalId {
  const c = canalBruto.trim().toLowerCase();
  if (c === "paid social") return "meta";
  if (c === "paid search") return "google_ads";
  if (c.includes("organic")) return "organico";
  return "outros";
}
