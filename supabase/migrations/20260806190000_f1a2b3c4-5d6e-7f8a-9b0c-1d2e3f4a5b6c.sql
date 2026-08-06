-- Automações v2: cofre de credenciais (WhatsApp/Evolution por enquanto) e
-- gatilhos por evento do Fluxo People (cartão criado/movido), disparados
-- direto pela trigger do Postgres via pg_net -- não esperam o polling de
-- 5 minutos do gatilho de horário.

CREATE TABLE IF NOT EXISTS public.automacoes_credenciais (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  tipo       text NOT NULL DEFAULT 'evolution_whatsapp',
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.automacoes_credenciais FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.automacoes_credenciais TO service_role;
ALTER TABLE public.automacoes_credenciais ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito: `config` carrega a API key da Evolution. Só a
-- service_role alcança (mesmo padrão de clientes_secrets); CRUD só via
-- server functions, que nunca devolvem o config de volta ao navegador.

CREATE TRIGGER update_automacoes_credenciais_updated_at
  BEFORE UPDATE ON public.automacoes_credenciais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION private.notificar_automacoes_cartao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  segredo text;
BEGIN
  SELECT ac.segredo INTO segredo FROM public.automacoes_config ac LIMIT 1;
  IF segredo IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://sgwskikhhhxhmdasxpkz.supabase.co/functions/v1/executar-automacoes',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-automacao-secret', segredo),
      body := jsonb_build_object('evento', 'cartao_criado', 'cartaoId', NEW.id::text, 'colunaId', NEW.coluna_id::text)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.coluna_id IS DISTINCT FROM OLD.coluna_id THEN
    PERFORM net.http_post(
      url := 'https://sgwskikhhhxhmdasxpkz.supabase.co/functions/v1/executar-automacoes',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-automacao-secret', segredo),
      body := jsonb_build_object(
        'evento', 'cartao_movido',
        'cartaoId', NEW.id::text,
        'colunaId', NEW.coluna_id::text,
        'colunaAnteriorId', OLD.coluna_id::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notificar_automacoes_cartao() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notificar_automacoes_cartao ON public.fluxo_cartoes;
CREATE TRIGGER trg_notificar_automacoes_cartao
  AFTER INSERT OR UPDATE ON public.fluxo_cartoes
  FOR EACH ROW EXECUTE FUNCTION private.notificar_automacoes_cartao();
