/**
 * Meta WhatsApp Cloud API message timestamps are Unix **seconds**.
 * Within one webhook `messages` / `message_echoes` array, several parts can
 * share the same second. Adding the array index as milliseconds preserves
 * Meta's payload order for DB sorts and Luna `batchParts`.
 */
export function whatsappUnixSecondsToIso(
  unixSeconds: number,
  indexMs = 0,
): string {
  return new Date(unixSeconds * 1000 + indexMs).toISOString();
}
