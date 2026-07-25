# Feedback do cliente — 25/07/2026

Fonte: 1 vídeo de WhatsApp (18s, tela do desktop no módulo Perfil Térmico do Boiler).
Transcrição via `uvx --from mlx-whisper mlx_whisper --model mlx-community/whisper-large-v3-turbo --language pt`.

## Vídeo — curvas do gráfico "Decaimento térmico × tempo"

> Ô, mano, aproveita que você tá aí, ó. Tá vendo? Essas linhas, elas estão muito retas, assim, ó.
> Se ela pudesse, tipo, ela ser mais, tipo, mais suavezinha, meio que curvando mesmo, assim.
> Ficaria mais bonito, entendeu? Se conseguir ajustar isso.

**Atendido** no commit "LineChart: curva suave no lugar da polilinha".

Nota técnica que vale pra qualquer pedido futuro de "curvar mais": as retas não são
artefato de renderização. Com a válvula termostática segurando a T. mistura, a vazão de
água quente puxada cresce na mesma proporção em que o boiler esfria, então a queda em
°C/min é constante — reta é a resposta certa do modelo V3. A única quebra real por série
é o minuto em que o apoio liga.

O que foi arredondado, então, é a quebra: média móvel triangular de ±2 min no Y de tela
(constante `JANELA` em `components/LineChart.tsx`) seguida de interpolação cúbica
monotônica. O traço sai no máx. 0,19 °C do valor calculado, e só na quebra; tooltip e
tabela minuto a minuto seguem exatos. Aumentar `JANELA` curva mais e afasta mais o traço
do dado — é o único botão a girar se ele pedir mais.
