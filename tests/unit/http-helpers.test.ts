import { describe, expect, it } from "vitest";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";

describe("http helpers", () => {
  it("creates success envelopes", () => {
    const envelope = success("request-1", { ok: true });
    expect(envelope.ok).toBe(true);
    expect(envelope.data.ok).toBe(true);
  });

  it("creates failure envelopes with optional details", () => {
    const envelope = failure("request-2", "BAD_INPUT", "Invalid request.", { field: "email" });
    expect(envelope.ok).toBe(false);
    expect(envelope.error.details?.field).toBe("email");
  });

  it("creates UUID-style request ids", () => {
    expect(createRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});