import { z } from 'zod';
// ISO 3166-1 alpha-2 identifiers, not event/catalogue data. No inferred country/timezone.
const COUNTRIES = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
const text = (max: number) => z.string().min(1).max(max).refine((s) => s === s.trim() && !/[\u0000-\u001f\u007f]/.test(s), 'Must be trimmed text without control characters');
const optionalText = (max: number) => text(max).nullish().transform((v) => v ?? null);
const safeUrl = z.url().refine((s) => { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }, 'Requires an HTTP(S) URL without credentials').max(2000);
const optionalUrl = safeUrl.nullish().transform((v) => v ?? null);
export const EventCatalogueSourceSchema = z.object({
  namespace: text(100).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
  kind: z.enum(['demo', 'imported']),
  attribution: text(500),
  referenceUrl: optionalUrl,
  licence: optionalText(1000).refine((v) => !v || !/^[a-z][a-z0-9+.-]*:/i.test(v) || safeUrl.safeParse(v).success, 'Licence URLs require HTTP(S) without credentials'),
}).strict().refine((s) => /^demo(?:[._-]|$)/.test(s.namespace) === (s.kind === 'demo'), 'The demo namespace prefix is reserved for demo sources');
export const EventCatalogueRecordSchema = z.object({
  externalId: text(200),
  name: text(250),
  countryCode: z.string().refine((s) => COUNTRIES.has(s), 'Requires an ISO 3166-1 alpha-2 country code'),
  subdivisionCode: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/).nullish().transform((v) => v ?? null),
  region: optionalText(250), town: optionalText(250),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timezone: text(100).regex(/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/).refine((s) => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; } catch { return false; } }, 'Requires a valid explicit IANA timezone'),
  active: z.boolean(),
  sourceUrl: optionalUrl, officialUrl: optionalUrl,
  sourceUpdatedAt: z.iso.datetime({ offset: true }).nullish().transform((v) => v ?? null),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullish().transform((v) => v ?? null),
  startLocationText: optionalText(1000),
}).strict().refine((r) => !r.subdivisionCode || r.subdivisionCode.startsWith(`${r.countryCode}-`), { path: ['subdivisionCode'], message: 'Subdivision must belong to the supplied country' });
export const CatalogueEnvelopeSchema = z.object({
  format: z.literal('5k-compass-catalogue-v1'),
  source: EventCatalogueSourceSchema,
  records: z.array(z.unknown()).max(5000),
}).strict();
export type EventCatalogueSource = z.infer<typeof EventCatalogueSourceSchema>;
export type EventCatalogueRecord = z.infer<typeof EventCatalogueRecordSchema>;
export interface CatalogueIssue { path: string; code: string; message: string }
export const catalogueIssues = (error: z.ZodError): CatalogueIssue[] => error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message }));
export class CatalogueInputError extends Error {
  constructor(readonly issues: CatalogueIssue[]) { super('Invalid catalogue input'); this.name = 'CatalogueInputError'; }
}
