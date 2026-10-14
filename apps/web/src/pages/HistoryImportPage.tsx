import { useEffect, useRef, useState } from 'react';
import { historyName, type HistoryCandidate, type HistoryPreview, type HistoryResult } from '@runsaturday/shared';
import { useAuth } from '../auth/AuthProvider';
import { AccountControls } from '../auth/AccountControls';
import { api } from '../api/endpoints';
import { useCommitHistory, useDeleteCsvHistory } from '../hooks/queries';
import { Button, ButtonLink } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { HISTORY_TEMPLATE, readHistoryFile } from '../history/csv';
export function HistoryImportPage() {
  const auth = useAuth(); const commit = useCommitHistory(); const remove = useDeleteCsvHistory();
  const [rows, setRows] = useState<HistoryCandidate[]>([]); const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [result, setResult] = useState<HistoryResult | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false); const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const lifetime = useRef(true); const generation = useRef(0);
  useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; generation.current++; }; }, []);
  async function previewRows(input: HistoryCandidate[]) {
    const ticket = auth.captureOperation(); const current = ++generation.current;
    setBusy(true); setError(''); setPreview(null); setResult(null); setConfirmed(false);
    try { const data = await api.previewHistory(input, ticket.signal); if (ticket.isCurrent() && lifetime.current && generation.current === current) { setRows(input); setPreview(data); } }
    catch (e) { if (ticket.isCurrent() && lifetime.current && generation.current === current) setError(e instanceof Error ? e.message : 'Could not preview.'); }
    finally { if (ticket.isCurrent() && lifetime.current && generation.current === current) setBusy(false); }
  }
  async function choose(file: File) {
    const ticket = auth.captureOperation(); const current = ++generation.current;
    setBusy(true); setRows([]); setPreview(null); setResult(null); setError(''); setConfirmed(false);
    try { const parsed = await readHistoryFile(file); if (ticket.isCurrent() && lifetime.current && current === generation.current) await previewRows(parsed); }
    catch (e) { if (ticket.isCurrent() && lifetime.current && current === generation.current) { setError(e instanceof Error ? e.message : 'Could not read CSV.'); setBusy(false); } }
  }
  async function apply() {
    const ticket = auth.captureOperation();
    if (!confirmed || !preview) return;
    setError('');
    try { const value = await commit.mutateAsync(rows) as HistoryResult; if (ticket.isCurrent() && lifetime.current) { setResult(value); setPreview(null); setRows([]); setConfirmed(false); } }
    catch (e) { if (ticket.isCurrent() && lifetime.current) setError(e instanceof Error ? e.message : 'Import failed.'); }
  }
  async function withdraw() {
    const ticket = auth.captureOperation(); if (!deleteConfirmed) return; setError('');
    try { const value = await remove.mutateAsync(undefined) as { deleted: number; formStatus: string }; if (ticket.isCurrent() && lifetime.current) { generation.current++; setRows([]); setPreview(null); setResult(null); setDeleteConfirmed(false); setError(`Removed ${value.deleted} CSV performances. Other sources are preserved.${value.formStatus === 'deferred' ? ' Current Form refresh is deferred.' : ''}`); } }
    catch (e) { if (ticket.isCurrent() && lifetime.current) setError(e instanceof Error ? e.message : 'Could not remove history.'); }
  }
  const pending = busy || commit.isPending || remove.isPending;
  const names = preview ? [...new Map(preview.rows.map(r => [historyName(r.candidate.eventName).toLowerCase(), r])).values()] : [];
  return <div className="space-y-5 py-5">
    <PageHeader title="Import my 5K history" subtitle="User-provided Personal History CSV v1" />
    <p className="text-sm">Use a file prepared from your own legitimate records. We do not fetch it from parkrun. Imported records are private to your account and are not provider verified. They may represent only part of your history.</p>
    <p className="text-sm font-semibold">Upload only your own run history. Do not upload full event result tables or other people's data.</p>
    <p className="text-sm text-muted">The file is parsed in your browser. Only normalised run rows are sent to 5K Compass; the original file is not stored. Required: date (YYYY-MM-DD), event_name, time (MM:SS or H:MM:SS). Optional: position (preview only), distance_m (blank or 5000). Up to 5 MiB and 5,000 rows.</p>
    <a className="block font-semibold text-brand-700 underline" download="5k-compass-personal-history-v1.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(HISTORY_TEMPLATE)}`}>Download CSV template</a>
    <label className="block font-semibold">Choose personal history CSV<input className="mt-2 block w-full min-w-0 text-sm" type="file" accept=".csv,text/csv" disabled={pending} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void choose(file); }} /></label>
    {busy && <p role="status">Validating preview…</p>}
    {error && <p role="alert" className="break-words">{error}</p>}
    {preview && <section className="space-y-4" aria-label="Import preview">
      <h2 className="text-xl font-bold">Preview: {preview.rows.length} rows</h2>
      <p>Valid {preview.rows.length - preview.counts.INVALID} · New {preview.counts.NEW} · Updates {preview.counts.UPDATE} · Unchanged {preview.counts.UNCHANGED} · Conflicts {preview.counts.CONFLICT} · Invalid {preview.counts.INVALID}</p>
      <p className="text-sm">Only NEW and UPDATE rows will be imported. Invalid and conflicting rows will be skipped. Reimport never overwrites another source. Position is validated for preview and is not saved.</p>
      {names.map(r => <label key={historyName(r.candidate.eventName).toLowerCase()} className="block text-sm font-semibold break-words">Mapping for {r.candidate.eventName}
        <select className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line" value={r.candidate.eventId === undefined ? 'auto' : r.candidate.eventId ?? 'external'} disabled={pending} onChange={e => { const value = e.target.value; const key = historyName(r.candidate.eventName).toLowerCase(); void previewRows(rows.map(row => historyName(row.eventName).toLowerCase() !== key ? row : { ...row, eventId: value === 'auto' ? undefined : value === 'external' ? null : value })); }}>
          <option value="auto">Saved mapping / suggestion: {r.eventLabel ?? 'keep external'}</option><option value="external">Keep as external event</option>
          {r.matches.map(event => <option key={event.id} value={event.id}>{event.name} · {[event.town, event.region].filter(Boolean).join(', ') || event.id}{event.active ? '' : ' (inactive — historical)'}</option>)}
        </select>
      </label>)}
      <ol className="max-h-96 space-y-2 overflow-y-auto" aria-label="Preview rows">{preview.rows.map(r => <li key={r.candidate.row} className="rounded-xl border border-line p-3 text-sm break-words"><strong>Row {r.candidate.row}: {r.status}</strong><p>{r.candidate.date} · {r.candidate.eventName} · {r.candidate.time}{r.candidate.position ? ` · position ${r.candidate.position} (not saved)` : ''}</p><p>{r.eventId ? `Trusted event mapping: ${r.eventLabel ?? 'choose a valid mapping'}` : 'External: no trusted visit or challenge credit'}</p>{r.message && <p>{r.message}</p>}</li>)}</ol>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} /><span>I confirm this file contains my own run history and I want to import the valid NEW and UPDATE records into my 5K Compass account.</span></label>
      <Button className="w-full" disabled={!confirmed || pending || preview.counts.NEW + preview.counts.UPDATE + preview.counts.UNCHANGED === 0} onClick={() => void apply()}>Confirm import</Button>
    </section>}
    {result && <section aria-label="Import result" role="status"><h2 className="text-xl font-bold">Import complete</h2><p>New {result.created} · Updated {result.updated} · Unchanged {result.unchanged} · Skipped {result.skipped} · Invalid {result.invalid}</p>{result.formStatus === 'deferred' && <p>Recorded history is saved. Current Form refresh is deferred; stale snapshots were invalidated.</p>}<ButtonLink to="/profile">View recorded history</ButtonLink></section>}
    <section className="space-y-3 border-t border-line pt-4"><h2 className="font-bold">Remove imported CSV history</h2><label className="flex gap-2 text-sm"><input type="checkbox" checked={deleteConfirmed} disabled={pending} onChange={e => setDeleteConfirmed(e.target.checked)} /><span>Remove all my CSV performances. Keep other sources and shared events.</span></label><Button variant="secondary" disabled={!deleteConfirmed || pending} onClick={() => void withdraw()}>Remove my CSV history</Button></section>
    <AccountControls />
  </div>;
}
