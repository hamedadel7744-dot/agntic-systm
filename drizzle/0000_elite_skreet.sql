CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE "agentTools" (
	"id" serial PRIMARY KEY NOT NULL,
	"systemId" integer,
	"name" varchar(128) NOT NULL,
	"description" text,
	"category" varchar(64) DEFAULT 'قراءة' NOT NULL,
	"permissionLevel" text DEFAULT 'read' NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"systemId" integer,
	"action" varchar(128) NOT NULL,
	"actorType" varchar(32) NOT NULL,
	"actorLabel" varchar(128),
	"details" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"systemId" integer,
	"externalUserId" varchar(128),
	"userName" varchar(128),
	"channel" text DEFAULT 'widget' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" varchar(255),
	"lastMessageAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledgeSources" (
	"id" serial PRIMARY KEY NOT NULL,
	"systemId" integer,
	"title" varchar(255) NOT NULL,
	"sourceType" text DEFAULT 'guide' NOT NULL,
	"status" text DEFAULT 'indexed' NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"lastIndexedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"confidence" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformActions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"runId" varchar(36) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"kind" varchar(128) NOT NULL,
	"proposal" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"requiresApproval" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformAgentVersions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"version" varchar(32) NOT NULL,
	"systemPrompt" text NOT NULL,
	"config" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformAgents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformApiKeys" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"label" varchar(128) NOT NULL,
	"keyHash" varchar(128) NOT NULL,
	"keyPrefix" varchar(16) NOT NULL,
	"revokedAt" timestamp,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platformApiKeys_keyHash_unique" UNIQUE("keyHash")
);
--> statement-breakpoint
CREATE TABLE "platformConnectors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(128) NOT NULL,
	"kind" text DEFAULT 'rest' NOT NULL,
	"baseUrl" varchar(255),
	"status" text DEFAULT 'draft' NOT NULL,
	"capabilities" text NOT NULL,
	"secretRef" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformConversations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"externalSessionId" varchar(255),
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformDeployments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"agentVersionId" varchar(36) NOT NULL,
	"environment" text DEFAULT 'development' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformEvents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"runId" varchar(36),
	"eventType" varchar(128) NOT NULL,
	"payload" text NOT NULL,
	"traceId" varchar(36),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformKnowledge" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"sourceType" text DEFAULT 'doc' NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"contentHash" varchar(128) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"embedding" vector(1536),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformMessages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"conversationId" varchar(36) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tokensUsed" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformRuns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"deploymentId" varchar(36),
	"conversationId" integer,
	"conversationKey" varchar(36),
	"status" text DEFAULT 'queued' NOT NULL,
	"input" text NOT NULL,
	"output" text,
	"error" text,
	"traceId" varchar(36) NOT NULL,
	"tokensUsed" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "platformTenants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"plan" text DEFAULT 'basic' NOT NULL,
	"tokenQuota" integer DEFAULT 100000 NOT NULL,
	"tokenUsedThisCycle" integer DEFAULT 0 NOT NULL,
	"hardCap" integer DEFAULT 120000 NOT NULL,
	"billingCycleStart" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformToolCalls" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"runId" varchar(36) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"toolName" varchar(128) NOT NULL,
	"input" text NOT NULL,
	"output" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platformUsage" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"cycleStart" timestamp NOT NULL,
	"cycleEnd" timestamp NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"toolCalls" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"market" varchar(128) NOT NULL,
	"description" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"accent" varchar(16) DEFAULT '#35c29a' NOT NULL,
	"apiBaseUrl" varchar(255),
	"activeUsers" integer DEFAULT 0 NOT NULL,
	"knowledgeCount" integer DEFAULT 0 NOT NULL,
	"lastSyncAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "systems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(32) NOT NULL,
	"systemId" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(64) DEFAULT 'استخدام' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requesterName" varchar(128),
	"requesterEmail" varchar(320),
	"assignee" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp,
	CONSTRAINT "tickets_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
