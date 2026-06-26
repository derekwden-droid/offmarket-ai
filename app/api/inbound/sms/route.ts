import { NextResponse, type NextRequest } from "next/server";
import { fail } from "@/lib/api";
import {
  verifyTwilioSignature,
  verifyTelnyxSignature,
  parseTwilioInbound,
  parseTelnyxInbound,
  type InboundSms,
} from "@/lib/webhooks/inbound-sms";
import { handleInboundSms } from "@/lib/inbound/handle";

// crypto + Prisma require the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbound/sms — provider-agnostic inbound SMS webhook (Twilio | Telnyx).
 *
 * Authentication is the provider's request signature, not the internal API
 * secret, so this route is excluded from that middleware gate (like /api/scrape
 * and /api/inngest). Twilio is verified by HMAC-SHA1 over (URL + sorted params);
 * Telnyx by Ed25519 over `${timestamp}|${body}`. A bad/missing signature gets
 * 401 (fail closed). Verified deliveries are handed to the STOP/HELP handler.
 *
 * Provider is detected from the signature headers. Each provider gets the ack
 * shape it expects (empty TwiML for Twilio; JSON for Telnyx) so the carrier
 * does not retry a successfully-handled message.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const twilioSig = request.headers.get("x-twilio-signature");
  const telnyxSig = request.headers.get("telnyx-signature-ed25519");

  let inbound: InboundSms;

  if (twilioSig) {
    const url = process.env.INBOUND_SMS_WEBHOOK_URL ?? request.url;
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const valid = verifyTwilioSignature({
      url,
      params,
      signature: twilioSig,
      authToken: process.env.TWILIO_AUTH_TOKEN,
    });
    if (!valid) {
      return fail("UNAUTHORIZED", "Invalid Twilio signature.", 401);
    }
    inbound = parseTwilioInbound(params);
    await handleInboundSms(inbound);
    // Empty TwiML: we reply (if needed) via the API in the handler, not TwiML.
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { "Content-Type": "text/xml" } },
    );
  }

  if (telnyxSig) {
    const valid = verifyTelnyxSignature({
      rawBody,
      signature: telnyxSig,
      timestamp: request.headers.get("telnyx-timestamp"),
      publicKeyBase64: process.env.TELNYX_PUBLIC_KEY,
    });
    if (!valid) {
      return fail("UNAUTHORIZED", "Invalid Telnyx signature.", 401);
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return fail("VALIDATION_ERROR", "Body is not valid JSON.", 422);
    }
    inbound = parseTelnyxInbound(
      json as Parameters<typeof parseTelnyxInbound>[0],
    );
    await handleInboundSms(inbound);
    return NextResponse.json({ ok: true });
  }

  return fail("UNAUTHORIZED", "Missing provider signature header.", 401);
}
