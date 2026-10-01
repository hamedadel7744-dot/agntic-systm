import { index, integer, pgTable, serial, text, timestamp, varchar, vector } from "drizzle-orm/pg-core";

/** Core identity table used by Manus OAuth. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: text("role").$type<"user" | "admin">().default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const systems = pgTable("systems", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  market: varchar("market", { length: 128 }).notNull(),
  description: text("description"),
  status: text("status").$type<"connected" | "attention" | "offline">().default("connected").notNull(),
  accent: varchar("accent", { length: 16 }).default("#35c29a").notNull(),
  apiBaseUrl: varchar("apiBaseUrl", { length: 255 }),
  activeUsers: integer("activeUsers").default(0).notNull(),
  knowledgeCount: integer("knowledgeCount").default(0).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  systemId: integer("systemId"),
  externalUserId: varchar("externalUserId", { length: 128 }),
  userName: varchar("userName", { length: 128 }),
  channel: text("channel").$type<"widget" | "dashboard" | "api">().default("widget").notNull(),
  status: text("status").$type<"active" | "resolved" | "handoff">().default("active").notNull(),
  title: varchar("title", { length: 255 }),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  role: text("role").$type<"user" | "assistant" | "system">().notNull(),
  content: text("content").notNull(),
  confidence: integer("confidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 32 }).notNull().unique(),
  systemId: integer("systemId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).default("استخدام").notNull(),
  priority: text("priority").$type<"low" | "medium" | "high" | "urgent">().default("medium").notNull(),
  status: text("status").$type<"open" | "in_progress" | "waiting" | "resolved">().default("open").notNull(),
  requesterName: varchar("requesterName", { length: 128 }),
  requesterEmail: varchar("requesterEmail", { length: 320 }),
  assignee: varchar("assignee", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export const knowledgeSources = pgTable("knowledgeSources", {
  id: serial("id").primaryKey(),
  systemId: integer("systemId"),
  title: varchar("title", { length: 255 }).notNull(),
  sourceType: text("sourceType").$type<"guide" | "faq" | "policy" | "api" | "video">().default("guide").notNull(),
  status: text("status").$type<"indexed" | "processing" | "needs_review">().default("indexed").notNull(),
  chunks: integer("chunks").default(0).notNull(),
  lastIndexedAt: timestamp("lastIndexedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const agentTools = pgTable("agentTools", {
  id: serial("id").primaryKey(),
  systemId: integer("systemId"),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).default("قراءة").notNull(),
  permissionLevel: text("permissionLevel").$type<"read" | "safe_action" | "sensitive">().default("read").notNull(),
  enabled: integer("enabled").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  systemId: integer("systemId"),
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
export const platformTenants = pgTable("platformTenants", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  plan: text("plan").$type<"basic" | "pro" | "enterprise">().default("basic").notNull(),
  tokenQuota: integer("tokenQuota").default(100000).notNull(),
  tokenUsedThisCycle: integer("tokenUsedThisCycle").default(0).notNull(),
  hardCap: integer("hardCap").default(120000).notNull(),
  billingCycleStart: timestamp("billingCycleStart").defaultNow().notNull(),
  status: text("status").$type<"active" | "suspended" | "deleted">().default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformApiKeys = pgTable("platformApiKeys", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  keyHash: varchar("keyHash", { length: 128 }).notNull().unique(),
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
  revokedAt: timestamp("revokedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformApiKeys_tenantId").on(table.tenantId),
]);

export const platformAgents = pgTable("platformAgents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  status: text("status").$type<"draft" | "active" | "paused">().default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const platformAgentVersions = pgTable("platformAgentVersions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  systemPrompt: text("systemPrompt").notNull(),
  config: text("config").notNull(),
  status: text("status").$type<"draft" | "validated" | "published" | "retired">().default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformAgentVersions_agentId").on(table.agentId),
]);

export const platformDeployments = pgTable("platformDeployments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  agentVersionId: varchar("agentVersionId", { length: 36 }).notNull(),
  environment: text("environment").$type<"development" | "staging" | "production">().default("development").notNull(),
  status: text("status").$type<"active" | "paused" | "rolled_back">().default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformRuns = pgTable("platformRuns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  deploymentId: varchar("deploymentId", { length: 36 }),
  conversationId: integer("conversationId"),
  conversationKey: varchar("conversationKey", { length: 36 }),
  status: text("status").$type<"queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled">().default("queued").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  error: text("error"),
  traceId: varchar("traceId", { length: 36 }).notNull(),
  tokensUsed: integer("tokensUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [
  index("idx_platformRuns_tenant_created").on(table.tenantId, table.createdAt),
]);

export const platformActions = pgTable("platformActions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("runId", { length: 36 }).notNull(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  kind: varchar("kind", { length: 128 }).notNull(),
  proposal: text("proposal").notNull(),
  status: text("status").$type<"proposed" | "authorized" | "denied" | "executed" | "verified" | "failed">().default("proposed").notNull(),
  requiresApproval: integer("requiresApproval").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformToolCalls = pgTable("platformToolCalls", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("runId", { length: 36 }).notNull(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  toolName: varchar("toolName", { length: 128 }).notNull(),
  input: text("input").notNull(),
  output: text("output"),
  status: text("status").$type<"pending" | "success" | "failed" | "denied">().default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformToolCalls_tenant_run").on(table.tenantId, table.runId),
]);

export const platformKnowledge = pgTable("platformKnowledge", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  sourceType: text("sourceType").$type<"doc" | "faq" | "url">().default("doc").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  contentHash: varchar("contentHash", { length: 128 }).notNull(),
  status: text("status").$type<"active" | "processing" | "needs_review">().default("active").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformKnowledge_tenant_agent").on(table.tenantId, table.agentId),
]);

export const platformUsage = pgTable("platformUsage", {
  // usage ids are `${tenantId}-${cycleStartMs}` which exceeds 36 chars, so keep headroom
  id: varchar("id", { length: 128 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  cycleStart: timestamp("cycleStart").notNull(),
  cycleEnd: timestamp("cycleEnd").notNull(),
  tokens: integer("tokens").default(0).notNull(),
  requests: integer("requests").default(0).notNull(),
  toolCalls: integer("toolCalls").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformUsage_tenantId").on(table.tenantId),
]);

export const platformEvents = pgTable("platformEvents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  runId: varchar("runId", { length: 36 }),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  payload: text("payload").notNull(),
  traceId: varchar("traceId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformEvents_tenant_created").on(table.tenantId, table.createdAt),
]);

export const platformConnectors = pgTable("platformConnectors", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  kind: text("kind").$type<"rest" | "graphql" | "mcp" | "webhook" | "internal">().default("rest").notNull(),
  baseUrl: varchar("baseUrl", { length: 255 }),
  status: text("status").$type<"draft" | "connected" | "attention" | "disabled">().default("draft").notNull(),
  capabilities: text("capabilities").notNull(),
  secretRef: varchar("secretRef", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const platformConversations = pgTable("platformConversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  agentId: varchar("agentId", { length: 36 }).notNull(),
  externalSessionId: varchar("externalSessionId", { length: 255 }),
  status: text("status").$type<"active" | "closed">().default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformConversations_tenantId").on(table.tenantId),
]);

export const platformMessages = pgTable("platformMessages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 36 }).notNull(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  role: text("role").$type<"user" | "assistant" | "tool">().notNull(),
  content: text("content").notNull(),
  tokensUsed: integer("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_platformMessages_conversation").on(table.conversationId, table.tenantId),
]);
