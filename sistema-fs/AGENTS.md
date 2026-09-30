# Desenvolvimento do sistema FS

Este projeto é um sistema em desenvolvimento local. Por orientação explícita do usuário, não utilizar as skills Sites / Sites Hosting e não publicar por esse serviço. Abrir e testar em localhost. Só implantar em outro ambiente quando o usuário solicitar explicitamente.

Executar `npm run dev -- --port 3100` para abrir a interface local. Preservar as telas existentes. As telas não exibem dados demonstrativos: módulo sem registro mostra estado vazio. Perfis e permissões ficam em `lib/auth/roles.ts` e são conferidos no servidor; ver `docs/CONTROLLER-E-PERFIS.md`.

A publicação na Vercel foi explicitamente solicitada pelo usuário para compartilhar a demonstração com o cliente. Usar Next.js nativo e Vercel; não voltar a utilizar Sites.
