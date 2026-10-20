# Acesso de testers no Precify

A coluna `precify_accounts.testers` aceita apenas `0` ou `1` e tem padrão `1`,
tanto para contas existentes na migração quanto para novas contas.

- `1`: segue o plano, o teste gratuito e as cotas normais da conta.
- `0`: recebe os recursos Pro e buscas ilimitadas, sem prazo de expiração.

Somente quem tem permissão de escrita direta no banco pode alterar a coluna.
Nenhuma API permite essa alteração, inclusive cadastro e login. O backend usa
sempre o ID NOVAI da sessão autenticada, nunca um ID informado pelo cliente.
A resposta de plano mantém o formato existente, sem expor a coluna `testers`.
Autenticação, isolamento entre contas e limites de segurança continuam ativos.

Para liberar uma conta, substitua `123` pelo `usuarios.id` / ID NOVAI correto
(não é o ID do vendedor do Mercado Livre):

```sql
INSERT INTO precify_accounts (user_id, testers) VALUES (123, 0)
ON CONFLICT (user_id) DO UPDATE SET testers = EXCLUDED.testers;
```

Para voltar ao comportamento normal:

```sql
UPDATE precify_accounts SET testers = 1 WHERE user_id = 123;
```

A próxima consulta de sessão/plano ou requisição protegida já considera o valor
atual. Uma alteração manual no banco não emite evento Socket.IO; reabra o app
para atualizar o plano exibido. Nenhuma conta é habilitada automaticamente.

Esta liberação não cria, cancela ou altera assinaturas, pagamentos ou datas de
teste gratuito. Uma assinatura já existente continua com seu ciclo de cobrança.
Ao restaurar `1`, volta a valer o plano real, incluindo as buscas já utilizadas.
Reaplicar a migração não redefine os testers configurados manualmente.
