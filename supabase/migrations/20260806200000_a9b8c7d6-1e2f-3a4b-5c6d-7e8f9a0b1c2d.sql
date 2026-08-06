-- Expansão do catálogo de métricas da Meta Ads: alcance, frequência, cliques
-- (link/únicos/saída), engajamento com a publicação, vídeo (ThruPlay, 95%,
-- 15s, contínuo 2s, tempo médio), reconhecimento de marca, e uma tabela nova
-- pra segmentações (idade, gênero, plataforma, posicionamento, dispositivo,
-- região, hora do dia) usadas nos gráficos do dashboard.

ALTER TABLE public.metricas_campanhas
  ADD COLUMN IF NOT EXISTS alcance              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_unicos        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_link          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_link_unicos   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_saida         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p95             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_thruplay        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_15s             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_continuo_2s     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_tempo_medio     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconhecimento_est    integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.metricas_campanhas_segmentadas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  dimensao      text NOT NULL,
  valor         text NOT NULL,
  data          date NOT NULL,
  investimento  numeric NOT NULL DEFAULT 0,
  impressoes    integer NOT NULL DEFAULT 0,
  cliques       integer NOT NULL DEFAULT 0,
  leads         integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, dimensao, valor, data)
);

GRANT SELECT ON public.metricas_campanhas_segmentadas TO authenticated;
GRANT ALL    ON public.metricas_campanhas_segmentadas TO service_role;
ALTER TABLE public.metricas_campanhas_segmentadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente ve suas segmentacoes" ON public.metricas_campanhas_segmentadas;
CREATE POLICY "cliente ve suas segmentacoes" ON public.metricas_campanhas_segmentadas
  FOR SELECT TO authenticated
  USING (cliente_id = private.current_cliente_id());

DROP POLICY IF EXISTS "agencia ve todas segmentacoes" ON public.metricas_campanhas_segmentadas;
CREATE POLICY "agencia ve todas segmentacoes" ON public.metricas_campanhas_segmentadas
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'agencia'::public.app_role));

CREATE INDEX IF NOT EXISTS metricas_campanhas_segmentadas_cliente_idx
  ON public.metricas_campanhas_segmentadas (cliente_id, dimensao, data);
