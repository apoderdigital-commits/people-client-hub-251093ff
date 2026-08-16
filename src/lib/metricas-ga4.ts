/** Agrupamento de canais do GA4 pro dashboard do cliente. */

export type CanalId = "meta" | "google_ads" | "organico" | "outros";

export const CANAIS: { id: CanalId; label: string }[] = [
  { id: "meta", label: "Meta" },
  { id: "google_ads", label: "Google Ads" },
  { id: "organico", label: "Orgânico" },
  { id: "outros", label: "Outros canais" },
];

function ehGrupoPago(grupoCanal: string): boolean {
  return grupoCanal.includes("paid") || grupoCanal === "cross-network";
}

/**
 * Mapeia a origem (`sessionSource`) + o grupo de canal padrão do GA4 pros 4
 * grupos do dashboard.
 *
 * Não dá pra usar só o grupo de canal: campanhas do Google Ads que não são
 * de Pesquisa (Performance Max, Shopping, Display) caem em grupos como
 * "Cross-network", não em "Paid Search" — por isso a origem da sessão
 * (`google`) importa tanto quanto o grupo. Mesma lógica pro Meta: assume que
 * é o único canal pago de rede social do cliente — se algum dia rodar
 * anúncio pago em outra rede social, ele cairia aqui também.
 */
export function agruparCanal(fonteBruta: string, canalBruto: string): CanalId {
  const fonte = fonteBruta.trim().toLowerCase();
  const canal = canalBruto.trim().toLowerCase();
  const pago = ehGrupoPago(canal);

  if (pago && fonte === "google") return "google_ads";
  if (pago && /facebook|instagram|(^|\W)fb(\W|$)|(^|\W)ig(\W|$)|meta/.test(fonte)) return "meta";
  if (canal.includes("organic")) return "organico";
  return "outros";
}
