import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity, AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, Database, KeyRound,
  RefreshCw, Server, ShieldAlert, ShieldCheck, Wrench, XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CheckStatus, DiagCheck, DiagnosticsReport } from "../../../server/platform/diagnostics";
import type { GuardFinding, GuardReport } from "../../../server/platform/guard";

const GROUP_LABELS: Record<DiagCheck["group"], string> = {
  database: "قاعدة البيانات",
  schema: "البنية والامتدادات",
  environment: "متغيرات البيئة",
  llm: "النموذج اللغوي",
  tools: "الأدوات",
};

const GROUP_ICONS: Record<DiagCheck["group"], typeof Database> = {
  database: Database,
  schema: Server,
  environment: KeyRound,
  llm: Bot,
  tools: Wrench,
};

const STATUS_META: Record<CheckStatus, { label: string; icon: typeof CheckCircle2; text: string; bg: string; border: string; dot: string }> = {
  ok: { label: "سليم", icon: CheckCircle2, text: "text-[#198a6a]", bg: "bg-[#f4fcf8]", border: "border-[#bfeedd]", dot: "bg-[#35c29a]" },
  warn: { label: "تحذير", icon: AlertTriangle, text: "text-[#b06f1f]", bg: "bg-[#fff7ee]", border: "border-[#f5ddb8]", dot: "bg-[#f2a65a]" },
  fail: { label: "فشل", icon: XCircle, text: "text-[#c0392b]", bg: "bg-[#fdeeee]", border: "border-[#f3c2c2]", dot: "bg-[#e5484d]" },
};

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function Diagnostics() {
  const [manual, setManual] = useState(false);
  const report = trpc.diagnostics.report.useQuery({ force: manual }, { refetchInterval: manual ? false : 20000 });
  useEffect(() => {
    if (manual && !report.isFetching) setManual(false);
  }, [manual, report.isFetching]);
  const [guardBusy, setGuardBusy] = useState(false);
  const [guardResult, setGuardResult] = useState<GuardReport | null>(null);
  const [guardError, setGuardError] = useState("");
  const data: DiagnosticsReport | undefined = report.data;

  const runGuard = async () => {
    const token = localStorage.getItem("platformAdminToken") ?? "";
    if (!token) {
      setGuardError("محتاج توكن المدير — اكتبه أولًا في صفحة منصة التشغيل (بيتحفظ محليًا عندك).");
      return;
    }
    setGuardBusy(true);
    setGuardError("");
    try {
      const res = await fetch("/v1/system/guard", { method: "POST", headers: { "x-admin-token": token } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تشغيل الحارس");
      setGuardResult(body.data);
    } catch (e) {
      setGuardError((e as Error).message);
    } finally {
      setGuardBusy(false);
    }
  };

  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const check of data?.checks ?? []) counts[check.status] += 1;
  const overall = data ? STATUS_META[data.status] : null;
  const groups = Object.keys(GROUP_LABELS) as DiagCheck["group"][];

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f7fb] p-5 text-[#14213a] md:p-8">
      <div className="mx-auto max-w-[1300px]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-[#198a6a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#35c29a]" />System Doctor / Phase 0
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">صحة النظام — فحص شامل مباشر</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7d8aa0]">
              الفحص بيلف على قاعدة البيانات والبنية والامتدادات ومتغيرات البيئة والنموذج اللغوي وسجل الأدوات، وبيرصد آخر الحوادث المسجلة — بدون فشل صامت.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <a href="/platform" className="flex items-center gap-2 rounded-xl border border-[#dfe6ee] bg-white px-4 py-3 text-xs font-bold text-[#526079] hover:bg-[#f8fafc]">
              <ArrowLeft className="h-4 w-4" />منصة التشغيل
            </a>
            <Button onClick={() => report.refetch()} disabled={report.isFetching} className="h-11 rounded-xl bg-[#101b35] px-5 text-xs font-bold text-white hover:bg-[#1b2c52]">
              <RefreshCw className={`ml-2 h-4 w-4 ${report.isFetching ? "animate-spin" : ""}`} />
              فحص الآن
            </Button>
          </div>
        </div>

        {report.isError && (
          <div className={`mt-6 rounded-[22px] border p-5 ${STATUS_META.fail.bg} ${STATUS_META.fail.border}`}>
            <div className={`flex items-center gap-2 text-sm font-black ${STATUS_META.fail.text}`}>
              <ShieldAlert className="h-5 w-5" />تعذر جلب تقرير الفحص نفسه
            </div>
            <p className="mt-2 text-xs leading-6 text-[#526079]">هذه حالة حرجة: خدمة التشخيص غير قابلة للوصول. راجع logs الـ deployment فورًا.</p>
            <code dir="ltr" className="mt-2 block break-all text-[10px] text-[#98a4b5]">{String(report.error?.message ?? "")}</code>
          </div>
        )}

        {data && overall && (
          <>
            <div className={`mt-6 rounded-[22px] border p-5 ${overall.bg} ${overall.border}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={`flex items-center gap-2 text-sm font-black ${overall.text}`}>
                  <overall.icon className="h-5 w-5" />
                  الحالة العامة: {overall.label}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#526079]">
                  <Badge className="border-0 bg-white text-[10px] text-[#526079]"><Clock3 className="ml-1 h-3 w-3" />آخر فحص: {formatTime(data.checkedAt)}</Badge>
                  <Badge className="border-0 bg-white text-[10px] text-[#526079]">مدة الفحص {data.durationMs}ms</Badge>
                  {data.cached && <Badge className="border-0 bg-white text-[10px] text-[#9aa6b6]">نتيجة مخزنة (أقل من 10 ثوانٍ)</Badge>}
                  <Badge className="border-0 bg-white text-[10px] text-[#526079]">تحديث تلقائي كل 20 ثانية</Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <MiniStat label="فحوصات سليمة" value={counts.ok} tone="ok" />
                <MiniStat label="تحذيرات" value={counts.warn} tone="warn" />
                <MiniStat label="أعطال" value={counts.fail} tone="fail" />
                <MiniStat label="حوادث آخر 24 ساعة" value={data.incidents.failedRuns24h} tone={data.incidents.failedRuns24h > 0 ? "warn" : "ok"} />
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {groups.map(group => {
                const groupChecks = data.checks.filter(check => check.group === group);
                const Icon = GROUP_ICONS[group];
                const worst = groupChecks.some(check => check.status === "fail") ? "fail" : groupChecks.some(check => check.status === "warn") ? "warn" : "ok";
                return (
                  <Card key={group} className="rounded-[26px] border-[#e7ebf2] bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base font-black">
                        <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#198a6a]" />{GROUP_LABELS[group]}</span>
                        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[worst].dot}`} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {groupChecks.length === 0 && <p className="text-xs text-[#98a4b5]">لا توجد فحوصات في هذه المجموعة.</p>}
                      {groupChecks.map(check => {
                        const meta = STATUS_META[check.status];
                        return (
                          <div key={check.id} className={`rounded-2xl border p-4 ${meta.bg} ${meta.border}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className={`flex items-center gap-2 text-xs font-black ${meta.text}`}>
                                <meta.icon className="h-4 w-4" />{check.title}
                              </div>
                              {typeof check.latencyMs === "number" && <Badge className="border-0 bg-white text-[10px] text-[#526079]">{check.latencyMs}ms</Badge>}
                            </div>
                            <p className="mt-2 text-xs leading-6 text-[#526079]">{check.detail}</p>
                            {check.cause && <p className="mt-1 text-[11px] leading-5 text-[#8c6d1f]">السبب المحتمل: {check.cause}</p>}
                            {check.fix && <p className="mt-1 text-[11px] leading-5 text-[#198a6a]">الإصلاح: {check.fix}</p>}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="mt-5 rounded-[26px] border-[#e7ebf2] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black"><ShieldAlert className="h-4 w-4 text-[#b06f1f]" />آخر الحوادث المسجلة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.incidents.failedRuns.length === 0 && data.incidents.usageWarnings.length === 0 && data.incidents.staleRuns.length === 0 && (
                  <p className="text-xs text-[#98a4b5]">لا توجد حوادث مسجلة — لا failed runs ولا runs معلقة ولا تحذيرات استخدام.</p>
                )}
                {data.incidents.staleRuns.map(incident => (
                  <div key={incident.id} className={`rounded-2xl border p-4 ${STATUS_META.warn.bg} ${STATUS_META.warn.border}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`flex items-center gap-1 text-xs font-black ${STATUS_META.warn.text}`}><AlertTriangle className="h-3.5 w-3.5" />تشغيل معلّق — زومبي محتمل</span>
                      <span className="text-[10px] text-[#98a4b5]">{formatTime(incident.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[#526079]">{incident.error}</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#198a6a]">الإصلاح: العملية اتقضت عليها قبل ما تسجل فشل (timeout أو kill). راجع فحص الوصول لمزود النموذج، ثم أعد المحاولة — والحالة هتتقفل أوتوماتيك مع التحقق اللاحق.</p>
                    <code dir="ltr" className="mt-1 block text-[10px] text-[#98a4b5]">{incident.id}</code>
                  </div>
                ))}
                {data.incidents.failedRuns.map(incident => (
                  <div key={incident.id} className={`rounded-2xl border p-4 ${STATUS_META.fail.bg} ${STATUS_META.fail.border}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-xs font-black ${STATUS_META.fail.text}`}>Run فاشل</span>
                      <span className="text-[10px] text-[#98a4b5]">{formatTime(incident.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[#526079]">السبب المسجل: {incident.error}</p>
                    <code dir="ltr" className="mt-1 block text-[10px] text-[#98a4b5]">{incident.id}</code>
                  </div>
                ))}
                {data.incidents.usageWarnings.map(incident => (
                  <div key={incident.id} className={`rounded-2xl border p-4 ${STATUS_META.warn.bg} ${STATUS_META.warn.border}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-xs font-black ${STATUS_META.warn.text}`}>تنبيه استخدام</span>
                      <span className="text-[10px] text-[#98a4b5]">{formatTime(incident.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[#526079]">{incident.error}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="mt-5 rounded-[26px] border-[#e7ebf2] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-black">
                  <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#198a6a]" />الحارس — ملاحظات هيكلية وذاتية الإصلاح</span>
                  <Button onClick={runGuard} disabled={guardBusy} className="h-8 rounded-lg bg-[#101b35] px-3 text-[10px] font-bold text-white hover:bg-[#1b2c52]"><ShieldCheck className={`ml-1 h-3 w-3 ${guardBusy ? "animate-pulse" : ""}`} />{guardBusy ? "جارٍ المسح..." : "تشغيل الحارس الآن"}</Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {guardResult && (
                  <div className={`rounded-2xl border p-3 text-xs font-bold ${guardResult.reapedZombies > 0 ? "border-[#bfeedd] bg-[#f4fcf8] text-[#198a6a]" : "border-[#dfe6ee] bg-[#f7f8fb] text-[#526079]"}`}>
                    آخر مسح: {formatTime(guardResult.ranAt)} — أعاد تأهيل {guardResult.reapedZombies} run معلق (زومبي).
                  </div>
                )}
                {guardError && <div className="rounded-2xl border border-[#f3c2c2] bg-[#fdeeee] p-3 text-xs font-bold text-[#c0392b]">{guardError}</div>}
                {(guardResult?.findings ?? data?.guardFindings ?? []).length === 0 && (
                  <p className="text-xs text-[#98a4b5]">لا ملاحظات هيكلية — كل وكيل له نسخة، وكل عميل له وكيل ومفتاح نشط، وكل المعرفة مضمّنة.</p>
                )}
                {(guardResult?.findings ?? data?.guardFindings ?? []).map((finding: GuardFinding) => {
                  const meta = STATUS_META[finding.severity === "fail" ? "fail" : "warn"];
                  return (
                    <div key={finding.id} className={`rounded-2xl border p-3 ${meta.bg} ${meta.border}`}>
                      <div className={`text-xs font-black ${meta.text}`}>{finding.title}{typeof finding.count === "number" ? ` (${finding.count})` : ""}</div>
                      <p className="mt-1 text-[11px] leading-5 text-[#526079]">{finding.detail}</p>
                      <p className="mt-1 text-[11px] leading-5 text-[#198a6a]">الإصلاح: {finding.fix}</p>
                    </div>
                  );
                })}
                <p className="text-[10px] leading-5 text-[#98a4b5]">المسح بيتطلب توكن المدير، وبيعيد تأهيل الـ runs المعلقة تلقائيًا (زومبي أقدم من 15 دقيقة) بدل ما تلوث الإحصائيات للأبد.</p>
              </CardContent>
            </Card>

            <Card className="mt-5 rounded-[26px] border-[#e7ebf2] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black"><Activity className="h-4 w-4 text-[#6376df]" />بيئة التشغيل</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-4">
                <MiniStat label="Node" value={data.meta.node} tone="ok" />
                <MiniStat label="Region" value={data.meta.region} tone="ok" />
                <MiniStat label="Uptime" value={`${Math.floor(data.meta.uptimeSec / 60)} دقيقة`} tone="ok" />
                <MiniStat label="DATABASE_URL" value={data.meta.dbConfigured ? "مضبوط" : "مفقود"} tone={data.meta.dbConfigured ? "ok" : "fail"} />
              </CardContent>
            </Card>
          </>
        )}

        {!data && !report.isError && (
          <div className="mt-6 rounded-[22px] border border-[#dfe6ee] bg-white p-8 text-center text-sm font-bold text-[#7d8aa0]">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#198a6a]" />
            <p className="mt-3">جاري تشغيل الفحص الشامل...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone: CheckStatus }) {
  const meta = STATUS_META[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${meta.bg} ${meta.border}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      <div>
        <div className="text-[10px] text-[#9aa6b6]">{label}</div>
        <div className={`mt-1 text-sm font-black ${meta.text}`}>{value}</div>
      </div>
    </div>
  );
}
