# FS Conector Mac — protótipo local

Instalado neste Mac em 10/09/2026. É um programa próprio em Node.js, iniciado por um LaunchAgent do usuário macOS. Recebe comandos estruturados, abre Chrome local com perfil separado, troca o perfil para procurador do CNPJ solicitado e chama as rotinas de coleta e diagnóstico fornecidas pela FS.

## Uso no Terminal

```sh
~/.local/bin/fs-conector status
~/.local/bin/fs-conector abrir
~/.local/bin/fs-conector login
~/.local/bin/fs-conector coletar 51646813000194
~/.local/bin/fs-conector analisar 51646813000194
~/.local/bin/fs-conector pedido ID_DO_PEDIDO
~/.local/bin/fs-conector retomar ID_DO_PEDIDO
```

`login` inicia a tentativa e retorna imediatamente. Acompanhe com `status`. Conclua eventuais confirmações na janela local do Chrome. `retomar` atende pedidos que ficaram aguardando login; falhas de coleta não são repetidas automaticamente.

`coletar` também extrai o dossiê, mas não chama o Claude. `analisar` executa coleta, extração e parecer. A etapa de parecer usa `claude` do código fornecido e exige autenticação (`claude auth login`). A chave OpenAI fornecida anteriormente não autentica o Claude Code.

Os comandos são explícitos; esta versão ainda não recebe linguagem natural nem mensagens do WhatsApp. Os PDFs permanecem no Mac, nos diretórios dos respectivos pedidos. A conexão Z-API será uma etapa separada, após a validação da coleta local.

## Arquivos e execução

- Programa e dados: `~/Documents/ChatGPT/FS Soluções Tributarias/conector-local`.
- Certificado PFX e senha: subpasta `secrets`, com acesso restrito ao usuário. O certificado também foi importado para o chaveiro de login, com autorização para o Chrome. A importação não comprova aceitação pelo Gov.br; isso depende de concluir o login real.
- Pedidos: `jobs/ID.json`; fontes, resultados e logs de coleta: `jobs/ID/`.
- Serviço: `~/Library/LaunchAgents/br.com.fs.conector.plist`.
- API local: `127.0.0.1:18765`, protegida por token; Chrome/CDP: `127.0.0.1:19222`. Não publicar essas portas na internet.
- O Mac precisa estar acordado, conectado e com o usuário na sessão gráfica. Este protótipo não modifica o repouso do Mac.

Para parar:

```sh
launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/br.com.fs.conector.plist"
```

Para iniciar novamente:

```sh
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/br.com.fs.conector.plist"
```

Para atualizar a instalação, dentro do projeto:

```sh
pnpm build
python3 scripts/mac/install.py --pipeline '/Users/holydev/Documents/ChatGPT/FS Soluções Tributarias/materiais-cliente/Diagnostico Fiscal Federal FS codigo fonte'
```

O instalador atual serve para desenvolvimento: usa dependências de `node_modules` deste repositório por links locais. Ainda não é um pacote independente para distribuir ao cliente. Não mover ou apagar o projeto enquanto este protótipo estiver em uso. A cópia original do fluxo da FS é preservada; somente a cópia instalada recebe a adaptação do navegador e do arquivo de configuração.

## Resultado da primeira validação

Em 10/09/2026, serviço, abertura local do Chrome e importação do certificado foram executados. A API respondeu 401 sem token e 400 para CNPJ inválido. Os testes automatizados passaram, incluindo detecção de desafio visível versus componente de CAPTCHA oculto.

O acesso real pelo Mac exibiu um desafio e depois a mensagem: “seu acesso foi bloqueado por possuir atributos que o caracteriza como um acesso automatizado”. Não houve autenticação concluída, troca de perfil, coleta ou parecer real. A captura está em `logs/session.png`. O Claude estava sem autenticação no momento da verificação.

O próximo teste deve comparar o fluxo com o ambiente original do cliente que ele informa já funcionar: skill, ferramentas de navegador e sessão utilizadas. Esta instalação reaproveita os arquivos fornecidos, mas não comprova que ferramentas externas e configurações do Claude do cliente também foram reproduzidas. Bloqueios do portal encerram a tentativa, sem nova tentativa automática.

## Organização atualizada em 11/09/2026

Código, instalação local e materiais recebidos estão reunidos na pasta principal do projeto. O LaunchAgent e o atalho `~/.local/bin/fs-conector` permanecem nos locais exigidos pelo macOS e apontam para esta pasta. O certificado importado no Chaveiro continua registrado pelo sistema. Os arquivos de certificado, senha, navegador, materiais e pedidos são excluídos do Git. O serviço grava seus logs diretamente na pasta `conector-local/logs`.

## Verificação do certificado em 13/09/2026

O PFX da FS foi reimportado no chaveiro de login com autorização para o Google Chrome. A identidade (certificado e chave privada) foi encontrada pela política X.509 Basic; a consulta SSL Client ainda não a considerou válida. O certificado tem validade de 20/08/2026 a 20/08/2027.

A raiz ICP-Brasil v5 contida no PFX foi comparada byte a byte com o arquivo oficial `https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt`; os arquivos coincidem. SHA-256 da raiz: `caa53fc6091c6951887c976e378f6ef89aa6377c55d97b6475422b71ed7e9b17`. A verificação SSL Client passou ao fornecer explicitamente essa raiz. A configuração de confiança do chaveiro está em validação e pode exigir confirmação do usuário na janela nativa do macOS.

Os arquivos em `conector-local/certificados-publicos/` contêm somente certificados públicos da cadeia; nenhuma chave privada foi extraída para esses arquivos. Esta verificação não equivale a autenticação concluída no e-CAC.

### Resultado da autorização e nova tentativa

A configuração de confiança da raiz ICP-Brasil v5 no chaveiro de login foi concluída. `security verify-cert -c conector-local/certificados-publicos/cadeia-0.pem -p ssl -C -L` passou usando o chaveiro, sem raiz informada por parâmetro. `security find-identity -p basic` reconhece a identidade da FS como válida. A listagem `security find-identity -p ssl-client` continua vazia; portanto, a seleção efetiva pelo navegador ainda precisa ser confirmada.

A aba do Chrome que mostrava “Certificado digital não encontrado” foi retornada ao login Gov.br e atualizada. Na nova tentativa de “Seu certificado digital”, o portal abriu um desafio hCaptcha. O teste foi pausado para conclusão manual pelo usuário. Não há autenticação real confirmada.
