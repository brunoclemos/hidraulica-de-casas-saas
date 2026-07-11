// Telemetria de uso (alimenta o painel admin). Tudo fire-and-forget e no-op sem
// Supabase configurado — nunca trava nem quebra a UI do aluno.

import { supabase } from "./supabase";

const SESSAO_TELEMETRIA_KEY = "hdc:sessao-telemetria";
const PING_INTERVALO_MS = 60_000; // 1 ping/min com a aba visível => tempo na plataforma

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

/** Registra o login: upsert do usuário (último acesso) + linha de acesso. */
export function registrarLogin(email: string) {
  const sb = supabase();
  if (!sb) return;
  void sb
    .from("usuarios")
    .upsert({ email, ultimo_acesso: new Date().toISOString() }, { onConflict: "email" })
    .then(() => {});
  void sb.from("acessos").insert({ email, sessao: sessaoId(), tipo: "login" }).then(() => {});
}

/** Evento de uso (ex.: modulo_aberto, projeto_salvo). */
export function registrarEvento(email: string, tipo: string, detalhe?: string) {
  const sb = supabase();
  if (!sb) return;
  void sb.from("eventos").insert({ email, tipo, detalhe: detalhe ?? null }).then(() => {});
}

/**
 * Heartbeat: 1 ping/min enquanto a aba está visível. O painel calcula
 * "tempo na plataforma" ≈ nº de pings × 1 min. Retorna função de cleanup.
 */
export function iniciarHeartbeat(email: string): () => void {
  const sb = supabase();
  if (!sb || typeof window === "undefined") return () => {};
  const ping = () => {
    if (document.visibilityState !== "visible") return;
    void sb.from("acessos").insert({ email, sessao: sessaoId(), tipo: "ping" }).then(() => {});
  };
  const timer = window.setInterval(ping, PING_INTERVALO_MS);
  return () => window.clearInterval(timer);
}
