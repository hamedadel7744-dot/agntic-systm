CREATE TABLE `agentTools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`systemId` int,
	`name` varchar(128) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL DEFAULT 'قراءة',
	`permissionLevel` enum('read','safe_action','sensitive') NOT NULL DEFAULT 'read',
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentTools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`systemId` int,
	`action` varchar(128) NOT NULL,
	`actorType` varchar(32) NOT NULL,
	`actorLabel` varchar(128),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`systemId` int,
	`externalUserId` varchar(128),
	`userName` varchar(128),
	`channel` enum('widget','dashboard','api') NOT NULL DEFAULT 'widget',
	`status` enum('active','resolved','handoff') NOT NULL DEFAULT 'active',
	`title` varchar(255),
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`systemId` int,
	`title` varchar(255) NOT NULL,
	`sourceType` enum('guide','faq','policy','api','video') NOT NULL DEFAULT 'guide',
	`status` enum('indexed','processing','needs_review') NOT NULL DEFAULT 'indexed',
	`chunks` int NOT NULL DEFAULT 0,
	`lastIndexedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledgeSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`confidence` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `systems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`market` varchar(128) NOT NULL,
	`description` text,
	`status` enum('connected','attention','offline') NOT NULL DEFAULT 'connected',
	`accent` varchar(16) NOT NULL DEFAULT '#35c29a',
	`apiBaseUrl` varchar(255),
	`activeUsers` int NOT NULL DEFAULT 0,
	`knowledgeCount` int NOT NULL DEFAULT 0,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systems_id` PRIMARY KEY(`id`),
	CONSTRAINT `systems_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32) NOT NULL,
	`systemId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL DEFAULT 'استخدام',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','waiting','resolved') NOT NULL DEFAULT 'open',
	`requesterName` varchar(128),
	`requesterEmail` varchar(320),
	`assignee` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`resolvedAt` timestamp,
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `tickets_number_unique` UNIQUE(`number`)
);
