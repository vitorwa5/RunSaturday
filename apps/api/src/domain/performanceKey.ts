/**
 * Deterministic duplicate key for a user's performance (Phase 4A.1). Stored in
 * UserPerformance.duplicateKey with a unique (userId, duplicateKey) index, so duplicate handling
 * never depends on how SQL treats NULLs in unique indexes (eventId is nullable).
 *
 *   internal event   event:<eventId>|<date>|<distanceMeters>
 *   external course  external:<normalised name>|<date>|<distanceMeters>
 *
 * External names are compared case-insensitively with whitespace collapsed, so "Warrington 5K"
 * and " warrington  5k " on the same date are the same race. The migration backfills existing
 * rows with the same "event:" format.
 */

/** Display form of an external event name: trimmed, inner whitespace collapsed. */
export function cleanExternalEventName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function performanceDuplicateKey(p: { eventId: string | null; externalEventName: string | null; date: string; distanceMeters: number }): string {
  if (p.eventId != null) return `event:${p.eventId}|${p.date}|${p.distanceMeters}`;
  if (p.externalEventName != null) return `external:${cleanExternalEventName(p.externalEventName).toLowerCase()}|${p.date}|${p.distanceMeters}`;
  throw new Error('A performance needs an eventId or an externalEventName.');
}
