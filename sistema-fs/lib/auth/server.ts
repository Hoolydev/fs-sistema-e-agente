import { betterAuth } from "better-auth";
import { Pool } from "pg";
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
  });
}
let instance: ReturnType<typeof createFsAuth> | undefined;
export function getAuth() { return instance ??= createFsAuth(); }
export async function sessionFor(request: Request) { return getAuth().api.getSession({ headers: request.headers }); }
export async function requireSession(request: Request) {
  const session = await sessionFor(request);
  return session ? null : Response.json({ message: "Entre na sua conta para continuar." }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
