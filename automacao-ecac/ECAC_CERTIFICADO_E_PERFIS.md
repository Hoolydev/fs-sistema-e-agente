# Certificado digital e perfis do e-CAC

## Modelo adotado

O worker usa um certificado A1 em arquivo PFX/P12. O arquivo não é instalado no
Ubuntu, não entra na imagem Docker e não fica disponível para a API. O Compose
monta o diretório `secrets` somente no worker, em modo de leitura.

O certificado pode ser:

- e-CNPJ da FS, quando os clientes outorgarem procuração ao CNPJ da FS;
- e-CPF de uma pessoa autorizada, quando as procurações forem outorgadas a esse CPF;
- e-CNPJ/e-CPF do próprio contribuinte, para operar apenas os CNPJs aos quais ele
  já tenha vínculo de representante.

Certificado A3 em token ou cartão não é adequado para o worker remoto, pois exige
hardware, driver e frequentemente confirmação presencial. Para o VPS, use A1.

## Preparação de cada cliente

Antes de automatizar, confirme que o titular do certificado possui procuração
digital válida para o CNPJ consultado e para os serviços estritamente necessários.
Registre internamente o outorgante, o outorgado, os serviços autorizados e a data
de validade. A automação deve recusar qualquer CNPJ sem autorização cadastrada.

## Instalação na VPS

O diretório final é `/opt/fs-automacao-ecac/secrets`. Ele deve pertencer a
`root:1001`, com modo `0750`; os dois arquivos devem usar modo `0640`:

```text
/opt/fs-automacao-ecac/secrets/certificate.pfx
/opt/fs-automacao-ecac/secrets/passphrase
```

O grupo numérico `1001` corresponde ao usuário `pwuser` da imagem Playwright.
O arquivo `passphrase` contém somente a senha do PFX, sem aspas e sem quebra de
linha. Não envie esses arquivos ao Git e não os inclua em backup sem criptografia.

Valide o certificado sem exibir a chave privada nem a senha:

```bash
cd /opt/fs-automacao-ecac
docker compose -f docker-compose.prod.yml -f docker-compose.cert.yml run --rm --no-deps \
  worker node dist/scripts/validate-certificate.js \
  /run/secrets/ecac/certificate.pfx /run/secrets/ecac/passphrase
```

Confira titular, emissor, número de série e datas. Se estiver correto, ative o
worker real:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.cert.yml up -d --build worker
docker compose -f docker-compose.prod.yml -f docker-compose.cert.yml logs -f worker
```

Para suspender o acesso real imediatamente:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate worker
```

Esse último comando volta ao `RPA_MODE=mock` definido no ambiente base.

## Troca de perfil

Para o diagnóstico solicitado pela FS, a sequência obrigatória é:

1. abrir o Portal e-CAC e escolher `Acesso Gov BR`;
2. no Gov.br, escolher `Seu certificado digital`;
3. depois do login, abrir `Alterar perfil de acesso`;
4. localizar `Procurador de pessoa jurídica - CNPJ`;
5. informar o CNPJ solicitado, sem pontuação, e clicar no botão `Alterar` da mesma linha;
6. confirmar na página que o papel ativo é procurador e que o CNPJ exibido é exatamente o solicitado.

O worker nunca usa o campo `Procurador de pessoa física - CPF` para esse fluxo.
Também não usa as opções de matriz, sucessora ou ente federativo. Se a opção de
procurador de pessoa jurídica não estiver disponível, a execução é interrompida
como falta de autorização.

O portal pode mostrar o comando como `Alterar perfil de acesso` ou dentro do menu
do avatar. O agente deve localizar o controle pelo texto e pela função acessível,
selecionar exclusivamente o perfil de procurador de pessoa jurídica, informar o
CNPJ sem pontuação e acionar `Alterar` na mesma linha.

Antes de buscar qualquer documento, o agente confirma na página:

1. CNPJ ativo exibido é exatamente o solicitado;
2. papel exibido corresponde a procurador de pessoa jurídica;
3. serviço solicitado está coberto pela procuração;
4. sessão não apresenta CAPTCHA, pedido de confirmação ou aviso de autorização.

Qualquer divergência encerra o job como `human_intervention`. O agente não tenta
outro perfil e não continua com um CNPJ diferente. CAPTCHA e confirmações do
Gov.br devem ser tratados por uma pessoa; não serão contornados pelo RPA.

## Homologação

Primeiro execute somente a autenticação e a seleção de perfil. Use um CNPJ de
teste com procuração válida e confira visualmente o contexto exibido. Depois
implemente e homologue um documento por vez, começando por uma operação apenas de
consulta e download. Cada execução deve terminar fechando o contexto do navegador,
apagando o material temporário e registrando resultado e motivo de falha sem dados
fiscais sensíveis nos logs.
