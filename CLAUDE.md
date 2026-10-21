# FS Soluções Tributárias — instruções do projeto

Leia `AGENTS.md` e `docs/CONTEXTO-ATUAL.md` para a arquitetura e os limites operacionais atuais.

## Relatórios e pareceres FS

Ao receber pedido de análise fiscal, relatório de consulta, parecer de CNPJ ou correção de parecer FS, carregue `.claude/skills/parecer-fs/SKILL.md` e siga o fluxo de geração pelo template oficial do sistema. Pode ser invocada explicitamente como `/parecer-fs`.

O contrato de saída é `DiagnosticReport` com `opinion`; o comando `npm --prefix sistema-fs run parecer:gerar` usa o mesmo renderer e logo do sistema. Não substituir por HTML livre, Markdown convertido ou templates genéricos. Se o renderer falhar, não entregar uma versão improvisada.

Reenvio de análise busca o documento existente; não dispara consulta nova. Dados ausentes são pendências, não zeros. PDF de exemplo nunca é relatório real. Padrão desde 21/10/2026 (modelo VOX AMBIENTAL): cada análise gera o **Diagnóstico Fiscal Estratégico** (capa, painel executivo, 13 seções) e o **Resumo de 1 página**, visual grafite e dourado com a logo oficial, texto resumido e objetivo. Encontro de contas com crédito judicial nunca entra automaticamente; CAPAG e composição da PGFN vêm do Regularize anexado pelo analista (sem eles, "a apurar"). O número de páginas varia com os dados.

Estas regras valem para relatórios da FS; não alteram outros projetos nem autorizam envio de WhatsApp, coleta fiscal ou acesso a documentos além do pedido do usuário.
