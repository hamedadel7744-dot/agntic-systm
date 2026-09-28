CREATE TABLE `platformConnectors` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`kind` enum('rest','graphql','mcp','webhook','internal') NOT NULL DEFAULT 'rest',
	`baseUrl` varchar(255),
	`status` enum('draft','connected','attention','disabled') NOT NULL DEFAULT 'draft',
	`capabilities` text NOT NULL,
	`secretRef` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platformConnectors_id` PRIMARY KEY(`id`)
);
