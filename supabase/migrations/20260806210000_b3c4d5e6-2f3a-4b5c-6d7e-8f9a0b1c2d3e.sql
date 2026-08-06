-- Expansão do catálogo de métricas do Instagram Business: contas engajadas,
-- visualizações, cliques nos botões de contato (site/ligar/e-mail/rota),
-- salvamentos e interações totais nas publicações, métricas de Reels, e
-- demografia/horários da audiência.

ALTER TABLE public.metricas_instagram_diarias
  ADD COLUMN IF NOT EXISTS contas_engajadas     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visualizacoes        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_site         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_ligar        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_email        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliques_rota         integer NOT NULL DEFAULT 0;

ALTER TABLE public.metricas_instagram_posts
  ADD COLUMN IF NOT EXISTS salvamentos          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interacoes_totais    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reproducoes          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tempo_medio_exibicao numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.metricas_instagram_demografia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  dimensao      text NOT NULL,
  valor         text NOT NULL,
  quantidade    integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, dimensao, valor)
);

GRANT SELECT ON public.metricas_instagram_demografia TO authenticated;
GRANT ALL    ON public.metricas_instagram_demografia TO service_role;
ALTER TABLE public.metricas_instagram_demografia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente ve sua demografia instagram" ON public.metricas_instagram_demografia;
CREATE POLICY "cliente ve sua demografia instagram" ON public.metricas_instagram_demografia
  FOR SELECT TO authenticated
  USING (cliente_id = private.current_cliente_id());

DROP POLICY IF EXISTS "agencia ve toda demografia instagram" ON public.metricas_instagram_demografia;
CREATE POLICY "agencia ve toda demografia instagram" ON public.metricas_instagram_demografia
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'agencia'::public.app_role));

CREATE TABLE IF NOT EXISTS public.metricas_instagram_horarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  hora          integer NOT NULL CHECK (hora >= 0 AND hora <= 23),
  quantidade    integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, hora)
);

GRANT SELECT ON public.metricas_instagram_horarios TO authenticated;
GRANT ALL    ON public.metricas_instagram_horarios TO service_role;
ALTER TABLE public.metricas_instagram_horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente ve seus horarios instagram" ON public.metricas_instagram_horarios;
CREATE POLICY "cliente ve seus horarios instagram" ON public.metricas_instagram_horarios
  FOR SELECT TO authenticated
  USING (cliente_id = private.current_cliente_id());

DROP POLICY IF EXISTS "agencia ve todos horarios instagram" ON public.metricas_instagram_horarios;
CREATE POLICY "agencia ve todos horarios instagram" ON public.metricas_instagram_horarios
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'agencia'::public.app_role));
