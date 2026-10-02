import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowLeft, Ban, Bot, CheckCircle2, Copy, Database, KeyRound, Play, Plus, RefreshCw, RotateCcw, ShieldCheck, Terminal, Users, WalletCards, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function Platform() {
  const auth = useAuth();
  const [tenantId, setTenantId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [agentId, setAgentId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [prompt, setPrompt] = useState("أنت وكيل دعم آمن ومفيد. استخدم المعرفة والأدوات المعتمدة فقط.");
  const [runInput, setRunInput] = useState("كيف أبدأ استخدام النظام؟");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const bootstrap = trpc.platform.bootstrap.useMutation({ onSuccess: data => { setTenantId(data.tenant.id); setApiKey(data.apiKey.key); setAgentId(data.agent.agent.id); } });
  const overview = trpc.platform.overview.useQuery({ tenantId }, { enabled: tenantId.length > 0 && auth.isAuthenticated });
  const run = trpc.platform.run.useMutation({ onSuccess: data => { setResult(data); overview.refetch(); } });
  const copyKey = async () => { await navigator.clipboard?.writeText(apiKey); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };

  if (!auth.loading && !auth.isAuthenticated) return <div dir="rtl" className="grid min-h-screen place-items-center bg-[#f6f7fb] p-6"><Card className="w-full max-w-md rounded-[26px] border-[#e7ebf2] bg-white shadow-sm"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-[#198a6a]" /><h1 className="mt-4 text-xl font-black">Control Plane محمي</h1><p className="mt-2 text-sm leading-6 text-[#7d8aa0]">سجّل الدخول بحساب مدير للوصول إلى tenants ومفاتيح API ونسخ الوكلاء.</p><Button onClick={() => startLogin()} className="mt-6 h-11 w-full rounded-xl bg-[#101b35] text-xs font-bold text-white">تسجيل الدخول</Button></CardContent></Card></div>;
  return <div dir="rtl" className="min-h-screen bg-[#f6f7fb] p-5 text-[#14213a] md:p-8"><div className="mx-auto max-w-[1300px]"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-[#198a6a]"><span className="h-1.5 w-1.5 rounded-full bg-[#35c29a]" />Control Plane / Phase 0</div><h1 className="mt-2 text-3xl font-black tracking-tight">منصة تشغيل الوكلاء</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#7d8aa0]">أنشئ Tenant، Agent version، ومفتاح API، ثم جرّب المسار الكامل من Gateway إلى Runtime مع usage meter وتدقيق.</p></div><a href="/diagnostics" className="flex items-center gap-2 self-start rounded-xl border border-[#dfe6ee] bg-white px-4 py-3 text-xs font-bold text-[#526079] hover:bg-[#f8fafc]"><Activity className="h-4 w-4" />صحة النظام</a><a href="/" className="flex items-center gap-2 self-start rounded-xl border border-[#dfe6ee] bg-white px-4 py-3 text-xs font-bold text-[#526079] hover:bg-[#f8fafc]"><ArrowLeft className="h-4 w-4" />لوحة الدعم الحالية</a></div>

<div className="mt-7 grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><Card className="rounded-[26px] border-[#e7ebf2] bg-white shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base font-black"><Plus className="h-4 w-4 text-[#198a6a]" />تهيئة Tenant جديد</CardTitle></CardHeader><CardContent className="space-y-4"><div><label className="mb-2 block text-xs font-bold">اسم العميل / المساحة</label><Input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="مثال: Acme Support" className="h-11 rounded-xl text-xs" /></div><div><label className="mb-2 block text-xs font-bold">System Prompt</label><textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="min-h-24 w-full rounded-xl border border-[#dfe6ee] bg-white p-3 text-xs leading-6 outline-none focus:border-[#35c29a]" /></div><Button disabled={bootstrap.isPending || workspaceName.trim().length < 2} onClick={() => bootstrap.mutate({ name: workspaceName, plan: "basic" })} className="h-11 w-full rounded-xl bg-[#101b35] text-xs font-bold text-white hover:bg-[#1b2c52]"><ShieldCheck className="ml-2 h-4 w-4 text-[#9af0d3]" />{bootstrap.isPending ? "جاري التهيئة..." : "إنشاء مساحة آمنة"}</Button>{tenantId && <div className="space-y-3 rounded-2xl bg-[#f4fcf8] p-4"><div className="flex items-center gap-2 text-xs font-black text-[#198a6a]"><CheckCircle2 className="h-4 w-4" />تم إنشاء الـ tenant والـ agent</div><div className="grid gap-2 text-[10px]"><div className="flex justify-between gap-3"><span className="text-[#8c99ac]">Tenant ID</span><code className="max-w-[220px] truncate font-bold">{tenantId}</code></div><div className="flex justify-between gap-3"><span className="text-[#8c99ac]">Agent ID</span><code className="max-w-[220px] truncate font-bold">{agentId}</code></div></div><div className="rounded-xl border border-[#bfeedd] bg-white p-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1 text-[10px] font-bold text-[#198a6a]"><KeyRound className="h-3 w-3" />API Key — يظهر مرة واحدة</span><button onClick={copyKey} className="text-[#198a6a]">{copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div><code className="block break-all text-[10px] text-[#526079]">{apiKey}</code></div></div>}</CardContent></Card>

<Card className="rounded-[26px] border-[#e7ebf2] bg-white shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base font-black"><Activity className="h-4 w-4 text-[#6376df]" />Golden Path — تشغيل حقيقي</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-4"><PathStep icon={KeyRound} label="Identity" done={Boolean(tenantId)} /><PathStep icon={Database} label="Tenant" done={Boolean(tenantId)} /><PathStep icon={Bot} label="Agent" done={Boolean(agentId)} /><PathStep icon={Play} label="Execution" done={Boolean(result)} /></div><div className="my-6 h-px bg-[#eef1f5]" /><div className="grid gap-4 md:grid-cols-[1fr_auto]"><div><label className="mb-2 block text-xs font-bold">رسالة اختبار Runtime</label><Input value={runInput} onChange={e => setRunInput(e.target.value)} className="h-11 rounded-xl text-xs" /></div><Button disabled={!apiKey || !agentId || run.isPending} onClick={() => run.mutate({ apiKey, agentId, input: runInput })} className="h-11 self-end rounded-xl bg-[#198a6a] px-6 text-xs font-bold text-white hover:bg-[#147758]"><Terminal className="ml-2 h-4 w-4" />{run.isPending ? "جارٍ التشغيل..." : "تشغيل الوكيل"}</Button></div>{result && <div className={`mt-5 rounded-2xl p-4 ${result.status === "succeeded" ? "bg-[#f4fcf8]" : "bg-[#fff7ee]"}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black"><span className={`h-2 w-2 rounded-full ${result.status === "succeeded" ? "bg-[#35c29a]" : "bg-[#f2a65a]"}`} />{result.status}</div><Badge className="border-0 bg-white text-[10px] text-[#526079]">{result.tokensUsed} tokens</Badge></div><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#526079]">{result.answer}</p><div className="mt-3 grid gap-2 text-[10px] text-[#98a4b5] sm:grid-cols-2"><span>Run: {result.runId || "—"}</span><span>Trace: {result.traceId || "—"}</span></div></div>}{overview.data && <div className="mt-6 grid gap-3 sm:grid-cols-3"><MiniStat icon={WalletCards} label="Usage" value={`${overview.data.usage.used} / ${overview.data.usage.quota}`} /><MiniStat icon={Bot} label="Agents" value={overview.data.agents.length} /><MiniStat icon={Activity} label="Runs" value={overview.data.runs.length} /></div>}</CardContent></Card></div>

<Card className="mt-5 rounded-[26px] border-[#e7ebf2] bg-[#101b35] text-white shadow-xl"><CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-[#9af0d3]"><Terminal className="h-4 w-4" />Developer Gateway</div><h2 className="mt-3 text-xl font-black">العقد الخارجي جاهز للأنظمة الأربعة</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-white/50">يمكن لكل مشروع استخدام نفس العقد عبر REST أو Widget: x-api-key، agentId، input. الأسرار لا تدخل سياق النموذج، وكل تشغيل يحصل على runId وtraceId.</p></div><pre dir="ltr" className="overflow-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-[10px] leading-5 text-[#b8f8e1]">{`POST /v1/runs\nX-API-Key: nova_...\n\n{\n  "agentId": "...",\n  "input": "..."\n}`}</pre></CardContent></Card><TenantsAdmin /><KnowledgeAdmin /></div></div>;
}

function KnowledgeAdmin() {
  const [token, setToken] = useState(() => localStorage.getItem("platformAdminToken") ?? "");
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [items, setItems] = useState<KnowledgeRow[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<"doc" | "faq" | "url">("doc");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTenants = async () => {
    if (!token) return;
    try {
      const res = await fetch("/v1/system/tenants", { headers: { "x-admin-token": token } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تحميل العملاء");
      setTenants(body.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (token) loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = async (tid: string, aid: string) => {
    setError("");
    try {
      const res = await fetch(`/v1/system/tenants/${tid}/agents/${aid}/knowledge`, { headers: { "x-admin-token": token } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تحميل المعرفة");
      setItems(body.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const selectTenant = (value: string) => {
    setTenantId(value);
    setAgentId("");
    setItems([]);
    const tenant = tenants.find(item => item.id === value);
    if (tenant && tenant.agents.length === 1) {
      setAgentId(tenant.agents[0].id);
      loadItems(tenant.id, tenant.agents[0].id);
    }
  };

  const selectAgent = (value: string) => {
    setAgentId(value);
    if (tenantId) loadItems(tenantId, value);
  };

  const add = async () => {
    if (!tenantId || !agentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/v1/system/tenants/${tenantId}/agents/${agentId}/knowledge`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token }, body: JSON.stringify({ title, content, sourceType }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل إضافة المعرفة");
      setNotice(body.data?.hasEmbedding ? "تمت الإضافة مع تضمين دلالي." : "تمت الإضافة (بدون تضمين لعدم توفر مفتاح المزود — البحث النصي يغطيها).");
      setTitle("");
      setContent("");
      await loadItems(tenantId, agentId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = async (knowledgeId: string) => {
    setError("");
    try {
      const res = await fetch(`/v1/system/knowledge/${knowledgeId}?tenantId=${tenantId}`, { method: "DELETE", headers: { "x-admin-token": token } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل الحذف");
      await loadItems(tenantId, agentId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card className="mt-5 rounded-[26px] border-[#e7ebf2] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-black"><Database className="h-4 w-4 text-[#6376df]" />إدارة المعرفة — إضافة وحذف</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-2 block text-xs font-bold">توكن المدير</label>
            <Input type="password" value={token} onChange={e => setToken(e.target.value)} className="h-11 rounded-xl text-xs" dir="ltr" />
          </div>
          <Button onClick={loadTenants} disabled={!token} className="h-11 self-end rounded-xl bg-[#101b35] px-6 text-xs font-bold text-white hover:bg-[#1b2c52]"><RefreshCw className="ml-2 h-4 w-4" />تحميل العملاء</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-bold">العميل</label>
            <select value={tenantId} onChange={e => selectTenant(e.target.value)} className="h-11 w-full rounded-xl border border-[#dfe6ee] bg-white px-3 text-xs font-bold outline-none focus:border-[#35c29a]">
              <option value="">اختر عميلًا…</option>
              {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold">الوكيل</label>
            <select value={agentId} onChange={e => selectAgent(e.target.value)} disabled={!tenantId} className="h-11 w-full rounded-xl border border-[#dfe6ee] bg-white px-3 text-xs font-bold outline-none focus:border-[#35c29a] disabled:opacity-50">
              <option value="">اختر وكيلًا…</option>
              {(tenants.find(tenant => tenant.id === tenantId)?.agents ?? []).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="rounded-2xl border border-[#f3c2c2] bg-[#fdeeee] p-3 text-xs font-bold text-[#c0392b]">{error}</div>}
        {notice && <div className="rounded-2xl border border-[#bfeedd] bg-[#f4fcf8] p-3 text-xs font-bold text-[#198a6a]">{notice}</div>}
        {tenantId && agentId && (
          <>
            <div className="space-y-2">
              {items.length === 0 && <p className="text-xs text-[#98a4b5]">لا مصادر معرفة لهذا الوكيل بعد.</p>}
              {items.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f8fb] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-[#526079]">
                    <span className="text-xs">{item.title}</span>
                    <Badge className="border-0 bg-white text-[9px] text-[#6376df]">{item.sourceType}</Badge>
                    <Badge className={`border-0 text-[9px] ${item.hasEmbedding ? "bg-[#f4fcf8] text-[#198a6a]" : "bg-white text-[#98a4b5]"}`}>{item.hasEmbedding ? "بحث دلالي" : "بحث نصي"}</Badge>
                  </div>
                  <Button onClick={() => del(item.id)} className="h-7 rounded-lg bg-[#fdeeee] px-3 text-[10px] font-bold text-[#c0392b] hover:bg-[#f8dcdc]"><Ban className="ml-1 h-3 w-3" />حذف</Button>
                </div>
              ))}
            </div>
            <div className="my-2 h-px bg-[#eef1f5]" />
            <div className="space-y-3">
              <div><label className="mb-2 block text-xs font-bold">عنوان المصدر</label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: سياسة الاسترجاع" className="h-11 rounded-xl text-xs" /></div>
              <div><label className="mb-2 block text-xs font-bold">المحتوى</label><textarea value={content} onChange={e => setContent(e.target.value)} className="min-h-24 w-full rounded-xl border border-[#dfe6ee] bg-white p-3 text-xs leading-6 outline-none focus:border-[#35c29a]" /></div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <select value={sourceType} onChange={e => setSourceType(e.target.value as "doc" | "faq" | "url")} className="h-11 w-full rounded-xl border border-[#dfe6ee] bg-white px-3 text-xs font-bold outline-none focus:border-[#35c29a]">
                  <option value="doc">مستند</option>
                  <option value="faq">سؤال شائع</option>
                  <option value="url">رابط</option>
                </select>
                <Button onClick={add} disabled={busy || title.trim().length < 2 || content.trim().length < 10} className="h-11 rounded-xl bg-[#198a6a] px-6 text-xs font-bold text-white hover:bg-[#147758]"><Plus className="ml-2 h-4 w-4" />{busy ? "جارٍ الإضافة..." : "إضافة مصدر"}</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type TenantKeyRow = { id: string; label: string; keyPrefix: string; revokedAt: string | null; lastUsedAt: string | null; createdAt: string };
type TenantRow = { id: string; name: string; plan: string; status: string; tokenQuota: number; tokenUsedThisCycle: number; agents: Array<{ id: string; name: string }>; keys: TenantKeyRow[] };
type KnowledgeRow = { id: string; title: string; sourceType: string; status: string; hasEmbedding: boolean; createdAt: string };
type RunRow = { id: string; status: string; error: string | null; input: string; tokensUsed: number; traceId: string; createdAt: string };

function TenantsAdmin() {
  const [token, setToken] = useState(() => localStorage.getItem("platformAdminToken") ?? "");
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [freshKey, setFreshKey] = useState<{ key: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [runsFor, setRunsFor] = useState<{ tenantId: string; rows: RunRow[] } | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/v1/system/tenants", { headers: { "x-admin-token": token } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تحميل قائمة العملاء");
      setTenants(body.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToken = () => { localStorage.setItem("platformAdminToken", token.trim()); setToken(token.trim()); load(); };

  const rotate = async (tenantId: string) => {
    setError("");
    try {
      const res = await fetch(`/v1/system/tenants/${tenantId}/rotate-key`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token }, body: JSON.stringify({}) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تدوير المفتاح");
      setFreshKey({ key: body.data.key, label: body.data.label });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const revoke = async (tenantId: string, keyId: string) => {
    setError("");
    try {
      const res = await fetch(`/v1/system/tenants/${tenantId}/revoke-key`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token }, body: JSON.stringify({ keyId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل إلغاء المفتاح");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleStatus = async (tenantId: string, status: "active" | "suspended") => {
    setError("");
    try {
      const res = await fetch(`/v1/system/tenants/${tenantId}/status`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token }, body: JSON.stringify({ status }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تغيير حالة العميل");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const showRuns = async (tenantId: string) => {
    if (runsFor?.tenantId === tenantId) {
      setRunsFor(null);
      return;
    }
    setError("");
    try {
      const res = await fetch(`/v1/system/tenants/${tenantId}/runs`, { headers: { "x-admin-token": token } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "فشل تحميل السجل");
      setRunsFor({ tenantId, rows: body.data ?? [] });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copyFresh = async () => {
    if (!freshKey) return;
    await navigator.clipboard?.writeText(freshKey.key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="mt-5 rounded-[26px] border-[#e7ebf2] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-black">
          <span className="flex items-center gap-2"><Users className="h-4 w-4 text-[#198a6a]" />إدارة العملاء والمفاتيح</span>
          <Button onClick={load} disabled={loading || !token} className="h-8 rounded-lg bg-[#f7f8fb] px-3 text-[10px] font-bold text-[#526079] hover:bg-[#eef1f5]"><RefreshCw className={`ml-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-2 block text-xs font-bold">توكن المدير (PLATFORM_ADMIN_TOKEN)</label>
            <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="توكن الإدارة الخاص بك" className="h-11 rounded-xl text-xs" dir="ltr" />
          </div>
          <Button onClick={saveToken} disabled={token.trim().length < 8} className="h-11 self-end rounded-xl bg-[#101b35] px-6 text-xs font-bold text-white hover:bg-[#1b2c52]"><ShieldCheck className="ml-2 h-4 w-4" />حفظ وفحص</Button>
        </div>
        {error && <div className="rounded-2xl border border-[#f3c2c2] bg-[#fdeeee] p-3 text-xs font-bold text-[#c0392b]">{error}</div>}
        {freshKey && (
          <div className="rounded-2xl border border-[#bfeedd] bg-[#f4fcf8] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] font-black text-[#198a6a]"><KeyRound className="h-3 w-3" />مفتاح جديد ({freshKey.label}) — يظهر مرة واحدة فقط</span>
              <button onClick={copyFresh} className="text-[#198a6a]">{copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
            </div>
            <code className="block break-all text-[10px] text-[#526079]">{freshKey.key}</code>
          </div>
        )}
        {token && tenants.length === 0 && !loading && !error && <p className="text-xs text-[#98a4b5]">لا يوجد عملاء مسجلون بعد — أنشئ واحدًا من الأعلى.</p>}
        {tenants.map(tenant => (
          <div key={tenant.id} className="rounded-2xl border border-[#eef1f5] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black">{tenant.name}</span>
                <Badge className="border-0 bg-[#f4fcf8] text-[10px] text-[#198a6a]">{tenant.plan}</Badge>
                <Badge className="border-0 bg-[#f7f8fb] text-[10px] text-[#526079]">{tenant.agents.length} agents</Badge>
                <Badge className={`border-0 text-[9px] ${tenant.status === "active" ? "bg-[#f4fcf8] text-[#198a6a]" : "bg-[#fff7ee] text-[#b06f1f]"}`}>{tenant.status === "active" ? "نشط" : "موقوف"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#98a4b5]">usage: {tenant.tokenUsedThisCycle} / {tenant.tokenQuota}</span>
                <Button onClick={() => showRuns(tenant.id)} className="h-7 rounded-lg bg-[#f7f8fb] px-3 text-[10px] font-bold text-[#526079] hover:bg-[#eef1f5]"><Activity className="ml-1 h-3 w-3" />{runsFor?.tenantId === tenant.id ? "إخفاء السجل" : "السجل"}</Button>
                {tenant.status === "active" ? (
                  <Button onClick={() => toggleStatus(tenant.id, "suspended")} className="h-7 rounded-lg bg-[#fff7ee] px-3 text-[10px] font-bold text-[#b06f1f] hover:bg-[#fdeed8]"><Ban className="ml-1 h-3 w-3" />إيقاف</Button>
                ) : (
                  <Button onClick={() => toggleStatus(tenant.id, "active")} className="h-7 rounded-lg bg-[#f4fcf8] px-3 text-[10px] font-bold text-[#198a6a] hover:bg-[#e9f8f2]"><CheckCircle2 className="ml-1 h-3 w-3" />تشغيل</Button>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {tenant.keys.map(key => (
                <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f8fb] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-[#526079]">
                    <code dir="ltr">{key.keyPrefix}…</code>
                    <span>{key.label}</span>
                    {key.revokedAt ? <Badge className="border-0 bg-[#fdeeee] text-[9px] text-[#c0392b]">ملغي</Badge> : <Badge className="border-0 bg-[#f4fcf8] text-[9px] text-[#198a6a]">نشط</Badge>}
                    {key.lastUsedAt && <span className="text-[#98a4b5]">آخر استخدام: {new Date(key.lastUsedAt).toLocaleDateString("ar-EG")}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => rotate(tenant.id)} className="h-7 rounded-lg bg-[#101b35] px-3 text-[10px] font-bold text-white hover:bg-[#1b2c52]"><RotateCcw className="ml-1 h-3 w-3" />تدوير</Button>
                    {!key.revokedAt && <Button onClick={() => revoke(tenant.id, key.id)} className="h-7 rounded-lg bg-[#fdeeee] px-3 text-[10px] font-bold text-[#c0392b] hover:bg-[#f8dcdc]"><Ban className="ml-1 h-3 w-3" />إلغاء</Button>}
                  </div>
                </div>
              ))}
              {tenant.keys.length === 0 && <p className="text-[10px] text-[#98a4b5]">لا مفاتيح — اضغط تدوير لإنشاء أول مفتاح.</p>}
            </div>
            {runsFor?.tenantId === tenant.id && (
              <div className="mt-3 rounded-xl border border-[#eef1f5] bg-[#fafbfd] p-3">
                <div className="mb-2 text-[10px] font-black text-[#526079]">آخر الـ runs ({runsFor.rows.length})</div>
                {runsFor.rows.length === 0 && <p className="text-[10px] text-[#98a4b5]">لا runs بعد.</p>}
                {runsFor.rows.map(run => (
                  <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f5] py-1.5 last:border-0">
                    <span className={`text-[10px] font-black ${run.status === "succeeded" ? "text-[#198a6a]" : run.status === "failed" ? "text-[#c0392b]" : "text-[#b06f1f]"}`}>{run.status}</span>
                    <span className="max-w-[260px] truncate text-[10px] text-[#526079]">{run.input || "—"}</span>
                    {run.error && <span className="max-w-[220px] truncate text-[10px] text-[#c0392b]">{run.error}</span>}
                    <span className="text-[10px] text-[#98a4b5]">{run.tokensUsed} tk · {new Date(run.createdAt).toLocaleTimeString("ar-EG")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PathStep({ icon: Icon, label, done }: { icon: typeof KeyRound; label: string; done: boolean }) { return <div className="flex items-center gap-2 rounded-xl bg-[#f7f8fb] p-3"><div className={`grid h-8 w-8 place-items-center rounded-lg ${done ? "bg-[#e9f8f2] text-[#198a6a]" : "bg-white text-[#a3adbb]"}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</div><span className="text-[11px] font-bold">{label}</span></div>; }
function MiniStat({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string | number }) { return <div className="flex items-center gap-3 rounded-xl bg-[#f7f8fb] p-3"><Icon className="h-4 w-4 text-[#6376df]" /><div><div className="text-[10px] text-[#9aa6b6]">{label}</div><div className="mt-1 text-sm font-black">{value}</div></div></div>; }
