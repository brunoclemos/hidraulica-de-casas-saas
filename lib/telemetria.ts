// Telemetria de uso (alimenta o painel admin). Fala com /api/telemetria (Pages
// Function + banco D1, mesma origem). Fire-and-forget: nunca trava nem quebra a
// UI do aluno; em ambiente sem a API (ex.: GitHub Pages) falha em silêncio.

const SESSAO_TELEMETRIA_KEY = "hdc:sessao-telemetria";
const PING_INTERVALO_MS = 60_000; // 1 ping/min com a aba visível => tempo na plataforma

function post(body: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  void fetch("/api/telemetria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

/** Id aleatório estável por sessão de navegação (sessionStorage). */
function sessaoId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem(SESSAO_TELEMETRIA_KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSAO_TELEMETRIA_KEY, id);
  }
  return id;
}

/** Registra o login (atualiza último acesso + linha de acesso). */
export function registrarLogin(email: string) {
  post({ acao: "login", email, sessao: sessaoId() });
}

/** Evento de uso (ex.: modulo_aberto, projeto_salvo). */
export function registrarEvento(email: string, tipo: string, detalhe?: string) {
  post({ acao: "evento", email, tipo, detalhe });
}

/**
 * Heartbeat: 1 ping/min enquanto a aba está visível. O painel calcula
 * "tempo na plataforma" ≈ nº de pings × 1 min. Retorna função de cleanup.
 */
export function iniciarHeartbeat(email: string): () => void {
  if (typeof window === "undefined") return () => {};
  const ping = () => {
    if (document.visibilityState !== "visible") return;
    post({ acao: "ping", email, sessao: sessaoId() });
  };
  const timer = window.setInterval(ping, PING_INTERVALO_MS);
  return () => window.clearInterval(timer);
}
