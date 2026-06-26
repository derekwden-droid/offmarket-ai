import { NextResponse, type NextRequest } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { addSuppression } from "@/lib/services/suppression";

// Prisma + crypto require the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/unsubscribe?e=<email>&t=<token> — one-click CAN-SPAM unsubscribe.
 *
 * Public (middleware-bypassed) but authenticated by the per-email HMAC token, so
 * the link works without a login yet cannot be forged to suppress an arbitrary
 * address. A valid click writes an EMAIL suppression (reason STOP) that hard-
 * blocks every future email send to that address at the gate.
 */
function page(title: string, message: string, ok: boolean): NextResponse {
  const color = ok ? "#10B981" : "#F43F5E";
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="margin:0;background:#0B0F19;color:#E5E7EB;font-family:system-ui,sans-serif"><div style="max-width:520px;margin:12vh auto;padding:32px;background:#111827;border:1px solid #1F2937;border-radius:16px;text-align:center"><div style="font-size:15px;font-weight:600;color:${color}">${title}</div><p style="color:#9CA3AF;font-size:14px;line-height:1.6;margin-top:12px">${message}</p></div></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("e");
  const token = request.nextUrl.searchParams.get("t");

  if (!email) {
    return page("Invalid link", "This unsubscribe link is missing its address.", false);
  }

  const valid = verifyUnsubscribeToken(
    email,
    token,
    process.env.UNSUBSCRIBE_SECRET,
  );
  if (!valid) {
    return page(
      "Invalid or expired link",
      "We couldn't verify this unsubscribe link. Reply STOP to any message, or contact support.",
      false,
    );
  }

  await addSuppression({
    value: email,
    channel: "EMAIL",
    reason: "STOP",
    detail: "One-click email unsubscribe",
  });

  return page(
    "You're unsubscribed",
    "You will not receive any more emails from us. You can close this page.",
    true,
  );
}
