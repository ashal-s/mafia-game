import { NextResponse } from "next/server";
import { autoAdvanceExpiredPhases } from "@/app/games/actions";

// web-push and the service-role client are Node-only.
export const runtime = "nodejs";
// Never cache: this must run fresh on every cron tick.
export const dynamic = "force-dynamic";

/**
 * Vercel Cron entrypoint that advances any game whose active phase has expired.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has a
 * CRON_SECRET. The schedule is configured in `vercel.json`.
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
