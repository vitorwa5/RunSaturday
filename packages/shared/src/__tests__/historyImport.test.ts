import { expect, it } from 'vitest';
import { validateHistoryRow, historyName, type HistoryCandidate } from '../historyImport';
const base: HistoryCandidate = { row: 2, date: '2026-09-05', eventName: 'Example 5K', time: '24:31' };
it('normalises Unicode conservatively and parses strict race times', () => {
  expect(historyName('  Ｐark   West ')).toBe('Park West');
  expect(validateHistoryRow(base, '2026-10-01').seconds).toBe(1471);
  expect(validateHistoryRow({ ...base, time: '1:02:03' }, '2026-10-01').seconds).toBe(3723);
});
it.each([{ date: '2026-02-30' }, { date: '01/02/26' }, { date: '2027-01-01' }, { time: '0:00' }, { time: '1:00' }, { time: '10:00:00' }, { time: '-1:00' }, { time: '24.5' }, { time: '24:60' }, { position: '0' }, { position: 'Infinity' }, { distance: '10000' }, { distance: '-1' }, { eventName: '' }])('rejects invalid personal facts %j', patch => {
  expect(validateHistoryRow({ ...base, ...patch }, '2026-10-01').error).toBeTruthy();
});
