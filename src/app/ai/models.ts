// The two Claude models the app uses, what they cost, and which one a job gets. Settings offers
// Automatic, Always quick or Always careful; Automatic gives small edits and checks the quick
// model and big creative jobs the careful one. Prices are dollars per million tokens.

export type ModelChoice = "auto" | "quick" | "careful";

export interface ModelInfo {
  id: string;
  name: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const QUICK: ModelInfo = { id: "claude-haiku-5-5", name: "Claude Haiku 5.5 (quick)", input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 };
export const CAREFUL: ModelInfo = { id: "claude-opus-5-5", name: "Claude Opus 5.5 (careful)", input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
const KNOWN = [QUICK, CAREFUL];

/** The size of job, which Automatic uses to choose. */
export type JobSize = "small" | "big";

export function pickModel(choice: ModelChoice, size: JobSize): ModelInfo {
  if (choice === "quick") return QUICK;
  if (choice === "careful") return CAREFUL;
  return size === "small" ? QUICK : CAREFUL;
}

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** What a reply cost in dollars. A reply from a model the app doesn't know is priced as careful. */
export function costOf(modelId: string, u: Usage): number {
  const m = KNOWN.find((k) => modelId.startsWith(k.id)) ?? CAREFUL;
  const per = (n: number | null | undefined, price: number) => ((n ?? 0) * price) / 1_000_000;
  return per(u.input_tokens, m.input) + per(u.output_tokens, m.output) + per(u.cache_creation_input_tokens, m.cacheWrite) + per(u.cache_read_input_tokens, m.cacheRead);
}

/**
 * A rough guess before a job runs: about four characters a token, a few rounds of reading and
 * answering, and a reply of a couple of thousand tokens. Estimates are approximate.
 */
export function estimateCost(model: ModelInfo, inputChars: number, rounds = 3, outputTokens = 2500): number {
  const input = (inputChars / 4) * rounds;
  return (input * model.input + outputTokens * rounds * model.output) / 1_000_000;
}

export function dollars(usd: number): string {
  if (usd < 0.01) return "under 1 cent";
  return `$${usd.toFixed(2)}`;
}
