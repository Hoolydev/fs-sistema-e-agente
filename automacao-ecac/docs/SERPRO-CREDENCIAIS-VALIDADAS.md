# Credenciais Serpro e autenticação — 16/09/2026

## Estado verificado

O usuário informou contratação dos produtos Integra Contador e Consulta Dívida Ativa (direto na faixa). As credenciais foram instaladas em arquivos privados no computador de desenvolvimento e em `/opt/fs-automacao-ecac/secrets/` na VPS. Nenhum valor de credencial ou token consta no repositório.

Teste executado na VPS em processo isolado, sem reiniciar os serviços existentes:

| Produto | Endpoint de autenticação | Resultado |
| --- | --- | --- |
| Integra Contador | `https://autenticacao.sapi.serpro.gov.br/authenticate` | HTTP 200, Bearer + JWT recebidos com o certificado FS já instalado |
| Consulta Dívida Ativa | `https://gateway.apiserpro.serpro.gov.br/token` | HTTP 200, Bearer recebido |

TLS validado normalmente, sem `curl -k`. Tokens permaneceram apenas na memória do processo de verificação e não foram impressos ou persistidos. Obter token não comprova autorização a todos os serviços ou empresas nem confirma procurações. Nenhum contribuinte foi consultado e nenhum PDF real foi produzido nesse teste.

## Arquivos privados

- Integra: `secrets/serpro/consumer-key`, `consumer-secret`, `contract-id`; na VPS já existiam `certificate.pfx` e `passphrase`.
- Dívida Ativa: `secrets/serpro-divida-ativa/consumer-key`, `consumer-secret`, `contract-id`.
- Local: arquivos modo 0600, diretórios 0700. VPS: root:1001, arquivos 0640, diretórios 0750.
- Os dois produtos usam atualmente o mesmo par fornecido, mas são mantidos separados para permitir futura troca independente.
- A cópia local nesta etapa recebeu somente as chaves/identificador: o teste mTLS foi realizado na VPS, onde o PFX já existia. A cópia local do PFX continua nos materiais privados/instalação anterior.

## Verificador reproduzível

`node scripts/validate-serpro-auth.mjs --secrets-dir /caminho/privado/secrets --product all`

Aceita `integra`, `divida-ativa` ou `all`. Usa somente endpoints fixos de autenticação, com timeout, limite de resposta e saída resumida; não realiza consultas de contribuintes. Requer Node com suporte ao PFX instalado. Na VPS atual o Node está no contêiner; o host não tem Node. Executar em contêiner isolado usando a imagem existente e montar somente o script e os dois diretórios Serpro como leitura, sem sobrescrever configuração do worker.

## O que falta para consulta efetiva

1. Confirmar com o responsável o CNPJ titular dos contratos; `SERPRO_CONTRACTOR_CNPJ` e `SERPRO_AUTHOR_CNPJ` estavam vazios no `.env` inspecionado. O certificado FS funcionou no teste de autenticação; não preencher identidade contratual por suposição.
2. Configurar os mounts corretos do worker para Serpro após decidir o fluxo. No teste, o worker em execução tinha mounts do certificado e-CAC/OpenAI, sem os diretórios Serpro. A instalação dos arquivos não mudou esses mounts nem ativou consultas.
3. Homologar SITFIS, procuração e CNPJ autorizados. O cliente SITFIS existe no código; ativação permanece desabilitada.
4. Implementar e homologar o cliente Consulta Dívida Ativa no produto `consulta-divida-ativa-df` contratado, conferindo cobertura, paginação, unidades, falhas e cobrança. A autenticação não implementa esse adaptador.
5. Mapear as duas fontes para o parecer FS e ligar sistema/worker/acervo. Fontes incompletas devem continuar explícitas, sem simular dívida zero nem desconto automático.

Na inspeção de arquivo `.env` desta etapa: `FISCAL_DATA_PROVIDER=serpro`, `SERPRO_ENABLED=false`, `RPA_MODE=mock`, `WHATSAPP_DRY_RUN=true`. Isso não determina sozinho o valor efetivo do contêiner porque os overrides Compose podem substituí-lo. Nenhum valor de ativação foi alterado durante a instalação das chaves.

Referências oficiais:
- [Autenticação Integra Contador](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/quick_start/)
- [Autenticação Consulta Dívida Ativa](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-divida-ativa/pt/quick_start/)

O exemplo enviado para Integra usava `/integra-contador/v1/`, que é base de serviços, não o endpoint de autenticação. O cliente existente já usa `/authenticate` com certificado e `role-type: TERCEIROS`.
