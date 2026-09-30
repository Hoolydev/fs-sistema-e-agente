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
