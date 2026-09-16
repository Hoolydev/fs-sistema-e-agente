import { startConnector } from '../../src/mac/connector.js';
import { Console } from 'node:console';
import { createWriteStream, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base=process.env.FS_CONNECTOR_HOME || join(homedir(),'Documents/ChatGPT/FS Soluções Tributarias/conector-local');
mkdirSync(join(base,'logs'),{recursive:true,mode:0o700});
globalThis.console=new Console({
  stdout:createWriteStream(join(base,'logs/service.log'),{flags:'a',mode:0o600}),
  stderr:createWriteStream(join(base,'logs/service-error.log'),{flags:'a',mode:0o600}),
});
try { await startConnector(); }
catch(error) { console.error(error); process.exitCode=1; }
