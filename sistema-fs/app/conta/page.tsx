"use client";
import { useState, type FormEvent } from "react";
import Dashboard from "@/components/fs/dashboard";
import { authClient } from "@/lib/auth/client";
export default function AccountPage() {
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const values=new FormData(form);setBusy(true);setMessage("");try{const result=await authClient.changePassword({currentPassword:String(values.get("current")),newPassword:String(values.get("new")),revokeOtherSessions:true});setMessage(result.error?"Não foi possível alterar. Confira a senha atual e use pelo menos 12 caracteres.":"Senha alterada. As outras sessões foram encerradas.");if(!result.error)form.reset();}catch{setMessage("Verifique sua conexão e tente novamente.");}finally{setBusy(false);}}
  return <Dashboard screen="conta"><section className="diag-card" style={{maxWidth:520,margin:"30px auto"}}><h1>Minha conta</h1><p>Altere sua senha de acesso ao sistema FS.</p><form onSubmit={submit} className="account-form"><label>Senha atual<input name="current" type="password" autoComplete="current-password" required/></label><label>Nova senha<input name="new" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label><p>Use pelo menos 12 caracteres.</p><button className="diag-button primary" disabled={busy}>{busy?"Salvando…":"Alterar senha"}</button><p role="status">{message}</p></form></section></Dashboard>;
}
