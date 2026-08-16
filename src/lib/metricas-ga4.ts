/** Agrupamento de canais do GA4 pro dashboard do cliente. */

export type CanalId = "meta" | "google_ads" | "organico" | "outros";

export const CANAIS: { id: CanalId; label: string }[] = [
  { id: "meta", label: "Meta" },
  { id: "google_ads", label: "Google Ads" },
  { id: "organico", label: "Orgânico" },
  { id: "outros", label: "Outros canais" },
];

/**
 * Em vez de listar quais grupos de canal são pagos (lista que fica velha
 * toda vez que o Google cria um grupo novo — "Display" não tem "paid" no
 * nome, mas é pago), listamos os grupos que são claramente NÃO pagos e
 * tratamos todo o resto como pago.
 */
function ehGrupoNaoPago(grupoCanal: string): boolean {
  return (
    grupoCanal.includes("organic") ||
    grupoCanal === "direct" ||
    grupoCanal === "referral" ||
    grupoCanal === "email" ||
    grupoCanal === "affiliates" ||
    grupoCanal === "unassigned" ||
    grupoCanal === "sms" ||
    grupoCanal.includes("push")
  );
}

/**
 * Mapeia a origem (`sessionSource`) + o grupo de canal padrão do GA4 pros 4
 * grupos do dashboard.
 *
 * Não dá pra usar só o grupo de canal: campanhas do Google Ads que não são
 * de Pesquisa (Performance Max, Shopping, Display, YouTube) caem em grupos
 * como "Cross-network", "Display" ou "Paid Video", não em "Paid Search" —
 * por isso a origem da sessão importa tanto quanto o grupo. Vídeo do
 * YouTube usa `youtube`/`youtube.com` como origem, não `google`. Mesma
 * lógica pro Meta: assume que é o único canal pago de rede social do
 * cliente — se algum dia rodar anúncio pago em outra rede social, ele
 * cairia aqui também.
 */
export function agruparCanal(fonteBruta: string, canalBruto: string): CanalId {
  const fonte = fonteBruta.trim().toLowerCase();
  const canal = canalBruto.trim().toLowerCase();
  const pago = !ehGrupoNaoPago(canal);

  if (pago && /^google$|youtube/.test(fonte)) return "google_ads";
  if (pago && /facebook|instagram|(^|\W)fb(\W|$)|(^|\W)ig(\W|$)|meta/.test(fonte)) return "meta";
  if (canal.includes("organic")) return "organico";
  return "outros";
}
