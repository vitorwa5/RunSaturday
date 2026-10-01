/** Calculation versions. Bump a version when its formula changes; old snapshots stay intact. */
export const COMPETITION_VERSION = 'competition_v1';
export const DIFFICULTY_VERSION = 'difficulty_v1';
/** Windows (days) snapshots are calculated for. 0 = all history. */
export const ANALYTICS_WINDOWS = [30, 60, 90, 365, 0] as const;
export const DEFAULT_ANALYTICS_WINDOW = 90;
/** Structural metrics do not depend on a results window. */
export const STRUCTURAL_WINDOW = 0;
