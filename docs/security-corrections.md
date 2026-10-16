# Correções de segurança da NOVAI e do Precify

Correções da auditoria de 16 de outubro de 2026, baseada no commit `81624ad`, preparadas para a branch de implantação `codex/railway-backend-deploy`. A produção só recebe estas proteções após concluir a implantação do backend e atualizar o app correspondente. A migração é aditiva e executada por `init_db.py` antes do servidor.

## Autenticação e isolamento

- Notificações do Mercado Livre aceitam tópicos e caminhos delimitados. O destino autenticado fica restrito à API oficial, sem seguir redirecionamentos. Antes de despachar, o servidor consulta o recurso com o token da conta e verifica seu proprietário. Ofertas são conferidas pelo anúncio associado; mensagens, pelos participantes.
- Socket.IO exige autenticação na conexão. A identidade dos eventos vem da sessão validada, e respostas são enviadas à conexão ou sala da própria conta. A troca de senha invalida JWTs antigos e encerra as outras sessões.
- O chat usa consultas parametrizadas de tabelas e colunas permitidas, com filtro obrigatório de proprietário, transação somente de leitura, limite de 100 registros por tabela e prazo de consulta. Não executa SQL gerado por IA. Métricas e pedidos ficam limitados aos últimos 30 dias; tabelas fora da lista não estão disponíveis nesse caminho.
- `/scraping`, `/visitsItems` e `/visitas_por_mes` exigem sessão NOVAI. As visitas usam o token da conta autenticada. A coleta de páginas aceita hosts oficiais, bloqueia endereços privados, fixa o IP verificado na conexão TLS e valida cada redirecionamento, tamanho de resposta e tempo.
- Os três logins compartilham o contador de falhas por conta. Logins válidos não consomem esse contador. Há um limite adicional de falhas por origem observada pelo servidor, sem confiar em `X-Forwarded-For` fornecido pelo cliente.
- Todos os cadastros exigem senha de pelo menos oito caracteres, com limite de 72 bytes do bcrypt. Contas antigas precisam atualizar senha quando necessário e aceitar os termos antes de utilizar os recursos do Precify. As sessões existentes continuam podendo acessar essa atualização e sair da conta.
- Foram removidos registros de tokens, cookies e corpos sensíveis do ponto de entrada ativo. Erros públicos não expõem exceções internas. O token literal do script antigo foi substituído por variável de ambiente.

## Conta e e-mail

O app oferece atualização de senha, confirmação de e-mail e lista/revogação das sessões do Precify. Recuperação e verificação usam códigos aleatórios, armazenados por hash, válidos por 20 minutos e consumidos uma única vez. A recuperação invalida todas as sessões da conta e os JWTs antigos.

O usuário ainda não tem serviço de envio. Portanto, recuperação e confirmação ficam explicitamente indisponíveis até configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` e `SMTP_FROM`. A porta 587 usa STARTTLS obrigatório; 465 usa TLS desde a conexão. Nenhum e-mail real foi enviado nos testes. A propriedade do e-mail ainda não é requisito de acesso enquanto esse serviço não estiver ativo.

## Pagamentos

A sincronização consulta a autorização, as faturas da assinatura e os pagamentos oficiais. Mantém a verificação de assinatura, conta, preço, moeda, estado e datas. Repetir a consulta não duplica o período; um reembolso atualizado remove o benefício correspondente.

Foi adicionado um conciliador periódico, iniciado quando as credenciais do Mercado Pago estão configuradas. Ele busca assinaturas pendentes/ativas e períodos pagos ainda vigentes, registra falhas para nova tentativa e usa uma reserva no PostgreSQL para evitar execução duplicada entre processos. Consultas têm paginação e tempo limitados; resposta incompleta é erro explícito. A fila é processada gradualmente, sem promessa de atualização instantânea quando faltam webhooks.

O fluxo utiliza a [API oficial de busca de faturas de assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get). Os testes usaram respostas simuladas: não cadastraram cartão nem fizeram cobranças.

## Compatibilidade

Os clientes web antigos enviam o cookie de sessão na conexão Socket.IO. A cópia legada `ml-ext` deste repositório recebeu login e autenticação nas três rotas antigas. A extensão ativa de OneDrive/Estudar não chama essas três rotas, conforme a busca realizada; sua instalação não foi substituída.

O app Precify foi alterado em seu projeto separado. Publique-o junto do backend para apresentar a etapa de atualização de contas antigas. O relay web permite somente as novas rotas explícitas de conta; mantém cookie HttpOnly e rejeição de origem diferente.

## Dependências e validação

Foram atualizadas as bibliotecas vulneráveis de autenticação, HTTP, parsing e IA, incluindo a combinação Flask e Flask-SocketIO. O pacote LangChain antigo foi removido; os imports utilizados vêm de `langchain-core`.

- Backend: 80 testes e 16 subtestes aprovados, em PostgreSQL temporário, com Python 3.12 e as dependências atualizadas. O Docker de produção continua em Python 3.11; não foi executada uma imagem Docker completa.
- Servidor real `teste:app`: importação aprovada, recusa de HTTP/socket anônimo e resposta explícita de e-mail indisponível.
- App: 154 testes aprovados; tipos, lint, exportação web e bundle Android aprovados. Não houve teste físico do APK.
- Dependências resolvidas do backend: 78 pacotes analisados, nenhum aviso conhecido no scanner dessa execução. Isso não é garantia de ausência de vulnerabilidades.
- App: `decode-uri-component` e `uuid` atualizados. `braces` e `node-forge` ainda não tinham versões corrigidas publicadas para os dois avisos remanescentes; o projeto aplica proteções locais verificadas no `postinstall`. Elas limitam a profundidade do parser e rejeitam elementos extras na estrutura de assinatura, com testes de entradas válidas e inválidas. O scanner continuará sinalizando as versões originais. Não omitir scripts na instalação do app; a instalação falha se a versão ou o trecho esperado mudar. [Aviso braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [aviso node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

## Pendências operacionais

1. Confirmar a implantação do backend no Railway após a integração na branch `codex/railway-backend-deploy`. O app Precify é um projeto separado, ainda sem repositório remoto configurado nesta publicação; suas alterações locais precisam acompanhar a distribuição do app.
2. Configurar e homologar o serviço de e-mail.
3. Conferir revogação/expiração das credenciais anteriormente expostas e tratar os logs/histórico antigos. Apagar a linha atual não revoga um token nem remove versões antigas. Não foi feita reescrita do histórico Git.
4. Homologar o ciclo real de assinatura com contas de teste do Mercado Pago: autorização, sete dias, cobrança, recusa, cancelamento e reembolso.
5. Substituir as proteções locais das dependências do app quando os mantenedores publicarem versões corrigidas. Eventlet está em manutenção; planejar migração do transporte em uma mudança própria.

As reproduções originais da auditoria descrevem o código anterior. Os testes de regressão atuais estão em `flask-backend/tests/test_security_fixes.py` e exigem o comportamento protegido.
