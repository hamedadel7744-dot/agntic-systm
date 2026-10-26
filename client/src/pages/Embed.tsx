import { AIChatBox, Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Bot, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export default function Embed() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const systemId = Number(params.get("systemId") ?? 1);
  const systemName = params.get("agentName") ?? params.get("systemName") ?? "نظامك";
  // Platform contract: agentKey + agentId switch the embed onto the real /v1/runs
  // runtime (tenant isolation, usage metering, tools). Without them we stay on the
  // legacy demo chat so old embeds keep working.
  // widget.js hands the key over postMessage (nova:auth) instead of the iframe URL,
  // so the key never reaches server logs, browser history or Referer headers. The
  // query-string read below stays only as a fallback for stale cached widget copies.
  const [handedAuth, setHandedAuth] = useState<{ agentKey: string; agentId: string } | null>(null);
  useEffect(() => {
    const onAuth = (event: MessageEvent) => {
      // Only the direct embedder may deliver credentials — never a sibling frame.
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; agentKey?: string; agentId?: string } | null;
      if (!data || data.type !== "nova:auth" || !data.agentKey) return;
      setHandedAuth({ agentKey: data.agentKey, agentId: data.agentId ?? "" });
    };
    window.addEventListener("message", onAuth);
    return () => window.removeEventListener("message", onAuth);
  }, []);
  const agentKey = handedAuth?.agentKey ?? params.get("agentKey") ?? "";
  const agentId = handedAuth?.agentId || (params.get("agentId") ?? "");
  // Key-only integration: the server resolves the tenant's default agent when
  // agentId is absent, so the key alone activates the real runtime.
  const platformMode = Boolean(agentKey);
  const [messages, setMessages] = useState<Message[]>([]);
  const [platformPending, setPlatformPending] = useState(false);
  const chat = trpc.ai.chat.useMutation({ onSuccess: result => setMessages(current => [...current, { role: "assistant", content: result.answer }]) });

  const sessionRef = useRef<string>(sessionStorage.getItem("novaEmbedSession") ?? "");
  if (!sessionRef.current) {
    sessionRef.current = (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
    sessionStorage.setItem("novaEmbedSession", sessionRef.current);
  }

  const runOnPlatform = async (message: string) => {
    setPlatformPending(true);
    try {
      const res = await fetch("/v1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": agentKey },
        body: JSON.stringify({ ...(agentId ? { agentId } : {}), input: message, externalSessionId: sessionRef.current, metadata: { page: params.get("page") ?? window.location.pathname } }),
      });
      const body = await res.json();
      // Failed runs still return a structured outcome with an honest answer; HTTP
      // errors surface their message instead of a fake success.
      const answer = body?.data?.answer ?? body?.error?.message ?? "تعذر الحصول على رد من الوكيل.";
      setMessages(current => [...current, { role: "assistant", content: answer }]);
    } catch {
      setMessages(current => [...current, { role: "assistant", content: "تعذر الاتصال بالخادم. حاول مرة أخرى." }]);
    } finally {
      setPlatformPending(false);
    }
  };

  const onSend = (message: string) => {
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    if (platformMode) {
      runOnPlatform(message);
    } else {
      chat.mutate({ systemId, message, history: next.slice(-8), currentPage: params.get("page") ?? "داخل النظام" });
    }
  };

  return <div dir="rtl" className="min-h-screen bg-[#f6f7fb] p-3 text-[#14213a]"><div className="mx-auto max-w-2xl"><div className="mb-3 flex items-center justify-between rounded-2xl bg-[#101b35] px-4 py-3 text-white shadow-lg"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#35c29a] text-[#101b35]"><Bot className="h-4 w-4" /></div><div><div className="text-sm font-black">مساعد {systemName}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-[#35c29a]" />{platformMode ? "متصل بمنصة التشغيل" : "وضع العرض التجريبي"}</div></div></div><ShieldCheck className="h-4 w-4 text-[#9af0d3]" /></div><AIChatBox messages={messages} onSendMessage={onSend} isLoading={platformMode ? platformPending : chat.isPending} height="calc(100vh - 108px)" placeholder="اكتب سؤالك هنا..." emptyStateMessage="أهلًا! أنا مساعدك داخل النظام" suggestedPrompts={["إزاي أبدأ؟", "فين أجد التقارير؟", "عندي مشكلة تقنية"]} />{chat.isError && <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-[#f3c2c2] bg-[#fdeeee] p-3 text-xs font-bold text-[#c0392b]"><span>{chat.error?.message ?? "تعذر إرسال الرسالة."}</span><Button onClick={() => chat.variables && chat.mutate(chat.variables)} disabled={chat.isPending} className="h-7 shrink-0 rounded-lg bg-[#fdeeee] px-3 text-[10px] font-bold text-[#c0392b] hover:bg-[#f8dcdc]"><RotateCcw className="ml-1 h-3 w-3" />إعادة المحاولة</Button></div>}<div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-[#9aa6b6]"><Sparkles className="h-3 w-3" />مدعوم بواسطة Nova Agent Platform</div></div></div>;
}
