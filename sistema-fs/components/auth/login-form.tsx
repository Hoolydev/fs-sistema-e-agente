"use client";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import "@/app/login.css";
export function LoginForm() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password, rememberMe: true });
      if (result.error) { setError(result.error.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente novamente." : "E-mail ou senha incorretos. Confira seus dados e tente novamente."); return; }
      window.location.assign("/diagnostico");
    } catch { setError("Não foi possível entrar. Verifique sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="fs-login"><section className="login-brand-panel"><Image src="/brand/fs-horizontal.png" alt="FS Soluções Tributárias" width={1581} height={274} priority/><div className="login-message"><span>INTELIGÊNCIA TRIBUTÁRIA</span><h1>Clareza para decidir.<br/><em>Acesso de onde estiver.</em></h1><p>Diagnósticos, pareceres e documentos da sua operação, reunidos em um só lugar.</p><div className="login-orbit" aria-hidden="true"><span>FS</span></div></div><small>ASSESSORIA TRIBUTÁRIA & PLANEJAMENTO FISCAL</small></section><section className="login-form-panel"><div className="login-card"><div className="login-lock"><LockKeyhole size={24}/></div><span className="login-kicker">ESPAÇO DA EQUIPE</span><h2>Bem-vindo à FS.</h2><p>Entre para acessar seus diagnósticos.</p><form onSubmit={submit}><label htmlFor="login-email">E-mail</label><input id="login-email" type="email" autoComplete="username" placeholder="seu@email.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/><label htmlFor="login-password">Senha</label><div className="login-password"><input id="login-password" type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/><button type="button" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>{error && <p role="alert" className="login-error">{error}</p>}<button className="login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>Entrar no sistema <ArrowRight size={18}/></>}</button></form><p className="login-help">Precisa de acesso ou esqueceu a senha?<br/>Solicite ao administrador da equipe FS.</p><div className="login-security"><ShieldCheck size={16}/><span>Acesso exclusivo para pessoas autorizadas.</span></div></div><small className="login-footer">FS Soluções Tributárias · Sistema de gestão</small></section></main>;
}
