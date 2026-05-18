import { scrubPiiPayload } from "@/server/observability/pii-scrubber";

export type LogLevel = "info" | "warn" | "error";

export type LogContext = {
  requestId: string;
  route: string;
  userId?: string | null;
  latencyMs?: number;
};

type LogRecord = {
  level: LogLevel;
  message: string;
  request_id: string;
  route: string;
  user_id: string | null;
  latency_ms: number | null;
  timestamp: string;
  payload?: unknown;
};

function writeLog(record: LogRecord) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export function logStructured(
  level: LogLevel,
  message: string,
  context: LogContext,
  payload?: Record<string, unknown>,
) {
  writeLog({
    level,
    message,
    request_id: context.requestId,
    route: context.route,
    user_id: context.userId ?? null,
    latency_ms: context.latencyMs ?? null,
    timestamp: new Date().toISOString(),
    payload: payload ? scrubPiiPayload(payload) : undefined,
  });
}

export function logInfo(
  message: string,
  context: LogContext,
  payload?: Record<string, unknown>,
) {
  logStructured("info", message, context, payload);
}

export function logWarn(
  message: string,
  context: LogContext,
  payload?: Record<string, unknown>,
) {
  logStructured("warn", message, context, payload);
}

export function logError(
  message: string,
  context: LogContext,
  payload?: Record<string, unknown>,
) {
  logStructured("error", message, context, payload);
}
