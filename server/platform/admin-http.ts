import type { Express, Request, Response } from "express";
import { z } from "zod";
import { listTenantsWithKeys, revokeTenantKey, rotateTenantKey } from "./db";
import { getDb } from "../db";

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
  if (req.header("x-admin-token") !== token) {
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
}
