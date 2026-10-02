import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { clearPersonalData, personalKey } from '../auth/cache';
describe('personal cache account transitions', () => {
  it('separates accounts and clears personal queries/mutations while retaining public course data', async () => {
    const client = new QueryClient();
    client.setQueryData(personalKey('A', ['profile']), { pb: 1000 });
    client.setQueryData(personalKey('A', ['current-form']), { seconds: 1100 });
    client.setQueryData(personalKey('A', ['performances']), [{ id: 'private-A' }]);
    client.setQueryData(['event', 'public-course', 'history', '90'], { count: 50 });
    expect(client.getQueryData(personalKey('B', ['profile']))).toBeUndefined();
    await clearPersonalData(client);
    expect(client.getQueryCache().findAll({ queryKey: ['personal'] })).toHaveLength(0);
    expect(client.getQueryData(['event', 'public-course', 'history', '90'])).toEqual({ count: 50 });
    client.setQueryData(personalKey('B', ['profile']), { pb: null });
    expect(client.getQueryData(personalKey('A', ['profile']))).toBeUndefined();
    expect(client.getQueryData(personalKey('B', ['profile']))).toEqual({ pb: null });
  });
  it('cannot move an in-flight response into the next account cache after logout', async () => {
    const client = new QueryClient();
    let finish!: (v: unknown) => void;
    const pending = client.fetchQuery({ queryKey: personalKey('A', ['profile']), queryFn: () => new Promise((r) => { finish = r; }) }).catch(() => undefined);
    await clearPersonalData(client);
    client.setQueryData(personalKey('B', ['profile']), { user: 'B' });
    finish({ user: 'A', private: true }); await pending;
    expect(client.getQueryData(personalKey('A', ['profile']))).toBeUndefined();
    expect(client.getQueryData(personalKey('B', ['profile']))).toEqual({ user: 'B' });
  });
});
