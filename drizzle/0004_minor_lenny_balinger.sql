CREATE TABLE `platformConversations` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`agentId` varchar(36) NOT NULL,
	`externalSessionId` varchar(255),
	`status` enum('active','closed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platformConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformMessages` (
	`id` varchar(36) NOT NULL,
	`conversationId` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`role` enum('user','assistant','tool') NOT NULL,
	`content` text NOT NULL,
	`tokensUsed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `platformRuns` ADD `conversationKey` varchar(36);