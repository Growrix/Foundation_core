const blockedKeyPattern = /(password|token|secret|authorization|cookie|email|phone|ssn|card|api[-_]?key|ip)/i;

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function scrubString(value: string) {
  return value.replace(emailPattern, "[REDACTED_EMAIL]");
}

export function scrubPiiPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((entry) => scrubPiiPayload(entry));
  }

  if (typeof payload === "object") {
    const entries = Object.entries(payload as Record<string, unknown>).map(([key, value]) => {
      if (blockedKeyPattern.test(key)) {
        return [key, "[REDACTED]"];
      }

      return [key, scrubPiiPayload(value)];
    });

    return Object.fromEntries(entries);
  }

  if (typeof payload === "string") {
    return scrubString(payload);
  }

  return payload;
}
