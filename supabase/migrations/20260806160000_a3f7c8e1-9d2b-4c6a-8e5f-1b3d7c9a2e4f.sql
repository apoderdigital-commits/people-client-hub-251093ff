-- Login do cliente criado pela agência, KPIs configuráveis do Instagram, e
-- métricas de reprodução de vídeo no Meta Ads.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS instagram_kpis jsonb;

ALTER TABLE public.metricas_diarias
  ADD COLUMN IF NOT EXISTS video_p25 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p50 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p75 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100 integer NOT NULL DEFAULT 0;

ALTER TABLE public.metricas_campanhas
  ADD COLUMN IF NOT EXISTS video_p25 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p50 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p75 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100 integer NOT NULL DEFAULT 0;
