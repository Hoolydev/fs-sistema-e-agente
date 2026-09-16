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
  "painel-executivo": "Resultados e evolução estratégica do escritório.",
  indicadores: "Acompanhe a eficiência e a qualidade das entregas.",
  comercial: "Relacionamentos que se transformam em oportunidades.",
  administrativo: "Clientes, cadastros e documentação organizados.",
  controller: "Visibilidade e controle sobre cada etapa da operação.",
  contabilidade: "Análises fiscais e obrigações acompanhadas de perto.",
  juridico: "Gestão de demandas, estratégias e prazos processuais.",
  aprovacoes: "Decisões que fazem a operação avançar.",
  documentos: "Os documentos da sua operação, sempre à mão.",
  relatorios: "Informações organizadas para decisões mais claras.",
  configuracoes: "Personalize seu espaço de trabalho.",
};
export type Process = {
  id: string;
  client: string;
  department: string;
  status: string;
  date: string;
  owner: string;
  initials: string;
  subject: string;
  progress: number;
};
export const processes: Process[] = [
  {
    id: "ADM-2026-0148",
    client: "Alfa Engenharia Ltda.",
    department: "Administrativo / Cadastro",
    status: "Em andamento",
    date: "14/09/2026",
    owner: "Amanda Souza",
    initials: "AS",
    subject: "Diligência documental",
    progress: 62,
  },
  {
    id: "CONT-2026-0093",
    client: "Beta Indústria S.A.",
    department: "Contabilidade",
    status: "Em análise",
    date: "15/09/2026",
    owner: "Rafael Martins",
    initials: "RM",
    subject: "Análise contábil e fiscal",
    progress: 45,
  },
  {
    id: "JUR-2026-0071",
    client: "Gama Comércio Ltda.",
    department: "Jurídico",
    status: "Aguardando aprovação",
    date: "16/09/2026",
    owner: "Juliana Ribeiro",
    initials: "JR",
    subject: "Aprovação para ajuizamento",
    progress: 80,
  },
  {
    id: "ADM-2026-0122",
    client: "Delta Serviços Ltda.",
    department: "Administrativo / Cadastro",
    status: "Em andamento",
    date: "18/09/2026",
    owner: "Carolina Mendes",
    initials: "CM",
    subject: "Manifestação de inconformidade",
    progress: 34,
  },
  {
    id: "CONT-2026-0105",
    client: "Épsilon Transportes Ltda.",
    department: "Contabilidade",
    status: "Concluído",
    date: "10/09/2026",
    owner: "Lucas Oliveira",
    initials: "LO",
    subject: "Revisão de obrigações fiscais",
    progress: 100,
  },
  {
    id: "JUR-2026-0068",
    client: "Horizonte Alimentos S.A.",
    department: "Jurídico",
    status: "Em análise",
    date: "21/09/2026",
    owner: "Juliana Ribeiro",
    initials: "JR",
    subject: "Revisão de transação tributária",
    progress: 55,
  },
];
export const priorities = [
  {
    title: "Manifestação de inconformidade",
    department: "Administrativo / Cadastro",
    days: 2,
    index: 3,
  },
  {
    title: "Análise contábil e fiscal",
    department: "Contabilidade",
    days: 3,
    index: 1,
  },
  {
    title: "Aprovação para ajuizamento",
    department: "Jurídico",
    days: 5,
    index: 2,
  },
  {
    title: "Diligência documental",
    department: "Administrativo / Cadastro",
    days: 7,
    index: 0,
  },
];
export function tone(status: string) {
  return status === "Concluído" || status === "Aprovado" || status === "Regular"
    ? "green"
    : status === "Em andamento"
      ? "blue"
      : status === "Em atraso"
        ? "red"
        : "gold";
}
