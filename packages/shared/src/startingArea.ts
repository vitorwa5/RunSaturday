/** Privacy grid in degrees; its physical size varies with latitude. */
export const LOCATION_GRID_DEGREES = 0.05;
export const TRAVEL_BUDGETS = [15, 30, 45, 60, 90] as const;
export function coarseCoordinate(value: number): number {
  return Number((Math.round(value / LOCATION_GRID_DEGREES) * LOCATION_GRID_DEGREES).toFixed(2));
}
export interface AccountSettings {
  homeLat: number | null;
  homeLon: number | null;
  homeLabel: string | null;
  defaultTravelMinutes: number;
  onboardingCompletedAt: string | null;
}
export type SettingsInput = Partial<Omit<AccountSettings, 'onboardingCompletedAt'>> & { completeOnboarding?: boolean };
