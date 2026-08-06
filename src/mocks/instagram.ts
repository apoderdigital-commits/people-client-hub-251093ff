/**
 * Dados mockados de métricas orgânicas do Instagram Business. Estrutura
 * pensada para espelhar o que a Instagram Graph API devolve, para que a troca
 * por dados reais depois seja direta.
 */

export type MetricaInstagramDiaria = {
  data: string;
  seguidores: number;
  alcance: number;
  impressoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  visitas_perfil: number;
};

function pseudoAleatorio(semente: number) {
  const x = Math.sin(semente * 78.233) * 12345.6789;
  return x - Math.floor(x);
}

function gerarSerie(dias: number): MetricaInstagramDiaria[] {
  const hoje = new Date();
  let seguidores = 4820;
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - (dias - 1 - i));
    const r = pseudoAleatorio(i + 1);
    const r2 = pseudoAleatorio(i + 17);
    seguidores += Math.round(r * 9);
    const alcance = Math.round(3200 + r * 2600);
    const impressoes = Math.round(alcance * (1.15 + r2 * 0.35));
    const curtidas = Math.round(alcance * (0.05 + r * 0.03));
    const comentarios = Math.round(curtidas * (0.03 + r2 * 0.03));
    const compartilhamentos = Math.round(curtidas * (0.015 + r * 0.015));
    const visitas_perfil = Math.round(alcance * (0.04 + r2 * 0.03));
    return {
      data: d.toISOString().slice(0, 10),
      seguidores,
      alcance,
      impressoes,
      curtidas,
      comentarios,
      compartilhamentos,
      visitas_perfil,
    };
  });
}

export const SERIE_INSTAGRAM: MetricaInstagramDiaria[] = gerarSerie(60);

export type PostagemInstagram = {
  id: string;
  tipo: "Reels" | "Carrossel" | "Foto";
  legenda: string;
  data: string;
  alcance: number;
  curtidas: number;
  comentarios: number;
};

export const POSTAGENS_RECENTES: PostagemInstagram[] = [
  {
    id: "1",
    tipo: "Reels",
    legenda: "Bastidores da campanha de inverno",
    data: "2026-08-04",
    alcance: 18420,
    curtidas: 1240,
    comentarios: 86,
  },
  {
    id: "2",
    tipo: "Carrossel",
    legenda: "Antes e depois — case de sucesso",
    data: "2026-08-02",
    alcance: 9870,
    curtidas: 612,
    comentarios: 34,
  },
  {
    id: "3",
    tipo: "Foto",
    legenda: "Equipe em ação no evento",
    data: "2026-07-30",
    alcance: 6210,
    curtidas: 340,
    comentarios: 19,
  },
  {
    id: "4",
    tipo: "Reels",
    legenda: "Dica rápida para clientes",
    data: "2026-07-27",
    alcance: 22150,
    curtidas: 1580,
    comentarios: 112,
  },
];
