import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { appendFile, mkdir } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { dirname } from 'node:path';
import { usesSecureAuthCookies, type AppConfig } from '../config/env';
import type { Db } from '../db/prisma';

export const deliveryStatus = new AsyncLocalStorage<{ failed: boolean }>();
export interface EmailDelivery { send(email: string, code: string): Promise<void> }

/** Never logs credentials or delivery payloads. Test inboxes are opt-in and unavailable in production. */
export function emailDelivery(config: AppConfig): EmailDelivery {
  if (config.EMAIL_TRANSPORT === 'test' && config.NODE_ENV === 'test') {
    if (!config.OTP_TEST_INBOX_PATH) throw new Error('Test inbox not configured');
    return { async send(email, code) {
      await mkdir(dirname(config.OTP_TEST_INBOX_PATH!), { recursive: true });
      await appendFile(config.OTP_TEST_INBOX_PATH!, JSON.stringify({ email, code }) + '\n', { mode: 0o600 });
    } };
  }
  return { async send(email, code) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [email], subject: 'Your 5K Compass sign-in code', text: `Your sign-in code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.` }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Email delivery unavailable');
  } };
}

export function createAuth(db: Db, config: AppConfig, delivery = emailDelivery(config)) {
  return betterAuth({
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    secret: config.AUTH_SECRET!,
    baseURL: config.AUTH_BASE_URL!,
    basePath: '/api/auth',
    trustedOrigins: [new URL(config.AUTH_BASE_URL!).origin],
    databaseHooks: { session: { create: { async before(session) {
      const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, isDemo: true, emailVerified: true } });
      return !!user && user.id !== 'demo-user' && !user.isDemo && user.emailVerified;
    } } } },
    user: { fields: { name: 'displayName' } },
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: usesSecureAuthCookies(config),
      cookiePrefix: '5k-compass',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      // This header is overwritten with Fastify's socket IP at the boundary, never client-supplied.
      ipAddress: { ipAddressHeaders: ['x-compass-client-ip'] },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    logger: { disabled: true },
    plugins: [emailOTP({ otpLength: 6, expiresIn: 300, allowedAttempts: 5, storeOTP: 'hashed', resendStrategy: 'rotate', rateLimit: { window: 60, max: 10 },
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'sign-in') throw new Error('Unsupported verification purpose');
        try { await delivery.send(email, otp); }
        catch {
          // Better Auth intentionally catches email-task errors. Record failure for our HTTP boundary.
          const status = deliveryStatus.getStore();
          if (status) status.failed = true;
          throw new Error('Email delivery unavailable');
        }
      },
    })],
  });
}
export type Auth = ReturnType<typeof createAuth>;
