import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { recordEvent } from "./db";
import { platformAgents, platformAgentVersions, platformApiKeys, platformKnowledge, platformRuns, platformTenants } from "../../drizzle/schema";

export interface GuardFinding {
  id: string;
  severity: "warn" | "fail";
  title: string;
  detail: string;
  fix: string;
  count?: number;
}

export interface GuardReport {
  ranAt: string;
  reapedZombies: number;
  findings: GuardFinding[];
}

/** Read-only guard findings — safe to call from GET diagnostics. */
export async function collectGuardFindings(): Promise<GuardFinding[]> {
  const db = await getDb();
  if (!db) return [];
  const findings: GuardFinding[] = [];

  // Agents without any version reject every run with agent_without_version.
  const brokenAgents = await db.select({ id: platformAgents.id }).from(platformAgents).leftJoin(platformAgentVersions, eq(platformAgentVersions.agentId, platformAgents.id)).where(isNull(platformAgentVersions.id));
  if (brokenAgents.length > 0) {
    findings.push({ id: "agents_without_versions", severity: "fail", count: brokenAgents.length, title: "وكلاء بلا نسخة منشورة", detail: `${brokenAgents.length} وكيل بدون أي نسخة — كل تشغيلاتهم هتترفض برسالة agent_without_version.`, fix: "انشر نسخة لكل وكيل من كارت نسخ الوكيل." });
  }

  const [tenantRows, agentRows, keyRows] = await Promise.all([
    db.select({ id: platformTenants.id }).from(platformTenants),
    db.select({ tenantId: platformAgents.tenantId }).from(platformAgents),
    db.select({ tenantId: platformApiKeys.tenantId, revokedAt: platformApiKeys.revokedAt }).from(platformApiKeys),
  ]);
  const tenantsWithAgents = new Set(agentRows.map(row => row.tenantId));
  const tenantsWithActiveKey = new Set(keyRows.filter(row => !row.revokedAt).map(row => row.tenantId));
  const noAgent = tenantRows.filter(row => !tenantsWithAgents.has(row.id));
  const noKey = tenantRows.filter(row => !tenantsWithActiveKey.has(row.id));
  if (noAgent.length > 0) findings.push({ id: "tenants_without_agents", severity: "warn", count: noAgent.length, title: "عملاء بلا وكيل", detail: `${noAgent.length} عميل بدون أي وكيل — مفتاحهم بيرجع no_agent على كل تشغيل.`, fix: "أنشئ وكيلًا لكل عميل من لوحة التحكم." });
  if (noKey.length > 0) findings.push({ id: "tenants_without_active_keys", severity: "warn", count: noKey.length, title: "عملاء بلا مفتاح نشط", detail: `${noKey.length} عميل بدون مفتاح نشط — مش هيقدروا يتكاملوا مع أي نظام.`, fix: "اعمل تدوير مفتاح من قائمة العملاء." });

  // Knowledge without embeddings = degraded (keyword-only) retrieval.
  const noEmbed = await db.select({ count: sql<number>`count(*)::int` }).from(platformKnowledge).where(isNull(platformKnowledge.embedding));
  if ((noEmbed[0]?.count ?? 0) > 0) {
    findings.push({ id: "knowledge_without_embeddings", severity: "warn", count: noEmbed[0].count, title: "مصادر معرفة بدون تضمين دلالي", detail: `${noEmbed[0].count} مصدر بيتبحث فيه نصيًا فقط — جودة الإجابات عليه أقل.`, fix: "هيتحل تلقائيًا أول ما مفتاح المزود يتضبط؛ أو أعد حفظ المصادر بعد التفعيل." });
  }

  return findings;
}

/** Self-healing sweep: reap zombie runs (running/waiting_approval older than 15
 * minutes that no process will ever finish) and surface structural findings. */
export async function runGuardSweep(): Promise<GuardReport> {
  const ranAt = new Date().toISOString();
  const db = await getDb();
  if (!db) {
    return { ranAt, reapedZombies: 0, findings: [{ id: "db_unavailable", severity: "fail", title: "قاعدة البيانات غير متاحة", detail: "المسح اتوقف — مفيش حاجة اتعامت.", fix: "افحص /api/system/health لمعرفة سبب انقطاع القاعدة." }] };
  }
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const zombies = await db.select({ id: platformRuns.id, tenantId: platformRuns.tenantId }).from(platformRuns).where(and(inArray(platformRuns.status, ["running", "waiting_approval"]), lt(platformRuns.createdAt, staleCutoff)));
  let reaped = 0;
  for (const zombie of zombies) {
    await db.update(platformRuns).set({ status: "failed", error: "zombie_reaped_by_guard", completedAt: new Date() }).where(eq(platformRuns.id, zombie.id));
    await recordEvent({ tenantId: zombie.tenantId, runId: zombie.id, type: "guard.zombie_reaped", payload: { reason: "running_or_waiting_over_15m" } });
    reaped += 1;
  }
  const findings = await collectGuardFindings();
  return { ranAt, reapedZombies: reaped, findings };
}
