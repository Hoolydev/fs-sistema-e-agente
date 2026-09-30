import { boundedBody, sameOrigin } from "@/lib/comercial/security";

export const noStore = { "Cache-Control": "no-store" };
export const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
// Corpo JSON de escrita: mesma origem, tamanho limitado e objeto simples.
export async function jsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  if (!sameOrigin(request)) return reply({ message: "Origem inválida." }, 403);
  try {
    const parsed: unknown = JSON.parse((await boundedBody(request, 8000)).toString());
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {}
  return reply({ message: "Solicitação inválida." }, 400);
}
export function storeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "NOT_FOUND") return reply({ message: "Registro não encontrado." }, 404);
  if (code === "STALE") return reply({ code, message: "Este registro foi alterado por outra pessoa. Recarregue a lista e refaça a alteração." }, 409);
  if (code === "DUPLICATE_PROCESS") return reply({ code, message: "Já existe um registro com este número de processo." }, 409);
  console.error("CONTROLLER_STORE", error instanceof Error ? error.name : "unknown", error && typeof error === "object" && "code" in error ? error.code : "NO_CODE");
  return reply({ message: "Não foi possível concluir a operação. Tente novamente." }, 503);
}
