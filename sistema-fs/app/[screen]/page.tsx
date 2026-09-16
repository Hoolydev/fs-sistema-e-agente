import { DocumentLibrary } from "@/components/documentos/library";
import Dashboard from "@/components/fs/dashboard";
import { notFound } from "next/navigation";
const screens = [
  "inicio",
  "painel-executivo",
  "indicadores",
  "comercial",
  "administrativo",
  "controller",
  "contabilidade",
  "juridico",
  "aprovacoes",
  "documentos",
  "relatorios",
  "configuracoes",
];
export const dynamicParams = false;
export function generateStaticParams() { return screens.map(screen => ({ screen })); }

export default async function Screen({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!screens.includes(screen)) notFound();
  if(screen === "documentos") return <Dashboard screen={screen}><DocumentLibrary/></Dashboard>;
  return <Dashboard screen={screen} />;
}
