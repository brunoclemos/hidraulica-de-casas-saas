// Utilitários compartilhados das Pages Functions (não é rota).

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function emailValido(e) {
  return typeof e === "string" && EMAIL_RE.test(e) && e.length <= 200;
}

// --- token de admin: base64url(email|exp) + "." + HMAC-SHA256 hex ---------

const enc = new TextEncoder();

async function hmacHex(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function gerarToken(email, secret) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h
  const payload = `${email}|${exp}`;
  const sig = await hmacHex(payload, secret);
  return btoa(payload).replace(/=+$/, "") + "." + sig;
}

/** Retorna o e-mail do admin se o token for válido, senão null. */
export async function verificarToken(request, secret) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  let payload;
  try {
    payload = atob(b64);
  } catch {
    return null;
  }
  const [email, expStr] = payload.split("|");
  if (!email || !expStr || Number(expStr) < Date.now() / 1000) return null;
  const esperado = await hmacHex(payload, secret);
  return sig === esperado ? email : null;
}

// --- senha: PBKDF2-SHA256 100k (mesmos parâmetros do seed local) -----------

export async function hashSenha(senha, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
