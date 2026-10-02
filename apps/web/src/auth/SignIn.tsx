import { useState, type FormEvent } from 'react';
import { apiSend } from '../api/client';
import { useAuth } from './AuthProvider';
export function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (sent) {
        await apiSend('POST', '/auth/sign-in/email-otp', { email, otp: code });
        await auth.refresh(true);
      } else {
        await apiSend('POST', '/auth/email-otp/send-verification-otp', { email });
        setSent(true);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md space-y-6 px-4 py-10">
    <div><p className="font-semibold text-brand-700">5K Compass</p><h1 className="mt-3 text-2xl font-bold">Sign in</h1><p className="mt-2 text-sm text-muted">Use your email to create or access your account. No password needed.</p></div>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold">Email address<input className="mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-3" type="email" autoComplete="email" required maxLength={254} value={email} disabled={sent || busy} onChange={(e) => setEmail(e.target.value)} /></label>
      {sent && <><p className="text-sm text-muted">Check your email for a six-digit code. It expires in five minutes.</p><label className="block text-sm font-semibold">Sign-in code<input className="mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-3" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} /></label></>}
      <button className="min-h-12 w-full rounded-xl bg-brand-700 px-4 font-semibold text-white" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Verify code' : 'Send code'}</button>
      {sent && <button type="button" className="min-h-11 text-sm font-semibold text-brand-700" disabled={busy} onClick={() => { setSent(false); setCode(''); }}>Change email or request a new code</button>}
      {(error || auth.error) && <p role="alert" className="text-sm text-red-700">{error || auth.error}</p>}
      {auth.error && <button type="button" className="min-h-11 text-sm font-semibold text-brand-700" onClick={() => void auth.refresh()}>Retry session check</button>}
    </form>
  </main>;
}
