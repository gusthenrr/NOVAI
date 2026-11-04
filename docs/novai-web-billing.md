# Pagamentos NOVAI no site

O site usa o mesmo cliente Mercado Pago, ledger, validação dos webhooks, reconciliação e cancelamento do Precify. Nenhum dado de cartão passa pelo frontend ou pelo servidor NOVAI; o formulário hospedado do Mercado Pago coleta a autorização.

## Produtos e valores confirmados

- NOVAI Pro: R$ 57,99/mês ou R$ 671,88 por ano (equivalente a R$ 55,99/mês).
- NOVAI Max: R$ 79,99/mês ou R$ 911,88 por ano (equivalente a R$ 75,99/mês); inclui Precify Pro na mesma conta.
- Sete dias grátis por conta NOVAI, iniciados somente após autorização validada do cartão; renovação pelo valor integral e ciclo escolhidos.
- Versão de consentimento: `2026-11-03-novai-subscriptions`. O checkout exige aceite explícito, versão atual e valor integral exibido igual ao catálogo do servidor.

Os preços do app permanecem no catálogo `precify_plans`. Os produtos NOVAI ficam em `novai_plans`. Ambos usam `precify_subscriptions`/`precify_payments`, distinguindo `product_code` e `novai_plan_code`. Registros antigos recebem `product_code=precify`; não há recálculo de pagamentos anteriores. O período de teste NOVAI é separado do teste Precify. Pagamento ou teste Max confirmado aparece como Pro na resposta do app, sem precisar de uma nova build.

## Fluxo

1. `/planos` carrega preços e disponibilidade pelo endpoint público `/api/novai/billing/plans`.
2. Seleção e período sobrevivem à entrada/cadastro, mas não iniciam pagamento automaticamente.
3. A pessoa aceita as condições e clica para continuar ao Mercado Pago.
4. O site envia o JWT de conta já utilizado pelo login NOVAI. O backend valida revogação, Origin, produto, preço e consentimento, trava a conta e reaproveita um checkout pendente idêntico.
5. O formulário do Mercado Pago retorna a `/api/novai/billing/return`, que redireciona a `/planos?retorno=1`. Esse retorno nunca libera benefícios.
6. Webhooks assinados e reconciliação consultam os recursos com a credencial do servidor, validando titularidade por identificadores, moeda, valor, ciclo e período gratuito. Só então os benefícios são reconhecidos.

O endpoint de webhook existente continua `/api/precify/billing/webhook`; não foi criada outra integração ou chave Mercado Pago. As variáveis existentes `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` e `FRONTEND_URL` continuam sendo utilizadas.

## Conta e cancelamento

`GET /api/novai/billing/account`, `POST /checkout`, `POST /sync` e `POST /cancel` exigem o bearer token atual. Escritas também exigem Origin igual ao frontend configurado. Cookies sozinhos não autorizam compra/cancelamento. Histórico e cancelamento ficam restritos ao usuário e produto NOVAI. O app continua gerenciando suas assinaturas Precify. É bloqueada uma segunda assinatura de Precify ao lado de um Max ativo/pendente, e vice-versa; não se cancela nem migra uma assinatura anterior silenciosamente.

A seleção de planos agora é funcional. Os gráficos de demonstração do site e as áreas do painel ainda sem integração não foram convertidos em dados reais. Esta alteração não cria uma nova política de bloqueio das funcionalidades antigas da extensão/painel: expõe o plano confirmado para os clientes e reconhece o pacote Max no Precify.

## Validação

Testes de integração usam PostgreSQL temporário e respostas Mercado Pago simuladas. Abrir checkout real, preencher cartão e concluir uma assinatura ficam com o usuário; nenhuma cobrança real é feita durante a validação.
