CREATE TABLE `platformActions` (
	`id` varchar(36) NOT NULL,
	`runId` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`kind` varchar(128) NOT NULL,
	`proposal` text NOT NULL,
	`status` enum('proposed','authorized','denied','executed','verified','failed') NOT NULL DEFAULT 'proposed',
	`requiresApproval` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformAgentVersions` (
	`id` varchar(36) NOT NULL,
	`agentId` varchar(36) NOT NULL,
	`version` varchar(32) NOT NULL,
	`systemPrompt` text NOT NULL,
	`config` text NOT NULL,
	`status` enum('draft','validated','published','retired') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformAgentVersions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformAgents` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`status` enum('draft','active','paused') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platformAgents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformApiKeys` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`label` varchar(128) NOT NULL,
	`keyHash` varchar(128) NOT NULL,
	`keyPrefix` varchar(16) NOT NULL,
	`revokedAt` timestamp,
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformApiKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `platformApiKeys_keyHash_unique` UNIQUE(`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `platformDeployments` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`agentId` varchar(36) NOT NULL,
	`agentVersionId` varchar(36) NOT NULL,
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`status` enum('active','paused','rolled_back') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformDeployments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformEvents` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`runId` varchar(36),
	`eventType` varchar(128) NOT NULL,
	`payload` text NOT NULL,
	`traceId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformKnowledge` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`agentId` varchar(36) NOT NULL,
	`sourceType` enum('doc','faq','url') NOT NULL DEFAULT 'doc',
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`contentHash` varchar(128) NOT NULL,
	`status` enum('active','processing','needs_review') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformKnowledge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformRuns` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`agentId` varchar(36) NOT NULL,
	`deploymentId` varchar(36),
	`conversationId` int,
	`status` enum('queued','running','waiting_approval','succeeded','failed','cancelled') NOT NULL DEFAULT 'queued',
	`input` text NOT NULL,
	`output` text,
	`error` text,
	`traceId` varchar(36) NOT NULL,
	`tokensUsed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `platformRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformTenants` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`plan` enum('basic','pro','enterprise') NOT NULL DEFAULT 'basic',
	`tokenQuota` int NOT NULL DEFAULT 100000,
	`tokenUsedThisCycle` int NOT NULL DEFAULT 0,
	`hardCap` int NOT NULL DEFAULT 120000,
	`billingCycleStart` timestamp NOT NULL DEFAULT (now()),
	`status` enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformTenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformToolCalls` (
	`id` varchar(36) NOT NULL,
	`runId` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`toolName` varchar(128) NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`status` enum('pending','success','failed','denied') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformToolCalls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformUsage` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`cycleStart` timestamp NOT NULL,
	`cycleEnd` timestamp NOT NULL,
	`tokens` int NOT NULL DEFAULT 0,
	`requests` int NOT NULL DEFAULT 0,
	`toolCalls` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platformUsage_id` PRIMARY KEY(`id`)
);
