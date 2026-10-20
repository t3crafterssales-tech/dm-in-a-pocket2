import { randomBytes } from "node:crypto";
import type { Id } from "./types.ts";

/** A new permanent id: 16 random hex characters, never reused. */
export function newId(): Id {
  return randomBytes(8).toString("hex");
}
