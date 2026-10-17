# Diagnóstico da cotação da calculadora

Os logs do Railway usam o prefixo `[pricing]`. Cada simulação recebe um
`diagnostic_id`, também enviado no cabeçalho `X-Pricing-Diagnostic-Id`.

Eventos:

- `calculator_request`: campos recebidos da calculadora, incluindo preço,
  custos, categoria, peso, medidas, modalidade, reputação e indicação de frete grátis.
- `ml_request`: caminho oficial consultado e parâmetros efetivamente enviados.
  Permite conferir `dimensions`, `category_id`, `listing_type_id`, `logistic_type`
  e `free_shipping`, entre outros.
- `ml_response`: status HTTP, tempo decorrido e corpo JSON da resposta oficial,
  inclusive `message`, `error` e `cause` quando fornecidos pelo Mercado Livre.
- `ml_transport_error`: timeout ou falha de conexão, sem imprimir a exceção bruta.
- `shipping_invalid_response`: formato inesperado na leitura da cotação.
- `calculator_response`: status e JSON efetivamente devolvidos ao aplicativo,
  incluindo os campos `frete`, `tarifas` e `missing`.

O diagnóstico não altera as regras do cálculo. Valores indisponíveis continuam
como `null`. Um HTTP 200 da NOVAI pode conter `missing: ["frete_400"]`; nesse
caso, procure o `ml_response` de status 400 com o mesmo `diagnostic_id`.

## Proteção dos registros

Headers e variáveis de ambiente não são impressos. Tokens, cookies, senhas e
segredos são ocultados recursivamente; o token efetivamente utilizado também é
removido caso apareça dentro de uma mensagem do serviço externo. De `/users/me`,
somente `id` e `site_id` são registrados. Campos desconhecidos do pedido da
calculadora são descartados do diagnóstico.

Respostas não JSON são identificadas por `body_format`, sem gravar HTML bruto.
Há limites de tamanho, profundidade e quantidade de elementos para impedir logs
descontrolados. O corpo de pedidos acima do limite de 16 KiB não é lido pelo
diagnóstico. Esses logs só são ativados no contexto da cotação da calculadora.
