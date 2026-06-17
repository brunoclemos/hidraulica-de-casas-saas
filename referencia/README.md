# Planilhas de referência — fonte de verdade da ferramenta

## Análises Água Quente (Recirculação & Perda Térmica)

- **`Análises Água Quente - CORRIGIDA.xlsx`** ← usar esta. É a fonte de verdade do módulo
  "Tempo de Recirculação & Perda Térmica". O app (`lib/calc/recirculacao.ts`) já implementa
  exatamente estas fórmulas — os números batem.
- `Análises Água Quente - ORIGINAL.xlsx` — versão original preservada (com os bugs), só para histórico.

### Correções aplicadas (ver aba `_Correções` dentro do .xlsx)

1. **Resfriamento do solo** — `Solos!C41/F41/C44/F44`: as fórmulas decaíam para a temperatura
   FINAL (e a de tempo-até-alvo chegava a usar a *condutividade do CPVC* no lugar de uma
   temperatura). Corrigido para decair para a temperatura AMBIENTE (modelo de Newton correto),
   espelhando a aba gêmea `Shafts e Afins`.
2. **`MATCH(...,2)` → `MATCH(...,0)`** — `Shafts/Solos!C6/F6`: o 3º argumento do MATCH deve ser
   `0` (correspondência exata). `2` é inválido e frágil.
3. **Isolante `C5+C19` → `C5+2*C19`** — `Shafts/Solos!C20/F20` ("Perda de carga térmica Tubos"):
   o diâmetro externo do isolante engrossa nos dois lados do tubo (2× a espessura). Célula isolada,
   não usada por outras fórmulas nem pela ferramenta — corrigida só por consistência geométrica.

> Ao abrir no Excel / Google Sheets a planilha recalcula sozinha (flag `fullCalcOnLoad`).
> Se o expert quiser reverter a correção nº 3 (modelagem própria), é só avisar.
