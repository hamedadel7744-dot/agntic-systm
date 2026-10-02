import { desc, eq, sql, and, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { getLlmApiBase } from "../_core/llm";
import { platformEvents, platformRuns } from "../../drizzle/schema";
import { listPlatformTools } from "./runtime";
import { collectGuardFindings } from "./guard";
import "./default-tools";

export type CheckStatus = "ok" | "warn" | "fail";

export interface DiagCheck {
  id: string;
  group: "database" | "schema" | "environment" | "llm" | "tools";
  title: string;
  status: CheckStatus;
  latencyMs?: number;
  detail: string;
  cause?: string;
  fix?: string;
}

export interface EnvAuditItem {
  key: string;
  present: boolean;
  severity: "critical" | "warn" | "info";
  impact: string;
  fix: string;
}

export interface Incident {
  id: string;
  error: string;
  createdAt: string;
}

export interface DiagnosticsReport {
  status: CheckStatus;
  checkedAt: string;
  durationMs: number;
  cached: boolean;
  meta: { node: string; region: string; uptimeSec: number; dbConfigured: boolean };
  checks: DiagCheck[];
  envAudit: EnvAuditItem[];
  guardFindings: import("./guard").GuardFinding[];
  incidents: { failedRuns: Incident[]; failedRuns24h: number; usageWarnings: Incident[]; staleRuns: Incident[] };
}

/** Expected platform tables after the Postgres migration (drizzle/0000). */
const EXPECTED_TABLES = [
  "users", "systems", "conversations", "messages", "tickets", "knowledgeSources", "agentTools", "auditLogs",
  "platformTenants", "platformApiKeys", "platformAgents", "platformAgentVersions", "platformDeployments",
  "platformRuns", "platformActions", "platformToolCalls", "platformKnowledge", "platformUsage",
  "platformEvents", "platformConnectors", "platformConversations", "platformMessages",
];

/** Normalizes drizzle execute() results across pg drivers into plain row arrays. */
function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

async function timeCheck(id: string, group: DiagCheck["group"], title: string, fn: () => Promise<Omit<DiagCheck, "id" | "group" | "title" | "latencyMs">>): Promise<DiagCheck> {
  const started = performance.now();
  try {
    const result = await fn();
    return { id, group, title, latencyMs: Math.round(performance.now() - started), ...result };
  } catch (error) {
    return {
      id,
      group,
      title,
      latencyMs: Math.round(performance.now() - started),
      status: "fail",
      detail: "الفحص نفسه واجه خطأ غير متوقع.",
      cause: String(error instanceof Error ? error.message : error).slice(0, 300),
      fix: "راجع logs الخادم لمزيد من التفاصيل حول هذا الفحص.",
    };
  }
}

function envAudit(): EnvAuditItem[] {
  const item = (key: string, severity: EnvAuditItem["severity"], impact: string, fix: string): EnvAuditItem => ({
    key,
    present: Boolean(process.env[key]),
    severity,
    impact,
    fix,
  });
  return [
    item("DATABASE_URL", "critical", "بدونها يعمل النظام ببيانات تجريبية فقط وكل عمليات الـ platform تُرفض.", "أضف DATABASE_URL بصيغة postgresql://user:pass@host:6543/postgres في متغيرات البيئة."),
    item("JWT_SECRET", "critical", "توقيع جلسات الداشبورد؛ بدونه لا يمكن الاعتماد على المصادقة.", "أضف JWT_SECRET كنص عشوائي طويل (32 حرفًا أو أكثر)."),
    item("BUILT_IN_FORGE_API_KEY", "critical", "النموذج اللغوي؛ بدونها كل الـ runs تفشل فورًا عند استدعاء المزود.", "أضف BUILT_IN_FORGE_API_KEY بمفتاح المزود المتوافق مع OpenAI."),
    item("BUILT_IN_FORGE_API_URL", "info", "افتراضيًا forge.manus.im؛ يمكن توجيهه لأي مزود متوافق مع OpenAI.", "اختياري: أضف BUILT_IN_FORGE_API_URL=https://api.openai.com أو أي مزود متوافق."),
    item("OAUTH_SERVER_URL", "warn", "تسجيل الدخول إلى الداشبورد معطّل بدونه، والواجهات المحمية لن تعمل.", "أضف OAUTH_SERVER_URL الخاص بمزود OAuth، أو تجاهل التحذير إذا كان الوصول عبر الـ API فقط مقصودًا."),
    item("VITE_APP_ID", "warn", "معرّف التطبيق أمام مزود OAuth.", "اختياري الآن؛ يلزم عند تفعيل تسجيل الدخول."),
  ];
}

async function runDbChecks(checks: DiagCheck[], dbConfigured: boolean): Promise<boolean> {
  if (!dbConfigured) {
    checks.push({ id: "db.connectivity", group: "database", title: "الاتصال بقاعدة البيانات", status: "fail", detail: "DATABASE_URL غير مضبوط، النظام يعمل بوضع البيانات التجريبية بدون أن يخبر أحدًا.", fix: "أضف DATABASE_URL ثم أعد النشر." });
    return false;
  }
  const connectivity = await timeCheck("db.connectivity", "database", "الاتصال بقاعدة البيانات", async () => {
    const db = await getDb();
    if (!db) throw new Error("database handle is null despite DATABASE_URL being set");
    await db.execute(sql`select 1`);
    return { status: "ok", detail: "الاتصال ناجح عبر الـ pooler." };
  });
  checks.push(connectivity);
  const dbUp = connectivity.status === "ok";
  if (!dbUp) {
    const msg = connectivity.cause ?? "";
    if (/tenant\/user not found/i.test(msg)) connectivity.fix = "الكلاستر المستخدم في الـ host غير صحيح؛ جرّب aws-0/aws-1/aws-2 على نفس المنطقة.";
    else if (/password authentication failed/i.test(msg)) connectivity.fix = "كلمة سر المستخدم في DATABASE_URL غير صحيحة؛ حدّث المتغير.";
    else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) connectivity.fix = "تعذر الوصول للـ host؛ تحقق من اسم الكلاستر والمنطقة ومن أن المنفذ 6543 مفتوح.";
    connectivity.detail = "فشل الاتصال بقاعدة البيانات.";
    return false;
  }

  const db = (await getDb())!;

  const tables = await timeCheck("db.schema", "schema", "اكتمال جداول الـ platform", async () => {
    const rows = asRows(await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`));
    const existing = new Set(rows.map(row => String(row.table_name)));
    const missing = EXPECTED_TABLES.filter(name => !existing.has(name));
    if (missing.length > 0) {
      return { status: "fail", detail: `جداول ناقصة: ${missing.join("، ")}.`, cause: "الـ migration لم يُطبق بالكامل على هذه القاعدة.", fix: "أعد تشغيل ملف drizzle/0000 على القاعدة أو شغّل pnpm db:push." };
    }
    return { status: "ok", detail: `كل الجداول الـ ${EXPECTED_TABLES.length} المطلوبة موجودة.` };
  });
  checks.push(tables);

  const vector = await timeCheck("db.pgvector", "schema", "امتداد pgvector وعمود التضمين", async () => {
    const ext = asRows(await db.execute(sql`select extname from pg_extension where extname = 'vector'`));
    if (ext.length === 0) {
      return { status: "fail", detail: "امتداد vector غير مفعّل.", fix: "نفّذ create extension if not exists vector; على القاعدة." };
    }
    const col = asRows(await db.execute(sql`select 1 as ok from information_schema.columns where table_name = 'platformKnowledge' and column_name = 'embedding' limit 1`));
    if (col.length === 0) {
      return { status: "fail", detail: "الامتداد مفعّل لكن عمود embedding مفقود في platformKnowledge.", fix: "أعد تطبيق الـ migration الأخير." };
    }
    return { status: "ok", detail: "الامتداد والعمود جاهزان للبحث الدلالي." };
  });
  checks.push(vector);

  const writes = await timeCheck("db.write_path", "database", "قدرة الكتابة والحذف الفعلية على الجداول", async () => {
    // A real write probe: insert a heartbeat event then delete it. Read-only checks
    // cannot prove INSERT/DELETE grants, and claiming writes without proving them
    // would be its own kind of silent failure.
    const probeId = randomUUID();
    await db.insert(platformEvents).values({ id: probeId, tenantId: "__diagnostics__", eventType: "diag.write_probe", payload: "{}" });
    await db.delete(platformEvents).where(eq(platformEvents.id, probeId));
    return { status: "ok", detail: "إدراج وحذف فعلي في platformEvents نجح — صلاحيات الكتابة سليمة." };
  });
  checks.push(writes);
  return true;
}

async function runLlmChecks(checks: DiagCheck[]): Promise<void> {
  const key = ENV.forgeApiKey;
  if (!key) {
    checks.push({
      id: "llm.config",
      group: "llm",
      title: "مفتاح النموذج اللغوي",
      status: "fail",
      detail: "لا يوجد BUILT_IN_FORGE_API_KEY، لذلك كل تشغيلات الوكيل تفشل فورًا عند استدعاء النموذج.",
      cause: "متغير مفتاح المزود غير مضبوط في بيئة التشغيل.",
      fix: "أضف BUILT_IN_FORGE_API_KEY على Vercel (يمكن استخدام مفتاح OpenAI مع BUILT_IN_FORGE_API_URL=https://api.openai.com) ثم أعد النشر.",
    });
    checks.push({ id: "llm.reachability", group: "llm", title: "الوصول لمزود النموذج", status: "warn", detail: "تم التخطي لأن المفتاح غير مضبوط." });
    return;
  }
  checks.push({ id: "llm.config", group: "llm", title: "مفتاح النموذج اللغوي", status: "ok", detail: "المفتاح موجود في البيئة." });
  const reach = await timeCheck("llm.reachability", "llm", "الوصول لمزود النموذج", async () => {
    const response = await fetch(`${getLlmApiBase()}/v1/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    if (response.status === 401 || response.status === 403) {
      return { status: "fail", detail: `المزود رفض المفتاح (HTTP ${response.status}).`, cause: "مفتاح غير صالح أو منتهي.", fix: "حدّث BUILT_IN_FORGE_API_KEY بمفتاح صالح." };
    }
    return { status: "ok", detail: `المزود يستجيب (HTTP ${response.status}).` };
  });
  checks.push(reach);
}

async function collectIncidents(dbAvailable: boolean): Promise<DiagnosticsReport["incidents"]> {
  if (!dbAvailable) return { failedRuns: [], failedRuns24h: 0, usageWarnings: [], staleRuns: [] };
  const db = (await getDb())!;
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [failed, failedCount, warnings, stale] = await Promise.all([
    db.select({ id: platformRuns.id, error: platformRuns.error, createdAt: platformRuns.createdAt }).from(platformRuns).where(eq(platformRuns.status, "failed")).orderBy(desc(platformRuns.createdAt)).limit(10),
    db.select({ count: sql<number>`count(*)::int` }).from(platformRuns).where(and(eq(platformRuns.status, "failed"), sql`${platformRuns.createdAt} > ${since}`)),
    db.select({ id: platformEvents.id, error: platformEvents.eventType, createdAt: platformEvents.createdAt }).from(platformEvents).where(inArray(platformEvents.eventType, ["usage.warning_80", "usage.overage"])).orderBy(desc(platformEvents.createdAt)).limit(5),
    // Runs stuck in running/waiting_approval are zombies: the process was killed
    // mid-run (timeout/OOM) and no catch block ever got to mark them failed.
    db.select({ id: platformRuns.id, error: platformRuns.error, createdAt: platformRuns.createdAt }).from(platformRuns).where(and(inArray(platformRuns.status, ["running", "waiting_approval"]), sql`${platformRuns.createdAt} < ${staleCutoff}`)).orderBy(desc(platformRuns.createdAt)).limit(10),
  ]);
  return {
    failedRuns: failed.map(row => ({ id: row.id, error: row.error ?? "بدون رسالة خطأ", createdAt: row.createdAt.toISOString() })),
    failedRuns24h: failedCount[0]?.count ?? 0,
    usageWarnings: warnings.map(row => ({ id: row.id, error: row.error, createdAt: row.createdAt.toISOString() })),
    staleRuns: stale.map(row => ({ id: row.id, error: row.error ?? "الحالة الحالية: running/waiting_approval منذ أكثر من 15 دقيقة", createdAt: row.createdAt.toISOString() })),
  };
}

const CACHE_TTL_MS = 10_000;
let cachedReport: { at: number; report: DiagnosticsReport } | null = null;

export async function runDiagnostics(options: { force?: boolean } = {}): Promise<DiagnosticsReport> {
  if (!options.force && cachedReport && Date.now() - cachedReport.at < CACHE_TTL_MS) {
    return { ...cachedReport.report, cached: true };
  }
  const report = await computeDiagnostics();
  cachedReport = { at: Date.now(), report };
  return { ...report, cached: false };
}

async function computeDiagnostics(): Promise<DiagnosticsReport> {
  const started = performance.now();
  const checks: DiagCheck[] = [];
  const dbConfigured = Boolean(process.env.DATABASE_URL);

  let dbAvailable = false;
  try {
    dbAvailable = await runDbChecks(checks, dbConfigured);
  } catch (error) {
    checks.push({ id: "db.unexpected", group: "database", title: "فحص قاعدة البيانات", status: "fail", detail: "حدث خطأ غير متوقع أثناء فحص قاعدة البيانات.", cause: String(error instanceof Error ? error.message : error).slice(0, 300) });
  }

  try {
    await runLlmChecks(checks);
  } catch (error) {
    checks.push({ id: "llm.unexpected", group: "llm", title: "فحص النموذج اللغوي", status: "fail", detail: "حدث خطأ غير متوقع أثناء فحص المزود.", cause: String(error instanceof Error ? error.message : error).slice(0, 300) });
  }

  const tools = listPlatformTools();
  checks.push(tools.length >= 3
    ? { id: "tools.registry", group: "tools", title: "سجل الأدوات المسجلة", status: "ok", detail: `${tools.length} أدوات مسجلة وجاهزة: ${tools.map(tool => tool.name).join("، ")}.` }
    : { id: "tools.registry", group: "tools", title: "سجل الأدوات المسجلة", status: "warn", detail: `${tools.length} أدوات فقط مسجلة.`, cause: "استيراد default-tools قد يكون مفقودًا في نقطة الإقلاع.", fix: "تأكد من استيراد server/platform/default-tools قبل تشغيل الـ runtime." });

  checks.push(...envAudit().filter(item => item.severity !== "info" && !item.present).map(item => ({
    id: `env.${item.key}`,
    group: "environment" as const,
    title: `متغير البيئة ${item.key} مفقود`,
    status: item.severity === "critical" ? ("fail" as const) : ("warn" as const),
    detail: item.impact,
    fix: item.fix,
  })));

  let incidents: DiagnosticsReport["incidents"] = { failedRuns: [], failedRuns24h: 0, usageWarnings: [], staleRuns: [] };
  try {
    incidents = await collectIncidents(dbAvailable);
  } catch {
    incidents = { failedRuns: [], failedRuns24h: 0, usageWarnings: [], staleRuns: [] };
  }

  let guardFindings: DiagnosticsReport["guardFindings"] = [];
  try {
    guardFindings = dbAvailable ? await collectGuardFindings() : [];
  } catch {
    guardFindings = [];
  }

  const hasFail = checks.some(check => check.status === "fail");
  const hasWarn = checks.some(check => check.status === "warn");
  const status: CheckStatus = hasFail ? "fail" : hasWarn ? "warn" : "ok";

  return {
    status,
    checkedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    cached: false,
    meta: {
      node: process.version,
      region: process.env.VERCEL_REGION ?? "local",
      uptimeSec: Math.round(process.uptime()),
      dbConfigured,
    },
    checks,
    envAudit: envAudit(),
    guardFindings,
    incidents,
  };
}
