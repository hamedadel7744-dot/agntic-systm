# Nova Agent Platform — Integration contract

هذه المنصة Modular Monolith متعددة المستأجرين. كل مشروع خارجي يتصل عبر API Key، ولا يحصل الـ LLM على أسرار أو وصول مباشر لقاعدة البيانات.

## التكامل في سطر واحد

```html
<script src="https://YOUR_AGENT_DOMAIN/widget.js" data-agent-key="nova_..."></script>
```

المفتاح لوحده كفاية: السيرفر بيشتغل على الوكيل الافتراضي للعميل (أول وكيل اتعمل). عايز وكيل معين؟ ضيف `data-agent-id`. نفس الفلسفة في كل الأسطح: `agentId` اختياري في الـ REST والـ SDK والويدجت.

## REST Gateway v1

```http
POST https://YOUR_AGENT_DOMAIN/v1/runs
Content-Type: application/json
X-API-Key: nova_...

{
  "agentId": "uuid-اختياري",
  "input": "كيف أبدأ استخدام النظام؟",
  "metadata": { "system": "market-hub", "page": "/orders" }
}
```

الاستجابة تحتوي على `runId`, `traceId`, `status`, `answer`, `tokensUsed`, و`toolCalls`، ومعها `agentId` المُستخدم فعليًا. لو مفيش وكيل للحساب بترجع 404 بكود `no_agent`.

- `GET /v1/health` — فحص الخدمة السريع.
- `GET /api/system/health` — تقرير تشخيص شامل (قاعدة البيانات، السكيما، pgvector، متغيرات البيئة، المزود، الأدوات، الحوادث).
- `GET /v1/tools` — أدوات المنصة؛ تتطلب مفتاحًا صحيحًا وترجع الأدوات المفعلة فقط.
- `POST /v1/runs` — تشغيل Agent مع tenant isolation وusage cap.

حد معدل الطلبات: افتراضيًا 60 طلب/دقيقة لكل tenant (متغير `RUNS_RATE_LIMIT_PER_MIN`)؛ التجاوز يرجع 429 مع `Retry-After`. سقف التوكنز يبقى هو حد الإنفاق الحقيقي.

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

لا تضع مفتاحًا بصلاحيات حساسة داخل Frontend في الإنتاج؛ استخدم Proxy من Backend النظام المضيف أو مفتاحًا محدود النطاق قابلًا للتدوير.

## Widget

```html
<script
  src="https://YOUR_AGENT_DOMAIN/widget.js"
  data-agent-url="https://YOUR_AGENT_DOMAIN"
  data-agent-key="nova_..."
  data-agent-id="agent-uuid"
  data-agent-name="Market Hub">
</script>
```

عند توفر `data-agent-key` و`data-agent-id` يعمل الويدجت على الـ runtime الحقيقي عبر `/v1/runs`؛ وبدونهما يعمل في وضع العرض التجريبي القديم. المفتاح داخل صفحة العميل مكشوف بطبيعته — استخدم مفتاحًا محدود النطاق ودوّره من لوحة التحكم عند الحاجة.

## Control Plane (إدارة المنصة)

محمية بتوكن مشترك من متغير `PLATFORM_ADMIN_TOKEN` عبر الهيدر `x-admin-token`. لو المتغير غير مضبوط ترجع 503 صريحة (الإدارة معطلة عمدًا).

- `GET /v1/system/tenants` — قائمة العملاء مع المفاتيح (بادئات فقط) والوكلاء والاستخدام.
- `POST /v1/system/tenants/:tenantId/rotate-key` — إلغاء كل المفاتيح النشطة وإصدار مفتاح جديد (يظهر مرة واحدة).
- `POST /v1/system/tenants/:tenantId/revoke-key` — إلغاء مفتاح محدد `{ "keyId": "..." }`.
- `POST /v1/system/tenants/:tenantId/status` — إيقاف/تشغيل عميل `{ "status": "active" | "suspended" }`.
- `GET /v1/system/tenants/:tenantId/runs` — آخر 20 تشغيل مع الحالة والخطأ.
- `GET/POST /v1/system/tenants/:tenantId/agents/:agentId/knowledge` — عرض/إضافة مصادر معرفة (التضمين best-effort).
- `DELETE /v1/system/knowledge/:knowledgeId?tenantId=...` — حذف مصدر.
- `GET /v1/system/tenants/:tenantId/agents/:agentId/versions` — قائمة نسخ الوكيل (الأحدث أولًا).
- `POST /v1/system/tenants/:tenantId/agents/:agentId/versions` — نشر نسخة جديدة `{ "version": "1.1.0", "systemPrompt": "..." }` — آخر نسخة هي النشطة.
- `POST /v1/system/tenants/:tenantId/agents/:agentId/rollback` — تراجع كنسخة جديدة منسوخة `{ "toVersionId": "..." }` — التاريخ append-only، وكل نشر/تراجع يتسجل كصف deployment.

## Environment variables

| المتغير | الأهمية | ملاحظة |
| --- | --- | --- |
| `DATABASE_URL` | حرج | postgresql pooler (منفذ 6543، prepare:false مفعّل في الكود) |
| `JWT_SECRET` | حرج | توقيع جلسات الداشبورد |
| `BUILT_IN_FORGE_API_KEY` | حرج | مفتاح مزود متوافق مع OpenAI للـ chat والـ embeddings |
| `BUILT_IN_FORGE_API_URL` | اختياري | افتراضيًا forge.manus.im؛ يقبل صيغة بـ /v1 أو بدونها |
| `EMBEDDING_MODEL` | اختياري | افتراضيًا text-embedding-3-small |
| `OAUTH_SERVER_URL` | مهم | تسجيل الدخول للداشبورد |
| `VITE_APP_ID` | مهم | معرّف التطبيق أمام مزود OAuth |
| `PLATFORM_ADMIN_TOKEN` | مهم | بوابة لوحة التحكم |
| `RUNS_RATE_LIMIT_PER_MIN` | اختياري | افتراضيًا 60 |

## Adapter Contract للأنظمة المشتركة

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

`Tenant`, `Agent`, `AgentVersion`, `Deployment`, `Conversation`, `Message`, `KnowledgeSource`, `Tool`, `ToolCall`, `Run`, `Action`, `UsageMeter`, و`Event` موجودة خلف جداول `platform*` وعقود server modules. البحث في المعرفة هجين: تضمينات pgvector أولًا ثم رجوع تلقائي للبحث النصي.

## Security invariants

- كل استعلام platform يحمل `tenantId` أو يمر عبر scoped lookup.
- API keys تحفظ كـ SHA-256 hash فقط، والتدوير يلغي كل المفاتيح النشطة دفعة واحدة.
- Runtime يحجب الأسرار قبل إرسال context للنموذج.
- الأدوات لا تنفذ إلا إذا كانت مسجلة ومصرحًا بها.
- الإجراء الذي يحتاج موافقة يرجع `waiting_approval` ولا ينفذ side effect.
- قاعدة البيانات غير القابلة للوصول تعني رفضًا صريحًا 503 — لا تمويه بمصادقة فاشلة.
- كل تشغيل يسجل `runId`, `traceId`, events، وtool calls، والـ runs المعلقة أكثر من 15 دقيقة تظهر في تقرير التشخيص كزومبي.
