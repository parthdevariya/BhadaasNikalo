import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { clientIp, err, json, limiter, readCapped, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { getSttProvider, ProviderError } from "@/lib/providers/stt";
import { detectRisk } from "@/lib/safety/detect";
import { store } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|x-m4a)(;.*)?$/;

/**
 * Receives the recorded clip ONCE, transcribes it, scans for risk, encrypts the
 * transcript into the ephemeral session, and zero-fills the audio buffer.
 * The response never contains the transcript.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const started = Date.now();
  if (!sameOrigin(req)) return err("bad_origin", 403);
  if (!limiter.check(clientIp(req), 2)) return err("rate_limited", 429);

  const session = store.get(params.id);
  if (!session) return err("session_expired", 404);
  if (session.hasTranscript) return err("already_uploaded", 409);

  const mime = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ALLOWED_MIME.test(mime)) return err("unsupported_audio", 415);

  const hint = req.headers.get("x-lang-hint");
  const languageHint = hint && /^[a-z]{2}(-IN)?$/.test(hint) ? hint : null;

  const body = await readCapped(req, config.maxAudioBytes);
  if (body === "too_large") return err("too_large", 413);
  if (body === "empty") return err("empty_audio", 400);

  let audio: Buffer | null = body;
  try {
    const stt = getSttProvider();
    const result = await stt.transcribe({ audio, mimeType: mime.split(";")[0]!, languageHint });
    // Audio is no longer needed — wipe it before anything else happens.
    audio.fill(0);
    audio = null;

    const text = result.text;
    if (!text || text.replace(/[\s.,…-]/g, "").length < 2) {
      log.info("audio_processed", { route: "audio", status: 200, ms: Date.now() - started, code: "empty_speech" });
      return json({ ok: true, empty: true, language: null, risk: "none" });
    }

    const risk = detectRisk(text);
    const ok = store.setTranscript(params.id, text, result.language, risk.level);
    if (!ok) return err("session_expired", 404);

    log.info("audio_processed", {
      route: "audio",
      status: 200,
      ms: Date.now() - started,
      provider: stt.name,
      risk: risk.level,
      language: result.language ?? undefined,
    });
    return json({ ok: true, empty: false, language: result.language, risk: risk.level, categories: risk.categories });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "processing_failed";
    log.error("audio_failed", { route: "audio", code, status: e instanceof ProviderError ? e.status : undefined, ms: Date.now() - started });
    return err(code === "stt_not_configured" ? "stt_not_configured" : "processing_failed", 502);
  } finally {
    if (audio) audio.fill(0);
  }
}
