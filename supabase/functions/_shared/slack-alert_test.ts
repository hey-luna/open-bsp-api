import { assertEquals } from "jsr:@std/assert@1";
import {
  formatLunaBatchFailureAlert,
  isLunaBatchJsonPoisonError,
} from "./slack-alert.ts";

Deno.test("isLunaBatchJsonPoisonError: detects unterminated JSON", () => {
  assertEquals(
    isLunaBatchJsonPoisonError(
      "Unterminated string in JSON at position 10435760 (line 1 column 10435761)",
    ),
    true,
  );
  assertEquals(
    isLunaBatchJsonPoisonError("Unexpected end of JSON input"),
    true,
  );
  assertEquals(
    isLunaBatchJsonPoisonError("Failed to fetch user by phone"),
    false,
  );
});

Deno.test("formatLunaBatchFailureAlert: includes contact and reason", () => {
  const payload = formatLunaBatchFailureAlert({
    batchId: "batch-1",
    contactAddress: "972545551100",
    organizationId: "org-1",
    errorMessage: "Unterminated string in JSON at position 10435760",
    attemptCount: 5,
    messageCount: 4,
    reason: "json_poison",
  });
  assertEquals(payload.text.includes("972545551100"), true);
  assertEquals(payload.text.includes("json_poison"), true);
  assertEquals(payload.text.includes("batch-1"), true);
});
