# NOVAI — visual do site, conta e painel

O frontend Next.js mantém o backend Railway existente. Esta alteração não importa dados financeiros de demonstração, não muda preços de cobrança nem modifica tabelas ou APIs.

- `next.js/public/site-apresentacao/`: site da pasta 05, organizado separadamente no Git; recursos, estilos e demonstração interativa preservados.
- `/`, `/planos`, `/como-funciona`, `/demonstracao`: apresentação pública. A escolha de planos continua identificada como prévia e não inicia cobrança.
- `/login`, `/cadastro`, `/conectado`: visual da pasta 02; formulário de login continua chamando `/user-login`; cadastro continua enviando `usuario`, `email`, `senha` a `/add-usuario`; confirmação OAuth continua na rota existente.
- `next.js/src/app/components/PanelShell.tsx` e `panel.css`: layout da pasta 03 aplicado às páginas existentes do dashboard e assistente. Os handlers, sockets, calendários, filtros e dados das páginas foram preservados. O modelo financeiro simulado da pasta 03 não foi conectado à produção.
- O endereço da API permanece `NEXT_PUBLIC_API_URL`, configurado no serviço de frontend Railway. Não há credenciais nos arquivos de apresentação.

O serviço de frontend é `appealing-dream`, raiz `/next.js`. O backend `NOVAI` e o PostgreSQL não precisam de alteração para este tema.
