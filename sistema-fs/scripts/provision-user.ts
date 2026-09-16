import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createFsAuth } from '../lib/auth/server';
async function main(){
 const email=process.env.FS_PROVISION_EMAIL,name=process.env.FS_PROVISION_NAME;
 if(!email||!name)throw new Error('Informe FS_PROVISION_EMAIL e FS_PROVISION_NAME.');
 mkdirSync('.local',{recursive:true,mode:0o700});
 const password=randomBytes(18).toString('base64url');
 const auth=createFsAuth(true);const result=await auth.api.signUpEmail({body:{email,name,password}});
 writeFileSync('.local/ACESSO-SISTEMA.txt',`Sistema FS\nhttps://app.fssolucoestributarias.com.br/login\nE-mail: ${email}\nSenha inicial: ${password}\n\nAltere a senha em Minha conta após o primeiro acesso.\n`,{mode:0o600});
 writeFileSync('.local/provisioned-user.json',JSON.stringify({id:result.user.id,email,password}),{mode:0o600});
 console.log('Conta criada. Credenciais no arquivo privado .local/ACESSO-SISTEMA.txt.');process.exit(0);
}
main().catch(e=>{console.error('Conta não criada:',e instanceof Error?e.message:'erro');process.exit(1);});
