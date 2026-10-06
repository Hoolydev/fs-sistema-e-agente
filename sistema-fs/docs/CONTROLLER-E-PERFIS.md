# Controller, perfis de acesso e revisão

Atualização de 30/09/2026. As telas de gestão deixaram de usar dados demonstrativos: tudo o que aparece vem do banco. Módulo sem registros mostra estado vazio, nunca números ilustrativos.

## Perfis e hierarquia

Fonte única: `lib/auth/roles.ts` (usada pelas APIs, pelo plugin `admin` do Better Auth e pela interface). O perfil fica na coluna `role` de `fs_auth_user`; conta sem perfil gravado recebe o menor nível.

| Ação | Administrador revisor (`admin`) | Advogado revisor (`advogado`) | Inclusão de dados (`operador`) |
| --- | --- | --- | --- |
| Consultar processos, documentos e diagnósticos | sim | sim | sim |
| Incluir e editar registros no Controller | sim | sim | sim |
| Revisar: aprovar ou pedir ajustes | sim | sim | não |
| Excluir registros | sim | não | não |
| Criar usuários, definir perfis, redefinir senhas | sim | não | não |
| Desativar e reativar acessos | sim | não | não |

Regras aplicadas no servidor (a interface apenas esconde o que o perfil não pode fazer):

- Registro salvo pelo perfil de inclusão fica **Aguardando revisão**. Registro salvo por um revisor já sai **Revisado** por ele.
- Revisor aprova ou **pede ajustes** (justificativa obrigatória). Quem incluiu corrige e salva; o registro volta para a fila de revisão.
- Toda inclusão, edição (campo a campo), decisão e exclusão fica em `fs_controller_audit` com autor e horário. A exclusão remove o registro e mantém o histórico.
- Edição concorrente é recusada (`409 STALE`): o formulário envia a versão lida.
- O administrador não altera o próprio perfil nem desativa a própria conta; sempre resta um administrador ativo.
- Ninguém entra como outro usuário (`impersonate` não é concedido a nenhum perfil) e contas não são apagadas, apenas desativadas. Conta desativada perde as sessões e não entra mais.
- Cadastro público continua fechado. Usuários nascem pela tela Configurações → Equipe e permissões (administrador) ou pelos scripts abaixo.

O botão Analisar CNPJ e o acervo continuam disponíveis a qualquer usuário logado; este ajuste não mudou essas regras.

## Controller

Tabelas `fs_controller_processes` e `fs_controller_audit`, criadas sob demanda (`lib/controller/store.ts`). Campos espelham a planilha da equipe: empresa, CNPJ, objeto, status adm./habilitação, data do protocolo, contagem, nº do processo adm., última atualização, status e observações. Na planilha a contagem é o protocolo + 31 dias; o formulário sugere esse valor e aceita ajuste.

APIs (sessão obrigatória, mesma origem nas escritas):

- `GET /api/controller/processos` — lista e perfil de quem consulta.
- `POST /api/controller/processos` — incluir.
- `GET|PATCH|DELETE /api/controller/processos/:id` — histórico, editar, excluir (admin).
- `POST /api/controller/processos/:id/revisao` — `aprovar` ou `ajustes` (revisores).

Página inicial, Painel executivo, Indicadores, Administrativo/Cadastro, Aprovações e Relatórios são calculados a partir desses registros (`lib/controller/metrics.ts`). Contabilidade e Jurídico ainda não têm registros próprios.

## Operação

```sh
# 1. Estrutura de autenticação (acrescenta role/banned em fs_auth_user; não apaga nada)
npx tsx --env-file=<env> scripts/setup-auth.ts
# 2. Equipe inicial — senhas aleatórias em .local/ACESSOS-EQUIPE-<data>.txt (privado, fora do Git)
npx tsx --env-file=<env> scripts/provision-team.ts
# 3. Planilha do Controller — sem --gravar apenas valida
npx tsx --env-file=<env> scripts/import-controller.ts "<planilha.xlsx>" --gravar
```

Os três são idempotentes: conta existente é mantida (senha e perfil intactos) e processo com nº já registrado é ignorado. Registros importados entram como revisados, com autor "Importação da planilha" no histórico. Em produção, executar a etapa 1 antes de publicar o código novo.

Um usuário avulso: `FS_PROVISION_EMAIL`, `FS_PROVISION_NAME` e, opcionalmente, `FS_PROVISION_ROLE` com `scripts/provision-user.ts` (grava `.local/ACESSO-SISTEMA.txt` e `.local/provisioned-user.json`, usados pelos scripts de verificação).

## Verificação

`npm run test:controller` (perfis, validação, indicadores e leitura da planilha), `npm run typecheck`, `npx eslint .`, `npm run build`. Conferência manual em localhost:3100 com os três perfis: inclusão → pedido de ajustes → aprovação → exclusão, criação de usuário, troca de perfil, nova senha e desativação.

## Agente WhatsApp: equipe, comprovantes e avisos (etapa 1, 30/09/2026)

- Cada usuário pode ter **WhatsApp** e **atribuições no agente** (`fs_auth_user.phone`, `fs_auth_user.agentTasks`: `comprovantes`, `analises`, `avisos`), definidos pelo administrador em Configurações → Equipe. O agente identifica o número por `GET /api/agent/team` (token de serviço) e só aceita ações de números cadastrados; `FS_AGENT_ALLOWED_PHONES` continua como allowlist de transição.
- `POST /api/agent/documents` aceita `kind: comprovante` em PDF, JPG ou PNG (tipo detectado pelo conteúdo, coluna `fs_documents.mime`); o nome da empresa é completado pelo Controller quando o agente só informa o CNPJ. Comprovantes aparecem no acervo e em "Documentos da empresa" no painel do processo.
- Caixa de saída `fs_notifications`: o sistema grava avisos (registro aguardando revisão → revisores; aprovação/ajustes → quem salvou; comprovante recebido → revisores; resumo diário das contagens a partir das 08:00 de Brasília, gerado quando o agente consulta). O agente lê em `GET /api/agent/notifications` e confirma em `POST /api/agent/notifications/:id` (`{"sent":true}` ou `{"sent":false,"error":"..."}`). Chave de deduplicação impede repetir o mesmo aviso; após 5 falhas o aviso deixa de ser oferecido.

## Cadastro de empresas e documentação (01/10/2026)

- **Administrativo / Cadastro** passou a ser o cadastro de empresas (`fs_companies`: CNPJ, razão social, observações, quem cadastrou). Empresas que só existem em processos do Controller aparecem na lista como "presente só no Controller" e ganham cadastro próprio ao serem editadas. `GET/POST/PATCH /api/empresas` (incluir: qualquer perfil que inclui registros).
- "Novo processo no Controller" a partir da empresa preenche razão social e CNPJ; no formulário do processo, a razão social tem lista das empresas cadastradas e preenche o CNPJ.
- **Documentação por empresa** com checklist (`lib/documentos/tipos.ts`): Cartão CNPJ, Documento pessoal, Contrato social, Procuração assinada, Traslado/cessão, Certidão Ouricuri, Certidão de trânsito (obrigatórios); Comprovante de pagamento e Outro (opcionais). Envio de vários arquivos de uma vez por `POST /api/documentos` (multipart: `cnpj`, `files[]`, `types[]`; PDF/JPG/PNG até 3 MB cada, até 10 por envio; tipo gravado em `fs_documents.doc_type`). O painel da empresa e o painel do processo mostram o checklist, os arquivos e o envio.
- O agente passa a procurar empresas em `GET /api/agent/companies` no cadastro, não só no Controller.

## Usuário externo e isolamento por dono (06/10/2026)

Perfil `externo` ("Usuário externo"): analisa CNPJ, cadastra empresas, inclui processos e envia documentação, mas **só vê e altera o que ele mesmo incluiu**. Implementado por uma coluna `owner_id` em `fs_controller_processes`, `fs_companies` e `fs_documents` (pareceres incluídos), aplicada no SQL por `lib/auth/scope.ts`: registros da FS têm dono nulo e são visíveis a toda a equipe interna; o externo recebe `owner_id = seu id` em tudo que cria e as consultas filtram por ele. O reaproveitamento de parecer (janela de 24 h) também respeita o dono. O que o externo inclui entra na fila de revisão da FS como qualquer registro de inclusão.

Fora do alcance do externo: Comercial, Aprovações, Jurídico, Contabilidade (menu e endereço direto), gestão da equipe, APIs do Comercial (`interno: acessar`), anexos do CRM e qualquer documento, processo ou parecer de outro dono (404). Criação pelo administrador em Configurações → Equipe, perfil "Usuário externo". Comprovantes enviados pelo WhatsApp por um externo com telefone cadastrado ficam no escopo dele.
