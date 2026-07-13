"use client";

// Painel ADMIN — login com senha real (tabela admins no D1, verificada no servidor).
// Todos os dados vêm de /api/admin/* com token assinado (12h); o navegador nunca
// acessa o banco direto.

import { useCallback, useEffect, useState } from "react";
import { MODULOS } from "@/lib/modulos";
import { Wordmark } from "@/components/Brand";

const TOKEN_KEY = "hdc:admin-token";

interface Cards {
  total_alunos: number;
  ativos7d: number;
  logins_hoje: number;
  tempo_min7d: number;
}
interface UsoRow { slug: string; n: number }
interface UsuarioRow {
  email: string;
  nome: string | null;
  primeiro_acesso: string;
  ultimo_acesso: string;
  logins30: number;
  tempo_min30: number;
  projetos: number;
}
interface Dados { cards: Cards; uso: UsoRow[]; usuarios: UsuarioRow[] }

const NOME_MODULO = new Map(MODULOS.map((m) => [m.slug, m.nome]));

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}min`;
}
function fmtData(iso: string): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ------------------------------- página -----------------------------------

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setEmail(sessionStorage.getItem(TOKEN_KEY + ":email") || "");
    setPronto(true);
  }, []);

  function sair() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY + ":email");
    location.reload();
  }

  if (!pronto) {
    return (
      <Casca>
        <p className="text-sm text-zinc-500">Carregando…</p>
      </Casca>
    );
  }
  if (!token) {
    return (
      <LoginAdmin
        onOk={(t, e) => {
          sessionStorage.setItem(TOKEN_KEY, t);
          sessionStorage.setItem(TOKEN_KEY + ":email", e);
          setToken(t);
          setEmail(e);
        }}
      />
    );
  }
  return <Painel token={token} email={email} aoExpirar={sair} />;
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center"><Wordmark /></div>
        {children}
      </div>
    </main>
  );
}

// ----------------------------- login admin ---------------------------------

function LoginAdmin({ onOk }: { onOk: (token: string, email: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // trim na senha: espaço/quebra de linha de colagem era 401 silencioso
        body: JSON.stringify({ email: email.trim(), senha: senha.trim() }),
      });
      if (res.status === 401) {
        setErro(
          "E-mail ou senha inválidos. Se o navegador preencheu sozinho, apague o campo e digite a senha atual à mão."
        );
        return;
      }
      if (!res.ok) {
        setErro(
          "Servidor indisponível neste endereço. Acesse pelo domínio oficial: ferramentas.ferretoengenharia.com.br/admin"
        );
        return;
      }
      const d = (await res.json()) as { token: string; email: string };
      onOk(d.token, d.email);
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Casca>
      <h1 className="mb-1 font-display text-lg font-bold text-zinc-100">Painel Admin</h1>
      <p className="mb-5 text-xs text-zinc-500">Acesso restrito.</p>
      <form onSubmit={entrar} className="glass space-y-3 rounded-3xl p-6 text-left">
        <label className="block">
          <span className="field-label">E-mail</span>
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-amber/60" />
        </label>
        <label className="block">
          <span className="field-label">Senha</span>
          {/* new-password: impede o Chrome de preencher senha antiga salva (causa de 401 fantasma) */}
          <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-amber/60" />
        </label>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <button type="submit" disabled={carregando}
          className="w-full rounded-xl bg-amber py-3 font-display text-sm font-bold uppercase tracking-wider text-ink-900 disabled:opacity-60">
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </Casca>
  );
}

// ------------------------------- painel ------------------------------------

type Aba = "geral" | "alunos" | "membros";

function Painel({ token, email, aoExpirar }: { token: string; email: string; aoExpirar: () => void }) {
  const [aba, setAba] = useState<Aba>("geral");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dados", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        aoExpirar();
        return;
      }
      if (!res.ok) {
        setErro("Falha ao carregar os dados. Recarregue a página.");
        return;
      }
      setDados((await res.json()) as Dados);
    } catch {
      setErro("Falha de conexão ao carregar os dados.");
    }
  }, [token, aoExpirar]);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:block">{email}</span>
            <button onClick={aoExpirar}
              className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex gap-2">
          {(
            [["geral", "Visão geral"], ["alunos", "Alunos"], ["membros", "Membros"]] as [Aba, string][]
          ).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                aba === k ? "bg-amber text-ink-900" : "border border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {erro && <p className="text-sm text-red-400">{erro}</p>}
        {!dados && !erro && aba !== "membros" && <p className="text-sm text-zinc-500">Carregando dados…</p>}
        {dados && aba === "geral" && <VisaoGeral d={dados} />}
        {dados && aba === "alunos" && <TabelaAlunos d={dados} />}
        {aba === "membros" && <Membros token={token} aoAdicionar={carregar} aoExpirar={aoExpirar} />}
      </main>
    </div>
  );
}

// ------------------------------ visão geral --------------------------------

function VisaoGeral({ d }: { d: Dados }) {
  const maxUso = d.uso[0]?.n ?? 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card titulo="Alunos que já entraram" valor={String(d.cards.total_alunos)} />
        <Card titulo="Ativos (7 dias)" valor={String(d.cards.ativos7d)} />
        <Card titulo="Logins hoje" valor={String(d.cards.logins_hoje)} />
        <Card titulo="Tempo na plataforma (7d)" valor={fmtMin(d.cards.tempo_min7d)} />
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Uso por ferramenta (30 dias)
        </h3>
        {d.uso.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem eventos ainda.</p>
        ) : (
          <div className="space-y-2">
            {d.uso.map((u) => (
              <div key={u.slug} className="flex items-center gap-3">
                <div className="w-56 truncate text-[12px] text-zinc-300">{NOME_MODULO.get(u.slug) ?? u.slug}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${(u.n / maxUso) * 100}%` }} />
                </div>
                <div className="w-12 text-right text-[12px] font-semibold text-zinc-200">{u.n}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{titulo}</div>
      <div className="mt-1 font-display text-2xl font-bold text-amber">{valor}</div>
    </div>
  );
}

// -------------------------------- alunos -----------------------------------

function TabelaAlunos({ d }: { d: Dados }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-700 bg-ink-800 p-4">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="text-zinc-500">
            <th className="pb-2 font-medium">Aluno</th>
            <th className="pb-2 text-right font-medium">1º acesso</th>
            <th className="pb-2 text-right font-medium">Último acesso</th>
            <th className="pb-2 text-right font-medium">Logins (30d)</th>
            <th className="pb-2 text-right font-medium">Tempo (30d)</th>
            <th className="pb-2 text-right font-medium">Projetos</th>
          </tr>
        </thead>
        <tbody>
          {d.usuarios.map((l) => (
            <tr key={l.email} className="border-t border-ink-700">
              <td className="py-2 pr-3 text-zinc-200">{l.email}</td>
              <td className="py-2 text-right text-zinc-400">{fmtData(l.primeiro_acesso)}</td>
              <td className="py-2 text-right text-zinc-300">{fmtData(l.ultimo_acesso)}</td>
              <td className="py-2 text-right text-zinc-300">{l.logins30}</td>
              <td className="py-2 text-right text-zinc-300">{fmtMin(l.tempo_min30)}</td>
              <td className="py-2 text-right text-zinc-300">{l.projetos}</td>
            </tr>
          ))}
          {d.usuarios.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-zinc-500">Nenhum acesso registrado ainda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------- membros -----------------------------------

function Membros({ token, aoAdicionar, aoExpirar }: { token: string; aoAdicionar: () => void; aoExpirar: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/membros", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), nome: nome.trim() }),
      });
      if (res.status === 401) {
        aoExpirar();
        return;
      }
      if (res.status === 501) {
        setMsg({ ok: false, texto: "Webhook de adicionar aluno ainda não configurado." });
        return;
      }
      if (!res.ok) {
        setMsg({ ok: false, texto: "Falha ao adicionar. Tente novamente." });
        return;
      }
      const corpo = (await res.json()) as { jaExiste?: boolean };
      setMsg({
        ok: true,
        texto: corpo.jaExiste
          ? "Este e-mail já estava na lista de alunos."
          : "Aluno adicionado à planilha — já consegue entrar com esse e-mail.",
      });
      setNome("");
      setEmail("");
      aoAdicionar();
    } catch {
      setMsg({ ok: false, texto: "Falha de conexão ao adicionar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-md rounded-2xl border border-ink-700 bg-ink-800 p-4">
      <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
        Adicionar membro
      </h3>
      <p className="mb-4 text-[12px] text-zinc-500">
        O e-mail entra direto na planilha de alunos — a pessoa já consegue logar em seguida.
      </p>
      <form onSubmit={adicionar} className="space-y-3">
        <label className="block">
          <span className="field-label">Nome (opcional)</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-900/40 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-amber/60" />
        </label>
        <label className="block">
          <span className="field-label">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-900/40 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-amber/60" />
        </label>
        {msg && <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.texto}</p>}
        <button type="submit" disabled={enviando}
          className="w-full rounded-xl bg-amber py-3 font-display text-sm font-bold uppercase tracking-wider text-ink-900 disabled:opacity-60">
          {enviando ? "Adicionando…" : "Adicionar aluno"}
        </button>
      </form>
    </div>
  );
}
