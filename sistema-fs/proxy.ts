import { NextRequest, NextResponse } from "next/server";
import { sessionFor } from "@/lib/auth/server";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Only these machine endpoints bypass browser sessions; each authenticates its caller itself.
  if (path.startsWith("/api/auth/") || path === "/api/webhooks/diagnostico" || path.startsWith("/api/agent/")) return NextResponse.next();
  let session;
  try { session = await sessionFor(request); } catch {
    if (path === "/login") return NextResponse.next();
    return new NextResponse("Serviço de acesso temporariamente indisponível.", { status: 503 });
  }
  if (!session && path !== "/login") {
    if (path.startsWith("/api/")) return NextResponse.json({ message: "Entre na sua conta para continuar." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && path === "/login") return NextResponse.redirect(new URL("/diagnostico", request.url));
  const response = NextResponse.next(); response.headers.set("Cache-Control", "private, no-store"); return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|brand/|icons/|favicon.svg|favicon.ico|manifest.webmanifest|sw.js|offline.html).*)"] };
