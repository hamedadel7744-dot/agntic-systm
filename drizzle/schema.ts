import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core identity table used by Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const systems = mysqlTable("systems", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  market: varchar("market", { length: 128 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["connected", "attention", "offline"]).default("connected").notNull(),
  accent: varchar("accent", { length: 16 }).default("#35c29a").notNull(),
  apiBaseUrl: varchar("apiBaseUrl", { length: 255 }),
  activeUsers: int("activeUsers").default(0).notNull(),
  knowledgeCount: int("knowledgeCount").default(0).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  systemId: int("systemId"),
  externalUserId: varchar("externalUserId", { length: 128 }),
  userName: varchar("userName", { length: 128 }),
  channel: mysqlEnum("channel", ["widget", "dashboard", "api"]).default("widget").notNull(),
  status: mysqlEnum("status", ["active", "resolved", "handoff"]).default("active").notNull(),
  title: varchar("title", { length: 255 }),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  confidence: int("confidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tickets = mysqlTable("tickets", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 32 }).notNull().unique(),
  systemId: int("systemId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).default("استخدام").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "waiting", "resolved"]).default("open").notNull(),
  requesterName: varchar("requesterName", { length: 128 }),
  requesterEmail: varchar("requesterEmail", { length: 320 }),
  assignee: varchar("assignee", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export const knowledgeSources = mysqlTable("knowledgeSources", {
  id: int("id").autoincrement().primaryKey(),
  systemId: int("systemId"),
  title: varchar("title", { length: 255 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["guide", "faq", "policy", "api", "video"]).default("guide").notNull(),
  status: mysqlEnum("status", ["indexed", "processing", "needs_review"]).default("indexed").notNull(),
  chunks: int("chunks").default(0).notNull(),
  lastIndexedAt: timestamp("lastIndexedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const agentTools = mysqlTable("agentTools", {
  id: int("id").autoincrement().primaryKey(),
  systemId: int("systemId"),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).default("قراءة").notNull(),
  permissionLevel: mysqlEnum("permissionLevel", ["read", "safe_action", "sensitive"]).default("read").notNull(),
  enabled: int("enabled").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  systemId: int("systemId"),
  action: varchar("action", { length: 128 }).notNull(),
  actorType: varchar("actorType", { length: 32 }).notNull(),
  actorLabel: varchar("actorLabel", { length: 128 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type System = typeof systems.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;

// Platform Phase 0 primitives. These tables intentionally use a separate namespace
// from the original dashboard tables so the migration is reversible and safe.
export const platformTenants = mysqlTable("platformTenants", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  plan: mysqlEnum("plan", ["basic", "pro", "enterprise"]).default("basic").notNull(),
  tokenQuota: int("tokenQuota").default(100000).notNull(),
  tokenUsedThisCycle: int("tokenUsedThisCycle").default(0).notNull(),
  hardCap: int("hardCap").default(120000).notNull(),
  billingCycleStart: timestamp("billingCycleStart").defaultNow().notNull(),
  status: mysqlEnum("status", ["active", "suspended", "deleted"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformApiKeys = mysqlTable("platformApiKeys", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  keyHash: varchar("keyHash", { length: 128 }).notNull().unique(),
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
  revokedAt: timestamp("revokedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformAgents = mysqlTable("platformAgents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "active", "paused"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const platformAgentVersions = mysqlTable("platformAgentVersions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  systemPrompt: text("systemPrompt").notNull(),
  config: text("config").notNull(),
  status: mysqlEnum("status", ["draft", "validated", "published", "retired"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformDeployments = mysqlTable("platformDeployments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  agentVersionId: varchar("agentVersionId", { length: 36 }).notNull(),
  environment: mysqlEnum("environment", ["development", "staging", "production"]).default("development").notNull(),
  status: mysqlEnum("status", ["active", "paused", "rolled_back"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformRuns = mysqlTable("platformRuns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  deploymentId: varchar("deploymentId", { length: 36 }),
  conversationId: int("conversationId"),
  conversationKey: varchar("conversationKey", { length: 36 }),
  status: mysqlEnum("status", ["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]).default("queued").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  error: text("error"),
  traceId: varchar("traceId", { length: 36 }).notNull(),
  tokensUsed: int("tokensUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const platformActions = mysqlTable("platformActions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("runId", { length: 36 }).notNull(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  kind: varchar("kind", { length: 128 }).notNull(),
  proposal: text("proposal").notNull(),
  status: mysqlEnum("status", ["proposed", "authorized", "denied", "executed", "verified", "failed"]).default("proposed").notNull(),
  requiresApproval: int("requiresApproval").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformToolCalls = mysqlTable("platformToolCalls", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("runId", { length: 36 }).notNull(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  toolName: varchar("toolName", { length: 128 }).notNull(),
  input: text("input").notNull(),
  output: text("output"),
  status: mysqlEnum("status", ["pending", "success", "failed", "denied"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformKnowledge = mysqlTable("platformKnowledge", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["doc", "faq", "url"]).default("doc").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  contentHash: varchar("contentHash", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["active", "processing", "needs_review"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformUsage = mysqlTable("platformUsage", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  cycleStart: timestamp("cycleStart").notNull(),
  cycleEnd: timestamp("cycleEnd").notNull(),
  tokens: int("tokens").default(0).notNull(),
  requests: int("requests").default(0).notNull(),
  toolCalls: int("toolCalls").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const platformEvents = mysqlTable("platformEvents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  runId: varchar("runId", { length: 36 }),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  payload: text("payload").notNull(),
  traceId: varchar("traceId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformConnectors = mysqlTable("platformConnectors", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  kind: mysqlEnum("kind", ["rest", "graphql", "mcp", "webhook", "internal"]).default("rest").notNull(),
  baseUrl: varchar("baseUrl", { length: 255 }),
  status: mysqlEnum("status", ["draft", "connected", "attention", "disabled"]).default("draft").notNull(),
  capabilities: text("capabilities").notNull(),
  secretRef: varchar("secretRef", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const platformConversations = mysqlTable("platformConversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  externalSessionId: varchar("externalSessionId", { length: 255 }),
  status: mysqlEnum("status", ["active", "closed"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const platformMessages = mysqlTable("platformMessages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 36 }).notNull(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant", "tool"]).notNull(),
  content: text("content").notNull(),
  tokensUsed: int("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
