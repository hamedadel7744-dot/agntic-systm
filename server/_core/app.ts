import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { registerPlatformHttp } from "../platform/http";
import { registerSystemAdminHttp } from "../platform/admin-http";
import { runDiagnostics } from "../platform/diagnostics";
import type { DiagnosticsReport } from "../platform/diagnostics";
import { runGuardSweep } from "../platform/guard";
import { createContext } from "./context";

/**
 * Opportunistic zombie reaper trigger: uptime monitors polling the health
 * endpoint double as the periodic scheduler that the manual admin-only
 * POST /v1/system/guard used to require. Throttled and fire-and-forget so
 * health latency and pooler load are unaffected.
 */
const GUARD_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastGuardSweepAt = 0;
function maybeRunGuardSweep() {
  if (!process.env.DATABASE_URL) return;
  if (Date.now() - lastGuardSweepAt < GUARD_SWEEP_INTERVAL_MS) return;
  lastGuardSweepAt = Date.now();
  void runGuardSweep().catch(() => {});
}

/**
 * Anonymous uptime-monitor projection of the diagnostics report: aggregate
 * status and per-check status only. Raw error causes (postgres messages carry
 * db host/user), env-var presence, and cross-tenant incidents never leave the
 * server unauthenticated — the full report stays on the tRPC diagnostics
 * surface consumed by the internal dashboard.
 */
function toPublicHealthReport(report: DiagnosticsReport) {
  return {
    status: report.status,
    checkedAt: report.checkedAt,
    durationMs: report.durationMs,
    cached: report.cached,
    meta: report.meta,
    checks: report.checks
      // Environment checks leak missing env-var names in their titles; their
      // impact still shows in the aggregate status.
      .filter(check => check.group !== "environment")
      .map(({ cause: _cause, ...check }) => check),
  };
}

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
  registerSystemAdminHttp(app);
  // public health endpoint for uptime monitors: aggregate status only, see
  // toPublicHealthReport (the full deep report is the tRPC diagnostics surface).
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
    maybeRunGuardSweep();
    res.json(toPublicHealthReport(await runDiagnostics()));
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
