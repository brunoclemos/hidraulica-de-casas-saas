"use client";

import { useRef, useState } from "react";
import { Material, TrechoSalvo, diametrosDe } from "@/lib/calc/pvc-cpvc-pressao";
import { Accordion } from "@/components/Fields";
import { BlocoCadeia, EstadoCadeia, LinhaRevisao } from "@/components/ifc/RevisaoCadeia";
import type { CadeiaImportada, ImportacaoIfc } from "@/lib/ifc/tipos";
import type { EdicaoTrecho } from "@/lib/ifc/trechos";

// O parser só entra no bundle de quem clica em importar: quem faz cálculo manual não paga.
type ModuloIfc = typeof import("@/lib/ifc/trechos");

const LIMITE_BYTES = 80 * 1024 * 1024;

const letra = (i: number) => String.fromCharCode(65 + (i % 26));
const nomeSequencial = (i: number) => `${letra(i)} → ${letra(i + 1)}`;

export function ImportadorIfc({ onInserir }: { onInserir: (trechos: TrechoSalvo[]) => void }) {
  const [importacao, setImportacao] = useState<ImportacaoIfc | null>(null);
  const [revisao, setRevisao] = useState<Record<string, EstadoCadeia>>({});
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const modulo = useRef<ModuloIfc | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  async function ler(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (arquivo.size > LIMITE_BYTES) {
      setErro("Arquivo acima de 80 MB. Exporte só a disciplina hidráulica do modelo.");
      return;
    }
    setLendo(true);
    try {
      const ifc = await import("@/lib/ifc/trechos");
      modulo.current = ifc;
      const texto = await arquivo.text();
      const lida = ifc.importarIfc(texto, { nome: arquivo.name, bytes: arquivo.size });
      setImportacao(lida);
      setRevisao(estadoInicial(lida, ifc));
      requestAnimationFrame(() => tituloRef.current?.focus());
    } catch (falha) {
      console.error("o IFC não foi lido", falha);
      setImportacao(null);
      setErro(falha instanceof Error ? falha.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  function estadoInicial(lida: ImportacaoIfc, ifc: ModuloIfc): Record<string, EstadoCadeia> {
    const estado: Record<string, EstadoCadeia> = {};
    for (const cadeia of lida.cadeias) {
      estado[cadeia.id] = {
        ambiente: cadeia.sistema,
        inseridos: 0,
        linhas: cadeia.trechos.map((t, i) => ({
          nome: nomeSequencial(i),
          trecho: t,
          edicao: ifc.edicaoInicial(t),
          aberta: false,
        })),
      };
    }
    return estado;
  }

  const alterarCadeia = (id: string, patch: Partial<EstadoCadeia>) =>
    setRevisao((atual) => ({ ...atual, [id]: { ...atual[id], ...patch } }));

  const alterarLinha = (id: string, indice: number, patch: Partial<LinhaRevisao>) =>
    setRevisao((atual) => ({
      ...atual,
      [id]: {
        ...atual[id],
        linhas: atual[id].linhas.map((l, i) => (i === indice ? { ...l, ...patch } : l)),
      },
    }));

  const alterarEdicao = (id: string, indice: number, patch: Partial<EdicaoTrecho>) =>
    setRevisao((atual) => ({
      ...atual,
      [id]: {
        ...atual[id],
        linhas: atual[id].linhas.map((l, i) =>
          i === indice ? { ...l, edicao: { ...l.edicao, ...patch } } : l,
        ),
      },
    }));

  // Trocar o material zera as conexões e reclassifica os itens: as duas matrizes de
  // comprimento equivalente não têm um id em comum (16 tipos no PVC, 32 no CPVC).
  function trocarMaterial(cadeia: CadeiaImportada, indice: number, material: Material) {
    const ifc = modulo.current;
    const trecho = revisao[cadeia.id]?.linhas[indice]?.trecho;
    if (!ifc || !trecho) return;
    const itens = ifc.reclassificarItens(trecho.itens, material, trecho.materialIfc);
    const snap = ifc.snapDiametro(trecho.diametroIfcMm, material);
    alterarEdicao(cadeia.id, indice, {
      material,
      diametro: snap.diametro ?? diametrosDe(material)[1].comercial,
      conexoes: ifc.agregarConexoes(itens),
      itens,
    });
  }

  // Inverter troca a ordem dos trechos e o que sobe pelo que desce em cada um.
  function inverterSentido(cadeia: CadeiaImportada) {
    setRevisao((atual) => ({
      ...atual,
      [cadeia.id]: {
        ...atual[cadeia.id],
        linhas: [...atual[cadeia.id].linhas]
          .reverse()
          .map((l) => ({ ...l, edicao: { ...l.edicao, sobe: l.edicao.desce, desce: l.edicao.sobe } })),
      },
    }));
  }

  function inserirCadeias(cadeias: CadeiaImportada[]) {
    const ifc = modulo.current;
    if (!ifc || !importacao) return;
    const salvos: TrechoSalvo[] = [];
    for (const cadeia of cadeias) {
      const estado = revisao[cadeia.id];
      const aguaFria = /(^|\s)AF|fria/i.test(`${cadeia.sistema} ${cadeia.descricaoSistema}`);
      for (const linha of estado.linhas) {
        salvos.push(
          ifc.paraTrechoSalvo(linha.trecho, linha.edicao, {
            ambiente: estado.ambiente.trim(),
            nome: linha.nome,
            arquivo: importacao.arquivo.nome,
            aguaFria,
          }),
        );
      }
    }
    if (!salvos.length) return;
    onInserir(salvos);
    setRevisao((atual) => {
      const proximo = { ...atual };
      for (const cadeia of cadeias) {
        proximo[cadeia.id] = {
          ...proximo[cadeia.id],
          inseridos: proximo[cadeia.id].inseridos + proximo[cadeia.id].linhas.length,
        };
      }
      return proximo;
    });
  }

  function descartar() {
    setImportacao(null);
    setRevisao({});
    setErro(null);
  }

  const pendentes = importacao
    ? importacao.cadeias.filter((c) => revisao[c.id]?.inseridos === 0)
    : [];
  const totalPendente = pendentes.reduce((s, c) => s + (revisao[c.id]?.linhas.length ?? 0), 0);

  return (
    <div className="space-y-4 rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Importar do IFC
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          O arquivo é lido aqui no seu navegador e não é enviado a lugar nenhum. Os trechos entram
          na lista abaixo depois que você conferir.
        </p>
      </div>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void ler(e.dataTransfer.files[0]);
        }}
        className="flex min-h-[96px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-amber/30 bg-amber/5 px-4 py-5 text-center text-sm text-zinc-300 focus-within:border-amber"
      >
        <input
          type="file"
          accept=".ifc"
          className="sr-only"
          onChange={(e) => void ler(e.target.files?.[0])}
        />
        <span>
          {lendo ? "Lendo arquivo…" : "Arraste o arquivo .ifc aqui ou toque para escolher"}
        </span>
      </label>

      {erro && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-red-300"
        >
          {erro}
        </p>
      )}

      <p role="status" aria-live="polite" className="text-[11px] leading-relaxed text-zinc-500">
        {lendo
          ? "Lendo arquivo…"
          : importacao
            ? `Lido em ${importacao.arquivo.ms} ms: ${importacao.cadeias.length} cadeia(s), ${importacao.cadeias.reduce((s, c) => s + c.trechos.length, 0)} trecho(s), ${importacao.isolados.length} peça(s) fora de cadeia.`
            : ""}
      </p>

      {importacao && (
        <>
          <h4
            ref={tituloRef}
            tabIndex={-1}
            className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200 outline-none"
          >
            Confira antes de inserir
          </h4>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {importacao.arquivo.nome} · {importacao.arquivo.schema} · unidade{" "}
            {importacao.arquivo.unidade} · {importacao.arquivo.aplicacao}
          </p>
          {importacao.avisos.map((aviso) => (
            <p key={aviso} className="text-[11px] leading-relaxed text-amber">
              {aviso}
            </p>
          ))}

          {importacao.cadeias.map((cadeia, indiceCadeia) => (
            <BlocoCadeia
              key={cadeia.id}
              cadeia={cadeia}
              numero={indiceCadeia + 1}
              estado={revisao[cadeia.id]}
              onAmbiente={(v) => alterarCadeia(cadeia.id, { ambiente: v })}
              onInverter={() => inverterSentido(cadeia)}
              onMaterial={(i, m) => trocarMaterial(cadeia, i, m)}
              onEdicao={(i, patch) => alterarEdicao(cadeia.id, i, patch)}
              onAbrir={(i, aberta) => alterarLinha(cadeia.id, i, { aberta })}
              onNome={(i, nome) => alterarLinha(cadeia.id, i, { nome })}
              onInserir={() => inserirCadeias([cadeia])}
            />
          ))}

          {importacao.isolados.length > 0 && (
            <Accordion title={`Peças que ficaram de fora (${importacao.isolados.length})`}>
              <ul className="space-y-1 text-[12px] text-zinc-400">
                {agruparIsolados(importacao).map((linha) => (
                  <li key={linha.chave}>
                    <span className="font-semibold text-zinc-300">{linha.quantidade}×</span>{" "}
                    {linha.familia}
                    <span className="text-zinc-600"> · {linha.motivo}</span>
                  </li>
                ))}
              </ul>
            </Accordion>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!totalPendente || pendentes.some(temBitolaPendente(revisao))}
              onClick={() => inserirCadeias(pendentes)}
              className="min-h-11 flex-1 rounded-xl bg-amber px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-[0.98] disabled:bg-ink-700 disabled:text-zinc-500"
            >
              Inserir todas as cadeias ({totalPendente} trechos)
            </button>
            <button
              type="button"
              onClick={descartar}
              className="min-h-11 rounded-xl border border-ink-600 px-4 py-3 text-sm font-semibold text-zinc-400"
            >
              Descartar importação
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const temBitolaPendente =
  (revisao: Record<string, EstadoCadeia>) =>
  (cadeia: CadeiaImportada): boolean =>
    (revisao[cadeia.id]?.linhas ?? []).some((l) => !(l.edicao.diametro > 0));

function agruparIsolados(importacao: ImportacaoIfc) {
  const mapa = new Map<string, { chave: string; familia: string; motivo: string; quantidade: number }>();
  for (const item of importacao.isolados) {
    const chave = `${item.familia}|${item.motivo}`;
    const atual = mapa.get(chave);
    if (atual) atual.quantidade++;
    else mapa.set(chave, { chave, familia: item.familia, motivo: item.motivo, quantidade: 1 });
  }
  return [...mapa.values()];
}

