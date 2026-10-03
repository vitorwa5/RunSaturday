import { BlockList, isIP } from 'node:net';

/** Literal IP/CIDR allowlist only; never a hop count, hostname, wildcard or trust-all flag. */
export function trustedProxyAddresses(value: string): string[] {
  if (!value.trim()) return [];
  const invalid = () => new Error('TRUSTED_PROXY_CIDRS requires explicit IP addresses/CIDRs; trust-all ranges, hostnames and hop counts are forbidden');
  const coverage = new BlockList();
  const entries = value.split(',').map((part) => {
    const entry = part.trim();
    const pieces = entry.split('/');
    const family = isIP(pieces[0]!);
    const prefix = pieces[1];
    if (!family || pieces.length > 2 || ['0.0.0.0', '::'].includes(entry)
      || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw invalid();
    }
    try {
      const type = family === 4 ? 'ipv4' : 'ipv6';
      if (prefix === undefined) coverage.addAddress(pieces[0]!, type);
      else coverage.addSubnet(pieces[0]!, Number(prefix), type);
    } catch { throw invalid(); }
    return entry;
  });
  // IPv4-mapped IPv6 /96 means ALL IPv4 peers, despite having a nonzero IPv6 prefix.
  // Fail closed for unions covering both family endpoints too (e.g. two /1 halves).
  if ((coverage.check('0.0.0.0', 'ipv4') && coverage.check('255.255.255.255', 'ipv4'))
    || (coverage.check('::', 'ipv6') && coverage.check('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ipv6'))) throw invalid();
  return entries;
}
