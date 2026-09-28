import { z } from "zod";
import { registerPlatformTool } from "./runtime";
import type { PlatformTool } from "./contracts";

const systemStatus: PlatformTool = {
  describe: () => ({ name: "get_system_status", description: "Read-only status lookup for the connected customer system.", inputSchema: { type: "object", properties: { systemId: { type: "string" } }, required: ["systemId"], additionalProperties: false }, enabled: true, requiresApproval: false, risk: "read" }),
  validate: input => z.object({ systemId: z.string().min(1) }).parse(input),
  authorize: async () => "allow",
  execute: async (_ctx, input) => ({ status: "success", verified: true, output: { systemId: input.systemId, status: "connected", checkedAt: new Date().toISOString(), note: "Adapter contract ready for the customer system." } }),
  verify: async (_ctx, _input, result) => result.status === "success",
};

const supportHandoff: PlatformTool = {
  describe: () => ({ name: "create_support_ticket", description: "Create a human support handoff with a structured summary. Never execute without user or policy approval.", inputSchema: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high", "urgent"] } }, required: ["title", "summary"], additionalProperties: false }, enabled: true, requiresApproval: true, risk: "safe_action" }),
  validate: input => z.object({ title: z.string().min(4), summary: z.string().min(10), priority: z.enum(["low", "medium", "high", "urgent"]).optional() }).parse(input),
  authorize: async () => "approval_required",
  execute: async () => ({ status: "failed", error: "approval_required" }),
};

registerPlatformTool(systemStatus);
registerPlatformTool(supportHandoff);
