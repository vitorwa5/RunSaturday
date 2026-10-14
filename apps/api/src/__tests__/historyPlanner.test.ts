import { expect, it } from 'vitest';
import { planHistory, historyIdentity } from '../history/planner';
import type { HistoryCandidate } from '@runsaturday/shared';
const row: HistoryCandidate = { row: 2, date: '2026-09-05', eventName: ' Park West ', time: '24:31' };
it('identity excludes finish time and mapping and normalises name', () => {
  expect(historyIdentity(row)).toBe(historyIdentity({ ...row, eventName: 'park west', time: '20:00', eventId: 'trusted' }));
});
it('marks every repeated logical row as conflict', () => {
  expect(planHistory([row, { ...row, row: 3, time: '20:00' }], [], [], '2026-10-01').preview.counts.CONFLICT).toBe(2);
});
it('suggests only unique exact matches, supports inactive, and retains ambiguous externally', () => {
  expect(planHistory([row], [], [{ id: 'old', name: 'Park West', active: false }], '2026-10-01').preview.rows[0]).toMatchObject({ eventId: 'old', status: 'NEW' });
  const events = [{ id: 'a', name: 'Park West', active: true }, { id: 'b', name: 'Park West', active: true }];
  expect(planHistory([row], [], events, '2026-10-01').preview.rows[0]!.eventId).toBeNull();
  expect(planHistory([{ ...row, eventId: 'b' }], [], events, '2026-10-01').preview.rows[0]!.eventId).toBe('b');
  expect(planHistory([{ ...row, eventId: 'untrusted' }], [], events, '2026-10-01').preview.rows[0]!.status).toBe('INVALID');
});

it('replay preserves confirmed ambiguous/internal and external mappings rather than retargeting intent', () => {
  const events = [{ id: 'a', name: 'Park West', active: true }, { id: 'b', name: 'Park West', active: false }];
  const first = planHistory([{ ...row, eventId: 'b' }], [], events, '2026-10-01').writes[0]!;
  const existing = { ...first.input, id: 'csv-record', userId: 'A', eventName: 'Park West', externalResultId: first.externalResultId, verified: false };
  expect(planHistory([row], [existing], events, '2026-10-01').preview.rows[0]).toMatchObject({ status: 'UNCHANGED', eventId: 'b' });
  const external = { ...existing, eventId: null, eventName: null, externalEventName: 'Park West' };
  expect(planHistory([row], [external], [events[0]!], '2026-10-01').preview.rows[0]).toMatchObject({ status: 'UNCHANGED', eventId: null });
  expect(planHistory([row], [existing], [], '2026-10-01').preview.rows[0]!.status).toBe('INVALID');
});
