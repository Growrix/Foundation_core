import { getAdapterStatus } from "@/server/config/env";
import { logError, logInfo, type LogContext } from "@/server/observability/logger";
import { scrubPiiPayload } from "@/server/observability/pii-scrubber";

export type TelemetryResult = {
  sent: boolean;
  reason: string | null;
};

export async function trackBackendEvent(
  eventName: string,
  context: LogContext,
  payload: Record<string, unknown>,
): Promise<TelemetryResult> {
  const adapters = getAdapterStatus();

  if (!adapters.analytics) {
    logInfo("telemetry.analytics.skipped", context, {
      eventName,
      reason: "ANALYTICS_NOT_CONFIGURED",
    });

    return {
      sent: false,
      reason: "ANALYTICS_NOT_CONFIGURED",
    };
  }

  logInfo("telemetry.analytics.event", context, {
    eventName,
    payload: scrubPiiPayload(payload),
  });

  return {
    sent: true,
    reason: null,
  };
}

export async function captureBackendError(
  eventName: string,
  context: LogContext,
  payload: Record<string, unknown>,
): Promise<TelemetryResult> {
  logError("telemetry.error.capture", context, {
    eventName,
    payload: scrubPiiPayload(payload),
  });

  return {
    sent: false,
    reason: "MISSING_KNOWLEDGE:error_tracking_provider_contract",
  };
}
