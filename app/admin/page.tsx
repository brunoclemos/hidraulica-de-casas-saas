"use client";

// Painel ADMIN — restrito (Supabase Auth e-mail+senha; só os e-mails em ADMIN_EMAILS).
// A proteção real é o RLS: as tabelas de telemetria só respondem SELECT para
// usuários autenticados — e os únicos com conta são os admins.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import { MODULOS } from "@/lib/modulos";
import { Wordmark } from "@/components/Brand";

const ADMIN_EMAILS = new Set(["brunoclemos1997@gmail.com", "contato@ferretoengenharia.com.br"]);

// -------------------------------- tipos -----------------------------------

interface UsuarioRow {
  email: string;
  nome: string | null;
  primeiro_acesso: string;
  ultimo_acesso: string;
}
interface AcessoRow {
  email: string;
  tipo: string;
  criado_em: string;
}
interface EventoRow {
  email: string;
  tipo: string;
  detalhe: string | null;
  criado_em: string;
}

interface Dados {
  usuarios: UsuarioRow[];
  acessos: AcessoRow[];
  eventos: EventoRow[];
  projetosPorEmail: Map<string, number>;
}

const NOME_MODULO = new Map(MODULOS.map((m) => [m.slug, m.nome]));

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}min`;
}
function fmtData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ------------------------------- página -----------------------------------

export default function AdminPage() {
  const [sessaoEmail, setSessaoEmail] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const sb = supabase();
    if (!sb) {
      setPronto(true);
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      setSessaoEmail(data.session?.user.email?.toLowerCase() ?? null);
      setPronto(true);
    });
  }, []);

  if (!supabaseConfigurado) {
    return (
      <Casca>
        <p className="text-sm text-zinc-400">
          Painel ainda não configurado (falta conectar o banco de dados).
        </p>
      </Casca>
    );
  }
  if (!pronto) {
    return (
      <Casca>
        <p className="text-sm text-zinc-500">Carregando…</p>
      </Casca>
    );
  }
  if (!sessaoEmail) return <LoginAdmin onOk={(e) => setSessaoEmail(e)} />;
  if (!ADMIN_EMAILS.has(sessaoEmail)) {
    return (
      <Casca>
        <p className="text-sm text-red-400">Esta conta não tem acesso ao painel.</p>
        <button onClick={() => supabase()?.auth.signOut().then(() => location.reload())} className="mt-4 rounded-xl border border-ink-600 px-4 py-2 text-sm text-zinc-300">
          Sair
        </button>
      </Casca>
    );
  }
  return <Painel email={sessaoEmail} />;
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

function LoginAdmin({ onOk }: { onOk: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    const sb = supabase()!;
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user?.email) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }
    onOk(data.user.email.toLowerCase());
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
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
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

function Painel({ email }: { email: string }) {
  const [aba, setAba] = useState<Aba>("geral");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const sb = supabase()!;
    const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [u, a, ev, pr] = await Promise.all([
      sb.from("usuarios").select("*").order("ultimo_acesso", { ascending: false }),
      sb.from("acessos").select("email,tipo,criado_em").gte("criado_em", desde).limit(50000),
      sb.from("eventos").select("email,tipo,detalhe,criado_em").gte("criado_em", desde).limit(50000),
      sb.from("projetos").select("email"),
    ]);
    if (u.error || a.error || ev.error || pr.error) {
      setErro("Falha ao carregar os dados. Recarregue a página.");
      return;
    }
    const projetosPorEmail = new Map<string, number>();
    for (const r of pr.data ?? []) {
      projetosPorEmail.set(r.email, (projetosPorEmail.get(r.email) ?? 0) + 1);
    }
    setDados({ usuarios: u.data ?? [], acessos: a.data ?? [], eventos: ev.data ?? [], projetosPorEmail });
  }, []);

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
            <button onClick={() => supabase()?.auth.signOut().then(() => location.reload())}
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
        {!dados && !erro && <p className="text-sm text-zinc-500">Carregando dados…</p>}
        {dados && aba === "geral" && <VisaoGeral d={dados} />}
        {dados && aba === "alunos" && <TabelaAlunos d={dados} />}
        {aba === "membros" && <Membros aoAdicionar={carregar} />}
      </main>
    </div>
  );
}

// ------------------------------ visão geral --------------------------------

function VisaoGeral({ d }: { d: Dados }) {
  const agora = Date.now();
  const seteDias = agora - 7 * 86400_000;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const ativos7d = new Set(d.acessos.filter((a) => new Date(a.criado_em).getTime() >= seteDias).map((a) => a.email)).size;
  const loginsHoje = d.acessos.filter((a) => a.tipo === "login" && new Date(a.criado_em) >= hoje).length;
  const tempo7dMin = d.acessos.filter((a) => a.tipo === "ping" && new Date(a.criado_em).getTime() >= seteDias).length;

  const usoPorModulo = new Map<string, number>();
  for (const e of d.eventos) {
    if (e.tipo === "modulo_aberto" && e.detalhe) usoPorModulo.set(e.detalhe, (usoPorModulo.get(e.detalhe) ?? 0) + 1);
  }
  const uso = Array.from(usoPorModulo.entries()).sort((a, b) => b[1] - a[1]);
  const maxUso = uso[0]?.[1] ?? 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card titulo="Alunos que já entraram" valor={String(d.usuarios.length)} />
        <Card titulo="Ativos (7 dias)" valor={String(ativos7d)} />
        <Card titulo="Logins hoje" valor={String(loginsHoje)} />
        <Card titulo="Tempo na plataforma (7d)" valor={fmtMin(tempo7dMin)} />
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Uso por ferramenta (30 dias)
        </h3>
        {uso.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem eventos ainda.</p>
        ) : (
          <div className="space-y-2">
            {uso.map(([slug, n]) => (
              <div key={slug} className="flex items-center gap-3">
                <div className="w-56 truncate text-[12px] text-zinc-300">{NOME_MODULO.get(slug) ?? slug}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${(n / maxUso) * 100}%` }} />
                </div>
                <div className="w-12 text-right text-[12px] font-semibold text-zinc-200">{n}</div>
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
  const linhas = useMemo(() => {
    const logins = new Map<string, number>();
    const pings = new Map<string, number>();
    for (const a of d.acessos) {
      const m = a.tipo === "login" ? logins : a.tipo === "ping" ? pings : null;
      if (m) m.set(a.email, (m.get(a.email) ?? 0) + 1);
    }
    return d.usuarios.map((u) => ({
      email: u.email,
      primeiro: u.primeiro_acesso,
      ultimo: u.ultimo_acesso,
      logins: logins.get(u.email) ?? 0,
      tempoMin: pings.get(u.email) ?? 0,
      projetos: d.projetosPorEmail.get(u.email) ?? 0,
    }));
  }, [d]);

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
          {linhas.map((l) => (
            <tr key={l.email} className="border-t border-ink-700">
              <td className="py-2 pr-3 text-zinc-200">{l.email}</td>
              <td className="py-2 text-right text-zinc-400">{fmtData(l.primeiro)}</td>
              <td className="py-2 text-right text-zinc-300">{fmtData(l.ultimo)}</td>
              <td className="py-2 text-right text-zinc-300">{l.logins}</td>
              <td className="py-2 text-right text-zinc-300">{fmtMin(l.tempoMin)}</td>
              <td className="py-2 text-right text-zinc-300">{l.projetos}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-zinc-500">Nenhum acesso registrado ainda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------- membros -----------------------------------

function Membros({ aoAdicionar }: { aoAdicionar: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    try {
      const sb = supabase()!;
      const { data } = await sb.from("config").select("chave,valor").in("chave", ["webhook_add_aluno_url", "webhook_add_aluno_secret"]);
      const cfg = new Map((data ?? []).map((r) => [r.chave, r.valor]));
      const url = cfg.get("webhook_add_aluno_url");
      const secret = cfg.get("webhook_add_aluno_secret");
      if (!url) {
        setMsg({ ok: false, texto: "Webhook de adicionar aluno ainda não configurado." });
        return;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(secret ? { "x-hdc-secret": secret } : {}) },
        body: JSON.stringify({ email: email.trim().toLowerCase(), nome: nome.trim() }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; jaExiste?: boolean };
      if (!res.ok) {
        setMsg({ ok: false, texto: "Falha ao adicionar. Tente novamente." });
        return;
      }
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
