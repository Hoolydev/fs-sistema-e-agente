# Homologação real Serpro — 16/09/2026

## Resultado verificado

A FS foi confirmada como contratante/autora, com seu e-CNPJ. O usuário autorizou ativar o worker para homologação e executar consulta real. Foi utilizado o CNPJ de cliente que ele já havia autorizado na conversa; identificadores e evidências fiscais ficam somente no armazenamento privado.

- Integra Contador/SITFIS: autenticação HTTP 200, uma chamada Apoiar HTTP 200 e uma Emitir HTTP 200. PDF oficial de 4 páginas, assinatura de formato verificada e CNPJ conferido pelo parser.
- Consulta Dívida Ativa direto na faixa: autenticação HTTP 200 e uma consulta de devedor HTTP 200. Retorno com 15 inscrições distintas; CNPJ de todas as linhas conferido. Não foram feitas chamadas adicionais por inscrição.
- PDF RFB arquivado pelo endpoint privado do sistema. Busca no acervo e download confirmados; hash SHA-256 do arquivo recuperado coincide com a fonte.
- As fontes RFB/PGFN e os resultados/protocolos foram preservados no volume privado do worker, em `/app/data/homologacao/<run-id>/`. Cópia de trabalho em `sistema-fs/.local/serpro-homologacao/`, fora do Git.
- Nenhuma mensagem WhatsApp enviada e nenhuma análise LLM executada. Não foi produzido parecer consolidado nem afirmado enquadramento tributário.

As requisições de consulta foram reais, sujeitas às condições de cobrança dos contratos. Não repetir a coleta como teste de tela. Reutilizar as evidências existentes durante a integração do PWA.

## Estado operacional

O worker foi recriado somente com `docker-compose.prod.yml` + `docker-compose.serpro.yml`, com `SERPRO_ENABLED=true`, contratante/autor FS e mounts corretos dos segredos. Os desktops/browser, API, Coolify, bancos e dados anteriores foram preservados.

**Fila BullMQ pausada para homologação.** O processo do worker permanece ativo e configurado para Serpro, mas a entrada automática da fila não deve ser liberada enquanto o parecer canônico e a consolidação RFB/PGFN não estiverem conectados. O worker central ainda usa um renderer próprio para análise parcial; não entregar isso como parecer completo FS. `WHATSAPP_DRY_RUN=true` permanece ativo.

A pausa não apaga jobs nem a fila. Inspecionar jobs pendentes antes de retomar; `queue.resume()` só deve ser usado após a integração e a validação do fluxo autorizado.

## O que está disponível no PWA

O PDF oficial da Receita aparece em Diagnóstico → Acervo compartilhado e em Documentos, buscando o CNPJ autorizado. Ele é documento de origem, não o parecer FS. Continua exigindo login e autorização; não há link público para o arquivo.

**O botão de nova análise ainda não foi conectado.** `POST /api/diagnosticos` continua retornando `PROVIDER_NOT_READY`; sua mensagem histórica cita contratação mesmo após esta homologação. Na implementação seguinte, corrigir a mensagem/estados e ligar a operação real, sem substituir dados da amostra por dados de cliente sem separação explícita.

## Próxima implementação do app

1. Serviço único de criação/consulta de jobs, autenticado para sistema e agente, com autorização por empresa, protocolo/idempotência e proteção contra repetição de chamadas cobradas.
2. Cliente permanente Consulta Dívida Ativa (DF) + adaptador do retorno real; preservar valor consolidado e marcar composição ausente. O script de homologação não substitui um cliente de produção.
3. Mapeamento RFB/PGFN para DiagnosticReport, conciliação de números e pendências. Não usar o consolidado como principal, nem presumir desconto/CAPAG a partir dele.
4. Emissão pelo mesmo gerador FS do sistema; manter fontes, versão, data-base e recibo, revisão técnica e acervo compartilhado.
5. Estados de carregamento/processamento/erro na tela, histórico e abertura do diagnóstico salvo. Preservar login, mobile/PWA e o reenvio sem reconsulta.
6. Homologar a cadeia completa usando as fontes já obtidas antes de liberar fila e envio real.

## Ferramentas administrativas adicionadas

- `automacao-ecac/scripts/homologate-serpro-sitfis.mjs`: consulta SITFIS com run-id exclusivo, preservação de resposta/protocolo e PDF, conferência do CNPJ; não envia WhatsApp nem chama LLM.
- `automacao-ecac/scripts/homologate-serpro-divida.mjs`: uma consulta de devedor no produto DF, resposta privada, validação de CNPJ/duplicidade. Sem repetição automática.
- Exigem build do agente (`dist/`) e ambiente do contêiner configurado. O script DF exige o diretório privado montado em `/run/serpro-divida` como leitura.
- Os scripts foram executados administrativamente em processo separado. O worker automático não consome esses scripts por conta própria.
- O Dockerfile passou a incluir os scripts `.mjs` em builds futuros. Na homologação corrente, os scripts foram copiados/montados no contêiner existente; a imagem não foi reconstruída só para incluí-los.

Não imprimir as fontes JSON/PDF, tokens, senhas ou `.env` em logs. A guarda por run-id é local ao volume: preservar esse volume e verificar evidências antes de decidir por uma nova consulta.
