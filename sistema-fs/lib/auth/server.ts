import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";
import { ac, can, defaultRole, roleOf, roles, type Permissions, type Role } from "./roles";
let pool: Pool | undefined;
export function createFsAuth(allowProvisioning = false) {
  pool ??= new Pool({ connectionString: process.env.FS_AUTH_DATABASE_URL || process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
  return betterAuth({
    appName: "FS Soluções Tributárias",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3100",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean),
    database: pool,
    user: { modelName: "fs_auth_user" },
    account: { modelName: "fs_auth_account" },
    session: { modelName: "fs_auth_session", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    verification: { modelName: "fs_auth_verification" },
    emailAndPassword: { enabled: true, disableSignUp: !allowProvisioning, minPasswordLength: 12, maxPasswordLength: 128 },
    rateLimit: { enabled: true, storage: "database", modelName: "fs_auth_rate_limit", window: 60, max: 60, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    advanced: { cookiePrefix: "fs", useSecureCookies: (process.env.BETTER_AUTH_URL || "").startsWith("https://") },
    plugins: [admin({ ac, roles, defaultRole, adminRoles: ["admin"], bannedUserMessage: "Seu acesso ao sistema FS foi desativado. Procure o administrador." })],
    // O administrador não altera o próprio perfil nem desativa a própria conta: sempre resta ao menos um administrador ativo.
    hooks: { before: createAuthMiddleware(async ctx => {
      if (ctx.path !== "/admin/set-role" && ctx.path !== "/admin/update-user") return;
      const session = await getSessionFromCtx(ctx);
      if (session && String(ctx.body?.userId) === session.user.id) throw new APIError("BAD_REQUEST", { message: "Você não pode alterar o próprio perfil de acesso." });
    }) },
  });
}
let instance: ReturnType<typeof createFsAuth> | undefined;
export function getAuth() { return instance ??= createFsAuth(); }
export async function sessionFor(request: Request) { return getAuth().api.getSession({ headers: request.headers }); }
export async function requireSession(request: Request) {
  const session = await sessionFor(request);
  return session ? null : Response.json({ message: "Entre na sua conta para continuar." }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
export type Actor = { id: string; name: string; role: Role };
// Sessão + permissão do perfil. Devolve o autor da ação ou a resposta de recusa pronta.
export async function requirePermission(request: Request, permissions?: Permissions): Promise<{ actor: Actor; denied?: undefined } | { actor?: undefined; denied: Response }> {
  const headers = { "Cache-Control": "no-store" };
  const session = await sessionFor(request);
  if (!session) return { denied: Response.json({ message: "Entre na sua conta para continuar." }, { status: 401, headers }) };
  const role = roleOf(session.user);
  if (permissions && !can(role, permissions)) return { denied: Response.json({ message: "Seu perfil de acesso não permite esta ação." }, { status: 403, headers }) };
  return { actor: { id: session.user.id, name: session.user.name, role } };
}
