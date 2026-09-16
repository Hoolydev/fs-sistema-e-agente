"use client";
import Link from "next/link";
import { ChevronDown, LogOut, KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
export function UserMenu() {
  const { data } = authClient.useSession();
  const name = data?.user.name ?? "Equipe FS";
  async function signOut() { await authClient.signOut(); window.location.replace("/login"); }
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="user-menu"><span className="user-avatar">{name.slice(0,1).toUpperCase()}</span><span><strong>{name}</strong><small>Equipe FS</small></span><ChevronDown size={16}/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>{data?.user.email ?? "Minha conta"}</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem asChild><Link href="/conta"><KeyRound size={16}/> Alterar senha</Link></DropdownMenuItem><DropdownMenuItem onClick={signOut}><LogOut size={16}/> Sair do sistema</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
