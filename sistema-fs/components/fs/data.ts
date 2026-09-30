import {
  House,
  LayoutDashboard,
  ChartNoAxesCombined,
  BriefcaseBusiness,
  ContactRound,
  SlidersHorizontal,
  Calculator,
  Scale,
  ShieldCheck,
  FolderOpen,
  FileChartColumn,
  Settings,
} from "lucide-react";
export const navigation = [
  {
    group: "PRINCIPAL",
    items: [
      { id: "inicio", label: "Página inicial", icon: House },
      { id: "diagnostico", label: "Diagnóstico fiscal", icon: FileChartColumn },
      {
        id: "painel-executivo",
        label: "Painel executivo",
        icon: LayoutDashboard,
      },
      { id: "indicadores", label: "Indicadores", icon: ChartNoAxesCombined },
    ],
  },
  {
    group: "MÓDULOS",
    items: [
      { id: "comercial", label: "Comercial", icon: BriefcaseBusiness },
      {
        id: "administrativo",
        label: "Administrativo / Cadastro",
        icon: ContactRound,
      },
      { id: "controller", label: "Controller", icon: SlidersHorizontal },
      { id: "contabilidade", label: "Contabilidade", icon: Calculator },
      { id: "juridico", label: "Jurídico", icon: Scale },
    ],
  },
  {
    group: "GOVERNANÇA",
    items: [
      { id: "aprovacoes", label: "Aprovações", icon: ShieldCheck },
      { id: "documentos", label: "Documentos", icon: FolderOpen },
      { id: "relatorios", label: "Relatórios", icon: FileChartColumn },
      { id: "configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];
export const descriptions: Record<string, string> = {
  inicio: "Uma visão completa da sua operação, em um só lugar.",
  "painel-executivo": "A carteira de processos do escritório em números.",
  indicadores: "Contagens, protocolos e revisão acompanhados de perto.",
  comercial: "Relacionamentos que se transformam em oportunidades.",
  administrativo: "Empresas atendidas e seus processos.",
  controller: "Visibilidade e controle sobre cada etapa da operação.",
  contabilidade: "Análises fiscais e obrigações acompanhadas de perto.",
  juridico: "Gestão de demandas, estratégias e prazos processuais.",
  aprovacoes: "Revisão dos registros incluídos pela equipe.",
  documentos: "Os documentos da sua operação, sempre à mão.",
  relatorios: "Informações organizadas para decisões mais claras.",
  configuracoes: "Seu acesso, a equipe e as permissões do sistema.",
};
const tones: Record<string, string> = {
  Revisado: "green", PROTOCOLADO: "green", Ativo: "green",
  "TEM DESPACHO": "blue",
  "Ajustes solicitados": "red", Desativado: "red", "Contagem vencida": "red",
  ARQUIVADO: "gray", "NÃO INICIADO": "gray",
};
export function tone(status: string) { return tones[status] ?? "gold"; }
