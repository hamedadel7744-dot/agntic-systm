import { AIChatBox, Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Bot, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

export default function Embed() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const systemId = Number(params.get("systemId") ?? 1);
  const systemName = params.get("systemName") ?? "نظامك";
  const [messages, setMessages] = useState<Message[]>([]);
  const chat = trpc.ai.chat.useMutation({ onSuccess: result => setMessages(current => [...current, { role: "assistant", content: result.answer }]) });

  const onSend = (message: string) => {
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    chat.mutate({ systemId, message, history: next.slice(-8), currentPage: params.get("page") ?? "داخل النظام" });
  };

  return <div dir="rtl" className="min-h-screen bg-[#f6f7fb] p-3 text-[#14213a]"><div className="mx-auto max-w-2xl"><div className="mb-3 flex items-center justify-between rounded-2xl bg-[#101b35] px-4 py-3 text-white shadow-lg"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#35c29a] text-[#101b35]"><Bot className="h-4 w-4" /></div><div><div className="text-sm font-black">مساعد {systemName}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-[#35c29a]" />متاح للمساعدة</div></div></div><ShieldCheck className="h-4 w-4 text-[#9af0d3]" /></div><AIChatBox messages={messages} onSendMessage={onSend} isLoading={chat.isPending} height="calc(100vh - 108px)" placeholder="اكتب سؤالك هنا..." emptyStateMessage="أهلًا! أنا مساعدك داخل النظام" suggestedPrompts={["إزاي أبدأ؟", "فين أجد التقارير؟", "عندي مشكلة تقنية"]} /><div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-[#9aa6b6]"><Sparkles className="h-3 w-3" />مدعوم بواسطة Nova Support Agent</div></div></div>;
}
