import Papa from 'papaparse';
import { HISTORY_MAX_BYTES, HISTORY_MAX_ROWS, historyName, type HistoryCandidate } from '@runsaturday/shared';
export const HISTORY_TEMPLATE = 'date,event_name,time,position,distance_m\n2026-09-05,Example Saturday 5K,24:31,87,5000\n2026-09-12,"Example Park, West",23:58,,5000\n';
export function parseHistoryCsv(text: string): HistoryCandidate[] {
  if (new TextEncoder().encode(text).length > HISTORY_MAX_BYTES) throw new Error('CSV must be no larger than 5 MiB.');
  const rows: string[][] = [];
  let error = '';
  Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: 'greedy', step(result, parser) {
    if (result.errors.length) { error = 'Malformed CSV quoting. Check the file.'; parser.abort(); return; }
    rows.push(result.data);
    if (rows.length > HISTORY_MAX_ROWS + 1) { error = 'CSV may contain at most 5,000 data rows.'; parser.abort(); }
  } });
  if (error) throw new Error(error);
  const header = rows.shift()?.map(h => h.trim());
  const allowed = ['date', 'event_name', 'time', 'position', 'distance_m'];
  if (!header || header.length === 0) throw new Error('Choose a CSV with the required header and at least one run.');
  if (new Set(header).size !== header.length || header.some(h => !allowed.includes(h)) || ['date', 'event_name', 'time'].some(h => !header.includes(h))) throw new Error('Use unique headers date,event_name,time and optional position,distance_m only.');
  if (!rows.length) throw new Error('CSV contains no runs.');
  return rows.map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`Row ${index + 2}: number of cells does not match the header.`);
    const value = (key: string) => cells[header.indexOf(key)]?.trim() ?? '';
    return { row: index + 2, date: value('date'), eventName: historyName(value('event_name')), time: value('time'), position: value('position'), distance: value('distance_m') };
  });
}
export async function readHistoryFile(file: File) {
  if (file.size > HISTORY_MAX_BYTES) throw new Error('CSV must be no larger than 5 MiB.');
  return parseHistoryCsv(await file.text());
}
