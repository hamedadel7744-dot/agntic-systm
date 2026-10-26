import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { addKnowledge, cancelRun, createAgentVersion, deleteKnowledge, findRunById, listAgentVersions, listKnowledgeForAgent, listRecentRuns, listTenantsWithKeys, recordEvent, revokeTenantKey, rotateTenantKey, setTenantStatus } from "./db";
import { decideRunAction, isPlatformKillSwitchEngaged, parseAgentConfig, setPlatformKillSwitch } from "./runtime";
import { runGuardSweep } from "./guard";
import { getDb } from "../db";

/** Constant-time comparison: hash both sides first so length differences never leak. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Control-plane REST surface, guarded by a single shared admin token from env.
 * Kept as REST (not tRPC) so it is trivially verifiable with curl and usable
 * from any dashboard without per-request tRPC header plumbing.
 */
function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = process.env.PLATFORM_ADMIN_TOKEN;
  // Loud refusal when admin mode is intentionally off — never a silent 404.
  if (!token) {
    return res.status(503).json({ error: { code: "admin_disabled", message: "PLATFORM_ADMIN_TOKEN غير مضبوط؛ إدارة المنصة معطلة عمدًا حتى يُضبط المتغير." } });
  }
  if (!tokenMatches(req.header("x-admin-token") ?? "", token)) {
    return res.status(401).json({ error: { code: "invalid_admin_token", message: "توكن المدير غير صحيح." } });
  }
  next();
}

export function registerSystemAdminHttp(app: Express) {
  app.get("/v1/system/tenants", requireAdmin, async (_req, res) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    return res.json({ data: await listTenantsWithKeys() });
  });

  app.post("/v1/system/tenants/:tenantId/rotate-key", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), label: z.string().max(64).optional() }).safeParse({ tenantId: req.params.tenantId, label: req.body?.label });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const result = await rotateTenantKey(parsed.data.tenantId, parsed.data.label ?? "rotated");
    if ("warning" in result) return res.status(503).json({ error: { code: "storage_unavailable", message: "وضع تجريبي بدون قاعدة بيانات." } });
    if ("notFound" in result) return res.status(404).json({ error: { code: "tenant_not_found", message: "Tenant غير موجود." } });
    return res.json({ data: result });
  });

  app.post("/v1/system/tenants/:tenantId/revoke-key", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), keyId: z.string().uuid() }).safeParse({ tenantId: req.params.tenantId, keyId: req.body?.keyId });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    return res.json({ data: await revokeTenantKey(parsed.data.tenantId, parsed.data.keyId) });
  });

  app.get("/v1/system/tenants/:tenantId/agents/:agentId/knowledge", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    return res.json({ data: await listKnowledgeForAgent(parsed.data.tenantId, parsed.data.agentId) });
  });

  app.post("/v1/system/tenants/:tenantId/agents/:agentId/knowledge", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid(), title: z.string().min(2).max(200), content: z.string().min(10).max(200000), sourceType: z.enum(["doc", "faq", "url"]).optional() }).safeParse({ ...req.params, ...req.body });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const row = await addKnowledge(parsed.data);
    if ("notFound" in row) return res.status(404).json({ error: { code: "agent_not_found", message: "Agent غير موجود داخل هذا الـ tenant." } });
    return res.json({ data: { id: row.id, title: row.title, status: row.status, hasEmbedding: "embedding" in row ? Boolean(row.embedding) : false } });
  });

  app.delete("/v1/system/knowledge/:knowledgeId", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ knowledgeId: z.string().uuid(), tenantId: z.string().uuid() }).safeParse({ knowledgeId: req.params.knowledgeId, tenantId: req.query.tenantId });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    return res.json({ data: await deleteKnowledge(parsed.data.tenantId, parsed.data.knowledgeId) });
  });

  app.post("/v1/system/tenants/:tenantId/status", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).safeParse({ tenantId: req.params.tenantId, status: req.body?.status });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const result = await setTenantStatus(parsed.data.tenantId, parsed.data.status);
    if (!result.updated) return res.status(404).json({ error: { code: "tenant_not_found", message: "Tenant غير موجود." } });
    return res.json({ data: result });
  });

  app.get("/v1/system/tenants/:tenantId/runs", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    return res.json({ data: await listRecentRuns(parsed.data.tenantId) });
  });

  // Per-run kill switch: flips a queued/running/waiting_approval run to cancelled
  // so executeRun's cooperative probe between tool executions stops it at the next
  // boundary — suspension and key revocation alone only gate NEW runs at auth time.
  app.post("/v1/system/runs/:runId/cancel", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ runId: z.string().uuid(), tenantId: z.string().uuid() }).safeParse({ runId: req.params.runId, tenantId: req.query.tenantId ?? req.body?.tenantId });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const result = await cancelRun(parsed.data.tenantId, parsed.data.runId);
    if (result.cancelled === 0) {
      const run = await findRunById(parsed.data.tenantId, parsed.data.runId);
      if (!run) return res.status(404).json({ error: { code: "run_not_found", message: "Run غير موجود داخل هذا الـ tenant." } });
      return res.status(409).json({ error: { code: "run_not_cancellable", message: "التشغيل انتهى بالفعل ولا يمكن إلغاؤه.", currentStatus: run.status } });
    }
    // Audit trail: the cancel decision is an admin action, recorded even though
    // the row's own status change is already visible in the runs list.
    await recordEvent({ tenantId: parsed.data.tenantId, runId: parsed.data.runId, type: "run.cancel_requested", payload: { requestedBy: "admin" } });
    return res.json({ data: { runId: parsed.data.runId, tenantId: parsed.data.tenantId, status: "cancelled" as const, note: "التشغيل الجارٍ سيتوقف عند حدود الأداة التالية قبل أي تنفيذ إضافي." } });
  });

  app.get("/v1/system/tenants/:tenantId/agents/:agentId/versions", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    return res.json({ data: await listAgentVersions(parsed.data.tenantId, parsed.data.agentId) });
  });

  app.post("/v1/system/tenants/:tenantId/agents/:agentId/versions", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid(), version: z.string().min(1).max(32), systemPrompt: z.string().min(10).max(20000), model: z.string().trim().max(100).optional(), toolPolicy: z.enum(["read", "execute", "both"]).optional() }).safeParse({ ...req.params, ...req.body });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    // The version carries the agent's full contract: prompt + model + tool policy.
    const config = JSON.stringify({ ...(parsed.data.model ? { model: parsed.data.model } : {}), toolPolicy: parsed.data.toolPolicy ?? "both" });
    const result = await createAgentVersion({ tenantId: parsed.data.tenantId, agentId: parsed.data.agentId, version: parsed.data.version, systemPrompt: parsed.data.systemPrompt, config });
    if ("notFound" in result) return res.status(404).json({ error: { code: "agent_not_found", message: "Agent غير موجود داخل هذا الـ tenant." } });
    const effective = parseAgentConfig(result.config ?? "{}");
    return res.json({ data: { id: result.id, version: result.version, status: result.status, model: effective.model ?? "platform-default", toolPolicy: effective.toolPolicy } });
  });

  app.post("/v1/system/tenants/:tenantId/agents/:agentId/rollback", requireAdmin, async (req: Request, res: Response) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid(), toVersionId: z.string().uuid() }).safeParse({ ...req.params, ...req.body });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const target = (await listAgentVersions(parsed.data.tenantId, parsed.data.agentId)).find(item => item.id === parsed.data.toVersionId);
    if (!target) return res.status(404).json({ error: { code: "version_not_found", message: "النسخة المطلوبة غير موجودة لهذا الوكيل." } });
    // Rollback restores the version's whole contract: prompt + model + tool policy.
    const result = await createAgentVersion({ tenantId: parsed.data.tenantId, agentId: parsed.data.agentId, version: `rb-${Date.now()}`, systemPrompt: target.systemPrompt, config: target.config });
    if ("notFound" in result) return res.status(404).json({ error: { code: "agent_not_found", message: "Agent غير موجود داخل هذا الـ tenant." } });
    const effective = parseAgentConfig(result.config ?? "{}");
    return res.json({ data: { id: result.id, version: result.version, restoredFrom: target.version, status: result.status, model: effective.model ?? "platform-default", toolPolicy: effective.toolPolicy } });
  });

  app.post("/v1/system/guard", requireAdmin, async (_req, res) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    return res.json({ data: await runGuardSweep() });
  });

  // Human approval path: grants re-execute the recorded proposal inside its run
  // (see decideRunAction), denies settle the paused run honestly. Same admin
  // trust level as the rest of this surface.
  app.post("/v1/system/tenants/:tenantId/approvals/:actionId", requireAdmin, async (req: Request, res) => {
    if (!(await getDb())) return res.status(503).json({ error: { code: "storage_unavailable", message: "قاعدة البيانات غير قابلة للوصول." } });
    const parsed = z.object({ tenantId: z.string().uuid(), actionId: z.string().uuid(), approve: z.boolean(), approverId: z.string().max(128).optional() }).safeParse({ tenantId: req.params.tenantId, actionId: req.params.actionId, approve: req.body?.approve, approverId: req.body?.approverId });
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    const outcome = await decideRunAction({ tenantId: parsed.data.tenantId, actionId: parsed.data.actionId, approve: parsed.data.approve, approverId: parsed.data.approverId });
    return res.status(outcome.status === "failed" ? 422 : 200).json({ data: outcome });
  });

  // Central kill switch. PLATFORM_KILL_SWITCH=1 stays the persistent control
  // across instances; this toggle flips live instances immediately.
  app.post("/v1/system/kill-switch", requireAdmin, async (req: Request, res) => {
    const parsed = z.object({ engaged: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", details: parsed.error.flatten() } });
    setPlatformKillSwitch(parsed.data.engaged);
    return res.json({ data: { engaged: isPlatformKillSwitchEngaged() } });
  });
}
