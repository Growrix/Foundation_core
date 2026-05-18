import { z } from "zod";

import type { LeadEmailResult } from "@/server/modules/forms/email.service";
import type { LeadPersistenceResult } from "@/server/modules/forms/lead.repository";
import { getFormsProviderAdapters } from "@/server/modules/forms/provider-adapters";
import {
  consumeSubmissionRateLimit,
  resetRateLimitForTests,
} from "@/server/modules/forms/rate-limit.service";
import type {
  SubmissionLifecycleEntry,
  SubmissionLifecycleStatus,
} from "@/server/modules/forms/submission-log.repository";
import { resetSubmissionLogForTests } from "@/server/modules/forms/submission-log.repository";
import type { LarkNotificationResult } from "@/server/modules/ops/lark-notifier.service";

const submissionSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  message: z.string().min(10),
  phone: z.string().min(7).optional(),
  website: z.string().optional(),
});

const acceptedForms = new Set(["contact", "quote", "booking"]);

export type SubmissionPayload = z.infer<typeof submissionSchema>;
export type SubmissionContext = {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type RejectedSubmission = {
  accepted: false;
  code: "FORM_NOT_FOUND" | "HONEYPOT_TRIGGERED" | "RATE_LIMITED";
  message: string;
  retryAfterSeconds?: number;
};

export type AcceptedSubmission = {
  accepted: true;
  formId: string;
  lead: {
    name: string;
    email: string;
    message: string;
    phone: string | null;
  };
  persistence: LeadPersistenceResult;
  email: LeadEmailResult;
  notifications: {
    leadAccepted: LarkNotificationResult;
    emailFailed: LarkNotificationResult | null;
  };
  rateLimitMode: "memory" | "database";
  lifecycle: SubmissionLifecycleEntry[];
};

export type ProcessSubmissionResult = RejectedSubmission | AcceptedSubmission;

export function parseSubmissionPayload(payload: unknown): SubmissionPayload {
  return submissionSchema.parse(payload);
}

export function resetRateLimitStateForTests() {
  resetRateLimitForTests();
  resetSubmissionLogForTests();
}

export function submitForm(formId: string, payload: SubmissionPayload): RejectedSubmission | {
  accepted: true;
  formId: string;
  lead: {
    name: string;
    email: string;
    message: string;
    phone: string | null;
  };
} {
  if (!acceptedForms.has(formId)) {
    return {
      accepted: false,
      code: "FORM_NOT_FOUND",
      message: `Unknown form '${formId}'.`,
    } as const;
  }

  if (payload.website && payload.website.trim().length > 0) {
    return {
      accepted: false,
      code: "HONEYPOT_TRIGGERED",
      message: "Spam protection was triggered.",
    } as const;
  }

  return {
    accepted: true,
    formId,
    lead: {
      name: payload.name,
      email: payload.email,
      message: payload.message,
      phone: payload.phone ?? null,
    },
  } as const;
}

export async function processLeadSubmission(
  formId: string,
  payload: SubmissionPayload,
  context: SubmissionContext,
): Promise<ProcessSubmissionResult> {
  const adapters = getFormsProviderAdapters();
  const lifecycle: SubmissionLifecycleEntry[] = [];

  const appendLifecycle = async (
    status: SubmissionLifecycleStatus,
    provider: string,
    details: Record<string, unknown>,
  ) => {
    const entry: SubmissionLifecycleEntry = {
      requestId: context.requestId,
      formId,
      status,
      provider,
      details,
      createdAt: new Date().toISOString(),
    };

    lifecycle.push(entry);
    await adapters.submissionLogAdapter.append(entry);
  };

  const baseResult = submitForm(formId, payload);

  if (!baseResult.accepted) {
    return baseResult;
  }

  const rateLimitKey = `${formId}:${context.ipAddress ?? "unknown"}`;
  const rateLimit = await consumeSubmissionRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    return {
      accepted: false,
      code: "RATE_LIMITED",
      message: "Too many submissions were received from this client. Please retry later.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  await appendLifecycle("accepted", "foundation.forms", {
    requestId: context.requestId,
    rateLimitMode: rateLimit.mode,
  });

  const persistence = await adapters.persistenceAdapter.persist({
    formId,
    payload,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (persistence.persisted) {
    await appendLifecycle("persisted", adapters.persistenceAdapter.name, {
      leadId: persistence.leadId,
      mode: persistence.mode,
    });
  }

  const email = await adapters.deliveryAdapter.deliver({
    formId,
    payload,
    requestId: context.requestId,
  });

  if (email.delivered) {
    await appendLifecycle("delivered", adapters.deliveryAdapter.name, {
      messageId: email.messageId,
      provider: email.provider,
    });
  } else {
    await appendLifecycle("delivery_failed", adapters.deliveryAdapter.name, {
      reason: email.reason,
      provider: email.provider,
    });
  }

  const leadAccepted = await adapters.notificationAdapter.notify("lead.accepted", {
    requestId: context.requestId,
    formId,
    emailDelivered: email.delivered,
    leadEmail: payload.email,
    persistenceMode: persistence.mode,
    leadId: persistence.leadId,
  });

  const emailFailed = email.delivered
    ? null
    : await adapters.notificationAdapter.notify("lead.email_failed", {
        requestId: context.requestId,
        formId,
        leadEmail: payload.email,
        reason: email.reason,
      });

  if (!leadAccepted.sent || (emailFailed && !emailFailed.sent)) {
    await appendLifecycle("notify_failed", adapters.notificationAdapter.name, {
      leadAcceptedSent: leadAccepted.sent,
      emailFailedSent: emailFailed?.sent ?? null,
      leadAcceptedReason: leadAccepted.reason,
      emailFailedReason: emailFailed?.reason ?? null,
    });
  }

  return {
    ...baseResult,
    persistence,
    email,
    rateLimitMode: rateLimit.mode,
    lifecycle,
    notifications: {
      leadAccepted,
      emailFailed,
    },
  };
}