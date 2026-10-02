import { invokeLLM } from "../_core/llm";
import { appendMessage, createRun, getAgentScoped, recordEvent, recordToolCall, updateRun, chargeUsage, resolveConversation, searchKnowledge } from "./db";
import { newId, safeJson } from "./identity";
import type { PlatformTool, RunRequest, RuntimeOutcome, ToolExecutionContext } from "./contracts";

const toolRegistry = new Map<string, PlatformTool>();
export function registerPlatformTool(tool: PlatformTool) { toolRegistry.set(tool.describe().name, tool); }
export function listPlatformTools() { return Array.from(toolRegistry.values()).map(tool => tool.describe()); }

/** The three pillars an agent stands on: knowledge (per agent), model (per version), tool policy (per version). */
export type ToolPolicy = "read" | "execute" | "both";

export function parseAgentConfig(configText: string): { model?: string; toolPolicy: ToolPolicy } {
  try {
    const parsed = JSON.parse(configText || "{}") as { model?: unknown; toolPolicy?: unknown };
    const model = typeof parsed.model === "string" && parsed.model.trim().length > 0 ? parsed.model.trim().slice(0, 100) : undefined;
    const toolPolicy: ToolPolicy = parsed.toolPolicy === "read" || parsed.toolPolicy === "execute" ? parsed.toolPolicy : "both";
    return { model, toolPolicy };
  } catch {
    return { toolPolicy: "both" };
  }
}

/** read → only read-risk tools; execute → only action tools; both → everything. */
export function toolMatchesPolicy(risk: "read" | "safe_action" | "sensitive", policy: ToolPolicy): boolean {
  if (policy === "read") return risk === "read";
  if (policy === "execute") return risk !== "read";
  return true;
}

function redactContext(value: string) {
  return value.replace(/(?:sk|pk|api|token|secret)[_-]?[a-z0-9-]{12,}/gi, "[REDACTED]");
}

export async function executeRun(request: RunRequest): Promise<RuntimeOutcome> {
  const traceId = newId();
  const agent = await getAgentScoped(request.tenantId, request.agentId);
  // Distinct denials with distinct causes — "not found" and "exists without a
  // published version" need different fixes, and both are audited.
  if (!agent?.agent) {
    await recordEvent({ tenantId: request.tenantId, type: "run.rejected", payload: { reason: "agent_not_found", agentId: request.agentId }, traceId });
    return { runId: "", traceId, status: "failed", answer: "الوكيل غير موجود داخل هذا الـ tenant.", tokensUsed: 0, toolCalls: 0 };
  }
  if (!agent.version) {
    await recordEvent({ tenantId: request.tenantId, type: "run.rejected", payload: { reason: "agent_without_version", agentId: request.agentId }, traceId });
    return { runId: "", traceId, status: "failed", answer: "الوكيل موجود لكن بلا نسخة system prompt — أنشئ نسخة أولًا من لوحة التحكم.", tokensUsed: 0, toolCalls: 0 };
  }
  const agentConfig = parseAgentConfig(agent.version.config);

  const conversation = await resolveConversation({ tenantId: request.tenantId, agentId: request.agentId, conversationId: request.conversationId, externalSessionId: request.externalSessionId });
  const run = await createRun({ tenantId: request.tenantId, agentId: request.agentId, input: request.input, traceId, conversationId: conversation.id });
  const runId = run.id;
  await updateRun(request.tenantId, runId, { status: "running" });
  await recordEvent({ tenantId: request.tenantId, runId, type: "run.started", payload: { agentId: request.agentId }, traceId });
  await appendMessage({ tenantId: request.tenantId, conversationId: conversation.id, role: "user", content: request.input });

  try {
    const evidence = await searchKnowledge(request.tenantId, request.agentId, request.input);
    const evidenceText = evidence.map(item => `مصدر: ${item.title}\n${item.content.slice(0, 1200)}`).join("\n\n");
    // Guard interlock: an agent answering with zero knowledge hits is a silent
    // quality failure — record it so tenants can see and fix their knowledge base.
    if (evidence.length === 0) {
      await recordEvent({ tenantId: request.tenantId, runId, type: "knowledge.miss", payload: { query: request.input.slice(0, 200) }, traceId });
    }
    const allowedTools = listPlatformTools().filter(tool => tool.enabled && toolMatchesPolicy(tool.risk, agentConfig.toolPolicy));
    const tools = allowedTools.map(tool => ({ type: "function" as const, function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
    await recordEvent({ tenantId: request.tenantId, runId, type: "run.config", payload: { model: agentConfig.model ?? "platform-default", toolPolicy: agentConfig.toolPolicy, toolsOffered: allowedTools.map(tool => tool.name) }, traceId });
    const response = await invokeLLM({
      model: agentConfig.model,
      messages: [
        { role: "system", content: `${redactContext(agent.version.systemPrompt)}\n\nقواعد المنصة: لا تكشف أسرارًا، لا تنفذ side effect خارج أدوات معتمدة، وإذا احتاجت الأداة موافقة أبلغ المستخدم بذلك.\n\nالمعرفة المتاحة:\n${evidenceText || "لا توجد مصادر مطابقة."}` },
        ...conversation.messages.map(item => ({ role: item.role, content: item.content })),
        { role: "user", content: request.input },
      ],
      tools: tools.length ? tools : undefined,
      toolChoice: tools.length ? "auto" : undefined,
    });
    const message = response.choices?.[0]?.message;
    const usage = response.usage?.total_tokens ?? 0;
    // Guard interlock: a provider that omits usage makes metering undercount silently.
    if (usage === 0) await recordEvent({ tenantId: request.tenantId, runId, type: "usage.missing", payload: { hint: "provider returned no usage; token metering may undercount" }, traceId });
    const usageResult = await chargeUsage(request.tenantId, usage, message?.tool_calls?.length ?? 0);
    if (!usageResult.allowed) {
      await updateRun(request.tenantId, runId, { status: "failed", error: usageResult.reason });
      return { runId, traceId, status: "failed", answer: usageResult.message ?? "تم إيقاف الطلب لأن الحساب تجاوز حد الاستخدام المسموح.", tokensUsed: usage, toolCalls: 0 };
    }
    if (usageResult.warning) await recordEvent({ tenantId: request.tenantId, runId, type: "usage.warning_80", payload: { used: usageResult.used, quota: usageResult.quota, cap: usageResult.cap }, traceId });
    if ((usageResult.overageTokens ?? 0) > 0) await recordEvent({ tenantId: request.tenantId, runId, type: "usage.overage", payload: { overageTokens: usageResult.overageTokens, policy: "billable_overage_until_hard_cap" }, traceId });

    const toolCalls = message?.tool_calls ?? [];
    const failedTools: string[] = [];
    for (const call of toolCalls) {
      const toolName = call.function?.name ?? "unknown";
      const tool = toolRegistry.get(toolName);
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(call.function?.arguments ?? "{}"); } catch { input = {}; }
      if (!tool) { await recordToolCall({ tenantId: request.tenantId, runId, toolName, toolInput: input, status: "denied", output: { reason: "tool_not_registered" } }); continue; }
      if (!toolMatchesPolicy(tool.describe().risk, agentConfig.toolPolicy)) {
        // The model tried a tool outside this version's policy — hard denial, audited.
        await recordToolCall({ tenantId: request.tenantId, runId, toolName, toolInput: input, status: "denied", output: { reason: "tool_policy_denied", policy: agentConfig.toolPolicy } });
        continue;
      }
      const definition = tool.describe();
      const toolContext: ToolExecutionContext = { tenantId: request.tenantId, runId, traceId, deadline: Date.now() + 15000, source: "internal" };
      const authorization = await tool.authorize(toolContext);
      if (authorization !== "allow" || definition.requiresApproval) {
        await recordToolCall({ tenantId: request.tenantId, runId, toolName, toolInput: input, status: "denied", output: { reason: authorization === "approval_required" ? "approval_required" : "policy_denied" } });
        await updateRun(request.tenantId, runId, { status: "waiting_approval" });
        const approvalAnswer = `الإجراء **${toolName}** يحتاج موافقة قبل التنفيذ. لم يتم تنفيذ أي تغيير.`;
        await appendMessage({ tenantId: request.tenantId, conversationId: conversation.id, role: "assistant", content: approvalAnswer, tokensUsed: usage });
        return { runId, traceId, status: "waiting_approval", answer: approvalAnswer, tokensUsed: usage, toolCalls: 1 };
      }
      try {
        tool.validate(input);
        const result = await tool.execute(toolContext, input);
        const verified = result.status === "success" && tool.verify ? await tool.verify(toolContext, input, result) : result.status === "success";
        if (!verified) {
          await recordToolCall({ tenantId: request.tenantId, runId, toolName, toolInput: input, status: "failed", output: { reason: "verification_failed", result: result.output ?? result.error } });
          await updateRun(request.tenantId, runId, { status: "failed", error: "tool_verification_failed" });
          return { runId, traceId, status: "failed", answer: `تم تنفيذ الأداة **${toolName}** لكن تعذر التحقق من النتيجة، لذلك لم يتم اعتبار العملية ناجحة.`, tokensUsed: usage, toolCalls: 1 };
        }
        await recordToolCall({ tenantId: request.tenantId, runId, toolName, toolInput: input, status: result.status, output: { result: result.output ?? result.error, verified: true } });
      } catch (error) {
        await recordToolCall({ tenantId: request.tenantId, runId, toolName, toolInput: input, status: "failed", output: { error: error instanceof Error ? error.message : "tool_failed" } });
        failedTools.push(toolName);
      }
    }
    // Guard interlock: tool failures must never hide behind a success-looking answer.
    if (failedTools.length > 0) {
      await recordEvent({ tenantId: request.tenantId, runId, type: "run.tool_failures", payload: { tools: failedTools }, traceId });
    }

    const baseAnswer = typeof message?.content === "string" ? message.content : "تم تحليل طلبك، لكن لا يوجد رد نصي من النموذج.";
    const toolFailureNotice = failedTools.length > 0 ? `\n\nتنبيه صادق: الأدوات التالية فشلت أثناء المعالجة: ${failedTools.join("، ")} — العملية لم تكتمل بنجاح كامل، وأعد المحاولة أو راجع الحالة.` : "";
    const usageNotice = (usageResult.overageTokens ?? 0) > 0 ? "\n\nتنبيه حساب: تم تجاوز حصة الباقة الأساسية، وسيُحتسب الاستخدام الزائد حتى الحد الأقصى المسموح." : usageResult.warning ? "\n\nتنبيه حساب: اقتربت من 80% من حصة الاستخدام." : "";
    const answer = baseAnswer + toolFailureNotice + usageNotice;
    await appendMessage({ tenantId: request.tenantId, conversationId: conversation.id, role: "assistant", content: answer, tokensUsed: usage });
    await updateRun(request.tenantId, runId, { status: "succeeded", output: answer, tokensUsed: usage });
    await recordEvent({ tenantId: request.tenantId, runId, type: "run.completed", payload: { tokensUsed: usage }, traceId });
    return { runId, traceId, status: "succeeded", answer, tokensUsed: usage, toolCalls: toolCalls.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_failed";
    await updateRun(request.tenantId, runId, { status: "failed", error: message });
    await recordEvent({ tenantId: request.tenantId, runId, type: "run.failed", payload: { error: safeJson(message) }, traceId });
    return { runId, traceId, status: "failed", answer: "حدث خطأ قابل للتسجيل أثناء تشغيل الوكيل. لم يتم تنفيذ إجراء خارجي.", tokensUsed: 0, toolCalls: 0 };
  }
}
