# Nova Agent Platform — agntic-systm

منصة وكلاء ذكاء اصطناعي متعددة المستأجرين: ‏‏ايجنت دعم جاهز للتركيب على أي موقع أو تطبيق بسطر واحد.

## التركيب في سطر واحد

```html
<script src="https://agntic-systm.vercel.app/widget.js" data-agent-key="nova_..."></script>
```

الوثيقة الكاملة للتكامل والإدارة: ‏[INTEGRATION.md](./INTEGRATION.md)

## الروابط الأساسية

- ‏‏التطبيق: ‏`https://agntic-systm.vercel.app`
- ‏‏منصة التشغيل: ‏`/platform` ‏(إنشاء عملاء، مفاتيح، معرفة، نسخ وكلاء)
- ‏‏صحة النظام: ‏`/diagnostics` ‏أو ‏`GET /api/system/health`
- ‏‏المستودع: ‏`github.com/hamedadel7744-dot/agntic-systm`

## دليل التشغيل (Runbook)

### النشر

- ‏‏كل push على `main` بيتنشر تلقائيًا بعد ما CI يعدي (فحص أنواع + اختبارات).
- ‏‏نشر يدوي: ‏`npx vercel deploy --prod --yes --token <TOKEN>`.
- ‏‏منطقة الدوال: ‏`fra1` ‏— بجوار قاعدة البيانات في `eu-central-1` عشان زمن الاستجابة.

### المتغيرات (على Vercel، كل البيئات)

| المتغير | الوظيفة |
| --- | --- |
| `DATABASE_URL` | ‏اتصال Supabase عبر الـ pooler (منفذ 6543) |
| `JWT_SECRET` | توقيع جلسات الداشبورد |
| `BUILT_IN_FORGE_API_KEY` | مفتاح مزود النموذج (chat + embeddings) |
| `BUILT_IN_FORGE_API_URL` | اختياري — أي مزود متوافق مع OpenAI |
| `PLATFORM_ADMIN_TOKEN` | بوابة لوحة التحكم (`x-admin-token`) |
| `RUNS_RATE_LIMIT_PER_MIN` | اختياري — افتراضيًا 60/دقيقة لكل عميل |
| `EMBEDDING_MODEL` | اختياري — افتراضيًا text-embedding-3-small |

### عند حادثة أمنية

1. ‏‏دوّر مفتاح أي عميل من `/platform` → قائمة العملاء → تدوير (المفاتيح القديمة تموت فورًا).
2. ‏‏دوّر `PLATFORM_ADMIN_TOKEN` من إعدادات Vercel ثم أعد النشر.
3. ‏‏افحص `run.rejected` و`run.tool_failures` و`guard.zombie_reaped` في جدول الأحداث.

### تشخيص المشاكل

1. `/diagnostics` — تقرير شامل كل 20 ثانية + زر تشغيل الحارس.
2. ‏‏`POST /v1/system/guard` بتوكن المدير — إصلاح ذاتي للـ runs الزومبي.
3. ‏‏Health Watch على GitHub: ‏‏إيميل تلقائي لو البنية وقعت (كل 15 دقيقة).

### قاعدة البيانات

- ‏Supabase project: ‏`agentic system` ‏(eu-central-1) — ‏`pgvector` مفعّل.
- ‏‏الجداول: ‏22 جدول — migration في `drizzle/0000` + indexes في `drizzle/0001`.
- ‏‏مستخدم التطبيق: ‏`nova_app` ‏بصلاحيات محدودة (بدون superuser).

### حدود معروفة

- ‏‏حد المعدل في الذاكرة لكل instance — throttling وليس الحد الحقيقي (الحد الحقيقي سقف التوكنز).
- ‏‏تسجيل دخول الداشبورد (OAuth) غير مفعل — لوحة التحكم تعمل بتوكن المدير.
- ‏‏نسخ Supabase الاحتياطية تحتاج ترقية الخطة.
