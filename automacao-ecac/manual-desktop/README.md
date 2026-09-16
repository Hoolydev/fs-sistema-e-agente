# Área de trabalho manual do e-CAC

Chrome estável do Google executado por um usuário Linux dedicado, com Fluxbox e
noVNC. O operador controla mouse e teclado. Este serviço não conecta Playwright,
não disponibiliza depuração remota e não compartilha cookies com o worker.
Não há garantia de aceitação pelo e-CAC; o servidor ainda usa o mesmo IP da VPS.

O certificado é importado para o banco NSS do usuário, conforme a documentação:
https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/linux/cert_management.md
O PFX e o arquivo de senha devem ser montados somente para leitura, com permissão
de leitura para GID 1001. O perfil, banco de certificados e downloads ficam no
volume `manual_home`. Esse volume contém material privado e deve ser protegido.

O Chrome usa `--no-sandbox` neste contêiner Docker executado sem root; por isso,
o serviço deve ser dedicado ao acesso fiscal autorizado, sem outros segredos
ou acesso ao socket Docker. Não se publica VNC nem depuração na Internet.

Na VPS, a partir da raiz do projeto:

```sh
docker compose -f docker-compose.manual.yml up -d --build
```

No computador do operador, manter o túnel aberto:

```sh
ssh -N -L 127.0.0.1:6081:127.0.0.1:6081 root@185.202.239.146
```

Abrir `http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale`.
A seta lateral do noVNC abre os controles de tela cheia e área de transferência.
Clique dentro da tela remota antes de digitar. Os arquivos baixados ficam em
`/home/operator/Downloads` no contêiner.

O agente não retoma automaticamente essa sessão manual. A coleta manual e a
análise dos PDFs pelo agente são etapas separadas; a entrega completa ainda
precisa ser validada.
