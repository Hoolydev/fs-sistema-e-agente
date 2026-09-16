# Login, PWA e acervo compartilhado

## Acesso

- Login próprio FS em `/login`, com Better Auth 1.7.5 e tabelas `fs_auth_*` no PostgreSQL Neon existente.
- Cadastro público desabilitado. Provisionamento somente pelo script administrativo `scripts/provision-user.ts`, com variáveis `FS_PROVISION_EMAIL` e `FS_PROVISION_NAME`. A senha aleatória fica em `.local/ACESSO-SISTEMA.txt` e deve ser trocada em `/conta`.
- Cookies HttpOnly, Secure em produção, sessão de 7 dias, encerramento/revogação, rate limiting persistido no banco e validação de sessão nos endpoints de dados.
- Usuários provisionados pertencem à equipe interna FS e acessam o mesmo acervo. Portal de clientes com separação por empresa não foi criado nesta etapa.
- O webhook de captação do site mantém seu token/assinatura e funciona independentemente de login.

## Aplicativo

Manifesto `/manifest.webmanifest`, abertura em `/diagnostico`, ícones e modo standalone. Android/Chrome exibe Instalar quando o navegador considera o aplicativo elegível. No iPhone, usar Safari > Compartilhar > Adicionar à Tela de Início.

O service worker armazena apenas a página genérica de indisponibilidade e ícones. Nenhum relatório, resposta de API, sessão ou página com dados é persistido no cache offline. Os diagnósticos exigem conexão à internet.

## Acervo

`/documentos` e a entrada do diagnóstico consultam as mesmas fontes:
- PDFs já anexados a contatos do Comercial (`fs_crm_attachments`);
- arquivos gerados e arquivados pelo agente (`fs_documents`).

Cada documento possui empresa/CNPJ, nome, origem, data e identificador. Uma nova análise gera outro documento; o reenvio utiliza o arquivo existente. O protocolo do agente é chave de idempotência do arquivamento. Downloads e operações do agente deixam registro em `fs_document_audit`.

Limite atual: PDF de até 3 MB. Arquivos maiores precisam de armazenamento de objetos antes de serem aceitos pelo receptor Vercel. A busca da interface mostra até 100 resultados; refinar por empresa/CNPJ. Documentos produzidos fora dos dois acervos precisam ser anexados/importados explicitamente.

## Agente e Contabo

A Vercel hospeda interface, login e APIs; o Neon guarda registros e PDFs nesta fase. A Contabo mantém API WhatsApp, Redis/BullMQ e worker existentes. O agente usa `FS_SYSTEM_URL` e `FS_SYSTEM_API_TOKEN` para consultar o sistema.

No sistema: `FS_AGENT_SERVICE_TOKEN` e `FS_AGENT_ALLOWED_PHONES`. Toda chamada exige token Bearer e `x-fs-requester-phone` autorizado. Nenhuma chave é exposta ao navegador e nenhum link público é necessário para entregar um PDF.

- `GET /api/agent/documents?q=nome-ou-cnpj`: localizar metadados.
- `GET /api/agent/documents/:id`: recuperar PDF privado.
- `POST /api/agent/documents`: arquivar PDF e metadados multipart.

Exemplo: “me manda a análise do cliente XPTO”. Havendo uma única empresa, seleciona o parecer mais recente e entrega o próprio arquivo. Se houver homônimos, pede CNPJ. Se não houver documento ou a conexão falhar, não inicia nova consulta. A consulta nova continua no fluxo de confirmação existente.

Novos documentos reais gerados pelo worker são arquivados antes da entrega. Documentos mock não são promovidos ao acervo real. Falha no arquivamento preserva o arquivo no armazenamento do agente e interrompe a tarefa sem repetir a consulta fiscal; requer reconciliação pelo protocolo.

A implantação manteve `WHATSAPP_DRY_RUN=true` e `RPA_MODE=mock`, valores encontrados no servidor. Não houve envio de mensagens de teste a pessoas. Confirmar os números de Fernando e da equipe e concluir a ativação operacional antes de anunciar envio real pelo WhatsApp.

## Verificação

- `node scripts/verify-access.mjs URL`: login/logout, PDF privado, rejeição de sessão forjada, cadastro fechado, manifesto e autorização do agente. Lê as credenciais privadas locais, sem imprimi-las.
- `npm run test:diagnostico`, `npm run test:comercial`, build e lint das adições.
- `automacao-ecac`: 60 testes, incluindo reenvio sem nova análise, homônimos, indisponibilidade e contato não autorizado.

Referências: https://better-auth.com/docs/integrations/next e https://nextjs.org/docs/app/guides/progressive-web-apps.
