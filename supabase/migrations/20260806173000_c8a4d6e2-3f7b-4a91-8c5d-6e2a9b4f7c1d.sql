-- Automações (estilo n8n): quadro de nós + agendador real via pg_cron/pg_net
-- chamando uma Edge Function a cada 5 minutos.
--
-- Conjunto fechado de nós de propósito: só o que já faz sentido neste
-- sistema (sincronizar Meta/Instagram, mover cartões vencidos), não um nó de
-- HTTP genérico.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.automacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  ativo           boolean NOT NULL DEFAULT true,
  nos             jsonb NOT NULL DEFAULT '[]'::jsonb,
  conexoes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ultima_execucao timestamptz,
  criado_por      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automacoes TO authenticated;
GRANT ALL ON public.automacoes TO service_role;
ALTER TABLE public.automacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin usa automacoes" ON public.automacoes;
CREATE POLICY "admin usa automacoes" ON public.automacoes
  FOR ALL TO authenticated
  USING (public.is_equipe_admin(auth.uid()))
  WITH CHECK (public.is_equipe_admin(auth.uid()));

CREATE TRIGGER update_automacoes_updated_at
  BEFORE UPDATE ON public.automacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.automacoes_execucoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id   uuid NOT NULL REFERENCES public.automacoes(id) ON DELETE CASCADE,
  iniciado_em    timestamptz NOT NULL DEFAULT now(),
  finalizado_em  timestamptz,
  status         text NOT NULL DEFAULT 'executando',
  resultado      jsonb,
  erro           text
);

GRANT SELECT ON public.automacoes_execucoes TO authenticated;
GRANT ALL    ON public.automacoes_execucoes TO service_role;
ALTER TABLE public.automacoes_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin ve execucoes" ON public.automacoes_execucoes;
CREATE POLICY "admin ve execucoes" ON public.automacoes_execucoes
  FOR SELECT TO authenticated
  USING (public.is_equipe_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS automacoes_execucoes_automacao_idx
  ON public.automacoes_execucoes (automacao_id, iniciado_em DESC);

-- Segredo compartilhado entre o pg_cron (que roda dentro do Postgres) e a
-- Edge Function: nenhuma das duas pontas precisa de uma variável de ambiente
-- nova, o valor vive só nesta tabela, sem policy nenhuma (só service_role
-- alcança, exatamente como clientes_secrets).
CREATE TABLE IF NOT EXISTS public.automacoes_config (
  id      boolean PRIMARY KEY DEFAULT true CHECK (id),
  segredo text NOT NULL
);

REVOKE ALL ON public.automacoes_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.automacoes_config TO service_role;
ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.automacoes_config (id, segredo)
VALUES (true, '6450cc382ba64e53b7d6478f265503f5d910ea55858115368aee8cc21eeb0cd7')
ON CONFLICT (id) DO NOTHING;

-- Roda a cada 5 minutos; a Edge Function decide se algum "gatilho: horário"
-- bateu (comparando com o fuso de Brasília) e evita rodar duas vezes no
-- mesmo dia usando `automacoes.ultima_execucao`.
SELECT cron.schedule(
  'automacoes-people',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sgwskikhhhxhmdasxpkz.supabase.co/functions/v1/executar-automacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automacao-secret', (SELECT segredo FROM public.automacoes_config)
    ),
    body := '{}'::jsonb
  );
  $$
);
