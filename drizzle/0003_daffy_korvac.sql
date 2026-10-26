-- One-time cleanup so the unique index below can build on existing data: the
-- old check-then-insert race may have produced several active conversations
-- for the same (tenantId, agentId, externalSessionId). Keep the newest — the
-- same row the previous "order by updatedAt desc limit 1" lookup resolved to —
-- and close the rest instead of deleting their message history.
UPDATE "platformConversations" SET "status" = 'closed'
WHERE "status" = 'active' AND "externalSessionId" IS NOT NULL
  AND "id" NOT IN (
    SELECT DISTINCT ON ("tenantId", "agentId", "externalSessionId") "id"
    FROM "platformConversations"
    WHERE "status" = 'active' AND "externalSessionId" IS NOT NULL
    ORDER BY "tenantId", "agentId", "externalSessionId", "updatedAt" DESC, "id" DESC
  );--> statement-breakpoint
CREATE UNIQUE INDEX "uq_platformConversations_tenant_agent_session_active" ON "platformConversations" USING btree ("tenantId","agentId","externalSessionId") WHERE "status" = 'active';
