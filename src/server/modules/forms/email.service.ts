import { Resend } from "resend";

import { getAdapterStatus, getRuntimeEnv } from "@/server/config/env";
import type { SubmissionPayload } from "@/server/modules/forms/form.service";

export type LeadEmailResult = {
  delivered: boolean;
  provider: "resend";
  messageId: string | null;
  reason: string | null;
};

export type SendLeadEmailInput = {
  formId: string;
  payload: SubmissionPayload;
  requestId: string;
};

let resendClient: Resend | null = null;

function getResendClient() {
  if (resendClient) {
    return resendClient;
  }

  const env = getRuntimeEnv();

  if (!env.RESEND_API_KEY) {
    throw new Error("Resend API key is missing.");
  }

  resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

export async function sendLeadEmail(input: SendLeadEmailInput): Promise<LeadEmailResult> {
  const adapters = getAdapterStatus();

  if (!adapters.email) {
    return {
      delivered: false,
      provider: "resend",
      messageId: null,
      reason: "EMAIL_ADAPTER_NOT_CONFIGURED",
    };
  }

  const env = getRuntimeEnv();

  try {
    const resend = getResendClient();
    const response = await resend.emails.send({
      from: env.EMAIL_FROM!,
      to: [env.LEADS_INBOX_EMAIL!],
      replyTo: input.payload.email,
      subject: `[Foundation-Core] ${input.formId} lead from ${input.payload.name}`,
      text: [
        `Request ID: ${input.requestId}`,
        `Form: ${input.formId}`,
        `Name: ${input.payload.name}`,
        `Email: ${input.payload.email}`,
        `Phone: ${input.payload.phone ?? "n/a"}`,
        "",
        input.payload.message,
      ].join("\n"),
    });

    if (response.error) {
      return {
        delivered: false,
        provider: "resend",
        messageId: null,
        reason: response.error.message,
      };
    }

    return {
      delivered: true,
      provider: "resend",
      messageId: response.data?.id ?? null,
      reason: null,
    };
  } catch (error) {
    return {
      delivered: false,
      provider: "resend",
      messageId: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function resetLeadEmailServiceForTests() {
  resendClient = null;
}
