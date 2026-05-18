import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getRuntimeEnv } from "@/server/config/env";
import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import {
  getRevalidationPaths,
  parseRevalidationPayload,
  validateRevalidationSignature,
} from "@/server/modules/content/revalidation.service";
import { notifyLark } from "@/server/modules/ops/lark-notifier.service";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const env = getRuntimeEnv();

  if (!env.SANITY_WEBHOOK_SECRET) {
    return NextResponse.json(
      failure(requestId, "REVALIDATION_NOT_CONFIGURED", "SANITY_WEBHOOK_SECRET is not configured."),
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("x-foundation-signature") ?? request.headers.get("x-sanity-signature");

  if (!validateRevalidationSignature(rawBody, signatureHeader, env.SANITY_WEBHOOK_SECRET)) {
    await notifyLark("content.revalidate_signature_failed", {
      requestId,
      hasSignature: Boolean(signatureHeader),
      source: "sanity",
    });

    return NextResponse.json(
      failure(requestId, "REVALIDATION_SIGNATURE_INVALID", "Webhook signature is invalid."),
      { status: 401 },
    );
  }

  try {
    const payload = parseRevalidationPayload(rawBody);

    if (payload.event !== "content.published") {
      return NextResponse.json(
        success(requestId, {
          accepted: false,
          ignored: true,
          reason: `Unsupported event '${payload.event}'.`,
        }),
        { status: 202 },
      );
    }

    const revalidatedPaths = getRevalidationPaths(payload);

    for (const path of revalidatedPaths) {
      revalidatePath(path);
    }

    return NextResponse.json(
      success(requestId, {
        accepted: true,
        event: payload.event,
        revalidatedPaths,
      }),
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        failure(requestId, "REVALIDATION_PAYLOAD_INVALID", "Webhook payload is invalid."),
        { status: 400 },
      );
    }

    return NextResponse.json(
      failure(requestId, "REVALIDATION_FAILED", "Unable to process revalidation event.", {
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 },
    );
  }
}
