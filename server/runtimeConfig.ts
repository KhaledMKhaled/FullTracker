export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production") {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 ||
        env.SESSION_SECRET === "fallback-secret-change-in-production" ||
        env.SESSION_SECRET.includes("REPLACE_")) {
      throw new Error("SESSION_SECRET must be a unique secret of at least 32 characters");
    }
  }
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  if (env.STORAGE_MODE && !["replit", "vps"].includes(env.STORAGE_MODE)) {
    throw new Error("STORAGE_MODE must be replit or vps");
  }
  return { port, host: env.HOST || "0.0.0.0" };
}
