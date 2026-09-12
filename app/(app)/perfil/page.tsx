"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Accordion } from "@/components/Fields";
import { SaveBadge, EstadoSalvo } from "@/components/SaveBadge";
import { tempoRelativo } from "@/lib/projetos";
import {
  Perfil,
  PERFIL_VAZIO,
  LIMITE_LOGO,
  carregarPerfil,
  salvarPerfil,
} from "@/lib/perfil";

// A logo entra embutida em cada PDF: 600 px de largura já imprime nítido no A4.
// Se nem assim couber no LIMITE_LOGO, cai pelas larguras seguintes.
const LARGURAS = [600, 480, 360, 280, 200];
const QUALIDADES_JPEG = [0.92, 0.85, 0.75, 0.6];

function lerArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler esse arquivo."));
    leitor.readAsDataURL(file);
  });
}

function carregarImagem(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Esse arquivo não é uma imagem que o navegador abre."));
    img.src = dataUrl;
  });
}

function reduzir(img: HTMLImageElement, largura: number) {
  const escala = Math.min(1, largura / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não conseguiu processar a imagem.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function temAlfa(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/** Redimensiona e comprime até caber no LIMITE_LOGO. Lança se não couber nem no menor passo. */
async function otimizarLogo(file: File): Promise<string> {
  const img = await carregarImagem(await lerArquivo(file));
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error("Imagem vazia ou corrompida.");
  }
  for (const largura of LARGURAS) {
    const { canvas, ctx } = reduzir(img, largura);
    // Logo de engenharia quase sempre vem com fundo transparente: virar JPEG cravaria
    // um fundo preto na folha do memorial, então com alfa a saída é PNG.
    // Nunca WebP — o react-pdf só embute PNG e JPEG.
    if (temAlfa(ctx, canvas)) {
      const png = canvas.toDataURL("image/png");
      if (png.length <= LIMITE_LOGO) return png;
      continue;
    }
    for (const q of QUALIDADES_JPEG) {
      const jpeg = canvas.toDataURL("image/jpeg", q);
      if (jpeg.length <= LIMITE_LOGO) return jpeg;
    }
  }
  throw new Error(
    "Essa imagem é pesada demais mesmo depois de reduzir. Use a logo em arquivo de marca (traço/vetor exportado em PNG), não uma foto."
  );
}

const kb = (dataUrl: string) => `≈ ${Math.round((dataUrl.length * 0.75) / 1024)} KB`;

export default function PerfilPage() {
  const [p, setP] = useState<Perfil>(PERFIL_VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<EstadoSalvo>("salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [processandoLogo, setProcessandoLogo] = useState(false);
  const [erro, setErro] = useState("");
  const snapshot = useRef(JSON.stringify(PERFIL_VAZIO));
  const arquivo = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Perfil>(k: K, v: Perfil[K]) => setP((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    let vivo = true;
    void carregarPerfil().then((remoto) => {
      if (!vivo) return;
      snapshot.current = JSON.stringify(remoto);
      setP(remoto);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    setEstado(JSON.stringify(p) === snapshot.current ? "salvo" : "nao-salvo");
  }, [p]);

  async function selecionarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // deixa reenviar o mesmo arquivo depois de remover
    if (!file) return;
    setErro("");
    setProcessandoLogo(true);
    try {
      set("logo", await otimizarLogo(file));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao processar a imagem.");
    } finally {
      setProcessandoLogo(false);
    }
  }

  async function salvar() {
    const atual = p;
    setErro("");
    setEstado("salvando");
    try {
      await salvarPerfil(atual);
      snapshot.current = JSON.stringify(atual);
      setSalvoEm(Date.now());
      setEstado("salvo");
    } catch (err) {
      const motivo = err instanceof Error ? err.message : "erro desconhecido";
      // salvarPerfil grava o cache local antes de chamar a API: o dado não se perdeu,
      // só não subiu para a conta.
      setErro(`Salvo neste aparelho, mas não subiu para a sua conta (${motivo}). Toque em Salvar de novo para sincronizar.`);
      setEstado("nao-salvo");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-zinc-100">
            Perfil do escritório
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            É o que sai no cabeçalho do memorial de cálculo que você entrega ao cliente da
            obra. Preencha uma vez e vale para todos os dimensionamentos.
          </p>
        </div>
        {!carregando && (
          <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
        )}
      </div>

      {erro && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-zinc-500">
          Carregando perfil…
        </div>
      ) : (
        <>
          <Accordion title="Dados do escritório" defaultOpen>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField
                  label="Empresa"
                  value={p.empresa}
                  onChange={(v) => set("empresa", v)}
                  placeholder="Ferreto Engenharia"
                  maxLength={120}
                  hint="Nome que aparece em destaque no documento"
                />
              </div>
              <TextField
                label="Responsável técnico"
                value={p.responsavel}
                onChange={(v) => set("responsavel", v)}
                placeholder="Eng. João da Silva"
                maxLength={120}
              />
              <TextField
                label="CREA"
                value={p.crea}
                onChange={(v) => set("crea", v)}
                placeholder="CREA-RS 123456"
                maxLength={60}
                hint="Sai junto da assinatura"
              />
              <TextField
                label="Telefone"
                value={p.telefone}
                onChange={(v) => set("telefone", v)}
                placeholder="(51) 99999-0000"
                maxLength={40}
                type="tel"
              />
              <TextField
                label="Contato"
                value={p.contato}
                onChange={(v) => set("contato", v)}
                placeholder="contato@escritorio.com.br"
                maxLength={160}
                hint="E-mail ou site impresso no documento"
              />
              <div className="sm:col-span-2">
                <TextField
                  label="Cidade"
                  value={p.cidade}
                  onChange={(v) => set("cidade", v)}
                  placeholder="Porto Alegre / RS"
                  maxLength={120}
                  hint="Usada na linha de data do memorial"
                />
              </div>
            </div>
          </Accordion>

          <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
              Logo
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              PNG, JPEG ou WebP. A imagem é reduzida para 600 px de largura aqui no
              navegador, e fundo transparente continua transparente no documento.
            </p>

            <input
              ref={arquivo}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void selecionarLogo(e)}
              className="hidden"
            />

            {p.logo ? (
              <div className="mt-3">
                <div className="flex min-h-[88px] items-center justify-center rounded-xl bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.logo}
                    alt="Prévia da logo do escritório"
                    className="max-h-20 w-auto max-w-full"
                  />
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Prévia sobre o fundo branco do documento · {kb(p.logo)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => arquivo.current?.click()}
                    disabled={processandoLogo}
                    className="rounded-xl border border-ink-600 px-4 py-2.5 text-sm font-medium text-zinc-300 active:scale-95 disabled:opacity-50"
                  >
                    {processandoLogo ? "Processando…" : "Trocar logo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => set("logo", "")}
                    className="rounded-xl px-4 py-2.5 text-sm text-zinc-500 hover:text-red-400"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => arquivo.current?.click()}
                disabled={processandoLogo}
                className="mt-3 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-ink-600 px-4 py-7 text-sm text-zinc-400 active:scale-[0.99] disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 text-amber"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 16l5-5 4 4 3-3 6 6" strokeLinejoin="round" />
                  <circle cx="8.5" cy="9" r="1.5" />
                </svg>
                {processandoLogo ? "Processando…" : "Enviar a logo do escritório"}
              </button>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-500">
                {estado === "salvo"
                  ? "Perfil guardado na sua conta."
                  : "Alterações ainda não salvas."}
              </span>
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={estado === "salvando" || processandoLogo}
                className="shrink-0 rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95 disabled:opacity-60"
              >
                {estado === "salvando" ? "Salvando…" : "Salvar perfil"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength: number;
  type?: "text" | "tel";
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1 rounded-xl border border-ink-600 bg-ink-800 focus-within:border-amber/60">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full bg-transparent px-3 py-3 text-base font-semibold text-zinc-100 outline-none placeholder:font-normal placeholder:text-zinc-600"
        />
      </div>
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}
