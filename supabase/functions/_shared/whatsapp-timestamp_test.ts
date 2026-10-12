import { assertEquals } from "jsr:@std/assert@1";
import { whatsappUnixSecondsToIso } from "./whatsapp-timestamp.ts";

Deno.test("whatsappUnixSecondsToIso: second-precision base", () => {
  // 2026-10-12T12:30:14Z as Unix seconds (Meta WhatsApp timestamp shape).
  assertEquals(
    whatsappUnixSecondsToIso(1_791_808_214),
    "2026-10-12T12:30:14.000Z",
  );
});

Deno.test("whatsappUnixSecondsToIso: index preserves same-second payload order", () => {
  const a = whatsappUnixSecondsToIso(1_791_808_214, 0);
  const b = whatsappUnixSecondsToIso(1_791_808_214, 1);
  assertEquals(a, "2026-10-12T12:30:14.000Z");
  assertEquals(b, "2026-10-12T12:30:14.001Z");
  assertEquals(a < b, true);
});
