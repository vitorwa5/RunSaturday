import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATA_SOURCE: z.enum(['database', 'demo']).default('database'),
    DATABASE_URL: z.string().min(1).optional(),
    HOST: z.string().default('127.0.0.1'),
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
  .refine((env) => env.DATA_SOURCE !== 'database' || env.DATABASE_URL, {
    message: 'DATABASE_URL is required when DATA_SOURCE=database (or set DATA_SOURCE=demo)',
    path: ['DATABASE_URL'],
  });

export type AppConfig = z.infer<typeof EnvSchema>;

/** Parse and validate configuration once at startup; fail fast with a readable message. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
