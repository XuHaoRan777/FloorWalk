import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { errorResponseSchema } from '@libs/shared';
import { AppModule } from './app.module.js';
import { clearFakeMailbox } from './email/fake.js';
import { EMAIL_SENDER, type EmailSender } from './email/index.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('email verification and recovery (FW-025 AC-01 through AC-05)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const orgPrefix = `FW025-${randomUUID()}`;
  const createdOrgIds: string[] = [];
  const registeredEmails = new Set<string>();

  const requestCode = async (email: string) => {
    registeredEmails.add(email);
    const response = await request(app.getHttpServer())
      .post('/api/auth/registration-code')
      .send({ email })
      .expect(201);
    expect(response.body.message).toBe('如果该邮箱可接收验证码，请查看邮箱。');
    const mailbox = await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: email })
      .expect(200);
    return mailbox.body as { subject: string; code: string };
  };

  const register = async (email: string, orgName: string) => {
    const mail = await requestCode(email);
    const response = await request(app.getHttpServer())
      .post('/api/orgs')
      .send({
        orgName,
        adminName: '验证码管理员',
        email,
        password: 'registration-password',
        verificationCode: mail.code,
      })
      .expect(201);
    createdOrgIds.push(response.body.org.id);
    return response.body as {
      org: { id: string; name: string };
      user: { id: string; loginName: string };
    };
  };

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM floorwalk.email_verifications WHERE email = ANY($1::text[])',
        [[...registeredEmails]],
      );
      await client.query(
        'DELETE FROM floorwalk.users WHERE org_id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await client.query(
        'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      clearFakeMailbox();
      await pool.end();
      await app.close();
    }
  });

  it('stores only a code hash and creates a merchant after email verification', async () => {
    const email = `fw025-${randomUUID()}@example.test`;
    const mail = await requestCode(email);
    expect(mail.subject).toBe('FloorWalk 邮箱验证码');
    expect(mail.code).toMatch(/^\d{6}$/);

    const stored = await pool.query<{
      code_hash: string;
      attempt_count: number;
      expires_at: Date;
      requested_at: Date;
    }>(
      `SELECT code_hash, attempt_count, expires_at, requested_at
       FROM floorwalk.email_verifications WHERE email = $1`,
      [email],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].code_hash).not.toBe(mail.code);
    expect(stored.rows[0].attempt_count).toBe(0);
    expect(stored.rows[0].expires_at.getTime()).toBeGreaterThan(
      stored.rows[0].requested_at.getTime(),
    );

    const registration = await request(app.getHttpServer())
      .post('/api/orgs')
      .send({
        orgName: `${orgPrefix}-verified-registration`,
        adminName: '验证码管理员',
        email,
        password: 'registration-password',
        verificationCode: mail.code,
      })
      .expect(201);
    createdOrgIds.push(registration.body.org.id);
    expect(registration.body.user.loginName).toBe(email);
    const consumed = await pool.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM floorwalk.email_verifications WHERE email = $1',
      [email],
    );
    expect(consumed.rows[0].consumed_at).toBeInstanceOf(Date);
  });

  it('allows the same verified email to register multiple merchants', async () => {
    const email = `fw025-multi-${randomUUID()}@example.test`;
    const first = await register(email, `${orgPrefix}-multi-one`);
    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET requested_at = now() - interval '61 seconds'
       WHERE email = $1 AND purpose = 'registration'`,
      [email],
    );
    const second = await register(email, `${orgPrefix}-multi-two`);
    expect(second.user.loginName).toBe(email);
    expect(second.org.id).not.toBe(first.org.id);
    expect(
      await pool.query(
        'SELECT count(*)::int AS count FROM floorwalk.users WHERE login_name = $1',
        [email],
      ),
    ).toMatchObject({ rows: [{ count: 2 }] });
  });

  it('hides administrator existence, selects a merchant, and resets only that account', async () => {
    const email = `fw025-recovery-${randomUUID()}@example.test`;
    const first = await register(email, `${orgPrefix}-recovery-one`);
    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET requested_at = now() - interval '61 seconds'
       WHERE email = $1 AND purpose = 'registration'`,
      [email],
    );
    const second = await register(email, `${orgPrefix}-recovery-two`);

    const unknownEmail = `fw025-unknown-${randomUUID()}@example.test`;
    registeredEmails.add(unknownEmail);
    const unknownRequest = await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email: unknownEmail })
      .expect(201);
    expect(unknownRequest.body.message).toBe(
      '如果该邮箱可接收验证码，请查看邮箱。',
    );
    await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: unknownEmail })
      .expect(404);
    const unknownResend = await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email: unknownEmail })
      .expect(429);
    expect(errorResponseSchema.parse(unknownResend.body).code).toBe(
      'RATE_LIMITED',
    );

    const knownRequest = await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email })
      .expect(201);
    expect(knownRequest.body).toEqual(unknownRequest.body);
    const resend = await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email })
      .expect(429);
    expect(errorResponseSchema.parse(resend.body).code).toBe('RATE_LIMITED');
    const mailbox = await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: email })
      .expect(200);
    const code = mailbox.body.code as string;

    const verified = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/verify')
      .send({ email, code })
      .expect(201);
    expect(verified.body.organizations).toEqual(
      expect.arrayContaining([
        { id: first.org.id, name: first.org.name },
        { id: second.org.id, name: second.org.name },
      ]),
    );
    expect(verified.body.resetToken).not.toBe(code);
    const storedToken = await pool.query<{
      code_hash: string;
      recovery_token_hash: string;
      verified_at: Date;
    }>(
      `SELECT code_hash, recovery_token_hash, verified_at
       FROM floorwalk.email_verifications
       WHERE email = $1 AND purpose = 'password_recovery'`,
      [email],
    );
    expect(storedToken.rows).toHaveLength(1);
    expect(storedToken.rows[0].code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedToken.rows[0].code_hash).not.toBe(code);
    expect(storedToken.rows[0].recovery_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedToken.rows[0].recovery_token_hash).not.toBe(
      verified.body.resetToken,
    );
    expect(storedToken.rows[0].verified_at).toBeInstanceOf(Date);

    const login = async (orgId: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({ loginName: email, orgId, password });
      const cookie = (
        response.headers['set-cookie'] as unknown as string[]
      )?.[0]?.split(';')[0];
      return { response, cookie };
    };
    const firstSession = await login(first.org.id, 'registration-password');
    const secondSession = await login(second.org.id, 'registration-password');
    const secondSessionAgain = await login(
      second.org.id,
      'registration-password',
    );
    expect(firstSession.response.status).toBe(201);
    expect(secondSession.response.status).toBe(201);
    expect(secondSessionAgain.response.status).toBe(201);

    const rejectedReset = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/reset')
      .send({
        resetToken: verified.body.resetToken,
        orgId: second.org.id,
        password: 'short',
      })
      .expect(400);
    expect(errorResponseSchema.parse(rejectedReset.body).code).toBe(
      'VALIDATION_FAILED',
    );
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', secondSession.cookie!)
      .expect(200);
    const afterRejectedReset = await login(
      second.org.id,
      'registration-password',
    );
    expect(afterRejectedReset.response.status).toBe(201);

    await request(app.getHttpServer())
      .post('/api/auth/password-recovery/reset')
      .send({
        resetToken: verified.body.resetToken,
        orgId: second.org.id,
        password: 'recovered-password',
      })
      .expect(204);
    const reuse = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/reset')
      .send({
        resetToken: verified.body.resetToken,
        orgId: second.org.id,
        password: 'another-password',
      })
      .expect(400);
    expect(errorResponseSchema.parse(reuse.body).code).toBe(
      'VALIDATION_FAILED',
    );

    for (const session of [
      secondSession,
      secondSessionAgain,
      afterRejectedReset,
    ])
      await request(app.getHttpServer())
        .get('/api/me')
        .set('Cookie', session.cookie!)
        .expect(401);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', firstSession.cookie!)
      .expect(200);
    expect(
      (await login(first.org.id, 'registration-password')).response.status,
    ).toBe(201);
    expect(
      (await login(second.org.id, 'registration-password')).response.status,
    ).toBe(401);
    const recoveredLogin = await login(second.org.id, 'recovered-password');
    expect(recoveredLogin.response.status).toBe(201);
    expect(recoveredLogin.response.body.user.mustChangePassword).toBe(false);

    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET requested_at = now() - interval '61 seconds'
       WHERE email = $1 AND purpose = 'password_recovery'`,
      [email],
    );
    await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email })
      .expect(201);
    const retryMailbox = await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: email })
      .expect(200);
    const recoveryCode = retryMailbox.body.code as string;
    const wrongCode = recoveryCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++)
      await request(app.getHttpServer())
        .post('/api/auth/password-recovery/verify')
        .send({ email, code: wrongCode })
        .expect(400);
    const sixthAttempt = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/verify')
      .send({ email, code: recoveryCode })
      .expect(400);
    expect(errorResponseSchema.parse(sixthAttempt.body).code).toBe(
      'VALIDATION_FAILED',
    );
    const recoveryAttempts = await pool.query<{
      attempt_count: number;
      consumed_at: Date | null;
    }>(
      `SELECT attempt_count, consumed_at FROM floorwalk.email_verifications
       WHERE email = $1 AND purpose = 'password_recovery'
       ORDER BY requested_at DESC LIMIT 1`,
      [email],
    );
    expect(recoveryAttempts.rows[0]).toMatchObject({ attempt_count: 5 });
    expect(recoveryAttempts.rows[0].consumed_at).toBeInstanceOf(Date);
    expect(
      (await login(second.org.id, 'recovered-password')).response.status,
    ).toBe(201);

    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET requested_at = now() - interval '61 seconds'
       WHERE email = $1 AND purpose = 'password_recovery'`,
      [email],
    );
    await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email })
      .expect(201);
    const expiredRecovery = await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: email })
      .expect(200);
    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET expires_at = now() - interval '1 second'
       WHERE email = $1 AND purpose = 'password_recovery'
         AND requested_at > now() - interval '60 seconds'`,
      [email],
    );
    await request(app.getHttpServer())
      .post('/api/auth/password-recovery/verify')
      .send({ email, code: expiredRecovery.body.code })
      .expect(400);
  });

  it('does not send recovery mail or verify an email belonging only to store managers', async () => {
    const email = 'inspector@northbean.example';
    registeredEmails.add(email);
    const users = await pool.query<{
      id: string;
      role: string;
      password_hash: string;
    }>(
      'SELECT id, role, password_hash FROM floorwalk.users WHERE login_name = $1',
      [email],
    );
    expect(users.rows.length).toBeGreaterThan(0);
    expect(users.rows.every((user) => user.role === 'store_manager')).toBe(
      true,
    );
    const userIds = users.rows.map((user) => user.id);
    const sessionsBefore = await pool.query(
      `SELECT id, revoked_at FROM floorwalk.sessions
       WHERE user_id = ANY($1::uuid[]) ORDER BY id`,
      [userIds],
    );
    const requested = await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email })
      .expect(201);
    expect(requested.body.message).toBe('如果该邮箱可接收验证码，请查看邮箱。');
    await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: email })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/auth/password-recovery/verify')
      .send({ email, code: '123456' })
      .expect(400);
    for (const user of users.rows) {
      const unchanged = await pool.query<{ password_unchanged: boolean }>(
        'SELECT password_hash = $2 AS password_unchanged FROM floorwalk.users WHERE id = $1',
        [user.id, user.password_hash],
      );
      expect(unchanged.rows).toEqual([{ password_unchanged: true }]);
    }
    const sessionsAfter = await pool.query(
      `SELECT id, revoked_at FROM floorwalk.sessions
       WHERE user_id = ANY($1::uuid[]) ORDER BY id`,
      [userIds],
    );
    expect(sessionsAfter.rows).toEqual(sessionsBefore.rows);
  });

  it('keeps recovery responses independent of mail provider delays and failures', async () => {
    const knownEmail = `fw025-send-failure-${randomUUID()}@example.test`;
    const unknownEmail = `fw025-unknown-failure-${randomUUID()}@example.test`;
    await register(knownEmail, `${orgPrefix}-send-failure`);
    registeredEmails.add(unknownEmail);
    clearFakeMailbox();
    let rejectDelivery!: (error: Error) => void;
    const delivery = new Promise<void>((_resolve, reject) => {
      rejectDelivery = reject;
    });
    const deliveryError = new Error('Mail provider unavailable');
    const sender = vi
      .spyOn(app.get<EmailSender>(EMAIL_SENDER), 'sendVerificationCode')
      .mockImplementation(() => delivery);
    try {
      const known = await request(app.getHttpServer())
        .post('/api/auth/password-recovery-code')
        .send({ email: knownEmail })
        .timeout({ response: 2_000 })
        .expect(201);
      const unknown = await request(app.getHttpServer())
        .post('/api/auth/password-recovery-code')
        .send({ email: unknownEmail })
        .expect(201);
      expect(known.body).toEqual(unknown.body);
      expect(sender).toHaveBeenCalledTimes(1);
      rejectDelivery(deliveryError);
      await delivery.catch(() => undefined);
      for (const email of [knownEmail, unknownEmail]) {
        await request(app.getHttpServer())
          .get('/api/testing/mailbox')
          .query({ recipient: email })
          .expect(404);
        const repeated = await request(app.getHttpServer())
          .post('/api/auth/password-recovery-code')
          .send({ email })
          .expect(429);
        expect(errorResponseSchema.parse(repeated.body).code).toBe(
          'RATE_LIMITED',
        );
      }
    } finally {
      rejectDelivery(deliveryError);
      await delivery.catch(() => undefined);
      sender.mockRestore();
    }
  });

  it('rate limits, expires, and consumes registration codes after five wrong attempts', async () => {
    const email = `fw025-attempts-${randomUUID()}@example.test`;
    const mail = await requestCode(email);
    const limited = await request(app.getHttpServer())
      .post('/api/auth/registration-code')
      .send({ email })
      .expect(429);
    expect(errorResponseSchema.parse(limited.body).code).toBe('RATE_LIMITED');
    const wrongCode = mail.code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++)
      await request(app.getHttpServer())
        .post('/api/orgs')
        .send({
          orgName: `${orgPrefix}-wrong-${attempt}`,
          adminName: '验证码管理员',
          email,
          password: 'registration-password',
          verificationCode: wrongCode,
        })
        .expect(400);
    await request(app.getHttpServer())
      .post('/api/orgs')
      .send({
        orgName: `${orgPrefix}-fifth-attempt`,
        adminName: '验证码管理员',
        email,
        password: 'registration-password',
        verificationCode: mail.code,
      })
      .expect(400);
    const attempts = await pool.query<{
      attempt_count: number;
      consumed_at: Date | null;
    }>(
      `SELECT attempt_count, consumed_at FROM floorwalk.email_verifications
       WHERE email = $1 AND purpose = 'registration'`,
      [email],
    );
    expect(attempts.rows[0]).toMatchObject({ attempt_count: 5 });
    expect(attempts.rows[0].consumed_at).toBeInstanceOf(Date);

    const expiredEmail = `fw025-expired-${randomUUID()}@example.test`;
    const expired = await requestCode(expiredEmail);
    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET expires_at = now() - interval '1 second'
       WHERE email = $1 AND purpose = 'registration'`,
      [expiredEmail],
    );
    await request(app.getHttpServer())
      .post('/api/orgs')
      .send({
        orgName: `${orgPrefix}-expired`,
        adminName: '验证码管理员',
        email: expiredEmail,
        password: 'registration-password',
        verificationCode: expired.code,
      })
      .expect(400);
  });
});
