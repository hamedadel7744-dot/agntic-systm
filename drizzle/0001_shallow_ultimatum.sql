CREATE INDEX "idx_platformAgentVersions_agentId" ON "platformAgentVersions" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "idx_platformApiKeys_tenantId" ON "platformApiKeys" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "idx_platformConversations_tenantId" ON "platformConversations" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "idx_platformEvents_tenant_created" ON "platformEvents" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "idx_platformKnowledge_tenant_agent" ON "platformKnowledge" USING btree ("tenantId","agentId");--> statement-breakpoint
CREATE INDEX "idx_platformMessages_conversation" ON "platformMessages" USING btree ("conversationId","tenantId");--> statement-breakpoint
CREATE INDEX "idx_platformRuns_tenant_created" ON "platformRuns" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "idx_platformToolCalls_tenant_run" ON "platformToolCalls" USING btree ("tenantId","runId");--> statement-breakpoint
CREATE INDEX "idx_platformUsage_tenantId" ON "platformUsage" USING btree ("tenantId");