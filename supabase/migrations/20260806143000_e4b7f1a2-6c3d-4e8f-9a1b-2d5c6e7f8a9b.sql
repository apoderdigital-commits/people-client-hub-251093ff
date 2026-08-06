-- Integração com o Instagram Business (Instagram Graph API).
--
-- Reaproveita o mesmo token guardado em clientes_secrets.meta_token: um
-- Usuário do Sistema da Meta com os escopos ads_read + instagram_basic +
-- instagram_manage_insights + pages_read_engagement enxerga tanto a conta de
-- anúncios quanto a conta do Instagram Business vinculada à Página do
-- Facebook. Só o ID da conta do Instagram precisa ser configurado à parte.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS instagram_business_account_id text,
  ADD COLUMN IF NOT EXISTS instagram_ultima_sincronizacao timestamptz,
  ADD COLUMN IF NOT EXISTS instagram_erro_sincronizacao text;

CREATE TABLE IF NOT EXISTS public.metricas_instagram_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  data date NOT NULL,
  seguidores integer NOT NULL DEFAULT 0,
  alcance integer NOT NULL DEFAULT 0,
  visitas_perfil integer NOT NULL DEFAULT 0,
  curtidas integer NOT NULL DEFAULT 0,
  comentarios integer NOT NULL DEFAULT 0,
  compartilhamentos integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, data)
);

GRANT SELECT ON public.metricas_instagram_diarias TO authenticated;
GRANT ALL    ON public.metricas_instagram_diarias TO service_role;
ALTER TABLE public.metricas_instagram_diarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente ve suas metricas instagram" ON public.metricas_instagram_diarias;
CREATE POLICY "cliente ve suas metricas instagram" ON public.metricas_instagram_diarias
  FOR SELECT TO authenticated
  USING (cliente_id = public.current_cliente_id());

DROP POLICY IF EXISTS "agencia ve todas metricas instagram" ON public.metricas_instagram_diarias;
CREATE POLICY "agencia ve todas metricas instagram" ON public.metricas_instagram_diarias
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'agencia'));

CREATE INDEX IF NOT EXISTS metricas_instagram_diarias_cliente_data_idx
  ON public.metricas_instagram_diarias (cliente_id, data);

-- Publicações recentes, para a tabela "Publicações recentes" do dashboard.
CREATE TABLE IF NOT EXISTS public.metricas_instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  media_id text NOT NULL,
  tipo text NOT NULL DEFAULT '',
  legenda text NOT NULL DEFAULT '',
  permalink text,
  publicado_em timestamptz,
  alcance integer NOT NULL DEFAULT 0,
  curtidas integer NOT NULL DEFAULT 0,
  comentarios integer NOT NULL DEFAULT 0,
  compartilhamentos integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, media_id)
);

GRANT SELECT ON public.metricas_instagram_posts TO authenticated;
GRANT ALL    ON public.metricas_instagram_posts TO service_role;
ALTER TABLE public.metricas_instagram_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente ve seus posts instagram" ON public.metricas_instagram_posts;
CREATE POLICY "cliente ve seus posts instagram" ON public.metricas_instagram_posts
  FOR SELECT TO authenticated
  USING (cliente_id = public.current_cliente_id());

DROP POLICY IF EXISTS "agencia ve todos posts instagram" ON public.metricas_instagram_posts;
CREATE POLICY "agencia ve todos posts instagram" ON public.metricas_instagram_posts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'agencia'));

CREATE INDEX IF NOT EXISTS metricas_instagram_posts_cliente_data_idx
  ON public.metricas_instagram_posts (cliente_id, publicado_em DESC);
