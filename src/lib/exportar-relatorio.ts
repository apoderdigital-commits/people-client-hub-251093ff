/**
 * Exportar um trecho da tela como PNG. Carrega `html2canvas` sob demanda
 * (só quem clica em "Baixar PNG" paga o custo no bundle) e baixa o arquivo
 * direto, sem passar por nenhum servidor.
 */
export async function baixarComoPng(elemento: HTMLElement, nomeArquivo: string): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const fundo = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const canvas = await html2canvas(elemento, {
    backgroundColor: fundo,
    scale: 2,
    useCORS: true,
  });
  const link = document.createElement("a");
  link.download = `${nomeArquivo}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
