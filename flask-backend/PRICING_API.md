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

Full usa `fulfillment`; Flex usa `self_service`. Nos demais casos, `logisticType` aceita `cross_docking`, `xd_drop_off`, `drop_off` ou `not_specified`, com `xd_drop_off` por padrão. `not_specified` não inventa cotação de frete. Full e Flex simultâneos são inválidos. Não há tabela local de frete nem simulação de bônus/custo do entregador Flex: o valor retornado é a cotação ML, não despesas de transportadora própria. A condição simulada é produto novo.

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

Se um recurso falhar, o componente fica `null` e a margem também. `missing` informa, por exemplo, `frete_403`, `tarifas_429`, `frete_timeout`, `frete_invalid_response` ou `frete_modalidade_nao_suportada`. Não há substituição por zero ou percentual fixo. HTTP 200 com `missing` é resposta parcial. Zero só é usado quando a API realmente retorna zero.

401 pede renovação do token; falhas na identificação da conta retornam 403/429/502/504; entradas inválidas retornam 400. O endpoint não recebe URLs externas e não segue redirecionamentos. Não há cache de resultados entre contas. O frete é estimado para uma unidade; a cobrança efetiva depende do envio e pode ser verificada em `/shipments/{id}/costs`, campo `senders[].cost`.

Referências oficiais:
- https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/custos-de-envio
- https://developers.mercadolivre.com.br/pt_br/descricao-de-produtos/comissao-por-vender
- https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-envios

Validação: `.venv/bin/python -m unittest discover -s flask-backend/tests -v`.
