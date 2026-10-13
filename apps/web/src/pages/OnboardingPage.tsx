import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { AccountControls } from '../auth/AccountControls';
import { StartingAreaForm } from '../components/profile/StartingArea';
import { Button, ButtonLink } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { useSaveSettings, useSettings } from '../hooks/queries';

export function OnboardingPage() {
  const auth = useAuth();
  const settings = useSettings();
  const save = useSaveSettings();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = params.get('step') === '5' ? 5 : params.get('step') === '6' ? 6 : params.get('step') === '3' ? 3 : params.get('step') === '2' ? 2 : 1;
  const [intent, setIntent] = useState('everything');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const next = (n: number) => setParams({ step: String(n) });
  async function finish(target: string) {
    const ticket = auth.captureOperation();
    try { await save.mutateAsync({ completeOnboarding: true }); if (ticket.isCurrent() && mounted.current) navigate(target, { replace: true }); }
    catch (e) { if (ticket.isCurrent() && mounted.current) setError(e instanceof Error ? e.message : 'Please try again.'); }
  }
  if (settings.isPending) return <LoadingState label="Loading onboarding" />;
  if (settings.isError) return <><ErrorState error={settings.error} onRetry={() => settings.refetch()} /><AccountControls /></>;
  return <div className="space-y-5 py-6">
    <p className="text-sm font-semibold text-brand-700">5K Compass · Your guide to Saturday 5Ks.</p>
    {step === 1 && <section className="space-y-4"><h1 className="text-3xl font-extrabold">Welcome</h1><p>Where should I run this Saturday? Explore events, follow challenges and use performance evidence when it is available.</p><Button className="w-full" onClick={() => next(2)}>Get started</Button></section>}
    {step === 2 && <section className="space-y-4"><h1 className="text-2xl font-bold">What would you like help with?</h1><p className="text-sm text-muted">Just for this welcome journey. You can choose a different goal any Saturday.</p><div role="group" aria-label="Current interest" className="grid gap-3">{[['faster', 'Run faster'], ['explore', 'Explore somewhere new'], ['challenge', 'Complete challenges'], ['everything', 'A bit of everything']].map(([value, label]) => <Button key={value} variant={intent === value ? 'primary' : 'secondary'} aria-pressed={intent === value} onClick={() => setIntent(value!)}>{label}</Button>)}</div><Button className="w-full" onClick={() => next(3)}>Continue</Button></section>}
    {step === 3 && <><h1 className="text-2xl font-bold">Choose your starting area</h1><StartingAreaForm initial={settings.data} onboarding onSaved={() => next(5)} /></>}
    {step === 5 && <section className="space-y-4"><h1 className="text-2xl font-bold">Optional recent 5K</h1><p className="text-sm text-muted">Record a run to establish your recorded PB. Current Form still needs sufficient course and performance evidence.</p><ButtonLink className="w-full" to="/profile/performances/new?returnTo=onboarding">Add a recent 5K</ButtonLink><Button className="w-full" variant="secondary" onClick={() => next(6)}>I'll do this later</Button></section>}
    {step === 6 && <section className="space-y-4"><h1 className="text-2xl font-bold">You're ready</h1><p className="text-sm text-muted">You can explore with no run history. Missing personal statistics and historical event analytics stay unavailable.</p><Button className="w-full" disabled={save.isPending} onClick={() => void finish(intent === 'challenge' ? '/challenges' : intent === 'faster' && settings.data.homeLat != null ? '/saturday?intent=pb' : '/explore')}>{intent === 'challenge' ? 'View challenges' : intent === 'faster' && settings.data.homeLat != null ? 'See Saturday ideas' : 'Explore events'}</Button></section>}
    {error && <p role="alert">{error}</p>}
    <Button variant="ghost" className="w-full" disabled={save.isPending} onClick={() => void finish('/explore')}>Skip welcome and explore</Button>
    <AccountControls />
  </div>;
}
