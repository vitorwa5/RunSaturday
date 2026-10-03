import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';
import { useAuth } from './AuthProvider';
export function AccountControls() {
  const auth = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current.abort();
  }, []);
  if (auth.mode === 'demo') return null;
  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    const ticket = auth.captureOperation();
    try { await fn(); } catch (err) { if (ticket.isCurrent() && !lifetime.current.signal.aborted) setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { if (ticket.isCurrent() && !lifetime.current.signal.aborted) setBusy(false); }
  }
  async function download() {
    const ticket = auth.captureOperation();
    const signal = AbortSignal.any([ticket.signal, lifetime.current.signal]);
    const data = await apiGet('/account/export', {}, signal);
    if (!ticket.isCurrent() || signal.aborted) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '5k-compass-account.json'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="space-y-3 rounded-2xl border border-line p-4" aria-label="Account">
    <h2 className="font-semibold">Your account</h2><p className="break-all text-sm text-muted">Signed in as {auth.user?.email}</p>
    <div className="flex flex-wrap gap-3"><button className="min-h-11 font-semibold text-brand-700" disabled={busy} onClick={() => void action(auth.logout)}>Sign out</button><button className="min-h-11 text-sm" disabled={busy} onClick={() => void action(download)}>Export my data</button><button className="min-h-11 text-sm text-red-700" disabled={busy} onClick={() => setConfirm(true)}>Delete account</button></div>
    {confirm && <div className="space-y-3"><p className="text-sm">This permanently deletes your performances, favourites, form snapshots and all sessions.</p><label className="block text-sm">Type DELETE MY ACCOUNT to confirm<input className="mt-2 min-h-11 w-full rounded-xl border border-line px-3" value={text} onChange={(e) => setText(e.target.value)} /></label><button className="min-h-11 rounded-xl bg-red-700 px-3 text-sm text-white" disabled={busy || text !== 'DELETE MY ACCOUNT'} onClick={() => void action(auth.deleteAccount)}>Permanently delete my account</button><button className="ml-3 min-h-11 text-sm" onClick={() => setConfirm(false)}>Cancel</button></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
