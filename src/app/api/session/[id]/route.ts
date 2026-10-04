import { NextRequest } from "next/server";
import { err, json, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { store } from "@/lib/session";
import { EphemeralStore } from "@/lib/session/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes the session and returns a receipt. The client may claim deletion
 * to the user ONLY when `verified === true`. Idempotent and not rate-limited
 * (we never want to block a deletion).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return err("bad_origin", 403);
  if (!EphemeralStore.isValidId(params.id)) return err("invalid_id", 400);

  const receipt = store.destroy(params.id);
  if (!receipt.verified) {
    log.error("deletion_unverified", { route: "delete", count: store.deletionFailures });
    return json({ ...receipt, ttlFallback: true }, 500);
  }
  log.info("session_deleted", { route: "delete", count: store.size() });
  return json(receipt);
}
