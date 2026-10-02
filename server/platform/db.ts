import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { platformAgents, platformAgentVersions, platformApiKeys, platformConnectors, platformConversations, platformDeployments, platformEvents, platformKnowledge, platformMessages, platformRuns, platformTenants, platformToolCalls, platformUsage } from "../../drizzle/schema";
import { hashApiKey, newId, safeJson } from "./identity";
import { embedText, toVectorLiteral } from "./embeddings";

/** Normalizes drizzle execute() results across pg drivers into plain row arrays. */
function rawRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

export async function createTenant(input: { name: string; plan?: "basic" | "pro" | "enterprise"; tokenQuota?: number; hardCap?: number }) {
  const db = await getDb();
  if (!db) return { id: newId(), ...input, plan: input.plan ?? "basic", tokenQuota: input.tokenQuota ?? 100000, tokenUsedThisCycle: 0, hardCap: input.hardCap ?? 120000, status: "active" as const };
  const id = newId();
  await db.insert(platformTenants).values({ id, name: input.name, plan: input.plan ?? "basic", tokenQuota: input.tokenQuota ?? 100000, hardCap: input.hardCap ?? 120000 });
  const rows = await db.select().from(platformTenants).where(eq(platformTenants.id, id)).limit(1);
  return rows[0];
}

export async function findTenantByApiKey(rawKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const keyHash = hashApiKey(rawKey);
  const rows = await db.select({ tenant: platformTenants, apiKey: platformApiKeys }).from(platformApiKeys).innerJoin(platformTenants, eq(platformApiKeys.tenantId, platformTenants.id)).where(and(eq(platformApiKeys.keyHash, keyHash), sql`${platformApiKeys.revokedAt} IS NULL`, eq(platformTenants.status, "active"))).limit(1);
  if (rows[0]) {
    // fire-and-forget: key usage telemetry must never block or fail the request
    db.update(platformApiKeys).set({ lastUsedAt: new Date() }).where(eq(platformApiKeys.id, rows[0].apiKey.id)).catch(() => {});
  }
  return rows[0];
}

export async function createAgent(input: { tenantId: string; name: string; description?: string; systemPrompt: string }) {
  const db = await getDb();
  const agentId = newId();
  const versionId = newId();
  if (!db) return { agent: { id: agentId, tenantId: input.tenantId, name: input.name, status: "draft" as const }, version: { id: versionId, agentId, version: "1.0.0", systemPrompt: input.systemPrompt, status: "draft" as const } };
  await db.insert(platformAgents).values({ id: agentId, tenantId: input.tenantId, name: input.name, description: input.description });
  await db.insert(platformAgentVersions).values({ id: versionId, agentId, version: "1.0.0", systemPrompt: input.systemPrompt, config: "{}" });
  const agent = (await db.select().from(platformAgents).where(and(eq(platformAgents.id, agentId), eq(platformAgents.tenantId, input.tenantId))).limit(1))[0];
  const version = (await db.select().from(platformAgentVersions).where(eq(platformAgentVersions.id, versionId)).limit(1))[0];
  return { agent, version };
}

export async function getAgentScoped(tenantId: string, agentId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ agent: platformAgents, version: platformAgentVersions }).from(platformAgents).leftJoin(platformAgentVersions, eq(platformAgents.id, platformAgentVersions.agentId)).where(and(eq(platformAgents.id, agentId), eq(platformAgents.tenantId, tenantId))).orderBy(desc(platformAgentVersions.createdAt)).limit(1);
  return rows[0];
}

/** Plug-and-play: an API key alone must be enough to run the platform, so the
 * tenant's first agent is the default when no agentId is provided. */
export async function resolveDefaultAgent(tenantId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ id: platformAgents.id, name: platformAgents.name }).from(platformAgents).where(eq(platformAgents.tenantId, tenantId)).orderBy(platformAgents.createdAt).limit(1))[0];
}

export async function createRun(input: { tenantId: string; agentId: string; input: string; traceId: string; conversationId?: string }) {
  const db = await getDb();
  const id = newId();
  if (!db) return { id, tenantId: input.tenantId, agentId: input.agentId, input: input.input, traceId: input.traceId, status: "queued" as const, tokensUsed: 0 };
  await db.insert(platformRuns).values({ id, tenantId: input.tenantId, agentId: input.agentId, input: input.input, traceId: input.traceId, conversationId: undefined, conversationKey: input.conversationId });
  return (await db.select().from(platformRuns).where(and(eq(platformRuns.id, id), eq(platformRuns.tenantId, input.tenantId))).limit(1))[0];
}

export async function updateRun(tenantId: string, runId: string, patch: { status: "running" | "waiting_approval" | "succeeded" | "failed"; output?: string; error?: string; tokensUsed?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.update(platformRuns).set({ ...patch, completedAt: ["succeeded", "failed"].includes(patch.status) ? new Date() : undefined }).where(and(eq(platformRuns.id, runId), eq(platformRuns.tenantId, tenantId)));
}

export async function recordToolCall(input: { tenantId: string; runId: string; toolName: string; toolInput: unknown; status: "pending" | "success" | "failed" | "denied"; output?: unknown }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(platformToolCalls).values({ id: newId(), tenantId: input.tenantId, runId: input.runId, toolName: input.toolName, input: safeJson(input.toolInput), output: input.output ? safeJson(input.output) : undefined, status: input.status });
}

export async function recordEvent(input: { tenantId: string; runId?: string; type: string; payload: unknown; traceId?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(platformEvents).values({ id: newId(), tenantId: input.tenantId, runId: input.runId, eventType: input.type, payload: safeJson(input.payload), traceId: input.traceId });
}

const BILLING_CYCLE_MS = 30 * 86400000;

export async function chargeUsage(tenantId: string, tokens: number, toolCalls = 0) {
  const db = await getDb();
  if (!db) return { allowed: true, used: tokens, quota: 100000, cap: 120000, warning: false, overageTokens: 0 };
  const current = (await db.select().from(platformTenants).where(eq(platformTenants.id, tenantId)).limit(1))[0];
  if (!current) return { allowed: false, reason: "tenant_not_found" };
  const now = new Date();
  const cycleExpired = now.getTime() - current.billingCycleStart.getTime() >= BILLING_CYCLE_MS;
  // Atomic increment via SQL: a read-modify-write here loses tokens under concurrency.
  // Tokens were really spent, so the cap is enforced AFTER incrementing (no refund).
  const updated = await db.update(platformTenants).set(
    cycleExpired
      ? { billingCycleStart: now, tokenUsedThisCycle: tokens }
      : { tokenUsedThisCycle: sql`${platformTenants.tokenUsedThisCycle} + ${tokens}` }
  ).where(eq(platformTenants.id, tenantId)).returning({ used: platformTenants.tokenUsedThisCycle, quota: platformTenants.tokenQuota, cap: platformTenants.hardCap, cycleStart: platformTenants.billingCycleStart });
  const row = updated[0];
  if (!row) return { allowed: false, reason: "tenant_not_found" };
  if (row.used > row.cap) return { allowed: false, reason: "hard_cap_reached", message: `تم إيقاف الطلب لأن الحساب تجاوز السقف النهائي المسموح (${row.cap} توكن في الدورة).`, used: row.used, quota: row.quota, cap: row.cap };
  const usageId = `${tenantId}-${row.cycleStart.getTime()}`;
  await db.insert(platformUsage).values({ id: usageId, tenantId, cycleStart: row.cycleStart, cycleEnd: new Date(row.cycleStart.getTime() + BILLING_CYCLE_MS), tokens, requests: 1, toolCalls }).onConflictDoUpdate({ target: platformUsage.id, set: { tokens: sql`${platformUsage.tokens} + ${tokens}`, requests: sql`${platformUsage.requests} + 1`, toolCalls: sql`${platformUsage.toolCalls} + ${toolCalls}` } });
  return { allowed: true, used: row.used, quota: row.quota, cap: row.cap, warning: row.used >= row.quota * 0.8, overageTokens: Math.max(0, row.used - row.quota) };
}

export async function listPlatformOverview(tenantId: string) {
  const db = await getDb();
  if (!db) return { tenantId, agents: [], runs: [], usage: { used: 0, quota: 100000, cap: 120000 } };
  const [agents, runs, tenants] = await Promise.all([
    db.select().from(platformAgents).where(eq(platformAgents.tenantId, tenantId)),
    db.select().from(platformRuns).where(eq(platformRuns.tenantId, tenantId)).orderBy(desc(platformRuns.createdAt)).limit(20),
    db.select().from(platformTenants).where(eq(platformTenants.id, tenantId)).limit(1),
  ]);
  const tenant = tenants[0];
  return { tenantId, agents, runs, usage: { used: tenant?.tokenUsedThisCycle ?? 0, quota: tenant?.tokenQuota ?? 0, cap: tenant?.hardCap ?? 0 } };
}

export async function addKnowledge(input: { tenantId: string; agentId: string; title: string; content: string; sourceType?: "doc" | "faq" | "url" }) {
  const db = await getDb();
  const id = newId();
  if (!db) return { id, ...input, status: "active" as const };
  // Embedding is best-effort: without a provider key the row is still stored and
  // searchable via the keyword path.
  const embedding = await embedText(`${input.title}\n${input.content}`);
  await db.insert(platformKnowledge).values({ id, tenantId: input.tenantId, agentId: input.agentId, title: input.title, content: input.content, contentHash: hashApiKey(input.content), sourceType: input.sourceType ?? "doc", ...(embedding ? { embedding } : {}) });
  return (await db.select().from(platformKnowledge).where(and(eq(platformKnowledge.id, id), eq(platformKnowledge.tenantId, input.tenantId))).limit(1))[0];
}

export async function listKnowledgeForAgent(tenantId: string, agentId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: platformKnowledge.id, title: platformKnowledge.title, sourceType: platformKnowledge.sourceType, status: platformKnowledge.status, hasEmbedding: sql<boolean>`${platformKnowledge.embedding} is not null`, createdAt: platformKnowledge.createdAt }).from(platformKnowledge).where(and(eq(platformKnowledge.tenantId, tenantId), eq(platformKnowledge.agentId, agentId))).orderBy(desc(platformKnowledge.createdAt));
}

export async function deleteKnowledge(tenantId: string, knowledgeId: string) {
  const db = await getDb();
  if (!db) return { deleted: 0 };
  const rows = await db.delete(platformKnowledge).where(and(eq(platformKnowledge.id, knowledgeId), eq(platformKnowledge.tenantId, tenantId))).returning({ id: platformKnowledge.id });
  return { deleted: rows.length };
}

export async function searchKnowledge(tenantId: string, agentId: string, query: string) {
  const db = await getDb();
  if (!db) return [];
  // Semantic path first (pgvector cosine distance); silently degrades to keyword
  // matching when embeddings are unavailable (no key yet, or no embedded docs).
  const queryEmbedding = await embedText(query);
  if (queryEmbedding) {
    const vectorRows = rawRows(await db.execute(sql`select "id", "title", "content", "sourceType", "status", "createdAt" from "platformKnowledge" where "tenantId" = ${tenantId} and "agentId" = ${agentId} and "status" = 'active' and "embedding" is not null order by "embedding" <=> ${toVectorLiteral(queryEmbedding)}::vector limit 5`));
    if (vectorRows.length > 0) return vectorRows as Array<{ id: string; title: string; content: string; sourceType: string; status: string; createdAt: Date }>;
  }
  const rows = await db.select().from(platformKnowledge).where(and(eq(platformKnowledge.tenantId, tenantId), eq(platformKnowledge.agentId, agentId), eq(platformKnowledge.status, "active"))).limit(50);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.map(row => ({ row, score: terms.filter(term => `${row.title} ${row.content}`.toLowerCase().includes(term)).length })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.row);
}

export async function createTenantApiKey(tenantId: string, label = "default") {
  const db = await getDb();
  const { raw, hash, prefix } = (await import("./identity")).createApiKey();
  const id = newId();
  if (db) {
    await db.insert(platformApiKeys).values({ id, tenantId, label, keyHash: hash, keyPrefix: prefix });
  }
  return { id, tenantId, label, key: raw, prefix };
}

export async function createConnector(input: { tenantId: string; name: string; kind?: "rest" | "graphql" | "mcp" | "webhook" | "internal"; baseUrl?: string; capabilities: string[]; secretRef?: string }) {
  const db = await getDb();
  const id = newId();
  if (!db) return { id, ...input, kind: input.kind ?? "rest", status: "draft" as const };
  await db.insert(platformConnectors).values({ id, tenantId: input.tenantId, name: input.name, kind: input.kind ?? "rest", baseUrl: input.baseUrl, capabilities: safeJson(input.capabilities), secretRef: input.secretRef });
  return (await db.select().from(platformConnectors).where(and(eq(platformConnectors.id, id), eq(platformConnectors.tenantId, input.tenantId))).limit(1))[0];
}

export async function listConnectors(tenantId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformConnectors).where(eq(platformConnectors.tenantId, tenantId)).orderBy(desc(platformConnectors.createdAt));
}

/** Control-plane view: tenants with their keys (never raw values) and agent counts. */
export async function listTenantsWithKeys() {
  const db = await getDb();
  if (!db) return [];
  const [tenants, keys, agents] = await Promise.all([
    db.select().from(platformTenants).orderBy(desc(platformTenants.createdAt)),
    db.select().from(platformApiKeys),
    db.select({ id: platformAgents.id, tenantId: platformAgents.tenantId, name: platformAgents.name }).from(platformAgents),
  ]);
  return tenants.map(tenant => ({
    ...tenant,
    agents: agents.filter(agent => agent.tenantId === tenant.id).map(agent => ({ id: agent.id, name: agent.name })),
    keys: keys.filter(key => key.tenantId === tenant.id).map(key => ({ id: key.id, label: key.label, keyPrefix: key.keyPrefix, revokedAt: key.revokedAt, lastUsedAt: key.lastUsedAt, createdAt: key.createdAt })),
  }));
}

/** Revoke all active keys of a tenant and issue one fresh key. The raw value is
 * returned exactly once — it is stored hashed, so losing it means rotating again. */
export async function rotateTenantKey(tenantId: string, label = "rotated") {
  const db = await getDb();
  if (!db) return { tenantId, label, key: "", warning: "demo-mode" as const };
  const tenant = (await db.select({ id: platformTenants.id }).from(platformTenants).where(eq(platformTenants.id, tenantId)).limit(1))[0];
  if (!tenant) return { tenantId, label, key: "", notFound: true as const };
  const now = new Date();
  await db.update(platformApiKeys).set({ revokedAt: now }).where(and(eq(platformApiKeys.tenantId, tenantId), sql`${platformApiKeys.revokedAt} IS NULL`));
  return await createTenantApiKey(tenantId, label);
}

export async function revokeTenantKey(tenantId: string, keyId: string) {
  const db = await getDb();
  if (!db) return { revoked: 0 };
  const rows = await db.update(platformApiKeys).set({ revokedAt: new Date() }).where(and(eq(platformApiKeys.id, keyId), eq(platformApiKeys.tenantId, tenantId), sql`${platformApiKeys.revokedAt} IS NULL`)).returning({ id: platformApiKeys.id });
  return { revoked: rows.length };
}

export async function setTenantStatus(tenantId: string, status: "active" | "suspended" | "deleted") {
  const db = await getDb();
  if (!db) return { updated: 0 };
  const rows = await db.update(platformTenants).set({ status }).where(eq(platformTenants.id, tenantId)).returning({ id: platformTenants.id });
  return { updated: rows.length };
}

export async function listRecentRuns(tenantId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: platformRuns.id, status: platformRuns.status, error: platformRuns.error, input: platformRuns.input, tokensUsed: platformRuns.tokensUsed, traceId: platformRuns.traceId, createdAt: platformRuns.createdAt }).from(platformRuns).where(eq(platformRuns.tenantId, tenantId)).orderBy(desc(platformRuns.createdAt)).limit(limit);
  // Input is truncated for the control-plane view; the full value stays in the row.
  return rows.map(row => ({ ...row, input: row.input.slice(0, 120) }));
}

export async function listAgentVersions(tenantId: string, agentId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: platformAgentVersions.id, version: platformAgentVersions.version, systemPrompt: platformAgentVersions.systemPrompt, status: platformAgentVersions.status, createdAt: platformAgentVersions.createdAt }).from(platformAgentVersions).innerJoin(platformAgents, eq(platformAgents.id, platformAgentVersions.agentId)).where(and(eq(platformAgentVersions.agentId, agentId), eq(platformAgents.tenantId, tenantId))).orderBy(desc(platformAgentVersions.createdAt));
}

/** Append-only versioning: publishing creates a new version (latest wins at runtime),
 * and rollback copies an old prompt forward as a new version so history is never rewritten.
 * Every publish/rollback is audited as a production deployment row. */
export async function createAgentVersion(input: { tenantId: string; agentId: string; version: string; systemPrompt: string }) {
  const db = await getDb();
  const id = newId();
  if (!db) return { id, ...input, status: "draft" as const };
  const agent = (await db.select({ id: platformAgents.id }).from(platformAgents).where(and(eq(platformAgents.id, input.agentId), eq(platformAgents.tenantId, input.tenantId))).limit(1))[0];
  if (!agent) return { id, notFound: true as const };
  await db.insert(platformAgentVersions).values({ id, agentId: input.agentId, version: input.version.slice(0, 32), systemPrompt: input.systemPrompt, config: "{}", status: "published" });
  await db.insert(platformDeployments).values({ id: newId(), tenantId: input.tenantId, agentId: input.agentId, agentVersionId: id, environment: "production", status: "active" });
  return (await db.select().from(platformAgentVersions).where(eq(platformAgentVersions.id, id)).limit(1))[0];
}

export async function resolveConversation(input: { tenantId: string; agentId: string; conversationId?: string; externalSessionId?: string }) {
  const db = await getDb();
  if (!db) return { id: input.conversationId ?? newId(), messages: [] as Array<{ role: "user" | "assistant" | "tool"; content: string }> };
  let conversation = input.conversationId
    ? (await db.select().from(platformConversations).where(and(eq(platformConversations.id, input.conversationId), eq(platformConversations.tenantId, input.tenantId), eq(platformConversations.agentId, input.agentId))).limit(1))[0]
    : undefined;
  if (!conversation && input.externalSessionId) {
    conversation = (await db.select().from(platformConversations).where(and(eq(platformConversations.tenantId, input.tenantId), eq(platformConversations.agentId, input.agentId), eq(platformConversations.externalSessionId, input.externalSessionId), eq(platformConversations.status, "active"))).orderBy(desc(platformConversations.updatedAt)).limit(1))[0];
  }
  if (!conversation) {
    const id = newId();
    await db.insert(platformConversations).values({ id, tenantId: input.tenantId, agentId: input.agentId, externalSessionId: input.externalSessionId });
    conversation = (await db.select().from(platformConversations).where(and(eq(platformConversations.id, id), eq(platformConversations.tenantId, input.tenantId))).limit(1))[0];
  }
  const messages = conversation ? await db.select({ role: platformMessages.role, content: platformMessages.content }).from(platformMessages).where(and(eq(platformMessages.conversationId, conversation.id), eq(platformMessages.tenantId, input.tenantId))).orderBy(desc(platformMessages.createdAt)).limit(12) : [];
  return { id: conversation?.id ?? newId(), messages: messages.reverse() };
}

export async function appendMessage(input: { tenantId: string; conversationId: string; role: "user" | "assistant" | "tool"; content: string; tokensUsed?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(platformMessages).values({ id: newId(), tenantId: input.tenantId, conversationId: input.conversationId, role: input.role, content: input.content, tokensUsed: input.tokensUsed });
  await db.update(platformConversations).set({ updatedAt: new Date() }).where(and(eq(platformConversations.id, input.conversationId), eq(platformConversations.tenantId, input.tenantId)));
}
