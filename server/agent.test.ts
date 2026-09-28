import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("agent dashboard contract", () => {
  it("returns a snapshot with four systems and operating metrics", async () => {
    const caller = appRouter.createCaller(createContext());
    const snapshot = await caller.dashboard.snapshot();

    expect(snapshot.systems.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.metrics).toMatchObject({
      resolutionRate: expect.any(Number),
      avgResponse: expect.any(String),
    });
    expect(snapshot.tickets[0]).toHaveProperty("number");
  });

  it("returns ticket records with status and priority fields", async () => {
    const caller = appRouter.createCaller(createContext());
    const tickets = await caller.tickets.list();

    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets[0]).toEqual(expect.objectContaining({
      number: expect.any(String),
      title: expect.any(String),
      status: expect.any(String),
      priority: expect.any(String),
    }));
  });

  it("returns knowledge sources grouped for the agent", async () => {
    const caller = appRouter.createCaller(createContext());
    const knowledge = await caller.knowledge.list();

    expect(knowledge.length).toBeGreaterThan(0);
    expect(knowledge[0]).toEqual(expect.objectContaining({
      title: expect.any(String),
      sourceType: expect.any(String),
      status: expect.any(String),
    }));
  });
});
