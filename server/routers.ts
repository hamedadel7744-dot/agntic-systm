import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { addAuditLog, createTicket, getDashboardSnapshot, getDb, listKnowledgeSources, listSystems, listTickets } from "./db";
import { resolveDefaultAgent } from "./platform/db";
import { addKnowledge, createAgent, createConnector, createTenant, createTenantApiKey, findTenantByApiKey, listConnectors, listPlatformOverview } from "./platform/db";
import { runDiagnostics } from "./platform/diagnostics";
import { executeRun, listPlatformTools } from "./platform/runtime";
import "./platform/default-tools";

const chatMessageSchema = z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() });
const tenantInput = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid() });

function fallbackAnswer(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("تذكرة") || normalized.includes("دعم")) return "أقدر أفتح لك تذكرة دعم الآن. اكتب اسم النظام ووصف المشكلة وسأرسلها للفريق المختص.";
  if (normalized.includes("طلب") || normalized.includes("orders")) return "للتأكد من الطلبات الجديدة: افتح لوحة الطلبات، فعّل فلتر آخر 24 ساعة، ثم راجع حالة المزامنة.";
  return "أنا جاهز أساعدك في شرح النظام، قراءة حالة الحساب، أو فتح تذكرة للدعم.";
}

export const appRouter = router({
  system: systemRouter,
  diagnostics: router({
    // public by design: the report contains statuses, latencies and error text only — never secret values
    report: publicProcedure.input(z.object({ force: z.boolean().optional() }).optional()).query(({ input }) => runDiagnostics({ force: input?.force })),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({ snapshot: publicProcedure.query(() => getDashboardSnapshot()) }),
  systems: router({ list: publicProcedure.query(() => listSystems()) }),
  tickets: router({
    list: publicProcedure.query(() => listTickets()),
    create: publicProcedure.input(z.object({ systemId: z.number().optional(), title: z.string().min(4), description: z.string().optional(), category: z.string().optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), requesterName: z.string().optional(), requesterEmail: z.string().email().optional().or(z.literal("")) })).mutation(async ({ input }) => {
      const ticket = await createTicket({ ...input, requesterEmail: input.requesterEmail || undefined });
      await addAuditLog({ systemId: input.systemId, action: "ticket.created", actorType: "agent", actorLabel: "لوحة الدعم", details: input.title });
      return ticket;
    }),
  }),
  knowledge: router({ list: publicProcedure.query(() => listKnowledgeSources()) }),
  ai: router({
    chat: publicProcedure.input(z.object({ systemId: z.number().optional(), message: z.string().min(1), history: z.array(chatMessageSchema).max(12).optional(), currentPage: z.string().optional() })).mutation(async ({ input }) => {
      const history = input.history ?? [];
      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: `أنت وكيل دعم ذكي. أجب بالعربية المصرية الواضحة وباختصار عملي. النظام الحالي رقم ${input.systemId ?? "غير محدد"}. الصفحة الحالية: ${input.currentPage ?? "غير محددة"}. لا تخترع بيانات.` }, ...history, { role: "user", content: input.message }] });
        const content = response.choices?.[0]?.message?.content;
        return { answer: typeof content === "string" ? content : fallbackAnswer(input.message), confidence: 86 };
      } catch (error) {
        // Even the demo fallback must be honest about why it fired.
        const reason = error instanceof Error ? error.message : "llm_unavailable";
        console.warn("[ai.chat] LLM unavailable, degraded fallback:", reason);
        return { answer: `${fallbackAnswer(input.message)}\n\n(إجابة احتياطية: النموذج اللغوي غير متاح حاليًا — ${reason.slice(0, 140)})`, confidence: 62 };
      }
    }),
  }),
  platform: router({
    tools: publicProcedure.query(() => listPlatformTools()),
    bootstrap: adminProcedure.input(z.object({ name: z.string().min(2), plan: z.enum(["basic", "pro", "enterprise"]).optional() })).mutation(async ({ input }) => {
      const tenant = await createTenant({ name: input.name, plan: input.plan });
      const key = await createTenantApiKey(tenant.id, "initial");
      const agent = await createAgent({ tenantId: tenant.id, name: "Support Agent", description: "Default customer support agent", systemPrompt: "You are a safe, helpful support agent. Use available knowledge and approved tools only." });
      return { tenant, apiKey: key, agent };
    }),
    overview: adminProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ input }) => listPlatformOverview(input.tenantId)),
    connectors: adminProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ input }) => listConnectors(input.tenantId)),
    createConnector: adminProcedure.input(z.object({ tenantId: z.string().uuid(), name: z.string().min(2), kind: z.enum(["rest", "graphql", "mcp", "webhook", "internal"]).optional(), baseUrl: z.string().url().optional().or(z.literal("")), capabilities: z.array(z.string()).min(1), secretRef: z.string().optional() })).mutation(({ input }) => createConnector({ ...input, baseUrl: input.baseUrl || undefined })),
    createAgent: adminProcedure.input(z.object({ tenantId: z.string().uuid(), name: z.string().min(2), description: z.string().optional(), systemPrompt: z.string().min(10) })).mutation(({ input }) => createAgent(input)),
    addKnowledge: adminProcedure.input(z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid(), title: z.string().min(2).max(200), content: z.string().min(10).max(200000), sourceType: z.enum(["doc", "faq", "url"]).optional() })).mutation(({ input }) => addKnowledge(input)),
    run: publicProcedure.input(z.object({ apiKey: z.string().min(10), agentId: z.string().uuid().optional(), input: z.string().min(1).max(8000), conversationId: z.string().uuid().optional(), externalSessionId: z.string().max(255).optional() })).mutation(async ({ input }) => {
      // Loud failure only when the DB is configured but unreachable; in demo mode
      // (no DATABASE_URL) the key check below still runs and demo behavior applies.
      if (process.env.DATABASE_URL && !(await getDb())) return { status: "failed" as const, answer: "قاعدة البيانات مضبوطة لكن غير قابلة للوصول الآن؛ الطلب مرفوض صراحة بدل الفشل الصامت. افتح صفحة صحة النظام للتفاصيل.", runId: "", traceId: "", tokensUsed: 0, toolCalls: 0 };
      const resolved = await findTenantByApiKey(input.apiKey);
      if (!resolved) return { status: "failed" as const, answer: "مفتاح API غير صالح أو tenant غير نشط.", runId: "", traceId: "", tokensUsed: 0, toolCalls: 0 };
      let agentId = input.agentId;
      if (!agentId) {
        const fallback = await resolveDefaultAgent(resolved.tenant.id);
        if (!fallback) return { status: "failed" as const, answer: "لا يوجد وكيل لهذا الحساب بعد — أنشئ وكيلًا من لوحة التحكم أو مرر agentId صريحًا.", runId: "", traceId: "", tokensUsed: 0, toolCalls: 0 };
        agentId = fallback.id;
      }
      return executeRun({ tenantId: resolved.tenant.id, agentId, input: input.input, conversationId: input.conversationId });
    }),
  }),
});

export type AppRouter = typeof appRouter;
