# Planilhas de referência — fonte de verdade da ferramenta

## Ferreto_Vazao_Apoio_Gas (Apoio a Gás — Vazão & Seleção)

- **`Ferreto_Vazao_Apoio_Gas - histerese.xlsx`** ← usar esta. Fonte de verdade do módulo
  `apoio-gas` (`lib/calc/apoio-gas.ts`). Aba `Cálculo` = 3 métodos (V.M.P, NBR 16057 Anexo C,
  Tempo Determinado COM histerese); aba `Aquecedores` = catálogo Rinnai (preços de 21/06/2026 —
  ao atualizar preços, atualizar `CATALOGO_RINNAI`/`DATA_REF_PRECOS` no motor e a data na planilha).
  Rendimento do E35 = 0,85 (≠ 0,86 dos demais) é INTENCIONAL, confirmado pelo cliente em 11/07/2026.
- `Ferreto_Vazao_Apoio_Gas - v1 sem histerese.xlsx` — versão anterior, só para histórico.
  Diff: a versão histerese adiciona o input `Histerese (T.D)` (B20) e reescreve o Método 3 com
  atraso de dead-band `t₁ = V×Hist/(VB×(TB−TAF))` e potência clampada em 0 (com Hist=0 a fórmula
  degenera exatamente na antiga).
- O painel de seleção da planilha (1× ou 2× iguais) foi SUBSTITUÍDO na ferramenta por um
  otimizador de custo × benefício (arranjos mistos, 3+ aparelhos, preços editáveis), a pedido
  do cliente — as fórmulas dos 3 métodos continuam fiéis célula a célula.

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
