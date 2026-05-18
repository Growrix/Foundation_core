import { getAdapterStatus, getRuntimeEnv } from "@/server/config/env";

export type LarkEvent =
  | "lead.accepted"
  | "lead.email_failed"
  | "content.revalidate_signature_failed"
  | "content.revalidate_payload_invalid"
  | "content.revalidate_failed";

export type LarkNotificationResult = {
  sent: boolean;
  reason: string | null;
};

export async function notifyLark(event: LarkEvent, payload: Record<string, unknown>): Promise<LarkNotificationResult> {
  const adapters = getAdapterStatus();

  if (!adapters.lark) {
    return {
      sent: false,
      reason: "LARK_NOT_CONFIGURED",
    };
  }

  const env = getRuntimeEnv();

  try {
    const response = await fetch(env.LARK_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text: `[Foundation-Core] ${event}\n${JSON.stringify(payload)}`,
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        sent: false,
        reason: `LARK_HTTP_${response.status}`,
      };
    }

    return {
      sent: true,
      reason: null,
    };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
