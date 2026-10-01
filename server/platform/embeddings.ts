import { ENV } from "../_core/env";
import { getLlmApiBase } from "../_core/llm";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

/**
 * Best-effort embedding via the same OpenAI-compatible provider used for chat.
 * Returns null on missing key or any failure — knowledge ingestion and search
 * must keep working (keyword fallback) instead of failing silently or loudly
 * blocking on an optional enhancement.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!ENV.forgeApiKey) return null;
  try {
    const res = await fetch(`${getLlmApiBase()}/v1/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ENV.forgeApiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding?: unknown }> };
    const vector = json?.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length > 0 ? (vector as number[]) : null;
  } catch {
    return null;
  }
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map(value => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}
