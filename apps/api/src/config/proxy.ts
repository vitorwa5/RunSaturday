import { isIP } from 'node:net';

/** Literal IP/CIDR allowlist only; never a hop count, hostname, wildcard or trust-all flag. */
export function trustedProxyAddresses(value: string): string[] {
  if (!value.trim()) return [];
  return value.split(',').map((part) => {
    const entry = part.trim();
    const pieces = entry.split('/');
    const family = isIP(pieces[0]!);
    const prefix = pieces[1];
    if (!family || pieces.length > 2 || ['0.0.0.0', '::'].includes(entry)
      || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXY_CIDRS requires explicit IP addresses/CIDRs; trust-all ranges, hostnames and hop counts are forbidden');
    }
    return entry;
  });
}
