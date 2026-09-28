import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { platformAgents, platformAgentVersions, platformApiKeys, platformConnectors, platformConversations, platformDeployments, platformEvents, platformKnowledge, platformMessages, platformRuns, platformTenants, platformToolCalls, platformUsage } from "../../drizzle/schema";
import { hashApiKey, newId, safeJson } from "./identity";

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

export async function chargeUsage(tenantId: string, tokens: number, toolCalls = 0) {
  const db = await getDb();
  if (!db) return { allowed: true, used: tokens, quota: 100000, cap: 120000, warning: false, overageTokens: 0 };
  const tenant = (await db.select().from(platformTenants).where(eq(platformTenants.id, tenantId)).limit(1))[0];
  if (!tenant) return { allowed: false, reason: "tenant_not_found" };
  const next = tenant.tokenUsedThisCycle + tokens;
  if (next > tenant.hardCap) return { allowed: false, reason: "hard_cap_reached", message: "تم إيقاف الطلب لأن الحساب وصل إلى الحد الأقصى 120% من الباقة.", used: tenant.tokenUsedThisCycle, quota: tenant.tokenQuota, cap: tenant.hardCap };
  await db.update(platformTenants).set({ tokenUsedThisCycle: next }).where(eq(platformTenants.id, tenantId));
  const usageId = `${tenantId}-${tenant.billingCycleStart.getTime()}`;
  await db.insert(platformUsage).values({ id: usageId, tenantId, cycleStart: tenant.billingCycleStart, cycleEnd: new Date(tenant.billingCycleStart.getTime() + 30 * 86400000), tokens, requests: 1, toolCalls }).onDuplicateKeyUpdate({ set: { tokens: sql`${platformUsage.tokens} + ${tokens}`, requests: sql`${platformUsage.requests} + 1`, toolCalls: sql`${platformUsage.toolCalls} + ${toolCalls}` } });
  return { allowed: true, used: next, quota: tenant.tokenQuota, cap: tenant.hardCap, warning: next >= tenant.tokenQuota * 0.8, overageTokens: Math.max(0, next - tenant.tokenQuota) };
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
  await db.insert(platformKnowledge).values({ id, tenantId: input.tenantId, agentId: input.agentId, title: input.title, content: input.content, contentHash: hashApiKey(input.content), sourceType: input.sourceType ?? "doc" });
  return (await db.select().from(platformKnowledge).where(and(eq(platformKnowledge.id, id), eq(platformKnowledge.tenantId, input.tenantId))).limit(1))[0];
}

export async function searchKnowledge(tenantId: string, agentId: string, query: string) {
  const db = await getDb();
  if (!db) return [];
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
