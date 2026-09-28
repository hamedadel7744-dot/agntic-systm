import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createApiKey, hashApiKey } from "./platform/identity";
import { listPlatformTools } from "./platform/runtime";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return { user: undefined, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("platform security contracts", () => {
  it("never stores a raw API key and can verify the hash", () => {
    const generated = createApiKey();
    expect(generated.raw).toMatch(/^nova_/);
    expect(generated.hash).toBe(hashApiKey(generated.raw));
    expect(generated.hash).not.toContain(generated.raw);
  });

  it("rejects a run with an invalid tenant API key before execution", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.platform.run({ apiKey: "invalid_api_key_12345", agentId: "00000000-0000-0000-0000-000000000000", input: "hello" });
    expect(result.status).toBe("failed");
    expect(result.answer).toContain("مفتاح API");
  });

  it("exposes only registered typed tools", () => {
    expect(listPlatformTools().map(tool => tool.name)).toEqual(["get_system_status", "create_support_ticket"]);
    expect(listPlatformTools().find(tool => tool.name === "create_support_ticket")?.requiresApproval).toBe(true);
  });
});
