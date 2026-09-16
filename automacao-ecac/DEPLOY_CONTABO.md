# Checklist de implantação na Contabo

Este documento registra a implantação da homologação e os passos que faltam para a integração externa. Não coloque segredos neste arquivo.

## Estado atual

- Ubuntu 24.04, Docker e Coolify preservados;
- aplicação instalada em `/opt/fs-automacao-ecac`;
- PostgreSQL e Redis em rede Docker, sem portas públicas;
- API vinculada a `127.0.0.1:3000`;
- migração aplicada e volumes persistentes criados;
- API e worker com reinício automático;
- WhatsApp em `dry-run`, com adaptadores Meta e Z-API disponíveis, e RPA em `mock`;
- chave OpenAI armazenada como segredo montado somente no worker;
- navegação Playwright até a tela de login do e-CAC validada na VPS;
- fluxo de fila, geração, armazenamento e envio simulado de PDF validado.

## Informações necessárias

- IP e usuário administrativo da VPS;
- domínio e acesso ao DNS;
- provedor de WhatsApp escolhido e suas credenciais (Meta ou Z-API);
- lista inicial de telefones autorizados;
- certificado A1 PFX/P12 de teste e senha entregue por canal seguro;
- primeiro documento do e-CAC a automatizar;
- CNPJ de teste com procuração ou autorização válida;
- endpoint e credenciais do armazenamento privado;
- prazo de retenção aprovado.

## Preparação do servidor

1. Concluído: validar Ubuntu, Docker, Compose e Coolify.
2. Concluído: configurar acesso SSH por chave sem remover o acesso existente.
3. Concluído: criar volumes separados para banco, Redis e documentos.
4. Concluído: criar `.env` na VPS com permissão `600` e segredos aleatórios.
5. Concluído: subir os serviços, executar a migração e validar saúde e fila.
6. Pendente: configurar DNS e TLS para o webhook.
7. Pendente: inserir as credenciais do provedor de WhatsApp e conectar o número.
8. Pendente: cadastrar os telefones autorizados.
9. Pendente: registrar o callback HTTPS da Meta ou os callbacks de recebimento e desconexão da Z-API.
10. Pendente: entregar o certificado A1 por canal seguro e homologar o primeiro fluxo real.

## Prova técnica do certificado

1. Usar exclusivamente um certificado de teste autorizado.
2. Configurar as origens exatas que solicitam o certificado cliente.
3. Abrir a autenticação com `RPA_MODE=ecac` sem implementar ações fiscais.
4. Confirmar que o perfil e o CNPJ representado aparecem corretamente.
5. Registrar as telas e URLs necessárias sem salvar senha, chave privada ou conteúdo fiscal nos logs.
6. Voltar para `RPA_MODE=mock` até o fluxo do primeiro documento ser revisado.

## Liberação do primeiro fluxo

O fluxo real só será habilitado depois de testar:

- contato autorizado e não autorizado;
- confirmação e cancelamento pelo WhatsApp;
- CNPJ sem procuração;
- certificado inválido e expirado;
- portal indisponível ou alterado;
- download correto e arquivo inexistente;
- reenvio do mesmo webhook sem duplicação;
- criptografia, retenção e exclusão do documento;
- entrega e falha de entrega no WhatsApp;
- encaminhamento para intervenção humana.
