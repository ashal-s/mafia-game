import { NextResponse } from "next/server";
import { autoAdvanceExpiredPhases } from "@/app/games/actions";

// web-push and the service-role client are Node-only.
export const runtime = "nodejs";
// Never cache: this must run fresh on every cron tick.
export const dynamic = "force-dynamic";

/**
 * Vercel Cron entrypoint that advances any game whose active phase has expired.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set
 * in the project env, which is how we reject arbitrary public callers. The
 * schedule lives in `vercel.json`.
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await autoAdvanceExpiredPhases();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
