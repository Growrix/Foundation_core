import { z } from "zod";

import { getRuntimeEnv } from "@/server/config/env";
import { sendLeadEmail, type LeadEmailResult } from "@/server/modules/forms/email.service";
import {
  persistLeadSubmission,
  type LeadPersistenceResult,
} from "@/server/modules/forms/lead.repository";
import {
  notifyLark,
  type LarkNotificationResult,
} from "@/server/modules/ops/lark-notifier.service";

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
};

export type ProcessSubmissionResult = RejectedSubmission | AcceptedSubmission;

type RateLimitState = {
  count: number;
  windowStartedAt: number;
};

const rateLimitState = new Map<string, RateLimitState>();

export function parseSubmissionPayload(payload: unknown): SubmissionPayload {
  return submissionSchema.parse(payload);
}

export function resetRateLimitStateForTests() {
  rateLimitState.clear();
}

function checkRateLimit(rateLimitKey: string) {
  const env = getRuntimeEnv();
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;

  const existing = rateLimitState.get(rateLimitKey);

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    rateLimitState.set(rateLimitKey, {
      count: 1,
      windowStartedAt: now,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
    } as const;
  }

  if (existing.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - existing.windowStartedAt)) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
    } as const;
  }

  existing.count += 1;
  rateLimitState.set(rateLimitKey, existing);

  return {
    allowed: true,
    retryAfterSeconds: 0,
  } as const;
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
  const baseResult = submitForm(formId, payload);

  if (!baseResult.accepted) {
    return baseResult;
  }

  const rateLimitKey = `${formId}:${context.ipAddress ?? "unknown"}`;
  const rateLimit = checkRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    return {
      accepted: false,
      code: "RATE_LIMITED",
      message: "Too many submissions were received from this client. Please retry later.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const persistence = await persistLeadSubmission({
    formId,
    payload,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  const email = await sendLeadEmail({
    formId,
    payload,
    requestId: context.requestId,
  });

  const leadAccepted = await notifyLark("lead.accepted", {
    requestId: context.requestId,
    formId,
    emailDelivered: email.delivered,
    leadEmail: payload.email,
    persistenceMode: persistence.mode,
    leadId: persistence.leadId,
  });

  const emailFailed = email.delivered
    ? null
    : await notifyLark("lead.email_failed", {
        requestId: context.requestId,
        formId,
        leadEmail: payload.email,
        reason: email.reason,
      });

  return {
    ...baseResult,
    persistence,
    email,
    notifications: {
      leadAccepted,
      emailFailed,
    },
  };
}