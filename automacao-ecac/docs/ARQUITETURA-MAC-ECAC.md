# Solicitação pelo WhatsApp, execução do e-CAC no Mac da FS

Decisão de arquitetura em 10/09/2026, após esclarecimento do cliente: priorizar o fluxo do Claude Code informado como funcional no Mac do escritório, usando o certificado e a sessão desse computador. Integra Contador e Consulta Dívida Ativa deixam de ser dependências para esta entrega. O protótipo de terminal foi instalado no Mac de desenvolvimento; a coleta real ainda não foi homologada, pois o portal também bloqueou a tentativa local. Consulte [instalação e resultado do teste](INSTALACAO-MAC.md).

## Fluxo

```mermaid
flowchart LR
  W[WhatsApp no celular] --> V[VPS Contabo: autenticação e fila]
  V -->|pedido obtido pelo conector| M[Mac da FS: usuário e ambiente existentes]
  M --> C[Claude Code e skill do cliente]
  C --> E[e-CAC: certificado e perfil procurador PJ]
  E --> P[Regularize e SISPAR: fontes completas]
  P --> R[Validar documentos e produzir parecer]
  R -->|envio do resultado| V
  V --> W
```

O celular inicia, acompanha e corrige pedidos. O Mac executa a navegação. A VPS recebe webhooks Z-API, mantém a fila e o histórico, recebe os resultados e entrega pelo WhatsApp.

O fluxo deixa de depender do navegador instalado na VPS. Não pressupõe VPN, proxy ou troca de IP como solução para bloqueios. Deve primeiro reproduzir uma consulta no ambiente que o cliente já utiliza. O funcionamento informado pelo usuário ainda precisa ser observado no Mac real; não foi homologado nesta sessão.

## Reaproveitamento confirmado por leitura dos arquivos

Na pasta `Diagnostico Fiscal Federal FS codigo fonte`:

- `src/sessao.mjs` abre/mantém o navegador autenticado; `src/lib/browser.mjs` conecta coletores à sessão local.
- `src/coletar.mjs` chama coletores de Situação Fiscal, processos, PGFN e SISPAR.
- `src/analisar.mjs` prepara dados e dossiê.
- `src/diagnosticar.mjs` já invoca o executável `claude` por `spawn`, com prompt pela entrada padrão.
- `src/tudo.mjs` encadeia coleta, análise e diagnóstico.

Isso comprova a existência dessas rotinas nos arquivos, não seu funcionamento atual no Mac. O usuário informou que abre Claude no terminal e pede a análise por CNPJ. A sessão interativa pode ter ferramentas, permissões, instruções e contexto adicionais que não estão na cópia fornecida. A instalação precisa conferir o diretório, as skills efetivamente carregadas, as conexões de navegador/MCP, a versão e a autenticação do Claude no Mac original.

## Integração completa proposta

1. Executar sob o mesmo usuário macOS que já utiliza Claude, com diretório e caminhos explícitos. Usar agente de login do usuário para preservar acesso à sessão gráfica; não iniciar como daemon root ou dentro de um contêiner novo.
2. O Mac inicia uma conexão autenticada de saída com a VPS. Usar HTTPS com certificado válido ou túnel autenticado enquanto não houver domínio/TLS. Não abrir Chrome/CDP, Redis ou terminal do Mac na internet.
3. Pedido estruturado: ID, CNPJ validado e autorizado, operação de análise e referências a correções. Não executar texto recebido no WhatsApp como comando de shell. Acionar um fluxo conhecido com argumentos separados e prompt controlado.
4. Testar o Claude em modo programático no mesmo ambiente. Autorizar somente as ferramentas necessárias ao fluxo. Uma aprovação pendente vira estado de intervenção, sem desativar globalmente permissões.
5. Uma coleta por vez no navegador; confirmar o CNPJ do perfil procurador antes de coletar e nos documentos recebidos. O parâmetro `--cnpj` e o nome da pasta não são prova de que o perfil mudou.
6. Cada pedido terá diretório próprio, horários e manifesto das fontes. Não usar automaticamente a pasta de coleta mais recente: `tudo.mjs` faz essa seleção e pode continuar após coleta incompleta; a integração precisa impedir entrega de material antigo como consulta nova.
7. Enviar apenas os arquivos vinculados ao pedido e necessários à entrega, com validação de tamanho, tipo, CNPJ e hash. Não enviar certificado, senha, cookies ou diretórios pessoais.
8. Registrar resultado antes de confirmar conclusão. Usar identificação de tentativa, reserva com prazo e retomada controlada para evitar consultas e entregas duplicadas quando a conexão cair.
9. Correção utiliza o ID da análise e sessão associada; não retomar indiscriminadamente a última conversa do Claude, que pode pertencer a outra empresa.

## Estados observáveis pelo WhatsApp

`recebido` → `aguardando_mac` → `iniciando` → `coletando` → `validando` → `gerando_parecer` → `pronto` → `enviado`.

Estados de exceção: `aguardando_login`, `aguardando_permissao`, `coleta_incompleta`, `falhou`, `aguardando_revisao`.

Mac desligado, sem rede ou suspenso: pedido permanece na fila. Sessão expirada, certificado ou desafio exigindo confirmação: notificar o operador e aguardar intervenção no Mac. Não prometer sessão permanente ou ausência de desafios. Acesso remoto pelo celular pode atender a essa intervenção, mas é uma capacidade adicional a configurar e validar.

## Implantação e critérios de aceite

1. No Mac real, observar um pedido pelo Claude como o cliente faz hoje. Registrar diretório, skill e ferramentas utilizadas; não copiar segredos.
2. Reproduzir a mesma coleta por execução controlada local, com o certificado existente. Conferir perfil procurador, fontes de RFB, PGFN, CAPAG e negociações, CNPJ e horário de coleta.
3. Conectar a um pedido de teste na VPS; retornar status e arquivos mantendo entrega externa em teste.
4. Conferir o parecer contra as fontes e validar a entrega ao número autorizado.
5. Testar Mac offline, sessão expirada, coleta parcial, repetição do webhook e correção referente ao pedido certo.
6. Somente após o teste completo, selecionar o conector Mac para os pedidos reais. Evitar consumidores Serpro/RPA concorrentes para a mesma fila.

## Situação atual da VPS

Na última verificação, o worker ainda estava selecionado como `serpro`, com consultas desativadas e WhatsApp dry-run. Este documento não altera a execução em produção. Coolify, Z-API, fila e armazenamento continuam aproveitáveis. A cópia do certificado instalada anteriormente na VPS existe; o novo fluxo não precisará dela. Sua eventual remoção deverá acontecer de forma controlada após a homologação local.
