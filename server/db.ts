import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  auditLogs,
  conversations,
  knowledgeSources,
  systems,
  tickets,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    values[field] = value ?? null;
    updateSet[field] = value ?? null;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const demoSystems = [
  { id: 1, slug: "market-hub", name: "Market Hub", market: "التجارة الإلكترونية", description: "إدارة المتاجر والطلبات والعملاء", status: "connected", accent: "#35c29a", activeUsers: 1842, knowledgeCount: 126 },
  { id: 2, slug: "clinic-flow", name: "Clinic Flow", market: "العيادات والرعاية", description: "تشغيل العيادات والمواعيد والملفات", status: "connected", accent: "#f2a65a", activeUsers: 763, knowledgeCount: 89 },
  { id: 3, slug: "fleet-line", name: "Fleet Line", market: "النقل والخدمات اللوجستية", description: "تتبع الأساطيل والرحلات والسائقين", status: "attention", accent: "#8ea7ff", activeUsers: 428, knowledgeCount: 74 },
  { id: 4, slug: "learn-space", name: "Learn Space", market: "التعليم والتدريب", description: "المحتوى، الطلاب، والمدربين", status: "connected", accent: "#df7ac4", activeUsers: 2190, knowledgeCount: 142 },
];

const demoTickets = [
  { id: 1, number: "TKT-1048", title: "لا تظهر الطلبات الجديدة في لوحة المتجر", systemId: 1, category: "بيانات", priority: "high", status: "in_progress", requesterName: "سارة محمود", requesterEmail: "sara@example.com", assignee: "محمود علي", createdAt: new Date(Date.now() - 1000 * 60 * 28), updatedAt: new Date(Date.now() - 1000 * 60 * 8) },
  { id: 2, number: "TKT-1047", title: "محتاج شرح إعداد تنبيهات المواعيد", systemId: 2, category: "استخدام", priority: "low", status: "resolved", requesterName: "د. كريم يوسف", requesterEmail: "karim@example.com", assignee: "الوكيل الذكي", createdAt: new Date(Date.now() - 1000 * 60 * 54), updatedAt: new Date(Date.now() - 1000 * 60 * 37) },
  { id: 3, number: "TKT-1046", title: "تعذر ربط حساب السائق بالتطبيق", systemId: 3, category: "صلاحيات", priority: "urgent", status: "waiting", requesterName: "عمر حسن", requesterEmail: "omar@example.com", assignee: "فريق التكامل", createdAt: new Date(Date.now() - 1000 * 60 * 91), updatedAt: new Date(Date.now() - 1000 * 60 * 66) },
  { id: 4, number: "TKT-1045", title: "كيف أنشئ مسارًا تعليميًا جديدًا؟", systemId: 4, category: "إرشاد", priority: "medium", status: "open", requesterName: "ندى سمير", requesterEmail: "nada@example.com", assignee: null, createdAt: new Date(Date.now() - 1000 * 60 * 125), updatedAt: new Date(Date.now() - 1000 * 60 * 125) },
];

const demoKnowledge = [
  { id: 1, systemId: 1, title: "دليل البدء السريع للتاجر", sourceType: "guide", status: "indexed", chunks: 38, lastIndexedAt: new Date(Date.now() - 1000 * 60 * 45) },
  { id: 2, systemId: 1, title: "الأسئلة المتكررة عن الطلبات", sourceType: "faq", status: "indexed", chunks: 27, lastIndexedAt: new Date(Date.now() - 1000 * 60 * 45) },
  { id: 3, systemId: 2, title: "إدارة المواعيد والموارد", sourceType: "guide", status: "processing", chunks: 24, lastIndexedAt: new Date(Date.now() - 1000 * 60 * 70) },
  { id: 4, systemId: 3, title: "سياسات ربط المركبات", sourceType: "policy", status: "needs_review", chunks: 19, lastIndexedAt: new Date(Date.now() - 1000 * 60 * 120) },
  { id: 5, systemId: 4, title: "دليل المدرّب الجديد", sourceType: "guide", status: "indexed", chunks: 44, lastIndexedAt: new Date(Date.now() - 1000 * 60 * 30) },
];

export function getDemoSnapshot() {
  return {
    systems: demoSystems,
    tickets: demoTickets,
    knowledge: demoKnowledge,
    metrics: { conversations: 284, resolvedByAgent: 231, resolutionRate: 81, avgResponse: "18ث", openTickets: 12 },
    activity: [
      { id: 1, label: "الوكيل أغلق محادثة تلقائيًا", detail: "Market Hub · منذ 3 دقائق", tone: "success" },
      { id: 2, label: "مصدر معرفة يحتاج مراجعة", detail: "Fleet Line · منذ 12 دقيقة", tone: "warning" },
      { id: 3, label: "تم تحويل تذكرة لفريق التكامل", detail: "Clinic Flow · منذ 24 دقيقة", tone: "info" },
      { id: 4, label: "تم تسجيل نظام جديد", detail: "Learn Space · منذ ساعة", tone: "success" },
    ],
  };
}

export async function getDashboardSnapshot() {
  const db = await getDb();
  if (!db) return getDemoSnapshot();
  try {
    const [systemRows, ticketRows, knowledgeRows] = await Promise.all([
      db.select().from(systems).orderBy(systems.id),
      db.select().from(tickets).orderBy(desc(tickets.updatedAt)).limit(8),
      db.select().from(knowledgeSources).orderBy(desc(knowledgeSources.createdAt)).limit(8),
    ]);
    if (systemRows.length === 0 && ticketRows.length === 0) return getDemoSnapshot();
    const openTickets = ticketRows.filter(ticket => ticket.status !== "resolved").length;
    return {
      systems: systemRows,
      tickets: ticketRows,
      knowledge: knowledgeRows,
      metrics: { conversations: 0, resolvedByAgent: 0, resolutionRate: 0, avgResponse: "—", openTickets },
      activity: [],
    };
  } catch (error) {
    console.warn("[Database] Snapshot fallback:", error);
    return getDemoSnapshot();
  }
}

export async function createTicket(input: {
  systemId?: number;
  title: string;
  description?: string;
  category?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  requesterName?: string;
  requesterEmail?: string;
}) {
  const number = `TKT-${Math.floor(1000 + Math.random() * 8999)}`;
  const db = await getDb();
  if (!db) {
    return { id: Date.now(), number, ...input, category: input.category ?? "استخدام", priority: input.priority ?? "medium", status: "open", assignee: null, createdAt: new Date(), updatedAt: new Date() };
  }
  try {
    await db.insert(tickets).values({
      number,
      systemId: input.systemId,
      title: input.title,
      description: input.description,
      category: input.category ?? "استخدام",
      priority: input.priority ?? "medium",
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
    });
    const result = await db.select().from(tickets).where(eq(tickets.number, number)).limit(1);
    return result[0];
  } catch (error) {
    console.warn("[Database] Ticket fallback:", error);
    return { id: Date.now(), number, ...input, category: input.category ?? "استخدام", priority: input.priority ?? "medium", status: "open", assignee: null, createdAt: new Date(), updatedAt: new Date() };
  }
}

export async function listTickets() {
  const db = await getDb();
  if (!db) return demoTickets;
  try {
    const result = await db.select().from(tickets).orderBy(desc(tickets.updatedAt)).limit(100);
    return result.length ? result : demoTickets;
  } catch {
    return demoTickets;
  }
}

export async function listSystems() {
  const db = await getDb();
  if (!db) return demoSystems;
  try {
    const result = await db.select().from(systems).orderBy(systems.id);
    return result.length ? result : demoSystems;
  } catch {
    return demoSystems;
  }
}

export async function listKnowledgeSources() {
  const db = await getDb();
  if (!db) return demoKnowledge;
  try {
    const result = await db.select().from(knowledgeSources).orderBy(desc(knowledgeSources.createdAt)).limit(100);
    return result.length ? result : demoKnowledge;
  } catch {
    return demoKnowledge;
  }
}

export async function addAuditLog(input: { systemId?: number; action: string; actorType: string; actorLabel?: string; details?: string }) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values(input);
  } catch (error) {
    console.warn("[Database] Audit log failed:", error);
  }
}
