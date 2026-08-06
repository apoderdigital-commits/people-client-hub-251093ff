CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_cliente_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cliente_id FROM public.profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION private.is_equipe(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'agencia'); $$;

CREATE OR REPLACE FUNCTION private.is_equipe_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'agencia' AND equipe_role::text IN ('super_admin','admin')); $$;

CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND equipe_role = 'super_admin'); $$;

REVOKE ALL ON FUNCTION private.current_cliente_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_equipe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_equipe_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_cliente_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_equipe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_equipe_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO authenticated, service_role;

-- profiles
DROP POLICY IF EXISTS "agencia select all profiles" ON public.profiles;
CREATE POLICY "agencia select all profiles" ON public.profiles FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'agencia'::public.app_role));
DROP POLICY IF EXISTS "equipe admin update profiles" ON public.profiles;
CREATE POLICY "equipe admin update profiles" ON public.profiles FOR UPDATE TO authenticated USING (private.is_equipe_admin(auth.uid())) WITH CHECK (private.is_equipe_admin(auth.uid()));

-- metricas_diarias
DROP POLICY IF EXISTS "cliente ve suas metricas" ON public.metricas_diarias;
CREATE POLICY "cliente ve suas metricas" ON public.metricas_diarias FOR SELECT TO authenticated USING (cliente_id = private.current_cliente_id());
DROP POLICY IF EXISTS "agencia ve todas metricas" ON public.metricas_diarias;
CREATE POLICY "agencia ve todas metricas" ON public.metricas_diarias FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'agencia'::public.app_role));

-- clientes
DROP POLICY IF EXISTS "equipe ve clientes" ON public.clientes;
CREATE POLICY "equipe ve clientes" ON public.clientes FOR SELECT TO authenticated USING (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe cria clientes" ON public.clientes;
CREATE POLICY "equipe cria clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe edita clientes" ON public.clientes;
CREATE POLICY "equipe edita clientes" ON public.clientes FOR UPDATE TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "super admin remove clientes" ON public.clientes;
CREATE POLICY "super admin remove clientes" ON public.clientes FOR DELETE TO authenticated USING (private.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "cliente ve seu proprio cliente" ON public.clientes;
CREATE POLICY "cliente ve seu proprio cliente" ON public.clientes FOR SELECT TO authenticated USING (id = private.current_cliente_id());

-- metricas_instagram_posts
DROP POLICY IF EXISTS "cliente ve seus posts instagram" ON public.metricas_instagram_posts;
CREATE POLICY "cliente ve seus posts instagram" ON public.metricas_instagram_posts FOR SELECT TO authenticated USING (cliente_id = private.current_cliente_id());
DROP POLICY IF EXISTS "agencia ve todos posts instagram" ON public.metricas_instagram_posts;
CREATE POLICY "agencia ve todos posts instagram" ON public.metricas_instagram_posts FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'agencia'::public.app_role));

-- metricas_campanhas
DROP POLICY IF EXISTS "cliente ve suas campanhas" ON public.metricas_campanhas;
CREATE POLICY "cliente ve suas campanhas" ON public.metricas_campanhas FOR SELECT TO authenticated USING (cliente_id = private.current_cliente_id());
DROP POLICY IF EXISTS "agencia ve todas campanhas" ON public.metricas_campanhas;
CREATE POLICY "agencia ve todas campanhas" ON public.metricas_campanhas FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'agencia'::public.app_role));

-- metricas_instagram_diarias
DROP POLICY IF EXISTS "cliente ve suas metricas instagram" ON public.metricas_instagram_diarias;
CREATE POLICY "cliente ve suas metricas instagram" ON public.metricas_instagram_diarias FOR SELECT TO authenticated USING (cliente_id = private.current_cliente_id());
DROP POLICY IF EXISTS "agencia ve todas metricas instagram" ON public.metricas_instagram_diarias;
CREATE POLICY "agencia ve todas metricas instagram" ON public.metricas_instagram_diarias FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'agencia'::public.app_role));

-- fluxo_*
DROP POLICY IF EXISTS "equipe usa colunas do fluxo" ON public.fluxo_colunas;
CREATE POLICY "equipe usa colunas do fluxo" ON public.fluxo_colunas FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe usa cartoes do fluxo" ON public.fluxo_cartoes;
CREATE POLICY "equipe usa cartoes do fluxo" ON public.fluxo_cartoes FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe usa responsaveis do fluxo" ON public.fluxo_responsaveis;
CREATE POLICY "equipe usa responsaveis do fluxo" ON public.fluxo_responsaveis FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe usa fluxo_etiquetas" ON public.fluxo_etiquetas;
CREATE POLICY "equipe usa fluxo_etiquetas" ON public.fluxo_etiquetas FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe usa fluxo_cartao_etiquetas" ON public.fluxo_cartao_etiquetas;
CREATE POLICY "equipe usa fluxo_cartao_etiquetas" ON public.fluxo_cartao_etiquetas FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe usa fluxo_checklist" ON public.fluxo_checklist;
CREATE POLICY "equipe usa fluxo_checklist" ON public.fluxo_checklist FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe usa fluxo_anexos" ON public.fluxo_anexos;
CREATE POLICY "equipe usa fluxo_anexos" ON public.fluxo_anexos FOR ALL TO authenticated USING (private.is_equipe(auth.uid())) WITH CHECK (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe le comentarios" ON public.fluxo_comentarios;
CREATE POLICY "equipe le comentarios" ON public.fluxo_comentarios FOR SELECT TO authenticated USING (private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "autor cria comentario" ON public.fluxo_comentarios;
CREATE POLICY "autor cria comentario" ON public.fluxo_comentarios FOR INSERT TO authenticated WITH CHECK (private.is_equipe(auth.uid()) AND autor_id = auth.uid());

-- automacoes
DROP POLICY IF EXISTS "admin usa automacoes" ON public.automacoes;
CREATE POLICY "admin usa automacoes" ON public.automacoes FOR ALL TO authenticated USING (private.is_equipe_admin(auth.uid())) WITH CHECK (private.is_equipe_admin(auth.uid()));
DROP POLICY IF EXISTS "admin ve execucoes" ON public.automacoes_execucoes;
CREATE POLICY "admin ve execucoes" ON public.automacoes_execucoes FOR SELECT TO authenticated USING (private.is_equipe_admin(auth.uid()));

DROP FUNCTION IF EXISTS public.current_cliente_id();
DROP POLICY IF EXISTS "equipe le anexos do fluxo" ON storage.objects;
CREATE POLICY "equipe le anexos do fluxo" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fluxo-anexos' AND private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe envia anexos do fluxo" ON storage.objects;
CREATE POLICY "equipe envia anexos do fluxo" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fluxo-anexos' AND private.is_equipe(auth.uid()));
DROP POLICY IF EXISTS "equipe apaga anexos do fluxo" ON storage.objects;
CREATE POLICY "equipe apaga anexos do fluxo" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'fluxo-anexos' AND private.is_equipe(auth.uid()));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_equipe(uuid);
DROP FUNCTION IF EXISTS public.is_equipe_admin(uuid);
DROP FUNCTION IF EXISTS public.is_super_admin(uuid);