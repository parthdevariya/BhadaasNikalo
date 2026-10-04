import { config } from "../config";
import { EphemeralStore } from "./store";

// One store per server process. globalThis keeps it across Next.js dev hot-reloads.
const g = globalThis as unknown as { __srgStore?: EphemeralStore };

export const store: EphemeralStore =
  g.__srgStore ?? (g.__srgStore = new EphemeralStore(config.sessionTtlSeconds * 1000));
