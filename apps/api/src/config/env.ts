import { z } from 'zod';
import { trustedProxyAddresses } from './proxy';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_MODE: z.enum(['demo', 'beta']),
    AUTH_SECRET: z.string().min(32).optional(),
    AUTH_BASE_URL: z.url().optional(),
    // Explicit opt-in, restricted below to exact loopback hosts outside production.
    AUTH_ALLOW_INSECURE_LOCAL_HTTP: z.enum(['true', 'false']).default('false'),
    EMAIL_TRANSPORT: z.enum(['resend', 'test']).optional(),
    EMAIL_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
    OTP_TEST_INBOX_PATH: z.string().optional(),
    DATA_SOURCE: z.enum(['database', 'demo']).default('database'),
    DATABASE_URL: z.string().min(1).optional(),
    HOST: z.string().default('127.0.0.1'),
    TRUSTED_PROXY_CIDRS: z.string().default(''),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://127.0.0.1:5173')
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
    APP_TIME_ZONE: z.string().default('Europe/London'),
    /** Which EventScore.calculationVersion clients are served. */
    ACTIVE_SCORE_VERSION: z.string().default('demo_v0'),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    try { trustedProxyAddresses(env.TRUSTED_PROXY_CIDRS); }
    catch (error) { issue('TRUSTED_PROXY_CIDRS', (error as Error).message); }
    if (env.NODE_ENV === 'production' && env.APP_MODE !== 'beta') issue('APP_MODE', 'Production requires APP_MODE=beta');
    if (env.APP_MODE === 'beta') {
      if (env.DATA_SOURCE !== 'database') issue('DATA_SOURCE', 'Beta requires PostgreSQL');
      if (!env.AUTH_SECRET) issue('AUTH_SECRET', 'Beta requires an authentication secret of at least 32 characters');
      if (!env.AUTH_BASE_URL) issue('AUTH_BASE_URL', 'Beta requires the public same-origin AUTH_BASE_URL');
      if (env.AUTH_BASE_URL) {
        const url = new URL(env.AUTH_BASE_URL);
        const localHttp = env.AUTH_ALLOW_INSECURE_LOCAL_HTTP === 'true'
          && env.NODE_ENV !== 'production'
          && url.protocol === 'http:'
          && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          && !url.username && !url.password;
        if (url.protocol !== 'https:' && !localHttp) issue('AUTH_BASE_URL', 'Beta requires HTTPS; local HTTP requires explicit AUTH_ALLOW_INSECURE_LOCAL_HTTP=true and a loopback host outside production');
      }
      if (env.NODE_ENV === 'production' && env.AUTH_ALLOW_INSECURE_LOCAL_HTTP === 'true') issue('AUTH_ALLOW_INSECURE_LOCAL_HTTP', 'Production forbids the local HTTP exception');
      if (env.EMAIL_TRANSPORT === 'test') {
        if (env.NODE_ENV !== 'test') issue('EMAIL_TRANSPORT', 'Test delivery is allowed only with NODE_ENV=test');
      } else if (env.EMAIL_TRANSPORT !== 'resend' || !env.EMAIL_API_KEY || !env.EMAIL_FROM) {
        issue('EMAIL_TRANSPORT', 'Beta requires real email delivery (resend, EMAIL_API_KEY and EMAIL_FROM)');
      }
    }
  })
  .refine((env) => env.DATA_SOURCE !== 'database' || env.DATABASE_URL, {
    message: 'DATABASE_URL is required when DATA_SOURCE=database (or set DATA_SOURCE=demo)',
    path: ['DATABASE_URL'],
  });

export type AppConfig = z.infer<typeof EnvSchema>;

/** Validated beta transport, independent of NODE_ENV's default. */
export function usesSecureAuthCookies(config: AppConfig): boolean {
  return config.APP_MODE === 'beta' && new URL(config.AUTH_BASE_URL!).protocol === 'https:';
}

/** Parse and validate configuration once at startup; fail fast with a readable message. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
