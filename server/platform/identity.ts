import { createHash, randomUUID } from "node:crypto";

export const newId = () => randomUUID();
export const hashApiKey = (value: string) => createHash("sha256").update(value).digest("hex");
export const createApiKey = () => {
  const raw = `nova_${randomUUID().replaceAll("-", "")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
};

export function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (typeof current === "string" && /(api[_-]?key|secret|token|password|authorization)/i.test(_key)) return "[REDACTED]";
    return current;
  });
}
