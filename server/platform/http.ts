import type { Express, Request, Response } from "express";
import { z } from "zod";
import { executeRun, listPlatformTools } from "./runtime";
import { findTenantByApiKey } from "./db";
import { getDb } from "../db";

const runSchema = z.object({ agentId: z.string().uuid(), input: z.string().min(1).max(8000), conversationId: z.string().uuid().optional(), externalSessionId: z.string().max(255).optional(), metadata: z.record(z.string(), z.unknown()).optional() });

function readApiKey(req: Request) {
  const direct = req.header("x-api-key");
  if (direct) return direct;
  const auth = req.header("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

export function registerPlatformHttp(app: Express) {
  app.use("/v1", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.header("origin") ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, Idempotency-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/v1/health", (_req, res) => res.json({ ok: true, service: "nova-agent-platform", version: "v1" }));
  app.get("/v1/tools", async (req: Request, res: Response) => {
    // Tool inventory is per-tenant intel: it requires a valid key and only
    // reports enabled tools. Never anonymous.
    if (process.env.DATABASE_URL && !(await getDb())) {
      return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    }
    const resolved = await findTenantByApiKey(readApiKey(req));
    if (!resolved) return res.status(401).json({ error: { code: "invalid_api_key", message: "API key is invalid or tenant is inactive" } });
    return res.json({ data: listPlatformTools().filter(tool => tool.enabled), tenantId: resolved.tenant.id });
  });
  app.post("/v1/runs", async (req: Request, res: Response) => {
    // Loud failure only when the DB is configured but unreachable — an unreachable
    // database must never masquerade as an invalid API key. In demo mode (no
    // DATABASE_URL) the key check below runs and demo behavior applies.
    if (process.env.DATABASE_URL && !(await getDb())) {
      return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات مضبوطة لكن غير قابلة للوصول الآن؛ الطلب مرفوض صراحة بدل الفشل الصامت." } });
    }
    const key = readApiKey(req);
    const resolved = await findTenantByApiKey(key);
    if (!resolved) return res.status(401).json({ error: { code: "invalid_api_key", message: "API key is invalid or tenant is inactive" } });
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const outcome = await executeRun({ tenantId: resolved.tenant.id, ...parsed.data });
    const statusCode = outcome.status === "failed" ? 422 : 200;
    return res.status(statusCode).json({ data: outcome });
  });
}
