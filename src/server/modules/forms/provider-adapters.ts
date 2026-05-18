import { sendLeadEmail } from "@/server/modules/forms/email.service";
import { persistLeadSubmission } from "@/server/modules/forms/lead.repository";
import {
  appendSubmissionLifecycleLog,
  type SubmissionLifecycleEntry,
} from "@/server/modules/forms/submission-log.repository";
import { notifyLark } from "@/server/modules/ops/lark-notifier.service";

export type FormsProviderAdapters = {
  deliveryAdapter: {
    name: "resend";
    deliver: typeof sendLeadEmail;
  };
  persistenceAdapter: {
    name: "postgres";
    persist: typeof persistLeadSubmission;
  };
  notificationAdapter: {
    name: "lark";
    notify: typeof notifyLark;
  };
  submissionLogAdapter: {
    name: "submission-lifecycle";
    append: (entry: SubmissionLifecycleEntry) => ReturnType<typeof appendSubmissionLifecycleLog>;
  };
};

export function getFormsProviderAdapters(): FormsProviderAdapters {
  return {
    deliveryAdapter: {
      name: "resend",
      deliver: sendLeadEmail,
    },
    persistenceAdapter: {
      name: "postgres",
      persist: persistLeadSubmission,
    },
    notificationAdapter: {
      name: "lark",
      notify: notifyLark,
    },
    submissionLogAdapter: {
      name: "submission-lifecycle",
      append: appendSubmissionLifecycleLog,
    },
  };
}
