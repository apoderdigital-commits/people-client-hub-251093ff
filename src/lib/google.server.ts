/**
 * OAuth compartilhado pra Google Ads + GA4: um único refresh token da agência
 * (gerado uma vez via OAuth Playground) autentica os dois, então a troca por
 * access token fica aqui em vez de duplicada em google-ads.server.ts e
 * ga4.server.ts.
 *
 * Só pode ser importado dentro de handlers de server function — as credenciais
 * nunca devem chegar ao navegador.
 */

export type IntegracaoGoogle = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  developer_token: string;
  login_customer_id: string | null;
};

/** Troca o refresh token por um access token de curta duração. */
export async function obterAccessToken(config: IntegracaoGoogle): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: config.refresh_token,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    throw new Error("Não foi possível alcançar o Google. Verifique a conexão.");
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!resposta.ok || !corpo?.access_token) {
    if (corpo?.error === "invalid_grant") {
      throw new Error(
        "O refresh token do Google expirou ou foi revogado. Gere um novo pelo OAuth Playground e salve de novo.",
      );
    }
    throw new Error(
      corpo?.error_description
        ? `Erro do Google: ${corpo.error_description}`
        : "Não foi possível autenticar com o Google.",
    );
  }

  return corpo.access_token;
}

/** Remove hífens/espaços de um ID de conta (Google Ads ou GA4 aceitam com ou sem). */
export function normalizarId(id: string): string {
  return id.replace(/[^0-9]/g, "");
}
