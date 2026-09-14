# Plano de implementação: importador de IFC no módulo PVC/CPVC, Bombas & Pressão

Data: 13/set/2026 · Pedido do cliente: `docs/feedback-cliente/2026-09-13-transcricoes.md`
Anexos de referência (código de sondagem, não de produção): `docs/planos/anexos-importador-ifc/`

- `prototipo.mjs`: algoritmo completo deste plano rodando em Node puro sobre um IFC. É a referência de comportamento para `lib/ifc/*`; o executor porta a lógica para TypeScript, com tipos, e joga o script fora quando os testes cobrirem tudo.
- `reduzir-fixture.mjs`: gera o fixture de teste a partir do IFC real (poda geometria de malha, remove PII do header, zera coordenadas do terreno).
- `saida-referencia.txt`: saída do protótipo sobre o fixture, idêntica à saída sobre o arquivo cheio. Os números dos testes (seção 7) vêm daqui.

Tudo neste plano foi verificado contra o arquivo `TESTE HIDRO.ifc` (7,7 MB, IFC2X3, Revit 2027, 149.095 entidades, unidade METRE). Onde escrevo "verificado", há um script que rodou e o número está no anexo.

---

> Implementado em 14/set. O protótipo em Node que acompanhava este plano foi removido:
> a referência do algoritmo agora é `lib/ifc/` com a suíte em `lib/ifc/__tests__/`, e o
> gerador do fixture vive em `tools/ifc/reduzir-fixture.mjs`. Manter o protótipo criaria
> uma segunda fonte de verdade destinada a divergir.
>
> Divergência assumida contra a seção 4: conexão de trecho sem tabela própria no app
> (cobre, PPR, material não identificado) entra como heurística mesmo quando a família
> é reconhecida sem ambiguidade — o comprimento equivalente sai da tabela do CPVC.

## 0. O que o cliente pediu, traduzido em contrato

1. Subir um `.ifc` e o app preencher, por trecho: diâmetro, comprimento real, sobe, desce, quantidade e tipo das conexões, válvulas e registros.
2. Regra de corte: **mudou o diâmetro, começa trecho novo**.
3. Vazão continua manual (decisão explícita dele). O importador não toca em `modoVazao`/`pecas`/`vazaoManualLmin`, salvo se o usuário digitar uma vazão na tela de revisão.
4. UI: seletor no topo do módulo, "importar do IFC ou preencher manualmente".
5. "Precisa ver como que ele vai conseguir fazer isso": há uma tela de revisão antes de inserir. Nada entra no projeto sem o engenheiro olhar.

Fora de escopo, intocável: motor de cálculo (`lib/calc/pvc-cpvc-pressao.ts`), tabelas de comprimento equivalente (`lib/calc/conexoes.ts`), paridade com a planilha.

---

## 1. Decisões de arquitetura

### 1.1 Parser STEP próprio, sem `web-ifc`

Decisão: escrever um leitor STEP/IFC mínimo em TypeScript (`lib/ifc/step.ts`), sem dependência nova.

Por quê (verificado):

| Critério | Parser próprio | `web-ifc` (o que o concorrente usa) |
|---|---|---|
| Tempo no arquivo de 7,7 MB | 38 ms de parse, 84 ms ponta a ponta (índice + grafo + trechos), Node 22 | ~200 ms só para iniciar o WASM, mais o parse |
| O que precisamos ler | 14 tipos de entidade (lista na seção 3.1). Nenhuma malha, nenhuma tesselação | Ele tesselagem tudo (é para visualizador 3D). Não precisamos de 3D |
| Dependência | zero | pacote npm ~10 MB + `web-ifc.wasm` (~2 MB) que teria que ser servido de `public/` nos DOIS alvos de build (raiz no Cloudflare, `basePath` no GitHub Pages) |
| Testabilidade | Vitest puro, sem WASM, fixture de 318 kB | precisa carregar WASM no ambiente de teste |
| Risco | STEP tem casos chatos: strings com `''`, `;` dentro de string, entidade em várias linhas, `\X\`/`\X2\` de acentos, IFC4 muda nomes de classe | esconde esses casos, mas traz os próprios (versões, API instável 0.0.x) |

Os riscos do parser próprio são todos cobertos por teste unitário com trechos STEP sintéticos (seção 7.3). O tokenizer é ~80 linhas; placement/matriz ~60; o resto é lógica de rede que teríamos que escrever de qualquer jeito com `web-ifc`.

### 1.2 Roda 100% no navegador

O IFC é o projeto do cliente dele. Não sobe para Pages Functions, não vai para o D1, não passa por nenhuma API. Leitura via `File.text()` no cliente; no GitHub Pages funciona igual (não depende de Functions). Texto obrigatório na UI: "O arquivo é lido aqui no seu navegador e não é enviado a lugar nenhum."

Sem Web Worker na fase 1: 84 ms no arquivo real não justifica. Arquivo de 50 MB projeta ~600 ms (parse linear); aceitável com status visível. Limite duro: 80 MB (mensagem clara acima disso). Worker fica mapeado na fase 2 se um arquivo real provar necessidade.

Carregamento: `lib/ifc/*` entra por `await import(...)` no clique de "Ler arquivo", no mesmo padrão de `components/pdf/BotaoMemorial.tsx` (que carrega `./gerar` sob demanda). Quem só faz cálculo manual não paga o bundle do importador.

### 1.3 Onde vivem os módulos novos

```
lib/ifc/
  step.ts            tokenizer STEP + índice de entidades + decode de \X\ + matriz de placement
  rede.ts            elementos de fluxo, portas, grafo, merge geométrico, cadeias, corte em equipamento, sentido
  mapeamento.ts      família IFC -> conexão do catálogo / campo dedicado / ignorado (tabela da seção 4)
  trechos.ts         cadeia -> TrechoImportado[] (corte por diâmetro, comprimento, sobe/desce, itens) e -> TrechoSalvo
  tipos.ts           tipos públicos do importador (seção 2)
  __tests__/
    fixtures/teste-hidro.reduzido.ifc
    step.test.ts  rede.test.ts  mapeamento.test.ts  trechos.test.ts  integracao.test.ts
components/ifc/
  ImportadorIfc.tsx  seletor de entrada + dropzone + status + revisão por cadeia + inserir
tools/ifc/
  reduzir-fixture.mjs   (copiado do anexo; gera o fixture de forma reprodutível)
```

Sem barrel file. `page.tsx` importa `ImportadorIfc` e recebe de volta `TrechoSalvo[]` prontos.

Regra de tamanho: `ImportadorIfc.tsx` até ~450 linhas. Se passar, separar `RevisaoCadeia.tsx` (a tabela de uma cadeia). Não separar antes disso.

### 1.4 Vira trecho direto ou passa por revisão?

Passa por revisão, sempre. O importador emite uma estrutura intermediária (`ImportacaoIfc`), a tela mostra por cadeia e o usuário confirma "Inserir N trechos". Só aí viram `TrechoSalvo` e entram em `f.trechos` (append, na ordem da cadeia). Motivos: o cliente pediu para conferir; há decisões heurísticas (cobre lido como CPVC, válvula de esfera como registro de gaveta) que ele precisa ver; e o sentido do fluxo pode precisar ser invertido.

Depois de inseridos, são inserções normais: editar/excluir/ordenar igual às manuais. A vazão o engenheiro preenche editando cada trecho (fluxo já existente), ou direto na coluna opcional da revisão.

---

## 2. Modelo de dados

### 2.1 O que o importador emite (`lib/ifc/tipos.ts`)

```ts
import type { Material } from "@/lib/calc/pvc-cpvc-pressao";

export type Confianca = "exato" | "heuristico" | "nao_mapeado";

// Para onde um elemento do IFC vai dentro de um Trecho do app.
export type DestinoItem =
  | { tipo: "conexao"; id: string; confianca: Confianca; motivo: string }        // id de ConexaoDef do material do trecho
  | { tipo: "campo"; campo: CampoDedicado; confianca: Confianca; motivo: string } // campo do Trecho fora do grid
  | { tipo: "ignorado"; confianca: "nao_mapeado"; motivo: string };

export type CampoDedicado = "qtdValvulaMisturadora" | "monocomando" | "incrementoPressurizador";

export interface ItemImportado {
  idIfc: number;            // #id da entidade (rastreabilidade e testes)
  familia: string;          // "AQ_Aquatherm_Joelho 45_90"
  classe: string;           // "IFCFLOWFITTING"
  anguloEixos: number | null;      // 0 | 45 | 90 (graus entre os eixos das duas portas), null se < 2 portas
  entreBitolasDiferentes: boolean; // segmento antes e depois com diâmetro diferente (tê/bucha de redução)
  destino: DestinoItem;
}

export type MaterialIfc = "PVC" | "CPVC" | "COBRE" | "PPR" | "desconhecido";

export interface TrechoImportado {
  material: Material;               // tabela do app usada (PVC | CPVC)
  materialIfc: MaterialIfc;         // o que o IFC diz
  diametroIfcMm: number;            // externo, do perfil da extrusão (34.9)
  diametro: number | null;          // comercial do app após snap (35), null = fora da tabela
  confiancaDiametro: Confianca;
  comprimentoReal: number;          // m, soma dos tubos
  sobe: number;                     // m
  desce: number;                    // m
  qtdTubos: number;
  pavimentos: string[];             // IFCBUILDINGSTOREY que o trecho atravessa
  itens: ItemImportado[];           // conexões/válvulas/equipamentos do trecho
  idsIfc: number[];                 // todos os elementos (tubos + itens) na ordem do fluxo
}

export interface CadeiaImportada {
  id: string;                       // "cadeia-1"
  sistema: string;                  // nome do IFCSYSTEM predominante ("AQ 1")
  descricaoSistema: string;         // "2.Água Quente Doméstica"
  origem: string;                   // equipamento no início ou "extremidade solta (família)"
  destino: string;
  sentido: { regra: RegraSentido; confiavel: boolean };
  bifurcacoes: number;              // nós com 3+ vizinhos (fase 1 só reporta)
  trechos: TrechoImportado[];
}

export type RegraSentido =
  | "equipamento na origem" | "equipamento no destino"
  | "porta solta de entrada/saída" | "portas internas" | "indefinido";

export interface ImportacaoIfc {
  arquivo: { nome: string; schema: string; unidade: "m" | "mm"; aplicacao: string; bytes: number; entidades: number; ms: number };
  cadeias: CadeiaImportada[];
  isolados: { idIfc: number; familia: string; motivo: string }[];  // elementos sem cadeia
  avisos: string[];                                                 // ex.: "3 portas soltas unidas por proximidade (20 mm)"
}
```

### 2.2 Como vira `TrechoSalvo`

`trechos.ts` exporta `paraTrechoSalvo(t: TrechoImportado, edicao: EdicaoTrecho, ambiente: string, nome: string, arquivo: string): TrechoSalvo`, onde `EdicaoTrecho` são os campos que a revisão deixa editar (material, diametro, comprimentoReal, sobe, desce, conexoes, vazaoLmin opcional). A montagem:

```ts
const base = trechoPadrao(material);          // do motor, sem tocar nele
return {
  ...base,
  material, diametro, comprimentoReal, sobe, desce,
  conexoes,                                   // Record<id, qtd> agregado dos itens tipo "conexao"
  qtdValvulaMisturadora,                      // contagem dos itens campo "qtdValvulaMisturadora" (só CPVC)
  monocomando: "",                            // item "monocomando" NÃO escolhe curva; só sinaliza (heuristicas)
  incrementoPressurizador: 0,                 // idem: sinaliza "pressurizador neste trecho"
  temperaturaAgua: sistemaEhAguaFria ? 20 : base.temperaturaAgua,  // AF em CPVC não é 40 °C
  modoVazao: vazaoLmin > 0 ? "manual" : "pesos",
  vazaoManualLmin: vazaoLmin > 0 ? vazaoLmin : 0,
  noTronco: false,
  ambiente, nome,
  origemIfc: { arquivo, heuristicas },
};
```

`qtdRegistroPressao`, `qtdFiltroY`, `chuveiro`, `kvValvula`, `bitolaFiltroY`, `perdaChuveiroManual`, `cenarios`: intocados (default do motor). O IFC não tem essa informação.

### 2.3 Único campo novo em `TrechoSalvo`: `origemIfc`

```ts
// lib/calc/pvc-cpvc-pressao.ts, em TrechoSalvo
// Trecho preenchido pelo importador de IFC (feedback 13/set): a lista de inserções
// marca "IFC" e lista o que foi decidido por heurística, para o engenheiro conferir.
origemIfc?: { arquivo: string; heuristicas: string[] };
```

Justificativa: é o que permite "marcar visualmente o que veio do IFC e o que foi heurístico" depois de inserido, salvo, recarregado de outro aparelho. Sem ele, a marcação some no primeiro reload. Um caller real: a lista de inserções (`page.tsx`) e uma linha no memorial.

Retrocompatibilidade:
- É opcional. `Trecho` (entrada do motor) não muda; o motor ignora o campo.
- `normalizarTrecho` ganha uma linha: copia `origemIfc` se `raw.origemIfc?.arquivo` for string e `heuristicas` for array de strings; senão `undefined`. Projeto antigo continua idêntico.
- D1 guarda `inputs` como JSON serializado (`functions/api/projetos.js`): nenhuma migração. Tamanho: ~120 bytes por trecho, irrelevante para o teto de 200 kB.
- O memorial (`useMemorial` em `page.tsx`) ganha um item em "Dados de entrada": `Trechos importados do IFC: N (arquivo X)` só quando N > 0. `components/pdf/preparar.ts` e `lib/memorial.ts` não mudam (é um `ItemCampo` comum).

O que fica FORA do `TrechoSalvo` (de propósito): ids de entidade IFC, geometria, itens brutos. Vivem só na `ImportacaoIfc` em memória durante a revisão. Se um dia precisar reimportar/diffar, é fase 3.

---

## 3. Algoritmo, passo a passo

Cada passo é uma função pura, testável isolada. Nomes abaixo são os nomes das funções.

### 3.1 `lerStep(texto): IndiceStep` (`step.ts`)

1. Validar prefixo `ISO-10303-21;`. Senão: `ErroIfc("nao_e_ifc")`.
2. Ler `FILE_SCHEMA(('IFC2X3'))` no HEADER; guardar `schema` (aceitar `IFC2X3`, `IFC4`, `IFC4X3`; outro: aviso, tenta mesmo assim). Ler `FILE_NAME` (6º campo: aplicação de origem) só para exibir.
3. Tokenizar a seção `DATA;` entidade a entidade: começa em `#` no início de linha, termina no primeiro `;` **fora de string**. Strings STEP são `'...'` com `''` como escape. Não assumir uma entidade por linha (o Revit gera uma por linha com CRLF, verificado, mas outros exportadores quebram linhas).
4. Índice: `Map<number, { tipo: string; args: string }>`; `args` é o miolo entre o primeiro `(` e o último `)`. Só isso; nada é parseado antes de ser pedido.
5. Helpers: `atributos(id): string[]` (split no nível 0 respeitando parênteses e strings), `ref(s): number | null` (`#123` -> 123), `refs(s): number[]`, `texto(s): string` (tira aspas, `''` -> `'`, decodifica `\X\E1` -> `á` e `\X2\00E1\X0\` -> `á`), `numero(s)`, `enumeracao(s)` (`.SOURCE.` -> `SOURCE`).
6. Unidade: varrer `IFCSIUNIT` com `.LENGTHUNIT.`; `.MILLI.` -> escala 0.001; sem prefixo -> 1. Tudo que sai do importador é em metros/milímetros do app.
7. Posições fixas de atributo (IFC2X3 e IFC4 coincidem nestas):
   - `IFCRELCONNECTSPORTTOELEMENT`: [4] RelatingPort, [5] RelatedElement
   - `IFCRELNESTS` (IFC4 usa para porta->elemento): [4] RelatingObject, [5] RelatedObjects
   - `IFCRELCONNECTSPORTS`: [4] RelatingPort, [5] RelatedPort
   - `IFCRELASSIGNSTOGROUP`: [4] RelatedObjects, **[6]** RelatingGroup (o [5] é RelatedObjectsType; errar isso deixa todos os sistemas vazios, foi um bug real do protótipo)
   - `IFCRELCONTAINEDINSPATIALSTRUCTURE`: [4] RelatedElements, [5] RelatingStructure
   - `IFCRELDEFINESBYPROPERTIES`: [4] RelatedObjects, [5] RelatingPropertyDefinition
   - `IFCDISTRIBUTIONPORT`: [5] ObjectPlacement, [7] FlowDirection
   - elemento (`IFCFLOWSEGMENT` etc.): [2] Name, [5] ObjectPlacement, [6] Representation
   - `IFCLOCALPLACEMENT`: [0] PlacementRelTo, [1] RelativePlacement
   - `IFCAXIS2PLACEMENT3D`: [0] Location, [1] Axis (Z), [2] RefDirection (X)
   - `IFCEXTRUDEDAREASOLID`: [0] SweptArea, [1] Position, [2] ExtrudedDirection, [3] Depth
   - `IFCCIRCLEPROFILEDEF`/`IFCCIRCLEHOLLOWPROFILEDEF`: [1] ProfileName, [3] Radius
   - `IFCSWEPTDISKSOLID`: [1] Radius
   - `IFCSYSTEM`/`IFCDISTRIBUTIONSYSTEM`: [2] Name, [3] Description
   - `IFCBUILDINGSTOREY`: [2] Name

Placement: `matrizGlobal(idLocalPlacement): Mat4` recursiva com cache, produto pai × filho; `axis2` monta [X Y Z | L] com Z default (0,0,1), X default ortogonalizado (Gram-Schmidt) e Y = Z × X. Verificado contra o arquivo: coordenadas globais das portas de tubos batem com `Length × direção` (ex.: tubo #2008: Δz das portas 1,588 m = profundidade × componente Z da direção).

### 3.2 `montarRede(indice): Rede` (`rede.ts`)

1. Elementos: toda entidade cujo `tipo` está em `CLASSES_FLUXO = {IFCFLOWSEGMENT, IFCPIPESEGMENT, IFCFLOWFITTING, IFCPIPEFITTING, IFCFLOWCONTROLLER, IFCVALVE, IFCFLOWTERMINAL, IFCSANITARYTERMINAL, IFCFLOWMOVINGDEVICE, IFCPUMP, IFCTANK, IFCFLOWSTORAGEDEVICE, IFCENERGYCONVERSIONDEVICE, IFCBUILDINGELEMENTPROXY, IFCDISTRIBUTIONELEMENT}`. (Revit 2027 em IFC2X3 exporta só as 4 genéricas + proxy, verificado; os nomes IFC4 entram na lista porque custam zero.)
2. Portas: `portaDe(porta) -> elemento` e `portasDe(elemento) -> porta[]` via `IFCRELCONNECTSPORTTOELEMENT` e `IFCRELNESTS`. Para cada porta: posição global, eixo global (Z do placement) e `fluxo` (SOURCE | SINK | SOURCEANDSINK).
3. Arestas: `IFCRELCONNECTSPORTS` -> aresta elemento a elemento (ignorar auto-arestas).
4. Merge geométrico: portas sem `IFCRELCONNECTSPORTS`, de elementos diferentes, a menos de **20 mm** uma da outra viram aresta. Verificado: 22 portas soltas, 3 pares unidos (0,016 m; 0,000; 0,000), e são exatamente os pontos onde o Revit deixou uma válvula isolada (#82576, sistema "AQ 15") entre dois conectores de cobre. Sem o merge, a cadeia de água quente vinha partida em dois. Cada merge vira um aviso na `ImportacaoIfc`.
5. Sistema por elemento (`IFCRELASSIGNSTOGROUP` -> `IFCSYSTEM`), pavimento por elemento (`IFCRELCONTAINEDINSPATIALSTRUCTURE`).
6. Componentes conexas por BFS. Componente de tamanho 1 ou elemento sem porta -> `isolados` (motivo: "sem porta" | "porta sem conexão").

### 3.3 `caminhar(componente): { ordem, bifurcacoes }`

Começa numa ponta (grau ≤ 1; se não houver, no primeiro elemento) e segue o vizinho ainda não visitado. Nós de grau ≥ 3 são contados em `bifurcacoes`. No arquivo real: grau máximo 2, 0 bifurcações (os tês foram exportados com 2 portas; a derivação não está no modelo). Fase 1 apenas reporta `bifurcacoes > 0` com aviso "esta cadeia tem N derivações; a caminhada seguiu um caminho só". Fase 2 trata (seção 8).

### 3.4 `cortarEmEquipamentos(ordem): Parte[]`

Equipamento de **corte** (termina uma parte, começa outra): família casa `/reservat|boiler|aquecedor|caixa|tanque|cisterna/i` OU (`IFCFLOWTERMINAL`/`IFCTANK`/`IFCFLOWSTORAGEDEVICE` com mais de 2 portas). O equipamento vira `origem` da parte seguinte e `destino` da anterior. Verificado: o Reservatório Solis (8 portas) está no meio de uma componente e separa a alimentação AF (uma bucha só, descartada por não ter tubo) da saída AQ.

Equipamento **inline** (fica dentro do trecho): família casa `/pressuriz|bomba|pump/i` e NÃO é engate flexível. Vira item com destino `campo: incrementoPressurizador` (o valor em mca é do engenheiro; o IFC não sabe).

Parte sem nenhum segmento de tubo é descartada e seus elementos vão para `isolados` com motivo "cadeia sem tubo".

### 3.5 `sentidoDaParte(parte): { dir: 1 | -1; regra; confiavel }`

Regras em ordem; a primeira que decide, decide:

1. **Equipamento na ponta.** Tanque/caixa/cisterna = fonte, sempre. Reservatório/boiler/aquecedor = fonte se o sistema predominante da parte é água quente (`/(^|\s)AQ|quente/i` no nome+descrição do `IFCSYSTEM`), destino se é água fria (`/(^|\s)AF|fria/i`), ambíguo se não dá para saber (cai para a regra 2). Fonte na origem -> mantém; fonte no destino -> inverte.
2. **Porta solta nas pontas.** Porta sem conexão com `FlowDirection = SOURCE` na última posição (é uma saída: ponto de uso) -> mantém; `SINK` no início -> mantém; o contrário -> inverte. Verificado: a ponta do chuveiro é `SOURCE` solta.
3. **Portas internas.** Para cada par conectado com `SOURCE`/`SINK`, voto a favor ou contra a caminhada. Só decide com ≥ 75% de maioria. Verificado que **não** dá para confiar cegamente: no arquivo real a cadeia AQ dá 15 × 16 porque a família "Válvula Misturadora Termostática" tem os conectores invertidos no Revit (diz que o fluxo vai da misturadora para o boiler). Perto do chuveiro os votos estão certos. Por isso a regra é a 3ª, não a 1ª.
4. **Indefinido**: mantém como caminhou, `confiavel: false`, a UI destaca "confira o sentido".

Diâmetro decrescente NÃO é regra: no arquivo real a linha AF vai PVC 32 -> CPVC 35 (diâmetro externo sobe porque muda a convenção do material). Elevação também não.

Resultado no arquivo real (verificado): cadeia AQ 1 decidida por "equipamento no destino" (boiler no fim da caminhada -> inverte), cadeia AF 1 por "equipamento na origem" (tanque). As duas ficam fisicamente corretas: boiler -> cobre 35 -> CPVC 28 -> CPVC 22 -> chuveiro (sobe líquido 8,8 m, de -2,57 a +6,20) e tanque -> pressurizador -> PVC 32 -> CPVC 35 -> boiler.

O botão "Inverter sentido" da UI existe para o caso 4 e para quando o engenheiro discorda.

### 3.6 `diametroDoSegmento(elemento)` e `materialDoSegmento`

1. `Representation` -> `IFCPRODUCTDEFINITIONSHAPE` -> cada `IFCSHAPEREPRESENTATION` -> itens. Primeiro `IFCEXTRUDEDAREASOLID` com perfil `IFCCIRCLEPROFILEDEF` ou `IFCCIRCLEHOLLOWPROFILEDEF`: `dExtMm = Radius × 2 × escala × 1000`. Fallback: `IFCSWEPTDISKSOLID` (tubo curvo). Nenhum: `dExtMm = null`.
   Verificado: o raio é o **externo** (34,9 -> CPVC DN 35 Tigre Aquatherm; 28,1 -> DN 28; 22; PVC marrom 32; cobre 35).
2. Material pelo nome do perfil (`ProfileName`, ex. `AQ_Tubo Aquatherm`), fallback nome do elemento: `/aquatherm|cpvc/i` -> CPVC; `/soldav|marrom|pvc/i` -> PVC; `/cobre|copper/i` -> COBRE; `/ppr/i` -> PPR; senão `desconhecido`. Aquatherm é a linha CPVC da Tigre: mapeamento exato, não heurístico.
3. Snap para o comercial do app: tabela do material (`DIAMETROS[material]`, campo `comercial`); COBRE/PPR/desconhecido tentam a tabela CPVC (as bitolas de cobre 15/22/28/35/42/54 coincidem numericamente com a série CPVC). Aceita se |diferença| ≤ 1,5 mm; senão `diametro: null` + `nao_mapeado` (usuário escolhe na revisão). Confiança: PVC/CPVC -> exato; COBRE/PPR/desconhecido -> heurístico com motivo "cobre lido pela tabela CPVC (diâmetro interno e rugosidade diferem)".

### 3.7 `comprimentoDoSegmento`

Ordem: `Pset_FlowSegmentPipeSegment.Length` (via `IFCRELDEFINESBYPROPERTIES` -> `IFCPROPERTYSET` -> `IFCPROPERTYSINGLEVALUE` "Length") > profundidade da extrusão > distância entre as duas portas. Verificado: Pset e extrusão batem em todos os 79 tubos.

### 3.8 `cortarEmTrechos(parteOrientada): TrechoImportado[]` (`trechos.ts`)

Percorre os elementos na ordem do fluxo:

- **Tubo**: calcula (material, diâmetro snap). Se não há trecho aberto, ou o diâmetro comercial mudou, ou o material do app mudou (PVC <-> CPVC): abre trecho novo. Soma `comprimentoReal` e `qtdTubos`.
- **Não tubo** (fitting/válvula/equipamento inline): vira `ItemImportado` do **trecho aberto** (o do último tubo antes dele). Regra "conexão pertence ao trecho de montante": a redução 28 -> 22 fica no trecho de 28, que é a bitola pela qual a tabela Tigre lista o tê de redução. Itens antes do primeiro tubo da cadeia (ex.: bucha e conectores na saída do boiler) entram no primeiro trecho.
- **Sobe/desce**: por elemento, `Δz = z(porta de saída) − z(porta de entrada)` com as portas identificadas pela vizinhança na ordem (entrada = porta ligada ao anterior). `Δz > 0` soma em `sobe`, `< 0` em `desce`. Vale para tubos E conexões (uma curva 90° vertical tem 8 a 10 cm de Δz, verificado). Assim `sobe − desce` do trecho é exatamente `z(fim) − z(início)`.
- `pavimentos`: união dos `IFCBUILDINGSTOREY` dos elementos.
- `entreBitolasDiferentes` de um item: diâmetro externo (arredondado) do último tubo antes ≠ do primeiro tubo depois.

### 3.9 `classificarItem(item, materialDoTrecho): DestinoItem` (`mapeamento.ts`)

Entrada: família (texto antes do primeiro `:` no `Name`; ex. `AQ_Aquatherm_Joelho 45_90:Standard:5163657` -> `AQ_Aquatherm_Joelho 45_90`), classe, ângulo entre eixos, `entreBitolasDiferentes`, material do trecho. Saída: tabela da seção 4.

**Ângulo entre eixos** (resolve "Joelho 45_90", "Curva 45_90", "Cotovelo 45_90" e o tipo de tê): `ang = acos(|eixo1 · eixo2|)` em graus, arredondado para o mais próximo de {0, 45, 90} (tolerância ±10°; fora disso, `null`). Usa o valor absoluto do produto porque o Revit exporta a normal de algumas portas apontando para dentro (verificado: 20 dos 79 tubos dão 0° em vez de 180°). Com isso: passagem reta = 0°, joelho 45 = 45°, joelho 90 = 90°. Verificado no arquivo: `Joelho 45_90` -> 18 × 45° e 1 × 90°; `Curva 90`/`Cotovelo 45_90`/`Curva 45_90` -> todos 90°; `Te_Reducao` Aquatherm -> 14 × 0° (passagem direta) e 2 × 90° (saída lateral); tês PVC -> 5 × 0°.

**Tê**: 0° -> passagem direta; 90° -> saída lateral. Em PVC são ids distintos (`te_direta` 0,9 m × `te_lateral` 3,1 m na bitola 32). Em CPVC a planilha do curso tem um id só para os dois casos (`te_direta`, nome "Tê passagem direta e saída lateral"); se `entreBitolasDiferentes`, usa a variante `te_passagem_direta_e_saida_lateral_de_reducao_central` (heurístico: o nome da família diz "Reducao" mas o Revit usa a mesma família para tê comum). `te_saida_bilateral`/`te_chegada_contraria` não podem ocorrer numa cadeia linear de 2 portas; ficam para a fase 2 (bifurcações).

### 3.10 Ambiente e nome

- `ambiente` da cadeia: nome do `IFCSYSTEM` predominante ("AQ 1", "AF 1"). O IFC deste cliente não tem `IFCSPACE` (verificado: 0), só pavimentos, e um trecho atravessa 3 pavimentos. "BANHEIRO 01" é conceito dele; a revisão tem um campo Ambiente por cadeia que ele preenche em 2 segundos e vale para todos os trechos dela. Fase 3: se um IFC vier com `IFCSPACE`, usar o espaço do último elemento.
- `nome` do trecho: letras sequenciais por cadeia, "A → B", "B → C" (o formato do print do cliente). Sufixo do sistema quando houver mais de uma cadeia com o mesmo ambiente vazio: a UI resolve, o dado não precisa.

---

## 4. Tabela de mapeamento família IFC -> app

Levantada por censo completo do arquivo (37 famílias, `anexos-importador-ifc/prototipo.mjs` imprime tudo). `n` = ocorrências no arquivo. "Ângulo" = medido entre eixos das portas. Destino por material do trecho onde o item caiu.

| Família IFC (classe) | n | Destino em trecho PVC | Destino em trecho CPVC | Regra | Confiança |
|---|---|---|---|---|---|
| Tipos de tubos, perfil `AQ_Tubo Aquatherm` (FLOWSEGMENT) | 62 | (define trecho) | CPVC, DN por snap (22 / 28,1→28 / 34,9→35) | perfil + raio | exato |
| Tipos de tubos, perfil `AF_Tubo Marrom Soldável` | 13 | PVC 32 | (define trecho) | perfil + raio | exato |
| Tipos de tubos, perfil `AQ_Tubo Cobre` | 14 | | CPVC 35 (cobre não tem tabela no app) | snap na série CPVC | heurístico |
| AQ_Aquatherm_Joelho 45_90 (FLOWFITTING) | 19 | joelho_45 / joelho90 | joelho_45 / joelho90 | ângulo 45 / 90 | exato |
| AQ_Aquatherm_Curva 90 | 11 | curva90 | curva90 | | exato |
| AQ_Aquatherm_Te_Reducao | 16 | te_direta (0°) / te_lateral (90°) | te_direta; entre bitolas diferentes: te_passagem_direta_e_saida_lateral_de_reducao_central | ângulo + bitolas vizinhas | exato / heurístico (redução) |
| AQ_Aquatherm_Joelho 90 de Transicao | 1 | ignorado (sem equivalente PVC) | joelho_90_c_latao | nome | heurístico |
| AQ_Aquatherm_Uniao | 1 | ignorado | uniao | nome | exato |
| AQ_Aquatherm_Luva de Transicao | 2 | ignorado | adaptador_de_transicao | nome (transição CPVC × rosca) | heurístico |
| AQ_Aquatherm_Conector(ponta) | 1 | ignorado | adaptador_de_transicao | nome | heurístico |
| AF_Soldavel_Curva 45_90 | 5 | curva90 / curva_45 | curva90; 45°: joelho_45 (CPVC não tem curva 45) | ângulo | exato / heurístico |
| AF_Soldavel_Te_Reducao | 5 | te_direta / te_lateral | te_direta | ângulo | exato |
| AF_Soldavel_Luva com Bucha de Latao | 3 | ignorado (tabela PVC não tem luva) | luva | nome | heurístico |
| AQ_Cobre_Cotovelo 45_90 | 6 | joelho90 / joelho_45 | joelho90 / joelho_45 | ângulo | heurístico (material) |
| AQ_Cobre_Te | 4 | te_direta / te_lateral | te_direta | ângulo | heurístico (material) |
| AQ_Cobre_União | 1 | ignorado | uniao | nome | heurístico (material) |
| AQ_Cobre_Conector RM Rosca Macho x Bolsa | 4 | ignorado | adaptador_de_transicao | nome | heurístico |
| AQ_Cobre_Conector RF Rosca Femea x Bolsa | 2 | ignorado | adaptador_de_transicao | nome | heurístico |
| BSP_Bucha de Redução - TUPY | 6 | ignorado | bucha_de_reducao_ate_2_dn | nome | heurístico |
| BSP_Niple Duplo - TUPY | 4 | ignorado | ignorado | sem comp. equivalente na planilha | não mapeado |
| AF_Adaptador Soldavel com Anel para CxDagua - Fortlev | 6 | ignorado (isolado no arquivo) | adaptador_de_transicao | nome | não mapeado / heurístico |
| AN_AQ_Aquatherm_Conector(centro), AN_AF_Soldavel_Luva…, AN_AÇO_Niple Duplo | 11 | ignorado | ignorado | prefixo `AN_` = família de anotação, 0 portas | não mapeado |
| VLV_Válvula de esfera com alavanca (azul/vermelha, Docol ou não) (FLOWCONTROLLER) | 6 | reg_gaveta | reg_gaveta | esfera = passagem plena ≈ gaveta aberto | heurístico |
| VLV_Válvula de retenção universal - Docol | 1 | valv_retencao | valv_retencao | tipo leve por padrão | heurístico |
| VLV_Válvula Misturadora Termostática | 1 | ignorado + aviso (só existe em CPVC) | campo `qtdValvulaMisturadora` +1 | nome | exato |
| VLV_Válvula de alívio de temperatura e pressão | 1 | ignorado | ignorado | não é perda do trecho; isolado no arquivo | não mapeado |
| AQ_Base misturador monocomando (FLOWCONTROLLER, 3 portas) | 1 | campo `monocomando` (sinaliza: escolher curva) | idem | nome | exato (detecção); curva é do engenheiro |
| AF_Engate Flexível Pressurizador N°1 / N°2 | 2 | ignorado | ignorado | sem comp. equivalente | não mapeado |
| AQ_TEXIUS-Pressurizador_SmartPump… (PROXY, 3 portas) | 1 | campo `incrementoPressurizador` (sinaliza: informar mca) | idem | regex pressuriz | exato (detecção) |
| AQ_ABBUD-TEXIUS-BOMBA…, AQ_ABBUD-TEXIUS-FixacaoTampa (PROXY, 0 portas) | 2 | ignorado | ignorado | peças do pressurizador sem porta | não mapeado |
| AQ_Reservatorio Termico Alta Pressao Solis (FLOWTERMINAL, 8 portas) | 1 | equipamento de corte: fim da cadeia AF / início da AQ | idem | regex reservat | exato |
| AQ_Tanque Fortlev - 2000 a 20.000 Litros (FLOWTERMINAL, 4 portas) | 1 | equipamento de corte: início da cadeia AF | idem | regex tanque | exato |
| qualquer outra família | | ignorado, motivo "família não reconhecida (classe)" | idem | | não mapeado |

**O que fazer com "não mapeado"**: nunca some em silêncio. Cada item ignorado aparece na revisão, agrupado por família com a quantidade e o motivo ("4× Niple Duplo: sem comprimento equivalente na tabela"). Ele não entra em `conexoes`. O engenheiro, se discordar, lança na mão pelo grid depois de inserir (fase 1) ou remapeia na própria revisão (fase 2).

**Heurístico** entra em `conexoes` normalmente E vira uma linha em `origemIfc.heuristicas` (texto do `motivo`), e a revisão mostra o badge "conferir" no item e o contador "N heurísticos" no trecho.

Os regexes de família vivem em `mapeamento.ts` numa lista ordenada `[teste, destinoPvc, destinoCpvc]`; o primeiro que casa decide. Ordem importa (verificado: "Engate Flexível Pressurizador" tem que ser testado antes de `/pressuriz/`).

---

## 5. UI

### 5.1 Seletor no topo

Logo abaixo do cabeçalho do módulo (antes do toggle PVC × CPVC, `page.tsx` ~linha 806), dois botões no mesmo padrão visual do toggle de material (`rounded-xl border`, ativo `border-amber bg-amber/10 text-amber`):

```
[ Preencher manualmente ]  [ Importar do IFC ]
```

Estado local `entrada: "manual" | "ifc"` (não persiste; abre em "manual"). Em "manual" a tela é a de hoje, sem nenhuma mudança. Em "ifc" aparece o card `ImportadorIfc` entre o seletor e "Montar nova inserção". Texto de apoio (11px, zinc-500): "O arquivo é lido aqui no seu navegador e não é enviado a lugar nenhum. Os trechos entram na lista abaixo depois que você conferir."

### 5.2 Card de importação (antes de ler)

- Dropzone: um `<label>` grande (`rounded-2xl border border-dashed border-amber/30 bg-amber/5`, altura mínima 96px) envolvendo `<input type="file" accept=".ifc" class="sr-only">`. Texto: "Arraste o arquivo .ifc aqui ou toque para escolher". Aceita drop (`onDragOver` preventDefault, `onDrop` pega `dataTransfer.files[0]`). Foco visível no label via `focus-within:border-amber`.
- Ao escolher: `await import("@/lib/ifc/...")`, `file.text()`, `importarIfc(texto, file.name)` dentro de `try/catch`; erro vira estado `erro: string` mostrado num bloco `role="alert"` (borda vermelha, mesma linguagem do `ErrorBoundary`).
- Status: `<p role="status" aria-live="polite">` com "Lendo arquivo…" / "Lido em 84 ms: 204 elementos hidráulicos, 2 cadeias, 19 peças fora de cadeia".

### 5.3 Revisão (depois de ler)

Resumo do arquivo (uma linha, zinc-500): nome, schema, unidade, aplicação, avisos ("3 portas soltas unidas por proximidade").

Por cadeia, um bloco `rounded-2xl border border-ink-600 bg-ink-800/60 p-4`:

Cabeçalho:
- Título: `Cadeia 1 · AQ 1 (Água Quente Doméstica)` e a linha `Reservatório Solis → chuveiro (Joelho 90 de Transição)`.
- Sentido: texto "sentido: equipamento na origem" + botão "Inverter sentido" (borda, texto âmbar). Quando `confiavel: false`, o bloco ganha `border-amber/40` e o texto "confira o sentido do fluxo".
- Campo Ambiente (input igual ao de "Ambiente & trecho", placeholder "Ex.: Banheiro suíte"), valor inicial = sistema. Vale para todos os trechos da cadeia.
- Se `bifurcacoes > 0`: aviso âmbar com o texto da seção 3.3.

Tabela de trechos (`overflow-x-auto`, `min-w-[720px]`, `th scope="col"`), uma linha por trecho, colunas:

| # | Trecho | Material | Ø | L real (m) | Sobe (m) | Desce (m) | Conexões | Vazão (L/min, opcional) | Origem |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A → B (input) | select PVC/CPVC | select `diametrosDe(material)` | number | number | number | "6× Joelho 90°, 4× Tê…" + "ver itens" | number | badges |

- Trocar material zera `conexoes` e reclassifica os itens com `classificarItem` para o novo material (o mesmo comportamento de `trocarMaterial` do rascunho, que também zera: as matrizes não têm ids em comum).
- Trocar Ø não reclassifica nada (a bitola só muda o comprimento equivalente, que o motor calcula).
- Badges na coluna Origem (texto, nunca só cor): `Ø heurístico` (cobre), `N heurísticos`, `M ignorados`, `monocomando: escolher curva`, `pressurizador: informar mca`, `válvula misturadora`. Cor âmbar = precisa de olhar; zinc = informativo.
- "ver itens" expande (Accordion controlado, `open`/`onOpenChange`) a lista de `ItemImportado` do trecho: família, quantidade agregada, destino em texto ("→ Joelho 45°" / "→ campo válvula misturadora" / "ignorado: sem comprimento equivalente"), badge de confiança ("exato" zinc, "conferir" âmbar, "ignorado" zinc-600) e o ângulo medido quando houver ("45°"). Fase 1: lista só de leitura. Contagem de conexões editável direto na linha via o mesmo padrão `− n +` do grid (reaproveitar o markup, sem componentizar antes de 3 usos).
- Vazão: se preenchida > 0, o trecho entra como `modoVazao: "manual"`. Hint abaixo da tabela: "Vazão é sua (regra do curso): deixe em branco para preencher depois, editando o trecho."

Rodapé da cadeia: botão primário `+ Inserir os 3 trechos desta cadeia` (mesma classe do "+ Inserir no projeto"). Global, abaixo de todas as cadeias: `Inserir todas as cadeias (5 trechos)` e `Descartar importação`.

Elementos ignorados/isolados: Accordion fechado "Peças que ficaram de fora (19)" com a lista agrupada por família e motivo.

### 5.4 Depois de inserir

- `inserirImportados(trechos: TrechoSalvo[])` em `page.tsx`: `setF(p => ({ ...p, trechos: [...p.trechos, ...trechos] }))`, `setDraft(freshDraft(...))`, `setEditIndex(null)`. O card da cadeia colapsa para "3 trechos inseridos (Cadeia 1)" com "desfazer" que remove pelos índices inseridos (só até a próxima ação; sem histórico).
- Lista de inserções (`page.tsx` ~linha 1390): ao lado de `material diametro`, se `p.trecho.origemIfc`: `<span class="text-zinc-500">· IFC</span>` e, se `heuristicas.length`, `<span class="text-amber">· conferir</span>` com `title` listando as heurísticas. Na edição do trecho (form do rascunho), acima de "Tubo & geometria", um parágrafo 11px: "Importado do IFC <arquivo>. Heurísticas: …" quando existir.
- Memorial: item "Trechos importados do IFC: 5 (TESTE HIDRO.ifc)" em "Dados de entrada" quando houver.

### 5.5 Acessibilidade e padrão visual

- Sem emoji, sem ícone decorativo; SVG inline só se precisar (não precisa).
- Botões ≥ 44px de altura no mobile (`h-11`/`py-3`), `aria-label` nos `−`/`+` ("Menos um Joelho 90° no trecho A → B").
- Após a leitura, mover o foco para o título do resumo (`tabIndex={-1}` + `ref.focus()`), para leitor de tela e teclado saberem que algo apareceu.
- Contraste: badges âmbar sobre `bg-amber/10` com texto `text-amber` já passam 4,5:1 no fundo ink-800 (é o padrão do app).
- Tabela rola horizontalmente dentro do próprio container; o body não.
- Ordem INPUTS antes de RESULTADO mantida: a importação é entrada, fica acima do hero de prévia.

---

## 6. Casos de borda e falha

| Caso | Comportamento | Onde |
|---|---|---|
| Arquivo não é IFC (não começa com `ISO-10303-21`) | `ErroIfc("nao_e_ifc")` -> "Este arquivo não é um IFC (formato STEP ISO-10303-21). Exporte do Revit em IFC 2x3 Coordination View." | step.ts / UI |
| Extensão errada mas conteúdo STEP | aceita (valida pelo conteúdo, não pela extensão) | step.ts |
| IFC4 / IFC4X3 | aceita; classes IFC4 estão na lista; portas via `IFCRELNESTS`; aviso "IFC4: validado só com IFC2X3 do Revit, confira os trechos" | rede.ts |
| Schema desconhecido | tenta; aviso | step.ts |
| Unidade MILLIMETRE | escala 0.001 em posições, comprimentos e raios | step.ts |
| Arquivo de 50 MB | lê (projeção ~600 ms); status "Lendo arquivo grande…" | UI |
| Arquivo > 80 MB | recusa antes de ler: "Arquivo acima de 80 MB. Exporte só a disciplina hidráulica." | UI |
| Entidade em várias linhas / `;` dentro de string / `''` | tokenizer por estado, não por linha | step.ts (teste sintético) |
| Nome com `\X\E1` e `\X2\00E1\X0\` | decodifica os dois | step.ts (teste) |
| Projeto sem portas (`IFCRELCONNECTSPORTS` ausente) | 0 cadeias; todos os elementos em isolados; mensagem "O IFC não trouxe conectividade (portas). No Revit, exporte com 'Exportar conectores/portas' ligado (IFC 2x3 Coordination View)." | rede.ts / UI |
| Portas existem mas nada se conecta, só geometria coincide | merge a 20 mm resolve pares exatos; o resto fica isolado com aviso | rede.ts |
| Cadeia com equipamento no meio (boiler) | corte; duas partes; a que não tem tubo é descartada com motivo | rede.ts |
| Pressurizador no meio | inline; item campo `incrementoPressurizador`; badge | mapeamento.ts |
| Elementos isolados (19 no arquivo real: adaptadores da caixa, anotações, alívio) | lista "Peças que ficaram de fora" com motivo | UI |
| Bifurcação (nó de grau ≥ 3) | fase 1: reporta e segue um caminho; aviso na cadeia | rede.ts |
| Diâmetro fora das tabelas (ex.: PPR 32, PVC 63) | `diametro: null`, linha da revisão com select vazio e badge "escolha o Ø"; botão inserir da cadeia desabilitado até resolver | trechos.ts / UI |
| Material desconhecido (perfil sem nome, família estranha) | `materialIfc: "desconhecido"`, tabela CPVC como tentativa, badge "material não identificado: confira" | trechos.ts |
| Tubo sem Pset de comprimento | profundidade da extrusão; sem extrusão: distância entre portas; sem portas: 0 + aviso "tubo #id sem comprimento" | trechos.ts |
| Tubo sem perfil circular (BREP) | `dExtMm: null` -> tenta herdar do tubo anterior na cadeia, marca heurístico; sem anterior: `diametro: null` | trechos.ts |
| Ângulo de porta fora de {0,45,90} ±10° | `anguloEixos: null`; joelho cai em `joelho90` heurístico com motivo "ângulo X° fora do esperado"; tê em `te_direta` | mapeamento.ts |
| Válvula misturadora num trecho PVC | ignorado + motivo "válvula misturadora só existe em CPVC" | mapeamento.ts |
| Mesma família com ports = 1 (ponta de cadeia) | é elemento normal; Δz = 0 | trechos.ts |
| Duas importações no mesmo projeto | permitido; cada inserção guarda o próprio `origemIfc.arquivo` | page.tsx |
| Reload durante a revisão | perde a revisão (não persiste); trechos já inseridos ficam no projeto salvo | aceito |
| `file.text()` falha (permissão, arquivo movido) | catch -> `role="alert"` com a mensagem do erro; console.error com o erro original | UI |

Nenhum `try/catch` engole: ou vira mensagem para o usuário com `console.error`, ou propaga.

---

## 7. Plano de testes

### 7.1 Infra

- `vitest` **4.1.11** exato em `devDependencies` (não a 5.0.0: saiu em 3/set/2026, exige Node ≥ 22.12 e ainda não tem histórico; a 4.1.11 roda em Node 20 e 22, que é o que os builds usam). Traz o `vite` como dependência própria; nada mais é instalado. Motivo forte: é a primeira infra de teste do repo e o importador é 100% lógica pura, ideal para começar.
- `vitest.config.ts` na raiz: `resolve.alias { "@": __dirname }` (espelha `tsconfig.paths`), `test.include ["lib/**/*.test.ts"]`, ambiente `node`.
- `package.json`: `"test": "vitest run"`.
- `tsconfig.json`: nada muda (`include` já pega `**/*.ts`).

### 7.2 Fixture reproduzível

`tools/ifc/reduzir-fixture.mjs` (copiar do anexo) gera `lib/ifc/__tests__/fixtures/teste-hidro.reduzido.ifc` a partir do IFC do cliente:

```
node tools/ifc/reduzir-fixture.mjs "~/Downloads/TESTE HIDRO.ifc" lib/ifc/__tests__/fixtures/teste-hidro.reduzido.ifc
```

Resultado verificado: 4.141 entidades (de 149.095), **318 kB** (77 kB comprimido pelo git), sem `IFCPERSON`/`IFCORGANIZATION`/CREA/e-mail, `IFCSITE` sem latitude/longitude, e o protótipo produz saída **idêntica** à do arquivo cheio (diff vazio, `saida-referencia.txt`). Commitar o fixture; o IFC original nunca entra no repo.

Fixtures sintéticos (strings STEP de 5 a 30 linhas escritas no próprio teste): tokenizer, unidades mm, IFC4 `IFCRELNESTS`, `IFCCIRCLEHOLLOWPROFILEDEF`, tê com 3 portas conectadas (bifurcação), cadeia sem portas, joelho a 45° por construção geométrica.

### 7.3 Testes e asserções (números de `saida-referencia.txt`)

`step.test.ts`
- lê o fixture: schema `IFC2X3`, unidade `m`, 4141 entidades, aplicação contém "Revit".
- `texto("'V\X\E1lvula'")` = "Válvula"; `texto("'\X2\00E1\X0\'")` = "á"; `texto("'it''s'")` = "it's".
- entidade em duas linhas e `;` dentro de string tokenizam certo (sintético).
- rejeita texto que não começa com `ISO-10303-21` com `ErroIfc.codigo === "nao_e_ifc"`.
- `matrizGlobal` de um `IFCLOCALPLACEMENT` com pai transladado e rotacionado 90° em Z: ponto (1,0,0) vai para o esperado (sintético, valores fechados).

`rede.test.ts`
- fixture: 204 elementos, 382 portas, 180 pares por relação, **3** merges geométricos, **2** cadeias com tubo, **19** isolados.
- cadeia AQ: `origem` contém "Reservatorio", `destino` contém "Joelho 90 de Transicao", `sentido.regra === "equipamento no destino"`, `sistema === "AQ 1"`.
- cadeia AF: `origem` contém "Tanque Fortlev", `sentido.regra === "equipamento na origem"`, `sistema === "AF 1"`.
- fixture sem `IFCRELCONNECTSPORTS` (sintético): 0 cadeias, todos isolados com motivo "porta sem conexão".
- IFC4 com `IFCRELNESTS` e `IFCPIPESEGMENT` (sintético): 1 cadeia de 3 elementos.
- tê com 3 portas conectadas (sintético): `bifurcacoes === 1`.

`mapeamento.test.ts` (tabela da seção 4, um `it.each` por linha)
- `Joelho 45_90` a 45° / 90° -> `joelho_45` / `joelho90`, exato.
- `Te_Reducao` a 0° em PVC -> `te_direta`; a 90° em PVC -> `te_lateral`; em CPVC entre bitolas diferentes -> `te_passagem_direta_e_saida_lateral_de_reducao_central` heurístico.
- `Válvula de esfera…` -> `reg_gaveta` heurístico; `Válvula Misturadora Termostática` em CPVC -> campo `qtdValvulaMisturadora`, em PVC -> ignorado.
- `AF_Engate Flexível Pressurizador` -> ignorado (e NÃO campo pressurizador); `AQ_TEXIUS-Pressurizador…` -> campo `incrementoPressurizador`.
- `AN_…` -> ignorado; família inventada -> ignorado com motivo contendo a classe.
- todo `id` retornado existe em `conexoesDe(material)` (varre a tabela inteira contra `CONEXOES_PVC`/`CONEXOES_CPVC`; pega typo de id).

`trechos.test.ts` (fixture; valores esperados com 4 casas, asserção `toBeCloseTo(v, 3)`)

Cadeia AQ 1 (boiler → chuveiro), 3 trechos:

| Trecho | material / Ø | materialIfc / ØIFC | L (m) | sobe | desce | tubos | pavimentos | conexões | campos |
|---|---|---|---|---|---|---|---|---|---|
| A → B | CPVC 35, heurístico | COBRE 35 | 4,3915 | 1,7235 | 1,0239 | 14 | SUBSOLO | joelho90 6, te_direta 4, adaptador_de_transicao 7, bucha_de_reducao_ate_2_dn 2, reg_gaveta 2, uniao 1 | qtdValvulaMisturadora |
| B → C | CPVC 28, exato | CPVC 28,1 | 25,7466 | 5,5209 | 0,7800 | 22 | SUBSOLO, Térreo, Superior | curva90 8, te_direta 6, joelho_45 5, te_passagem_direta_e_saida_lateral_de_reducao_central 1, uniao 1, reg_gaveta 1 | |
| C → D | CPVC 22, exato | CPVC 22 | 4,7032 | 3,3361 | 0,0170 | 8 | Superior | curva90 3, joelho90 1, joelho_45 1, te_direta 1, joelho_90_c_latao 1 | monocomando |

Cadeia AF 1 (tanque → boiler), 2 trechos:

| Trecho | material / Ø | L (m) | sobe | desce | tubos | conexões | campos | ignorados |
|---|---|---|---|---|---|---|---|---|
| A → B | PVC 32, exato | 4,2885 | 0,4037 | 0,6372 | 13 | curva90 5, te_direta 5, reg_gaveta 2, valv_retencao 1 | incrementoPressurizador | Luva com Bucha de Latão 3, Niple Duplo 4, Engate Flexível 2, Bucha de Redução 3, Conector(ponta) 1 |
| B → C | CPVC 35, exato | 7,2084 | 0,6097 | 0,9493 | 22 | te_direta 8, joelho_45 12, reg_gaveta 1, adaptador_de_transicao 1 | | |

Invariantes: soma de `qtdTubos` = 79; `Σ(sobe − desce)` da cadeia AQ = 8,76 (± 0,01; é z do chuveiro menos z da saída do boiler, 6,20 − (−2,57)); trocar o sentido de uma parte troca `sobe` por `desce` em cada trecho e inverte a ordem.

`integracao.test.ts` (ponta a ponta com o motor real, sem mockar nada)
- `paraTrechoSalvo` de B → C (CPVC 28) -> `calcularTrecho(t, 10)`: `compEquivalente` = **25,810** (8×0,922 + 6×1,844 + 5×0,615 + 3,688 + 0,307 + 0,3; valores de `CONEXOES_CPVC` na bitola 28) e `compTotal` = 25,747 + 25,810.
- A → B PVC 32 -> `compEquivalente` = **11,900** (5×0,6 + 5×0,9 + 2×0,3 + 3,8).
- `normalizarTrecho` de um trecho com `origemIfc` preserva o campo; sem ele, `undefined`; com `origemIfc` malformado (`{arquivo: 3}`), `undefined`.
- trecho importado com `vazaoLmin: 30` -> `modoVazao === "manual"`, `vazaoManualLmin === 30`; sem vazão -> `"pesos"` e `vazaoDoTrecho(t).lmin === 0`.
- AF em CPVC -> `temperaturaAgua === 20`; AQ -> 40.

### 7.4 Roteiro no navegador (Chrome desktop + Safari iPhone)

1. Abrir o módulo, clicar "Importar do IFC", arrastar `TESTE HIDRO.ifc` (o original, 7,7 MB). Esperado: status "Lido em < 300 ms", 2 cadeias, textos iguais aos da tabela acima.
2. Cadeia AQ 1: origem Reservatório, destino chuveiro. Clicar "Inverter sentido": ordem vira C→D, B→C, A→B e sobe/desce trocam. Inverter de novo: volta.
3. Trocar material do trecho A → B para PVC: conexões zeram e reclassificam (cobre em PVC: tês viram te_direta, conectores viram ignorados). Voltar para CPVC.
4. Digitar Ambiente "Banheiro suíte" e vazão 30 no C → D. Inserir a cadeia. Esperado: 3 inserções novas no fim da lista, agrupadas em "Banheiro suíte", com "· IFC" e "· conferir" no A → B; C → D com vazão manual 30 L/min e residual calculada.
5. Editar A → B: parágrafo com as heurísticas; grid de conexões com 6 joelhos 90° etc.; válvula misturadora = 1; monocomando "Nenhum" (escolher).
6. Salvar projeto, recarregar a página, reabrir: badges continuam (veio do D1/localStorage com `origemIfc`).
7. Gerar o memorial em PDF: linha "Trechos importados do IFC: 3 (TESTE HIDRO.ifc)".
8. Soltar um `.txt` renomeado para `.ifc`: mensagem de "não é um IFC", nada quebra.
9. Modo "Preencher manualmente": tela idêntica à de antes da tarefa (comparar com o print do cliente).
10. Teclado: Tab chega na dropzone, Enter abre o seletor de arquivo, Tab percorre selects/inputs/botões da revisão na ordem visual; VoiceOver lê o status após a leitura.

---

## 8. Faseamento

### Fase 1 (esta entrega; demonstrável em vídeo com o IFC dele)

- `lib/ifc/step.ts`, `rede.ts`, `mapeamento.ts`, `trechos.ts`, `tipos.ts` conforme seções 2 a 4, portados do `prototipo.mjs` com tipos concretos (zero `any`; `unknown` só na fronteira do JSON de `origemIfc`).
- `components/ifc/ImportadorIfc.tsx` conforme seção 5: dropzone, status, revisão por cadeia com edição de material/Ø/L/sobe/desce/conexões (contadores)/vazão/ambiente/nome, inverter sentido, itens em modo leitura com badges, inserir por cadeia e todas, ignorados.
- `page.tsx`: seletor, estado `entrada`, `inserirImportados`, badge na lista, parágrafo na edição, item no memorial.
- `pvc-cpvc-pressao.ts`: `origemIfc` em `TrechoSalvo` + linha em `normalizarTrecho`. Nada mais nesse arquivo.
- Vitest 4.1.11, `vitest.config.ts`, fixture gerado, 5 arquivos de teste da seção 7.3 passando.
- Bifurcações: só detecção e aviso.
- IFC4: classes e `IFCRELNESTS` aceitos, teste sintético; sem fixture real.

Ordem de execução sugerida (cada passo compila e testa sozinho): step -> rede -> mapeamento -> trechos -> integração com o motor -> UI -> page.tsx -> roteiro no navegador -> commit.

### Fase 2 (mapeada, depois do vídeo de retorno do cliente)

- Remapear item por item na revisão (select: qualquer conexão do material / campo dedicado / ignorar) e "lembrar esta escolha para a família X" em localStorage (mesmo padrão de `lib/favoritas.ts`).
- Bifurcações: nó de grau ≥ 3 vira ponto de derivação; o tronco segue pelas portas colineares (0°), cada ramal vira cadeia própria "Ramal a partir de <tê> (trecho B → C)", e o tê no tronco vira `te_direta`; no PVC o ramal marca o tê como `te_lateral` no primeiro trecho do ramal. Precisa de IFC real com derivação para validar.
- Web Worker quando um arquivo real passar de 30 MB.
- "termina junto a": extremidade solta a menos de 50 cm de um equipamento ganha o nome dele no `destino`.
- Memorial: tabela "Itens lidos do IFC por trecho" (família, quantidade, destino).

### Fase 3 (só se o cliente pedir)

- `IFCSPACE` -> ambiente automático (o IFC atual não tem).
- Reimportar e diffar contra um projeto salvo.
- Tabelas de cobre e PPR no motor (isso mexe no motor e na paridade; é decisão do cliente, não desta tarefa).

---

## 9. Perguntas abertas para o Bruno

Separadas do que já está decidido acima. Só as que mudam o trabalho.

1. **Cobre lido pela tabela CPVC.** O IFC dele tem 4,4 m de cobre 35 na saída do boiler e o app não tem tabela de cobre. Proposta: trecho entra como CPVC 35 com badge "Ø heurístico" e heurística registrada, e ele troca se quiser. Alternativa: deixar sem diâmetro e obrigar a escolha. Fico com a proposta; confirmar.
2. **Base do monocomando.** Proposta: detectar e sinalizar "monocomando neste trecho: escolha a curva DOCOL" (campo `monocomando`), sem lançar nada no grid. A tabela CPVC da planilha tem a linha "Misturador" (1,51 m na bitola 22); lançar essa linha E a curva DOCOL pode contar a perda duas vezes. Só o cliente sabe como ele faz na planilha. Vale perguntar a ele no retorno, ou embutir a proposta e ajustar?
3. **Heurísticas de válvula e conexão de transição** (esfera -> registro de gaveta aberto; retenção universal -> tipo leve; luva de transição/conectores -> adaptador de transição; bucha -> até 2 DN; joelho de transição -> joelho 90° c/ latão; tê entre bitolas -> redução central; curva 45° em CPVC -> joelho 45°). Embutir como default marcado "conferir" e validar no vídeo de retorno (proposta), ou mandar a tabela da seção 4 para ele aprovar antes de codar? A segunda opção atrasa a fase 1 em uma rodada de WhatsApp; a primeira arrisca uma rodada de correção. Prefiro a primeira.

Decidido sem perguntar (já justificado no texto): parser próprio; tudo no navegador; revisão obrigatória antes de inserir; `origemIfc` como único campo novo; ambiente = nome do sistema editável por cadeia; nomes "A → B"; vazão opcional na revisão; AF em CPVC a 20 °C; Vitest 4.1.11; fixture reduzido de 318 kB no repo privado, sem PII e sem coordenadas.
