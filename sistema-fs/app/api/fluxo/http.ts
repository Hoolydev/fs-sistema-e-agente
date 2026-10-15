import { reply, storeError } from "@/lib/controller/http";
// Recusas do fluxo de etapas com mensagem para a tela.
const messages: Record<string, [number, string]> = {
  FORBIDDEN_SECTOR: [403, "Esta área não está entre os seus setores. Peça ao administrador para incluir você em Configurações."],
  INVALID_SUBSTAGE: [422, "Subetapa inválida para esta área."],
  REVIEWER_REQUIRED: [403, "Mudar de área exige a validação de quem aprova nesta área."],
  APPROVAL_REQUIRED: [403, "Este passo é a aprovação da chefia da área. Peça ao responsável para mover o cartão."],
  SUBSTAGE_NOT_DONE: [422, "Conclua a última subetapa desta área antes de enviar o cliente para a próxima."],
  LAST_SECTOR: [422, "O Jurídico é a última área do fluxo."],
  FIRST_SECTOR: [422, "O Comercial é a primeira área do fluxo."],
};
export function flowError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known = messages[code];
  return known ? reply({ code, message: known[1] }, known[0]) : storeError(error);
}
