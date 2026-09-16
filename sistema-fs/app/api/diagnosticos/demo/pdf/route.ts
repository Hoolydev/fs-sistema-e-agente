import { requireSession } from "@/lib/auth/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { demoReport } from "@/lib/diagnostico/demo";
import { generateDiagnosticPdf } from "@/lib/diagnostico/pdf";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireSession(request); if (denied) return denied;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const logo = await readFile(path.join(process.cwd(), "public/brand/fs-horizontal.png"));
  const pdf = generateDiagnosticPdf(demoReport, logo);
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="FS-Parecer-Demonstrativo.pdf"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
