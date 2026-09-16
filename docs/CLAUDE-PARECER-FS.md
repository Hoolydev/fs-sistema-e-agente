# Instalar o padrão FS no Claude do Fernando

A skill do projeto fica em `.claude/skills/parecer-fs/SKILL.md`; a raiz possui `CLAUDE.md`. Este é o formato de skills de projeto documentado pelo [Claude Code](https://code.claude.com/docs/en/skills). Abrir o Claude na raiz do clone permite usar `/parecer-fs`. Uma instalação pessoal em `~/.claude/skills/` tem escopo mais amplo; não é necessária quando a operação acontece neste projeto.

## Texto para colar no Claude

```text
Precisamos padronizar os relatórios fiscais da FS. O template aprovado está no repositório https://github.com/Hoolydev/fs-sistema-e-agente.

1. Localize o clone e preserve alterações locais; atualize por fast-forward quando possível. Se não houver clone, baixe o repositório sem sobrescrever pastas existentes.
2. Leia CLAUDE.md, .claude/skills/parecer-fs/SKILL.md e seu arquivo references/dados-e-validacao.md. Ative a skill parecer-fs para esta operação. Se meu projeto de atendimento estiver em outra pasta, acrescente ao CLAUDE.md dessa pasta uma referência ao caminho absoluto deste clone e a esta skill, preservando as instruções existentes. Não copie a skill sozinha sem o código do gerador.
3. A partir de agora, para nova análise ou correção de relatório FS, gere DiagnosticReport com opinion a partir das fontes reais e execute npm --prefix sistema-fs run parecer:gerar com --input e --output em caminhos absolutos. Use o mesmo renderer do sistema. Não gere HTML livre nem troque por outro PDF genérico. Não altere logo, navy, indicadores, quatro partes ou 17 seções para preencher conteúdo.
4. Se os dados da consulta vierem de dados.json do pipeline Mac, faça o mapeamento explícito para o schema do sistema e confira unidades, CNPJ, inscrições, datas e fontes. Campos ausentes ficam pendentes, não zero. Desconto e prazo dependem de evidência, não do exemplo.
5. Inspecione o comando que meu fluxo executa hoje. Se ainda chamar o antigo parecer.mjs/gerador HTML, conecte SOMENTE a etapa de emissão ao novo gerador validado, preservando coleta, certificados, filas e autorizações. Não diga que o fluxo automático está corrigido só porque leu a skill. Teste essa conexão com fontes sintéticas antes de ativar para clientes.
6. Execute primeiro o teste --demo descrito na skill, abra o PDF e confira marca, indicadores, todas as seções e o recibo .fs.json. Se houver falha, corrija; não entregue layout alternativo. Não consultar e-CAC nem enviar WhatsApp nesse teste.
7. Para “me manda a análise do cliente X”, busque o documento existente no acervo autorizado; não refaça análise. Para nova emissão, entregue/arquive somente o PDF produzido pelo gerador FS, após conferência das fontes e apresentação. Não substitua documentos reais por demonstração.
8. Ao concluir, informe em qual raiz a regra foi instalada, qual skill/comando está ativo, qual ponto do fluxo foi ligado ao gerador e qual arquivo de teste foi conferido. Informe claramente o que não conseguiu integrar.
```

## Instalação manual no clone

```sh
git pull --ff-only
npm --prefix sistema-fs ci
claude
```

Então invoque `/parecer-fs` e peça o teste demonstrativo. Não executar `git reset --hard` se o pull encontrar alterações locais. Se o Claude já estava em sessão antes da instalação, abra nova sessão na raiz para carregar a regra.

## O que esta entrega implementa

- Regra de projeto em `CLAUDE.md` e skill descoberta em `.claude/skills/parecer-fs/`.
- Gerador CLI que usa diretamente o renderer, cálculos e logo existentes em `sistema-fs`.
- Validação de schema/fontes, recusa de demonstração no fluxo real, proteção contra sobrescrita e recibo de hashes.

Isso evita delegar o layout ao modelo **quando a geração passa pelo comando**. A skill é orientação ao Claude, não um bloqueio técnico de toda ferramenta do computador. Ela não reconfigura automaticamente o script legado que recebe eventos do WhatsApp. O operador deve conectar esse ponto à geração canônica conforme o item 5 e verificar o fluxo efetivo.

Não houve instalação no computador do Fernando, alteração da coleta fiscal, chamada de LLM, envio WhatsApp nem deploy na VPS nesta entrega.
