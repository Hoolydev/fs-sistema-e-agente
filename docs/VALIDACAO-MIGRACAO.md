# Validação do snapshot para GitHub — 16/09/2026

- Sistema: TypeScript e 16 testes (diagnóstico 10, Comercial 4, acervo 2) passaram.
- Agente: TypeScript, 60 testes em 13 arquivos e build passaram.
- Conector: sintaxe de 30 scripts `.mjs` validada; dependências do pipeline instaladas a partir do lockfile.
- Snapshot limpo exportado somente do índice Git: `npm ci` e `npm run build` do sistema passaram, sem `.env` privados nem diretórios de estado.
- O build local usou Node 25.9.0 e emitiu aviso por engine 22.x; produção está configurada para Node 22. Também houve aviso de tracing amplo do Turbopack no store existente, sem impedir compilação.
- Gitleaks executado sobre o conteúdo staged, com saída redigida: nenhum segredo detectado. Isso não substitui revisão antes de adicionar futuros arquivos.
- Repositórios Git internos da instalação antiga não foram exportados como submódulos: o clone contém fontes normais de todos os componentes.
- Foram preservados os arquivos privados e a instalação ativa. Não houve consulta fiscal, envio WhatsApp ou alteração de banco/serviços de produção durante a preparação do repositório.

As instruções para autenticação e coleta em outro Mac ainda exigem os segredos privados e homologação; o sucesso de build não prova acesso ao e-CAC.
