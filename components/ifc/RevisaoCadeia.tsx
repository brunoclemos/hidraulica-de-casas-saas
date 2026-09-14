"use client";

import { Material, conexoesDe, diametrosDe } from "@/lib/calc/pvc-cpvc-pressao";
import type { CadeiaImportada, ItemImportado, TrechoImportado } from "@/lib/ifc/tipos";
import type { EdicaoTrecho } from "@/lib/ifc/trechos";

export interface LinhaRevisao {
  nome: string;
  /** O trecho lido do IFC. Anda junto com a linha: inverter o sentido reordena as linhas. */
  trecho: TrechoImportado;
  edicao: EdicaoTrecho;
  aberta: boolean;
}

export interface EstadoCadeia {
  ambiente: string;
  linhas: LinhaRevisao[];
  /** Quantos trechos desta cadeia já foram inseridos no projeto. */
  inseridos: number;
}

const nomeConexao = (material: Material, id: string) =>
  conexoesDe(material).find((c) => c.id === id)?.nome ?? id;

const contarCampo = (itens: ItemImportado[], campo: string) =>
  itens.filter((i) => i.destino.tipo === "campo" && i.destino.campo === campo).length;

export function BlocoCadeia({
  cadeia,
  numero,
  estado,
  onAmbiente,
  onInverter,
  onMaterial,
  onEdicao,
  onAbrir,
  onNome,
  onInserir,
}: {
  cadeia: CadeiaImportada;
  numero: number;
  estado: EstadoCadeia;
  onAmbiente: (v: string) => void;
  onInverter: () => void;
  onMaterial: (indice: number, material: Material) => void;
  onEdicao: (indice: number, patch: Partial<EdicaoTrecho>) => void;
  onAbrir: (indice: number, aberta: boolean) => void;
  onNome: (indice: number, nome: string) => void;
  onInserir: () => void;
}) {
  if (!estado) return null;
  const confiavel = cadeia.sentido.confiavel;
  const faltaBitola = estado.linhas.some((l) => !(l.edicao.diametro > 0));

  if (estado.inseridos > 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-ink-800/60 p-4 text-sm text-zinc-300">
        {estado.inseridos} trecho(s) inserido(s) · Cadeia {numero} ({cadeia.sistema})
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border bg-ink-800/60 p-4 ${confiavel ? "border-ink-600" : "border-amber/40"}`}
    >
      <h5 className="font-display text-sm font-bold text-zinc-100">
        Cadeia {numero} · {cadeia.sistema}
        {cadeia.descricaoSistema ? ` (${cadeia.descricaoSistema})` : ""}
      </h5>
      <p className="mt-0.5 text-[12px] text-zinc-400">
        {cadeia.origem} → {cadeia.destino}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-zinc-500">sentido: {cadeia.sentido.regra}</span>
        <button
          type="button"
          onClick={onInverter}
          className="min-h-11 rounded-xl border border-ink-600 px-3 py-2 text-xs font-semibold text-amber"
        >
          Inverter sentido
        </button>
      </div>
      {!confiavel && (
        <p className="mt-1 text-[11px] leading-relaxed text-amber">
          Confira o sentido do fluxo: o IFC não deu evidência suficiente para decidir sozinho.
        </p>
      )}
      {cadeia.bifurcacoes > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-amber">
          Esta cadeia tem {cadeia.bifurcacoes} derivação(ões); a leitura seguiu um caminho só.
        </p>
      )}

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
          Ambiente (vale para todos os trechos desta cadeia)
        </span>
        <input
          value={estado.ambiente}
          onChange={(e) => onAmbiente(e.target.value)}
          placeholder="Ex.: Banheiro suíte"
          className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-3 text-base font-semibold text-zinc-100 outline-none focus:border-amber/60"
        />
      </label>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
              <th scope="col" className="py-1 pr-2">Trecho</th>
              <th scope="col" className="py-1 pr-2">Material</th>
              <th scope="col" className="py-1 pr-2">Ø</th>
              <th scope="col" className="py-1 pr-2">L real (m)</th>
              <th scope="col" className="py-1 pr-2">Sobe (m)</th>
              <th scope="col" className="py-1 pr-2">Desce (m)</th>
              <th scope="col" className="py-1 pr-2">Vazão (L/min)</th>
              <th scope="col" className="py-1">Origem</th>
            </tr>
          </thead>
          <tbody>
            {estado.linhas.map((linha, i) => (
              <LinhaTrechoRevisao
                key={i}
                linha={linha}
                onMaterial={(m) => onMaterial(i, m)}
                onEdicao={(patch) => onEdicao(i, patch)}
                onAbrir={(aberta) => onAbrir(i, aberta)}
                onNome={(nome) => onNome(i, nome)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        A vazão é sua (regra do curso): deixe em branco para preencher depois, editando o trecho.
      </p>

      <button
        type="button"
        disabled={faltaBitola}
        onClick={onInserir}
        className="mt-3 min-h-11 w-full rounded-xl bg-amber px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-[0.98] disabled:bg-ink-700 disabled:text-zinc-500"
      >
        + Inserir os {estado.linhas.length} trechos desta cadeia
      </button>
      {faltaBitola && (
        <p className="mt-1 text-[11px] text-amber">
          Escolha a bitola do trecho que ficou fora da tabela antes de inserir.
        </p>
      )}
    </div>
  );
}

function LinhaTrechoRevisao({
  linha,
  onMaterial,
  onEdicao,
  onAbrir,
  onNome,
}: {
  linha: LinhaRevisao;
  onMaterial: (material: Material) => void;
  onEdicao: (patch: Partial<EdicaoTrecho>) => void;
  onAbrir: (aberta: boolean) => void;
  onNome: (nome: string) => void;
}) {
  const { edicao, trecho } = linha;
  const heuristicos = edicao.itens.filter((i) => i.destino.confianca === "heuristico").length;
  const ignorados = edicao.itens.filter((i) => i.destino.tipo === "ignorado").length;
  const badges = [
    trecho.confiancaDiametro === "heuristico" ? "Ø heurístico" : "",
    heuristicos ? `${heuristicos} heurísticos` : "",
    ignorados ? `${ignorados} ignorados` : "",
    contarCampo(edicao.itens, "monocomando") ? "monocomando: escolher curva" : "",
    contarCampo(edicao.itens, "incrementoPressurizador") ? "pressurizador: informar mca" : "",
    contarCampo(edicao.itens, "qtdValvulaMisturadora") ? "válvula misturadora" : "",
  ].filter(Boolean);

  return (
    <>
      <tr className="border-t border-ink-700 align-top">
        <td className="py-2 pr-2">
          <input
            value={linha.nome}
            aria-label="Nome do trecho"
            onChange={(e) => onNome(e.target.value)}
            className="min-h-11 w-24 rounded-lg border border-ink-600 bg-ink-800 px-2 py-2 text-[12px] font-semibold text-zinc-100 outline-none focus:border-amber/60"
          />
        </td>
        <td className="py-2 pr-2">
          <select
            value={edicao.material}
            aria-label={`Material do trecho ${linha.nome}`}
            onChange={(e) => onMaterial(e.target.value as Material)}
            className="min-h-11 rounded-lg border border-ink-600 bg-ink-800 px-2 py-2 text-[12px] font-semibold text-zinc-100 outline-none focus:border-amber/60"
          >
            <option value="PVC">PVC</option>
            <option value="CPVC">CPVC</option>
          </select>
        </td>
        <td className="py-2 pr-2">
          <select
            value={edicao.diametro}
            aria-label={`Diâmetro do trecho ${linha.nome}`}
            onChange={(e) => onEdicao({ diametro: Number(e.target.value) })}
            className="min-h-11 rounded-lg border border-ink-600 bg-ink-800 px-2 py-2 text-[12px] font-semibold text-zinc-100 outline-none focus:border-amber/60"
          >
            {!(edicao.diametro > 0) && <option value={0}>escolha o Ø</option>}
            {diametrosDe(edicao.material).map((d) => (
              <option key={d.comercial} value={d.comercial} className="bg-ink-800">
                {d.comercial} mm
              </option>
            ))}
          </select>
        </td>
        <CelulaNumero
          rotulo={`Comprimento real do trecho ${linha.nome}`}
          valor={edicao.comprimentoReal}
          onChange={(v) => onEdicao({ comprimentoReal: v })}
        />
        <CelulaNumero
          rotulo={`Elevação que sobe no trecho ${linha.nome}`}
          valor={edicao.sobe}
          onChange={(v) => onEdicao({ sobe: v })}
        />
        <CelulaNumero
          rotulo={`Elevação que desce no trecho ${linha.nome}`}
          valor={edicao.desce}
          onChange={(v) => onEdicao({ desce: v })}
        />
        <CelulaNumero
          rotulo={`Vazão manual do trecho ${linha.nome}`}
          valor={edicao.vazaoLmin}
          onChange={(v) => onEdicao({ vazaoLmin: v })}
        />
        <td className="py-2">
          <div className="flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-semibold text-amber"
              >
                {b}
              </span>
            ))}
            <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] text-zinc-400">
              IFC {trecho.materialIfc} Ø{trecho.diametroIfcMm} · {trecho.qtdTubos} tubos
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAbrir(!linha.aberta)}
            aria-expanded={linha.aberta}
            className="mt-1 min-h-11 text-[11px] font-semibold text-amber"
          >
            {linha.aberta ? "esconder itens" : `ver itens (${edicao.itens.length})`}
          </button>
        </td>
      </tr>
      {linha.aberta && (
        <tr className="border-t border-ink-800">
          <td colSpan={8} className="py-3">
            <DetalheDoTrecho edicao={edicao} onEdicao={onEdicao} nome={linha.nome} />
          </td>
        </tr>
      )}
    </>
  );
}

function CelulaNumero({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <td className="py-2 pr-2">
      <input
        type="number"
        inputMode="decimal"
        step={0.01}
        aria-label={rotulo}
        value={Number.isFinite(valor) ? Number(valor.toFixed(4)) : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onWheel={(e) => e.currentTarget.blur()}
        className="min-h-11 w-20 rounded-lg border border-ink-600 bg-ink-800 px-2 py-2 text-[12px] font-semibold text-zinc-100 outline-none focus:border-amber/60"
      />
    </td>
  );
}

function DetalheDoTrecho({
  edicao,
  onEdicao,
  nome,
}: {
  edicao: EdicaoTrecho;
  onEdicao: (patch: Partial<EdicaoTrecho>) => void;
  nome: string;
}) {
  const setConexao = (id: string, qtd: number) =>
    onEdicao({ conexoes: { ...edicao.conexoes, [id]: Math.max(0, qtd) } });
  const lancadas = Object.entries(edicao.conexoes).filter(([, qtd]) => qtd > 0);

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
          Conexões lançadas no trecho
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {lancadas.map(([id, qtd]) => (
            <div key={id} className="flex items-center gap-1.5">
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Menos um ${nomeConexao(edicao.material, id)} no trecho ${nome}`}
                  onClick={() => setConexao(id, qtd - 1)}
                  className="h-11 w-11 rounded-lg border border-ink-600 bg-ink-800 text-base font-bold text-amber active:scale-95"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-semibold text-zinc-100">{qtd}</span>
                <button
                  type="button"
                  aria-label={`Mais um ${nomeConexao(edicao.material, id)} no trecho ${nome}`}
                  onClick={() => setConexao(id, qtd + 1)}
                  className="h-11 w-11 rounded-lg border border-ink-600 bg-ink-800 text-base font-bold text-amber active:scale-95"
                >
                  +
                </button>
              </div>
              <span className="min-w-0 flex-1 text-[12px] leading-tight text-zinc-400">
                {nomeConexao(edicao.material, id)}
              </span>
            </div>
          ))}
          {!lancadas.length && (
            <p className="text-[12px] text-zinc-500">Nenhuma conexão neste trecho.</p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
          O que o IFC trouxe
        </p>
        <ul className="space-y-1 text-[12px] text-zinc-400">
          {agruparItens(edicao).map((item) => (
            <li key={item.chave}>
              <span className="font-semibold text-zinc-300">{item.quantidade}×</span> {item.familia}
              {item.angulo !== null && <span className="text-zinc-600"> · {item.angulo}°</span>}
              <span className="text-zinc-600"> → {item.destino}</span>
              <span className={item.conferir ? "text-amber" : "text-zinc-600"}>
                {" "}
                · {item.conferir ? "conferir" : item.selo}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function agruparItens(edicao: EdicaoTrecho) {
  const mapa = new Map<
    string,
    {
      chave: string;
      familia: string;
      angulo: number | null;
      destino: string;
      conferir: boolean;
      selo: string;
      quantidade: number;
    }
  >();
  for (const item of edicao.itens) {
    const destino =
      item.destino.tipo === "conexao"
        ? nomeConexao(edicao.material, item.destino.id)
        : item.destino.tipo === "campo"
          ? `campo ${item.destino.campo}`
          : `ignorado: ${item.destino.motivo}`;
    const chave = `${item.familia}|${item.anguloEixos}|${destino}`;
    const atual = mapa.get(chave);
    if (atual) {
      atual.quantidade++;
      continue;
    }
    mapa.set(chave, {
      chave,
      familia: item.familia,
      angulo: item.anguloEixos,
      destino,
      conferir: item.destino.confianca === "heuristico",
      selo: item.destino.tipo === "ignorado" ? "fora do cálculo" : "exato",
      quantidade: 1,
    });
  }
  return [...mapa.values()];
}
