# Nova Agent Platform — Integration contract

هذه المنصة الآن Modular Monolith متعددة المستأجرين. كل مشروع خارجي يتصل عبر API Key وAgent Version، ولا يحصل الـ LLM على أسرار أو وصول مباشر لقاعدة البيانات.

## REST Gateway v1

```http
POST https://YOUR_AGENT_DOMAIN/v1/runs
Content-Type: application/json
X-API-Key: nova_...

{
  "agentId": "uuid",
  "input": "كيف أبدأ استخدام النظام؟",
  "conversationId": 123,
  "metadata": { "system": "market-hub", "page": "/orders" }
}
```

الاستجابة تحتوي على `runId`, `traceId`, `status`, `answer`, `tokensUsed`, و`toolCalls`.

- `GET /v1/health` — فحص الخدمة.
- `GET /v1/tools` — الأدوات المنشورة بدون internals.
- `POST /v1/runs` — تشغيل Agent مع tenant isolation وusage cap.

## Browser SDK

```html
<script src="https://YOUR_AGENT_DOMAIN/agent-sdk.js"></script>
<script>
  const agent = NovaAgent.createClient({
    baseUrl: "https://YOUR_AGENT_DOMAIN",
    apiKey: "nova_...",
    agentId: "agent-uuid"
  });
  agent.run("أين أجد التقارير؟", {
    metadata: { systemId: "market-hub", currentPage: location.pathname }
  }).then(console.log);
</script>
```

لا تضع مفتاحًا بصلاحيات حساسة داخل Frontend في الإنتاج؛ استخدم Proxy من Backend النظام المضيف أو مفتاحًا محدود النطاق.

## Widget الحالي

```html
<script
  src="https://YOUR_AGENT_DOMAIN/widget.js"
  data-agent-url="https://YOUR_AGENT_DOMAIN"
  data-system-id="1"
  data-system-name="Market Hub">
</script>
```

## Adapter Contract للأنظمة الأربعة

كل نظام ينفذ هذه الوظائف خلف API داخلي مؤمّن:

```ts
getUserProfile(externalUserId)
getAccountStatus(externalUserId)
getOnboardingStatus(externalUserId)
getCurrentPageContext(pathname)
searchRecords(externalUserId, query)
getUsageSummary(externalUserId)
createSupportTicket(payload)
```

أي Side Effect يجب أن يمر من Tool Contract ويحتوي على authorization، idempotency، preconditions، verification، وaudit trail. ابدأ بالقراءة ثم فعّل الإجراءات الآمنة واحدة تلو الأخرى.

## Phase 0 primitives

`Tenant`, `Agent`, `AgentVersion`, `Deployment`, `Conversation`, `Message`, `KnowledgeSource`, `Tool`, `ToolCall`, `Run`, `Action`, `UsageMeter`, و`Event` موجودة خلف جداول `platform*` وعقود server modules.

## Security invariants

- كل استعلام platform يحمل `tenantId` أو يمر عبر scoped lookup.
- API keys تحفظ كـ SHA-256 hash فقط.
- Runtime يحجب الأسرار قبل إرسال context للنموذج.
- الأدوات لا تنفذ إلا إذا كانت مسجلة ومصرحًا بها.
- الإجراء الذي يحتاج موافقة يرجع `waiting_approval` ولا ينفذ side effect.
- كل تشغيل يسجل `runId`, `traceId`, events، وtool calls.
