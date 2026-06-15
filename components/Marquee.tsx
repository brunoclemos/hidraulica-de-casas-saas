// Ticker de normas/unidades correndo (referência: marquee da LP de inspiração).
const ITENS = [
  "NBR 5626",
  "NBR 16057",
  "Tabela Caleffi",
  "CPVC",
  "Método dos Pesos",
  "Darcy-Weisbach",
  "INMETRO / PBE",
  "Colebrook-White",
  "Padrão Ferreto",
];

export function Marquee() {
  const fila = [...ITENS, ...ITENS];
  return (
    <div className="overflow-hidden border-y border-ink-700 bg-ink-800/40 py-2">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap px-4">
        {fila.map((t, i) => (
          <span
            key={i}
            className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500"
          >
            <span className="h-1 w-1 rounded-full bg-amber" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
