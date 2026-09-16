"use client";
import { useEffect,useState,useSyncExternalStore } from "react";
import { Download, X, Smartphone } from "lucide-react";
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function InstallApp(){
 const ios=useSyncExternalStore(()=>()=>{},()=>/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches,()=>false);
 const previouslyDismissed=useSyncExternalStore(()=>()=>{},()=>sessionStorage.getItem('fs-install-dismissed')==='1',()=>true);
 const [event,setEvent]=useState<InstallEvent|null>(null);const [dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  if(matchMedia('(display-mode: standalone)').matches)return;
  const ready=(e:Event)=>{e.preventDefault();setEvent(e as InstallEvent);};const installed=()=>{setEvent(null);setDismissed(true);};window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',installed);return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',installed);};
 },[]);
 if(dismissed||previouslyDismissed||(!event&&!ios))return null;
 return <aside className="pwa-install"><Smartphone size={24}/><div><strong>FS na tela inicial</strong><p>{ios?'No Safari, toque em Compartilhar e em Adicionar à Tela de Início.':'Abra seus diagnósticos como um aplicativo.'}</p></div>{event&&<button onClick={async()=>{await event.prompt();await event.userChoice;setEvent(null);}}><Download size={16}/> Instalar</button>}<button aria-label="Fechar sugestão de instalação" onClick={()=>{setDismissed(true);sessionStorage.setItem('fs-install-dismissed','1');}}><X size={18}/></button></aside>;
}
