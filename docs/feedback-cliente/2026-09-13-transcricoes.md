# Feedback do cliente — 13/set/2026

Vídeo de 2min07 (WhatsApp 21:41) + texto explicativo + anexo `TESTE HIDRO.ifc` (7,7 MB).
Contexto: o cliente encaminhou uma conversa de terceiros em que alguém subiu um IFC num
chat de IA e gerou a ferramenta `recalque-aplicar.pages.dev` (Escola Aplicar), que tem uma
seção "2 · Importar do IFC". Pediu engenharia reversa da ideia.

## Texto do cliente

> Quero usar o arquivo em IFC para extrair, de forma mais fácil: comprimento do tubo,
> diâmetro, quantidade e especificações das conexões, bem como válvulas, registros etc.
>
> Porém, temos que ter ciência de que a análise deve ser feita por TRECHOS.
>
> Sempre que mudar o diâmetro deve criar novo trecho (e a vazão dos trechos será inserida
> manualmente, depois).
>
> Ou seja, meu objetivo maior seria: o software conseguir ler o IFC e PREENCHER os trechos
> para facilitar nossa vida.

## Transcrição do vídeo (mlx-whisper large-v3)

> Cara, seguinte, ó, aqui, o que acontece? Tem essas questões aqui que a gente tem que
> preencher manual. Tamanho do diâmetro, comprimento, sobe e desce. Isso aqui eu quero que
> seja preenchido pelo IFC. Aí cada, se eu mudar o diâmetro, por exemplo, aqui, eu preciso
> criar um trecho novo, tá? Se eu mudar o diâmetro ou mudar a vazão que tá aqui embaixo, ó.
> Essa vazão aqui a gente vai preencher, não precisa do programa preencher, tá bom?
>
> Então se eu mudar aqui, ou seja, na real assim, ó. O programa ele cria todos os trechos.
> Aí eu venho mudando a vazão de forma manual, sacou? Acho que dá pra fazer assim.
>
> E aí o programa, o IFC inserido, eu quero que gere essas informações de cada trecho. E
> aqui, ó. Isso aqui é muito chato pegar, ó. Isso aqui é muito chato pegar. Então, por
> exemplo, eu quero que o IFC já me dê essas respostas aqui, entendeu? É isso aqui.
>
> Aí eu posso colocar aqui, ó, mais ou menos... é aqui em cima. Coloca assim, inserir o IFC
> ou fazer manualmente, entendeu? Aí eu posso fazer a inserção do IFC aqui pra pegar essas
> informações. E essas informações aqui, ó, tá? Se puder, inclusive, o IFC alimentar essa
> parte aqui pra depois o cara poder ver manualmente, eu acho que seria bem interessante
> também.
>
> Aí, obviamente, aqui também, né? Tem válvulas aqui, ó. Válvula, registro, enfim. E aqui
> ele pode colocar também, né? Não sei, daí tem que ver.
>
> E aí ele vai criar, ó, tá? Enfim, ó, inserir no projeto. Então, esse aqui eu criei um
> trecho. Ele vai me dar vários trechos. Esse IFC vai me gerar vários trechos. Dois, três,
> enfim. Aí precisa ver como que ele vai conseguir fazer isso. E aí

## Leitura

O que ele aponta na tela é o card de montagem de inserção do módulo `pvc-cpvc-pressao`:
diâmetro, comprimento real, sobe/desce, o grid de conexões ("muito chato pegar") e o card
"Registros, válvulas & equipamentos". O que fica manual, por decisão dele, é a VAZÃO.

Pedido de UI explícito: um seletor no topo do módulo — "inserir o IFC ou fazer manualmente".

## Prints anexos

1. Conversa encaminhada com o link da ferramenta de referência e o IFC de exemplo.
2. Tela do nosso app com 4 inserções (BANHEIRO 01: A-B, B-C CPVC 35 mm; C-D, D-E CPVC
   22 mm) — o formato-alvo que ele quer ver preenchido sozinho.
3. Planilha com o desdobramento item a item por trecho (Ambiente, ID, Trecho, ITEM, Qtde,
   Pressão Residual, Diâm. Tub., Diâm. Interno, Vazão, Velocidade, Temperatura, Comp. Real,
   Comp. Equiv., Comp. Total, Elev. Sobe, Elev. Desce).
