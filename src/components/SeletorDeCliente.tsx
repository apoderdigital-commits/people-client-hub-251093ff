import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { definirClienteSelecionado } from "@/lib/visao-cliente";

/** Uma empresa cadastrada em Configurar Clientes. */
type Empresa = {
  id: string;
  nome: string;
  identificador: string;
};

type Props = {
  /** Rota para onde navegar depois que a empresa é selecionada. */
  destino: "/cliente" | "/cliente/metricas";
};

/** Busca + lista de clientes para a agência escolher qual empresa visualizar. */
export function SeletorDeCliente({ destino }: Props) {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let ativo = true;
    supabase
      .from("clientes")
      .select("id, nome, identificador")
      .order("nome", { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro(error.message);
        else setEmpresas((data as Empresa[]) ?? []);
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return empresas;
    return empresas.filter(
      (e) => e.nome.toLowerCase().includes(t) || e.identificador.toLowerCase().includes(t),
    );
  }, [busca, empresas]);

  function abrir(empresa: Empresa) {
    definirClienteSelecionado({
      cliente_id: empresa.id,
      nome: empresa.nome,
      identificador: empresa.identificador,
    });
    navigate({ to: destino });
  }

  if (carregando) {
    return (
      <div className="mt-8 grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  if (erro) {
    return <p className="mt-8 text-sm text-destructive">{erro}</p>;
  }

  return (
    <div className="mt-7">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou identificador"
          className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-brand"
        />
      </div>

      {filtradas.length === 0 ? (
        <p className="mt-8 text-sm text-ink-muted">
          {empresas.length === 0 ? (
            <>
              Nenhuma empresa cadastrada ainda.{" "}
              <Link to="/agencia/clientes" className="font-semibold text-brand hover:underline">
                Cadastre em Configurar Clientes
              </Link>
              .
            </>
          ) : (
            "Nenhuma empresa encontrada para esta busca."
          )}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtradas.map((empresa) => (
            <button
              key={empresa.id}
              type="button"
              onClick={() => abrir(empresa)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                {empresa.nome.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{empresa.nome}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {empresa.identificador}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
