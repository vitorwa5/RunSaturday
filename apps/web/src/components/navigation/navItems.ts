import { House, Map, Search, Sparkles, UserRound, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Other paths that should highlight this tab. */
  matches?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/explore', label: 'Explore', icon: Search, matches: ['/event/', '/compare'] },
  { to: '/saturday', label: 'Saturday', icon: Sparkles, matches: ['/pb-finder', '/where-could-i-place', '/hidden-gems'] },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return pathname === item.to || pathname.startsWith(`${item.to}/`) || (item.matches ?? []).some((m) => pathname.startsWith(m));
}
