import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { registerPlatformHttp } from "../platform/http";
import { runDiagnostics } from "../platform/diagnostics";
import { createContext } from "./context";

/**
 * Builds the API-only express app. Static file serving and the HTTP listener
 * live in index.ts (long-running) or api/index.ts (serverless) so this stays
 * safe to import inside a serverless bundle.
 */
export function buildApp() {
  const missingCritical = ["DATABASE_URL", "JWT_SECRET", "BUILT_IN_FORGE_API_KEY"].filter(key => !process.env[key]);
  if (missingCritical.length > 0) {
    console.error(`[startup] Missing critical env vars: ${missingCritical.join(", ")} — /api/system/health يوضح الأثر والإصلاح لكل واحد.`);
  }
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPlatformHttp(app);
  // deep health report for uptime monitors and the diagnostics dashboard.
  // The report itself is cached for 10s inside runDiagnostics; this limiter only
  // stops someone hammering the endpoint to exhaust pooler connections.
  const healthHits = new Map<string, { count: number; resetAt: number }>();
  app.get(["/api/system/health", "/v1/system/health"], async (req, res) => {
    const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.ip || "unknown";
    const nowMs = Date.now();
    const bucket = healthHits.get(ip);
    if (!bucket || bucket.resetAt < nowMs) healthHits.set(ip, { count: 1, resetAt: nowMs + 60_000 });
    else if (++bucket.count > 60) {
      return res.status(429).json({ error: { code: "rate_limited", message: "طلبات فحص كثيرة جدًا؛ تمهّل ثانية." } });
    }
    res.json(await runDiagnostics());
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
