# Verificação do fluxo de nova análise — 17/09/2026

## Conclusão

**Ainda não liberado para novas análises pelo botão do sistema.** O acervo real e o parecer existente foram verificados. A consulta Serpro executada administrativamente e o arquivamento posterior não equivalem à integração automática do formulário.

Esta verificação foi feita em leitura, com consultas ao GitHub, Vercel, API privada do acervo e servidor Contabo. Não houve consulta fiscal nova, cobrança de consulta, envio de WhatsApp, retomada da fila, alteração de configuração ou deploy.

## Evidências atuais

| Item | Resultado observado |
| --- | --- |
| Vercel | Projeto existente `fs-solucoes-sistema`, deploy de produção READY, criado em 16/09/2026 às 20h16 de Brasília; domínio `app.fssolucoestributarias.com.br` vinculado. Publicação por CLI com alterações não commitadas. |
| Código GitHub e local | `POST /api/diagnosticos` valida sessão/CNPJ e retorna incondicionalmente `503 PROVIDER_NOT_READY`; não chama o provedor. |
| Produção | Consulta aos logs das últimas 24 horas encontrou duas respostas 503 para `/api/diagnosticos`. Não foi disparado outro POST para teste. |
| Acervo real | Busca autenticada do CNPJ mostrado pelo usuário retornou um parecer FS e um documento de apoio. Ambos têm o mesmo CNPJ; o parecer possui vínculo para diagnóstico estruturado. |
| Download | Ambos os PDFs foram recuperados pela API privada com HTTP 200 e assinatura PDF válida. A rota de documento do navegador recusou acesso sem autenticação com HTTP 401. |
| Parecer existente | PDF de 16 páginas, quatro partes e seções 1 a 17, identidade navy/dourado, fontes RFB/PGFN e quadros complementares. CNPJ confere; sem marcação de demonstração. Estrutura conferida por extração e visão geral renderizada das 16 páginas. |
| Rastreabilidade | Hash do PDF de apoio coincide com o citado no parecer. Os dois hashes de evidências citados no parecer foram encontrados entre os arquivos preservados em `/app/data/homologacao` na VPS. |
| Worker | Ativo, `FISCAL_DATA_PROVIDER=serpro`, `SERPRO_ENABLED=true`. Validação local de configuração Serpro passou, sem autenticação ou consulta externa nova. |
| Fila BullMQ | Pausada; zero jobs esperando, ativos, atrasados ou falhos; dois concluídos. O conteúdo desses jobs não foi usado para afirmar consulta real anterior. |
| Código efetivamente executado | `/app/dist/src/serpro/automation.js` ainda produz análise parcial RFB. Cliente de documentos usa `/api/agent/documents`, sem integração com `/api/agent/reports`. |
| API do servidor | Rotas registradas de health/readiness e webhooks WhatsApp/Z-API; sem rota de criação/acompanhamento de diagnóstico para o sistema. `SERPRO_ENABLED=false` nessa API, distinto do worker. |
| WhatsApp | API/worker centrais em dry-run. Ponte Mac com dry-run desativado; não foi testado envio nem confirmado qual callback está ativo. |
| Coolify | Está ativo no mesmo servidor. Contêineres FS usam Compose em `/opt/fs-automacao-ecac`, sem labels Coolify; consulta aos cadastros de applications/services não encontrou nomes FS/eCAC/Serpro. Isso não exclui cadastro com outro nome. |

## O que falta para liberar

1. Implementar o caminho autenticado de criação e acompanhamento de jobs do aplicativo, com protocolo, autorização e proteção contra repetição de consultas cobradas.
2. Integrar a coleta real RFB e PGFN ao processamento permanente. O worker observado ainda não executa a consolidação completa do parecer.
3. Preservar as evidências, validar o CNPJ e conciliar os números antes da emissão; fonte ausente deve continuar explicitamente ausente.
4. Emitir o `DiagnosticReport` real pela API canônica `/api/agent/reports`, usando o mesmo template do sistema, com PDF e dados estruturados arquivados e recuperáveis por CNPJ/versão.
5. Tratar falha de arquivamento sem repetir a consulta fiscal. Distinguir reenvio de documento existente de nova consulta.
6. Verificar esse caminho com evidências já coletadas e depois homologar a nova consulta autorizada; publicar e liberar apenas o processamento apropriado ao aplicativo, preservando o fluxo separado de WhatsApp.

Não basta remover o retorno 503, trocar o texto de homologação ou retomar a fila atual.

## Limites da verificação

- A validação do parecer existente não é revisão jurídico-tributária e não garante suporte a todos os layouts ou CNPJs futuros.
- Não foi comparado todo o código-fonte privado do deploy Vercel; foram comparados o endpoint no GitHub/local, a telemetria de produção e os resultados do acervo.
- A integração Neon não autorizou a consulta SQL; a indexação foi confirmada pela API privada em produção, não por inspeção direta das tabelas.
- A integridade das fontes foi comprovada por hash; não foi feita nova consulta Serpro para atualizar os valores.
- Segredos, senhas, certificados, telefone do solicitante e valores fiscais não fazem parte deste documento.
