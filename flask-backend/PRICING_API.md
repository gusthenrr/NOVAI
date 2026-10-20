# Simulação da calculadora

`POST /api/ext/pricing/margin` recebe JSON e um access_token **do Mercado Livre** no cabeçalho `Authorization: Bearer ...`. Para compatibilidade, também aceita `access_token` no corpo quando não há cabeçalho. Não grava nem imprime credenciais ou respostas brutas.

```json
{
  "precoVenda": 100,
  "custoProduto": 40,
  "aliquotaImpostoPct": 4,
  "tipoAnuncio": "classico",
  "freteGratis": true,
  "envioFull": true,
  "envioFlex": false,
  "pesoGramas": 300,
  "alturaCm": 5,
  "larguraCm": 15,
  "comprimentoCm": 20,
  "reputacao": "verde",
  "categoryId": "MLB9600",
  "nome": "Cabo"
}
```

`sellerId` é opcional: a conta é identificada por `/users/me` com o token recebido. Quando informado, deve ser uma string numérica igual à conta autenticada. Não usar o vendedor do anúncio importado nem a string literal `ID_DA_CONTA_EM_SESSAO`.

`custoVariavel` é opcional (zero por padrão); o app o usa para o custo da embalagem. Reputações: `verde`, `verde-claro`, `amarela`, `laranja`, `vermelha`, `sem-reputacao`. Sem reputação, o parâmetro oficial é omitido para que a conta determine a condição.

`incluirTiposAnuncio: true` solicita Clássico e Premium na mesma chamada. `/users/me` é consultado uma vez e os dois fluxos de frete/tarifa rodam em paralelo. A resposta mantém os sete campos do tipo selecionado e acrescenta `opcoesAnuncio: { "classico": { ... }, "premium": { ... } }`, cada opção com os mesmos sete campos. Sem o parâmetro, o contrato anterior permanece igual. O parâmetro deve ser booleano. Uma falha parcial pertence somente à opção afetada; token expirado retorna 401. O app autenticado usa `/api/precify/pricing`; a NOVAI obtém o token ML da conta no servidor, como antes.

Full usa `fulfillment`; Flex usa `self_service`. Nos demais casos, `logisticType` aceita `cross_docking`, `xd_drop_off`, `drop_off` ou `not_specified`, com `xd_drop_off` por padrão. `not_specified` não inventa cotação de frete. Full e Flex simultâneos são inválidos. Por padrão, o valor retornado é a cotação ML. O fallback opcional de referência descrito abaixo não cobre bônus/custo do entregador Flex ou despesas de transportadora própria. A condição simulada é produto novo.

Fluxo somente leitura, destinos fixos:

1. `/users/me` identifica a conta brasileira autenticada.
2. `/users/{id}/shipping_options/free` recebe categoria, preço, listing type, reputação, logística, frete grátis e dimensões. Peso e dimensões positivos são arredondados para cima para gramas/cm inteiros; não se subestima o pacote. Usa `coverage.all_country.list_cost` em BRL; não reaplica descontos. `free_shipping=false` também é cotado.
3. `/sites/MLB/listing_prices` recebe categoria, preço, listing type, moeda, logística, shipping mode e peso faturável da cotação, quando disponível. Usa `sale_fee_amount`, que já inclui a taxa fixa por unidade, sem somar `fixed_fee` novamente.

Resposta sempre inclui os sete campos solicitados. Exemplo de **teste controlado**, não tarifa atual:

```json
{"frete":8.15,"tarifas":15,"impostos":4,"custos":40,"margemContribuicao":32.85,"margemPct":32.85,"missing":[]}
```

`impostos = precoVenda × aliquotaImpostoPct / 100`.
`custos = custoProduto + custoVariavel`.
`margemContribuicao = precoVenda − frete − tarifas − impostos − custos`.
`margemPct = margemContribuicao / precoVenda × 100`.
Valores monetários são arredondados em centavos, usando decimal/half-up; margem negativa é válida.

Se um recurso falhar, o componente fica `null` e a margem também. `missing` informa, por exemplo, `frete_403`, `tarifas_429`, `frete_timeout`, `frete_invalid_response` ou `frete_modalidade_nao_suportada`. Não há substituição por zero ou percentual fixo. HTTP 200 com `missing` é resposta parcial. Zero só é usado quando a API realmente retorna zero ou quando o usuário informa explicitamente frete manual zero.

401 pede renovação do token; falhas na identificação da conta retornam 403/429/502/504; entradas inválidas retornam 400. O endpoint não recebe URLs externas e não segue redirecionamentos. Não há cache de resultados entre contas. O frete é estimado para uma unidade; a cobrança efetiva depende do envio e pode ser verificada em `/shipments/{id}/costs`, campo `senders[].cost`.

Referências oficiais:
- https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/custos-de-envio
- https://developers.mercadolivre.com.br/pt_br/descricao-de-produtos/comissao-por-vender
- https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-envios

Validação: `.venv/bin/python -m unittest discover -s flask-backend/tests -v`.

## Continuidade sem Mercado Envios

O app envia `permitirFreteEstimado: true`. Somente quando a API identifica especificamente `conta_sem_me2`, o servidor pode usar a tabela pública geral de produtos novos para Full, Coleta e Agências (`fulfillment`, `cross_docking`, `xd_drop_off`). A referência considera preço, reputação e o maior peso entre físico e volumétrico, com arredondamento para cima. Peso volumétrico em gramas: altura × largura × comprimento em cm / 6. A seleção não usa o tipo Clássico/Premium para alterar arbitrariamente o frete; as tarifas de venda continuam consultadas para cada tipo.

A resposta estimada mantém os sete campos e acrescenta `freteOrigem: "tabela_referencia"`, `freteTabelaVersao: "2026-08-24"` e `avisos: ["frete_estimado_sem_me2", "frete_tabela_geral"]`. O lucro pode ser calculado quando frete e tarifas estão disponíveis. Histórico/salvos devem preservar esses metadados. A interface identifica frete e lucro como estimados e informa que ativar Mercado Envios permite consultar as condições da conta; trocar de conta é opcional.

A tabela é uma referência geral, sem benefícios de categorias especiais (como livros e alimentos de animais), Full Super, condições particulares da conta ou garantia de elegibilidade. Flex, Correios e envio próprio não usam esse fallback. Não substituímos falhas genéricas, 401, 403 ou 429 por uma estimativa automática.

Para simular um custo próprio, enviar `freteInformado: 12.50` junto com `permitirFreteEstimado: true`. Nesse caso não se consulta a API de frete, mas a autenticação e a consulta de tarifas continuam. A resposta identifica `freteOrigem: "informado"` e `avisos: ["frete_informado"]`. Zero é aceito somente quando informado explicitamente; o zero inicial do formulário não ativa esse caminho. `freteGratisRapido: true` escolhe a faixa de frete grátis rápido da tabela para preços abaixo de R$ 79; o booleano antigo `freteGratis` não presume essa opção.

As tabelas ficam em `data/shipping_reference.json`, verificadas em 20/10/2026 e vigentes publicamente desde 24/08/2026. `review_by` (19/11/2026) é um prazo interno de revisão, não uma validade prometida pelo Mercado Livre. Após esse prazo, a referência automática é suspensa até revisão; continua disponível a entrada manual. Sem o opt-in, o contrato anterior permanece igual. As credenciais não fazem parte da tabela.

Fontes públicas:
- https://www.mercadolivre.com.br/ajuda/custos-envio-reputacao-verde-sem-reputacao_48392
- https://www.mercadolivre.com.br/ajuda/40545
- https://www.mercadolivre.com.br/ajuda/40547
- https://www.mercadolivre.com.br/ajuda/Como-calcular-o-custo-dos-seus_4413
