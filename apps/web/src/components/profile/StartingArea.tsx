import { coarseCoordinate, TRAVEL_BUDGETS, type AccountSettings, type SettingsInput } from '@runsaturday/shared';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useSaveSettings, useSettings } from '../../hooks/queries';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';

export function StartingAreaForm({ initial, onSaved, onboarding = false }: { initial: AccountSettings; onSaved?: () => void; onboarding?: boolean }) {
  const auth = useAuth();
  const save = useSaveSettings();
  const [label, setLabel] = useState(initial.homeLabel ?? '');
  const [point, setPoint] = useState<{ homeLat: number; homeLon: number } | null>(initial.homeLat != null && initial.homeLon != null ? { homeLat: initial.homeLat, homeLon: initial.homeLon } : null);
  const [budget, setBudget] = useState(initial.defaultTravelMinutes);
  const [status, setStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const lifetime = useRef(new AbortController());
  const geoGeneration = useRef(0);
  useEffect(() => { lifetime.current = new AbortController(); return () => { lifetime.current.abort(); geoGeneration.current++; }; }, []);
  function locate() {
    if (!navigator.geolocation) { setStatus('Location is not supported here. Enter a label or skip for now.'); return; }
    const ticket = auth.captureOperation();
    const generation = ++geoGeneration.current;
    const valid = () => ticket.isCurrent() && !lifetime.current.signal.aborted && generation === geoGeneration.current;
    setLocating(true); setStatus('Requesting approximate starting area…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!valid()) return;
      // Raw browser coordinates exist only in this callback; never send/store them.
      setPoint({ homeLat: coarseCoordinate(coords.latitude), homeLon: coarseCoordinate(coords.longitude) });
      setLocating(false); setStatus('Approximate starting point selected. Save to keep it.');
    }, (error) => {
      if (!valid()) return;
      setLocating(false);
      setStatus(error.code === 1 ? 'Location permission denied. Enter a label or skip for now.' : error.code === 3 ? 'Location timed out. Enter a label or skip for now.' : 'Location unavailable. Enter a label or skip for now.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }
  async function persist(input: SettingsInput) {
    const ticket = auth.captureOperation();
    setStatus('');
    try {
      await save.mutateAsync(input);
      if (ticket.isCurrent() && !lifetime.current.signal.aborted) { setStatus('Starting area saved.'); onSaved?.(); }
    } catch (error) {
      if (ticket.isCurrent() && !lifetime.current.signal.aborted) setStatus(error instanceof Error ? error.message : 'Could not save. Please try again.');
    }
  }
  return <section className="space-y-4 rounded-3xl border border-line bg-surface p-4" aria-label="Starting area">
    <h2 className="text-lg font-bold">Starting area</h2>
    <p className="text-sm text-muted">We save an approximate starting point, not your exact location. Device location is optional.</p>
    <Button variant="secondary" className="w-full" onClick={locate} disabled={locating || save.isPending}>Use my approximate location</Button>
    {point && <p className="text-sm text-muted">Approximate coordinates: {point.homeLat.toFixed(2)}, {point.homeLon.toFixed(2)} · rounded to a 0.05° grid</p>}
    <label className="block text-sm font-semibold">Town or postcode district
      <input maxLength={100} className="mt-2 min-h-11 w-full rounded-xl border border-line px-3" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. WA12 or Newton-le-Willows" />
    </label>
    <p className="text-xs text-muted">Use a town or district, not an exact address. Text is a label only. It does not resolve coordinates. Without a starting point, distance and travel estimates are unavailable; you can still browse events and challenges.</p>
    {point && <label className="block text-sm font-semibold">Approx. travel budget
      <select className="mt-2 min-h-11 w-full rounded-xl border border-line px-3" value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
        {TRAVEL_BUDGETS.map((n) => <option key={n} value={n}>{n} minutes</option>)}
      </select>
      <span className="mt-2 block text-xs font-normal text-muted">Estimated from distance — not live traffic or turn-by-turn routing.</span>
    </label>}
    <Button className="w-full" disabled={locating || save.isPending} onClick={() => void persist({ homeLabel: label.trim() || null, homeLat: point?.homeLat ?? null, homeLon: point?.homeLon ?? null, defaultTravelMinutes: budget })}>{save.isPending ? 'Saving…' : onboarding ? 'Continue' : 'Save starting area'}</Button>
    <Button variant="ghost" className="w-full" disabled={save.isPending} onClick={() => {
      geoGeneration.current++; setLocating(false); setPoint(null); setLabel('');
      void persist({ homeLat: null, homeLon: null, homeLabel: null });
    }}>{onboarding ? 'Skip for now' : 'Clear starting area'}</Button>
    {status && <p role="status" className="text-sm">{status}</p>}
  </section>;
}

export function StartingAreaSettings() {
  const query = useSettings();
  if (query.isPending) return <LoadingState label="Loading starting area" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <StartingAreaForm key={`${query.data.homeLat}:${query.data.homeLon}:${query.data.homeLabel}:${query.data.defaultTravelMinutes}`} initial={query.data} />;
}
