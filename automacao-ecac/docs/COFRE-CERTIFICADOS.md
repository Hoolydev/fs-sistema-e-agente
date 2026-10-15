# Cofre de certificados e análise sem procuração (15/10/2026)

Empresas que não deram procuração à FS podem ser analisadas com o próprio e-CNPJ A1.

## Fluxo
1. Diagnóstico fiscal → "Analisar uma empresa" → "Tenho o certificado digital da empresa (sem procuração)".
   Arquivo .pfx/.p12 e senha (todo A1 tem senha). Também dá para guardar pela ficha da empresa (Administrativo).
2. O sistema confere a senha, o CNPJ do certificado (o da empresa ou da mesma raiz) e a validade, e cifra arquivo + senha
   (AES-256-GCM; chave em RSA-OAEP-SHA256 com a chave pública do agente, `FS_CERT_VAULT_PUBLIC_KEY` na Vercel).
   Banco e Vercel guardam só o envelope. Novo envio troca o anterior; revogar (administrador) apaga o envelope.
3. A análise emite o preliminar (PGFN) e pede ao agente o SITFIS com `autor: "contribuinte"`.
4. O worker busca o envelope (`/api/agent/certificados`), abre com `secrets/cofre/privada.pem` (montada só no worker por
   `docker-compose.cofre.yml`), assina com o certificado da empresa o Termo de Autorização do Integra Contador
   (AUTENTICAPROCURADOR / ENVIOXMLASSINADO81) autorizando a FS, guarda o token no Redis até vencer e consulta o SITFIS
   com a empresa como autora do pedido. O certificado fica só em memória.
5. Envio, uso pelo agente (com finalidade) e revogação ficam no histórico do certificado.

## Subida do agente na VPS
`docker compose -f docker-compose.prod.yml -f docker-compose.cert.yml -f docker-compose.webhook.yml -f docker-compose.sitfis.yml -f docker-compose.cofre.yml up -d --build api worker`

## Confirmado em produção (15/10/2026)
Primeira análise real com o certificado da empresa (STARTEC, CNPJ 10.173.280/0001-93): o Serpro aceitou o termo assinado
pela própria empresa como autora do pedido e devolveu a Situação Fiscal. Sem procuração à FS.
Se o Serpro recusar em algum caso, a análise volta com "O Serpro recusou o termo de autorização..." e nada errado entra no parecer.
