// TeIA · função "ia" (substitui o ia_proxy.php)
// Recebe { token, payload } do navegador, confere a sessão e a permissão de IA
// no banco (teia_ia_chave), pega a chave da Anthropic guardada no banco e
// repassa o pedido em streaming (SSE) para o navegador.
// Implantar com "Verify JWT" DESLIGADO: a checagem é feita pelo token do TeIA.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELOS = /^claude-(sonnet|haiku|opus)-[\w.-]+$/;

function erro(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return erro(405, "Use POST");

  let corpo: { token?: string; payload?: Record<string, unknown> };
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "Corpo inválido");
  }
  const token = String(corpo.token || "");
  const payload = corpo.payload || {};
  if (!token) return erro(401, "Sessão expirada. Entre novamente.");

  // 1) Sessão + permissão + chave (função do banco acessível só à service_role)
  const url = Deno.env.get("SUPABASE_URL")!;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/rest/v1/rpc/teia_ia_chave`, {
    method: "POST",
    headers: { apikey: srk, Authorization: `Bearer ${srk}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  const info = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = String(info?.message || "");
    return erro(m === "SESSAO_INVALIDA" ? 401 : 500, m === "SESSAO_INVALIDA" ? "Sessão expirada. Entre novamente." : "Falha ao validar a sessão.");
  }
  if (info.error) return erro(403, info.error);

  // 2) Pedido para a Anthropic, com limites para evitar uso indevido
  const model = String(payload.model || "claude-sonnet-4-5");
  if (!MODELOS.test(model)) return erro(400, "Modelo não permitido.");
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) return erro(400, "Sem mensagens.");
  const body = {
    model,
    max_tokens: Math.min(Number(payload.max_tokens) || 4000, 16000),
    stream: payload.stream !== false,
    messages,
    ...(payload.system ? { system: payload.system } : {}),
    ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
  };

  const up = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": info.key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!up.ok || !up.body) {
    const t = await up.text().catch(() => "");
    let msg = `Erro da IA (HTTP ${up.status})`;
    try {
      msg = JSON.parse(t)?.error?.message || msg;
    } catch { /* texto */ }
    return erro(up.status >= 400 && up.status < 600 ? up.status : 502, msg);
  }

  return new Response(up.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": body.stream ? "text/event-stream; charset=utf-8" : "application/json",
      "Cache-Control": "no-cache",
    },
  });
});
