# FS Soluções Tributárias — instruções do projeto

Leia `AGENTS.md` e `docs/CONTEXTO-ATUAL.md` para a arquitetura e os limites operacionais atuais.

## Relatórios e pareceres FS

Ao receber pedido de análise fiscal, relatório de consulta, parecer de CNPJ ou correção de parecer FS, carregue `.claude/skills/parecer-fs/SKILL.md` e siga o fluxo de geração pelo template oficial do sistema. Pode ser invocada explicitamente como `/parecer-fs`.

O contrato de saída é `DiagnosticReport` com `opinion`; o comando `npm --prefix sistema-fs run parecer:gerar` usa o mesmo renderer e logo do sistema. Não substituir por HTML livre, Markdown convertido ou templates genéricos. Se o renderer falhar, não entregar uma versão improvisada.

Reenvio de análise busca o documento existente; não dispara consulta nova. Dados ausentes são pendências, não zeros. PDF de exemplo nunca é relatório real. Preservar logo, navy, indicadores, quatro partes e 17 seções; o número de páginas varia com os dados.

Estas regras valem para relatórios da FS; não alteram outros projetos nem autorizam envio de WhatsApp, coleta fiscal ou acesso a documentos além do pedido do usuário.
