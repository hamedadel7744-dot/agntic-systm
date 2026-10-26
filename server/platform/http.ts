import type { Express, Request, Response } from "express";
import { z } from "zod";
import { executeRun, listPlatformTools } from "./runtime";
import { findTenantByApiKey, resolveDefaultAgent } from "./db";
import { getDb } from "../db";
import { checkRateLimit, RUNS_RATE_LIMIT_PER_MIN, runsRateBuckets } from "./rate-limit";

const runSchema = z.object({ agentId: z.string().uuid().optional(), input: z.string().min(1).max(8000), conversationId: z.string().uuid().optional(), externalSessionId: z.string().max(255).optional(), metadata: z.record(z.string(), z.unknown()).optional() });

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
    // Admission control: reject bursts politely before they burn quota.
    const rate = checkRateLimit(runsRateBuckets, resolved.tenant.id, RUNS_RATE_LIMIT_PER_MIN);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      return res.status(429).json({ error: { code: "rate_limited", message: `عدد الطلبات تجاوز الحد (${RUNS_RATE_LIMIT_PER_MIN} في الدقيقة لهذا الحساب). حاول بعد ${rate.retryAfterSec} ثانية.` } });
    }
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    // Stripe-style idempotency: the header is whitelisted in CORS above; a retry
    // carrying the same key replays the original outcome instead of re-billing.
    const idempotencyKey = req.header("idempotency-key")?.trim() || undefined;
    if (idempotencyKey && idempotencyKey.length > 255) return res.status(400).json({ error: { code: "invalid_request", message: "مفتاح التكرار أطول من الحد المسموح (255 حرفًا)." } });
    // Key-only integration: without agentId, the tenant's default agent runs.
    let agentId = parsed.data.agentId;
    if (!agentId) {
      const fallback = await resolveDefaultAgent(resolved.tenant.id);
      if (!fallback) return res.status(404).json({ error: { code: "no_agent", message: "لا يوجد وكيل لهذا الحساب بعد — أنشئ وكيلًا من لوحة التحكم أو مرر agentId صريحًا." } });
      agentId = fallback.id;
    }
    const outcome = await executeRun({ tenantId: resolved.tenant.id, agentId, input: parsed.data.input, conversationId: parsed.data.conversationId, externalSessionId: parsed.data.externalSessionId, idempotencyKey, metadata: parsed.data.metadata });
    if (outcome.status === "failed") {
      // Unified failure envelope: the same {error:{code,message,runId}} shape as
      // auth/rate-limit failures, with a stable machine-readable code — the run
      // reason is no longer buried inside a 422 success-shaped body.
      return res.status(422).json({ error: { code: outcome.errorCode ?? "run_failed", message: outcome.answer, runId: outcome.runId } });
    }
    return res.status(200).json({ data: outcome, agentId });
  });
}
