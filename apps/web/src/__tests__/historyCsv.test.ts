import { describe, expect, it } from 'vitest';
import { parseHistoryCsv, readHistoryFile } from '../history/csv';
const header = 'date,event_name,time,position,distance_m';
describe('Personal History CSV v1 local parser', () => {
  it.each(['\n', '\r\n'])('parses BOM and quoted commas using %j', newline => {
    expect(parseHistoryCsv('\uFEFF' + header + newline + '2026-09-05,"Park, West",24:31,87,5000')).toEqual([{ row: 2, date: '2026-09-05', eventName: 'Park, West', time: '24:31', position: '87', distance: '5000' }]);
  });
  it.each(['', 'event_name,time\nPark,24:31', 'date,event_name,time,email\n2026-09-05,Park,24:31,a@test', 'date,event_name,time,time\n2026-09-05,Park,24:31,24:31', header, header + '\n2026-09-05,"unterminated,24:31,,5000', header + '\n2026-09-05,Park,24:31'])('rejects invalid file structure %j', input => expect(() => parseHistoryCsv(input)).toThrow());
  it('rejects row limit and file size before reading oversized File', async () => {
    expect(() => parseHistoryCsv(header + '\n' + Array(5001).fill('2026-09-05,Park,24:31,,').join('\n'))).toThrow('5,000');
    const text = () => { throw new Error('must not read'); };
    await expect(readHistoryFile({ size: 5 * 1024 * 1024 + 1, text } as unknown as File)).rejects.toThrow('5 MiB');
  });
  it('does not evaluate formulas or discard duplicate participation before server preview', () => {
    const rows = parseHistoryCsv('date,event_name,time\n2026-09-05,=1+1,24:31\n2026-09-05,=1+1,24:31');
    expect(rows).toHaveLength(2); expect(rows[0]!.eventName).toBe('=1+1');
  });
});
