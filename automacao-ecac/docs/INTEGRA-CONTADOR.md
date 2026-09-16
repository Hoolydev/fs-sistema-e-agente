# Integra Contador — ativação FS

> Atualização: credenciais dos dois produtos Serpro recebidas e autenticação validada na VPS. Consultas reais ainda não homologadas. Ver [estado da integração Serpro](SERPRO-CREDENCIAIS-VALIDADAS.md); esta atualização substitui os trechos históricos que indicam ausência de contratação/chaves.

Estado: adaptador SITFIS implementado e testado com respostas simuladas. Contratação, credenciais e homologação real pendentes. Não foi realizada consulta fiscal real via Serpro.

## Contratação

1. Contratar [Integra Contador na loja oficial](https://www.loja.serpro.gov.br/integracontador) com o e-CNPJ da empresa contratante. Conferir preços e condições no fluxo de contratação; custos Serpro são separados de OpenAI, WhatsApp e hospedagem.
2. Para aproveitar o certificado da FS instalado, contratar em nome de FS Soluções Tributárias, CNPJ 47.733.961/0001-79. O certificado de autenticação deve corresponder ao da contratação, conforme [autenticação oficial](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/quick_start/).
3. Obter Consumer Key e Consumer Secret na [Área do Cliente](https://cliente.serpro.gov.br/). Instalar como arquivos secretos, nunca no repositório, logs ou imagens Docker.
4. Conferir a procuração e os serviços autorizados pelo contribuinte à FS. O certificado da FS, por si só, não concede acesso aos clientes.

Esta primeira versão exige contratante = autorPedidoDados (FS). Contratar como Nexa e consultar como FS requer a integração adicional de autenticação/delegação de procurador, ainda não implementada. O cliente consultado é enviado separadamente em contribuinte.numero.

## Fluxo implementado

WhatsApp/Z-API → fila → certificado do contratante + OAuth Serpro → SITFIS/Apoiar → protocolo → SITFIS/Emitir → validar PDF e CNPJ → OpenAI → parecer parcial PDF → WhatsApp.

- Endpoints de produção fixos, HTTPS com validação TLS, sem redirecionamentos.
- Autenticação: POST `https://autenticacao.sapi.serpro.gov.br/authenticate`, mTLS PFX, Basic Consumer Key/Secret, `role-type: TERCEIROS`, `grant_type=client_credentials`. Serviços usam Bearer e `jwt_token`.
- Base: `https://gateway.apiserpro.serpro.gov.br/integra-contador/v1`.
- SITFIS versão **2.0**, serviço `SOLICITARPROTOCOLO91` em `/Apoiar`, dados vazio; `RELATORIOSITFIS92` em `/Emitir`, dados JSON serializado com `protocoloRelatorio`.
- Espera `tempoEspera` em milissegundos; no máximo seis emissões e janela configurável de polling. 202 significa processamento, não relatório vazio.
- PDF somente é usado após validação de conteúdo, contribuinte no envelope e primeiro CNPJ identificado no texto do documento. Layout divergente exige revisão humana.
- Não repete automaticamente a coleta após falha, retorno ambíguo ou reinício do job. A fila grava uma marca antes da coleta. Revisar a solicitação antes de criar uma nova, que pode gerar cobrança. O protocolo não possui retomada persistente nesta versão.
- A fonte original é temporária; é apagada depois do processamento. O parecer entregue é salvo pelo armazenamento já existente. Um pedido de Situação Fiscal salva/entrega o PDF original. Não há novo arquivo permanente dos PDFs-fonte neste adaptador.

## Limite PGFN e período

SITFIS não foi homologado como substituto do relatório consolidado detalhado do Regularize. O documento da RFB pode conter referências à dívida ativa, mas isso não prova cobertura integral da PGFN. O parecer traz aviso de análise parcial na capa, no resumo, nas pendências e na mensagem de entrega, inserido pelo código mesmo se o LLM omitir o aviso. Não tratar dados ausentes como ausência de débitos.

O módulo recebe CNPJs numéricos, como o parser atual do agente. Não implementa ainda CNPJ alfanumérico, consulta histórica por competência, DCTFWeb, Caixa Postal ou a coleta detalhada PGFN. SITFIS apresenta a posição da data da emissão.

## Instalação na VPS

Manter Coolify. Usar `/opt/fs-automacao-ecac`. Compose de produção + overlay Serpro; não combinar com overlay do navegador.

Criar `secrets/serpro` com acesso restrito. Instalar quatro arquivos para leitura pelo usuário do worker (UID/GID 1001):

- `certificate.pfx`: e-CNPJ da empresa contratante.
- `passphrase`: senha do PFX.
- `consumer-key`: Consumer Key.
- `consumer-secret`: Consumer Secret.

Diretório root:1001 com modo 0750; arquivos root:1001 com modo 0640. O diretório pode existir sem chaves enquanto `SERPRO_ENABLED=false`. Montar apenas os segredos necessários nesse worker.

No `.env`, após confirmar contratação FS:

```dotenv
FISCAL_DATA_PROVIDER=serpro
SERPRO_ENABLED=false
SERPRO_CONTRACTOR_CNPJ=47733961000179
SERPRO_AUTHOR_CNPJ=47733961000179
WHATSAPP_DRY_RUN=true
```

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.serpro.yml build worker
docker compose -f docker-compose.prod.yml -f docker-compose.serpro.yml up -d --no-deps worker
```

Antes de recriar qualquer infraestrutura, conferir volumes, rede e banco existentes. O worker oficial usa a rede backend do Compose de produção. Nunca usar `down -v` para migrar.

Após instalar credenciais válidas: mudar `SERPRO_ENABLED=true`, recriar somente o worker e executar uma consulta autorizada. Conferir PDF, CNPJ, procuração, conteúdo e faturamento da chamada. Manter WhatsApp dry-run durante essa homologação; ativar entrega real após verificar o resultado. A instalação sozinha não homologa a integração.

## Verificação

`pnpm typecheck`, `pnpm test` e `pnpm build`. Os testes usam credenciais falsas e respostas simuladas; não acessam Serpro, OpenAI nem WhatsApp. Cobrem autenticação, versão/envelope, espera/polling limitado, falta de ativação, erros, CNPJ divergente, PDF inválido e escopo parcial. Homologar mTLS, procuração, layout de PDF e respostas reais após contratação.

Documentação oficial consultada em 10/09/2026:

- [Como contratar](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/como_contratar/)
- [Solicitar protocolo](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sitfis/sitfis/servicos/apoiar_relatorio/)
- [Emitir relatório](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sitfis/sitfis/servicos/emitir_relatorio/)
- [Mensagens SITFIS](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sitfis/sitfis/mensagens/)
- [API Reference](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/chamadas/api_reference/)

## Estado da VPS em 10/09/2026

Worker reconstruído e iniciado com o overlay Serpro, `SERPRO_ENABLED=false` e WhatsApp dry-run. Certificado da FS, senha e segredo OpenAI acessíveis somente pelos caminhos configurados. Consumer Key/Secret ainda ausentes; CNPJs contratuais aguardam confirmação após contratação. Nenhum acesso ao Serpro foi realizado. Coolify e desktops existentes preservados.

PostgreSQL e Redis existentes estavam na rede `fs-automacao-ecac_default`; foram também conectados à rede `fs-automacao-ecac_backend`, com aliases `postgres` e `redis`, para comunicação com API e worker de produção, sem recriar bancos ou apagar volumes. Ao recriar esses serviços no futuro, usar o Compose de produção para manter essa rede. Backup anterior à migração: `/opt/fs-automacao-ecac/backups/pre-serpro-20260910.tar.gz`, acessível somente ao root.
