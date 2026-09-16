#!/usr/bin/env python3
"""Install the terminal prototype under the current macOS user's account.
Requires a built project and existing certificate.pfx/passphrase in the private secrets directory.
"""
import argparse, json, os, pathlib, plistlib, shutil, subprocess, time, urllib.request
p=argparse.ArgumentParser()
p.add_argument('--pipeline',required=True)
p.add_argument('--home',help='Diretório dos dados e da instalação local')
a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2]
base=pathlib.Path(a.home).expanduser().resolve() if a.home else repo.parent/'conector-local'
for name in ['', 'secrets','jobs','logs','browser','app','pipeline']:
 d=base/name;d.mkdir(parents=True,exist_ok=True);d.chmod(0o700)
for name in ['certificate.pfx','passphrase']:
 if not (base/'secrets'/name).is_file(): raise SystemExit('Instale primeiro o certificado e a senha no diretório privado do conector.')
node=shutil.which('node')
if not node: raise SystemExit('Node.js não encontrado')
for name in ['src','scripts/mac']:
 shutil.copytree(repo/'dist'/name,base/'app/dist'/name,dirs_exist_ok=True)
(base/'app/package.json').write_text('{"type":"module"}\n')
modules=base/'app/node_modules'
if not modules.exists(): modules.symlink_to(repo/'node_modules',target_is_directory=True)
source=pathlib.Path(a.pipeline).resolve()
for name in ['src','skills','assets']:
 if (source/name).exists(): shutil.copytree(source/name,base/'pipeline'/name,dirs_exist_ok=True)
(base/'pipeline/package.json').write_text('{"type":"module"}\n')
modules=base/'pipeline/node_modules'
if not modules.exists(): modules.symlink_to(repo/'node_modules',target_is_directory=True)
browser=base/'pipeline/src/lib/browser.mjs'
s=browser.read_text()
s=s.replace("path.join(os.homedir(), '.credentials/clients/fernando-silva.env')", "process.env.FS_CONNECTOR_VAULT || path.join(os.homedir(), '.credentials/clients/fernando-silva.env')")
s=s.replace('export const CDP_URL = `http://127.0.0.1:${CDP_PORT}`', 'export const CDP_URL = process.env.FS_ECAC_CDP_URL || `http://127.0.0.1:${CDP_PORT}`')
s=s.replace("      '--disable-blink-features=AutomationControlled',\n",'')
browser.write_text(s)
vault=base/'secrets/pipeline.env'
vault.write_text('FS_CERT_CNPJ=47733961000179\nFS_CERT_RAZAO=FS SOLUCOES TRIBUTARIAS LTDA\nFS_ECAC_PROFILE='+str(base/'browser')+'\n')
vault.chmod(0o600)
bin_dir=pathlib.Path.home()/'.local/bin';bin_dir.mkdir(parents=True,exist_ok=True)
# Explicit paths; no shell evaluation of WhatsApp input.
import shlex
wrapper=bin_dir/'fs-conector'
wrapper.write_text('#!/bin/sh\nexport FS_CONNECTOR_HOME='+shlex.quote(str(base))+'\nexec '+shlex.quote(node)+' '+shlex.quote(str(base/'app/dist/scripts/mac/cli.js'))+' "$@"\n')
wrapper.chmod(0o700)
plist=pathlib.Path.home()/'Library/LaunchAgents/br.com.fs.conector.plist'
plist.parent.mkdir(parents=True,exist_ok=True)
settings={'Label':'br.com.fs.conector','ProgramArguments':[node,str(base/'app/dist/scripts/mac/start.js')],
 'WorkingDirectory':str(pathlib.Path.home()),'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,
 'EnvironmentVariables':{'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin','FS_CONNECTOR_HOME':str(base)},
 # launchd cannot open logs in Documents directly; the user process writes them.
 'StandardOutPath':'/dev/null','StandardErrorPath':'/dev/null'}
plist.write_bytes(plistlib.dumps(settings));plist.chmod(0o600)
uid=str(os.getuid())
subprocess.run(['launchctl','bootout','gui/'+uid,str(plist)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['launchctl','bootstrap','gui/'+uid,str(plist)],check=True)
for attempt in range(30):
 try:
  with urllib.request.urlopen('http://127.0.0.1:18765/health',timeout=1) as response:
   if json.load(response).get('name')=='FS Conector Mac': break
 except (OSError, ValueError): pass
 time.sleep(0.2)
else: raise SystemExit('Serviço instalado, mas não iniciou. Verifique logs/service-error.log.')
print(json.dumps({'installed':True,'home':str(base),'command':str(wrapper),'listen':'127.0.0.1:18765','whatsapp':'not_connected'},ensure_ascii=False,indent=2))
