import { getMigrations } from "better-auth/db/migration";
import { createFsAuth } from "../lib/auth/server";
async function main(){
const auth=createFsAuth();
const migration=await getMigrations(auth.options);
await migration.runMigrations();
console.log('Estrutura de autenticação criada.');
process.exit(0);

}
main().catch(()=>{console.error("Falha ao preparar autenticação.");process.exit(1);});
