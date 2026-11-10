import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import argon2 from 'argon2';
import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  ResetPasswordRecoveryRequest,
  VerifyPasswordRecoveryCodeResponse,
} from '@libs/shared';
import { verifyPasswordRecoveryCodeResponseSchema } from '@libs/shared';
import { DATABASE_POOL } from './db/pool.provider.js';
import { getJwtSecret } from './auth-config.js';
import { EMAIL_SENDER } from './email/types.js';
import type { EmailSender, EmailPurpose } from './email/types.js';

export function hashVerificationCode(
  email: string,
  purpose: EmailPurpose,
  code: string,
) {
  return createHmac('sha256', getJwtSecret())
    .update(`floorwalk:email-verification:v1\0${purpose}\0${email}\0${code}`)
    .digest('hex');
}

export function hashPasswordRecoveryToken(token: string) {
  return createHmac('sha256', getJwtSecret())
    .update(`floorwalk:password-recovery-token:v1\0${token}`)
    .digest('hex');
}

function matchesVerificationCode(
  storedHash: string,
  email: string,
  purpose: EmailPurpose,
  code: string,
) {
  const expected = Buffer.from(
    hashVerificationCode(email, purpose, code),
    'hex',
  );
  const stored = Buffer.from(storedHash, 'hex');
  return stored.length === expected.length && timingSafeEqual(stored, expected);
}

@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
  ) {}

  requestRegistrationCode(email: string) {
    return this.issueCode(email, 'registration');
  }

  requestPasswordRecoveryCode(email: string) {
    return this.issueCode(email, 'password_recovery');
  }

  private async issueCode(email: string, purpose: EmailPurpose) {
    const client = await this.pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${purpose}:${email}`],
      );
      await client.query(
        'DELETE FROM floorwalk.email_verifications WHERE email = $1 AND purpose = $2 AND expires_at <= now()',
        [email, purpose],
      );
      const recent = await client.query(
        `SELECT id FROM floorwalk.email_verifications
         WHERE email = $1 AND purpose = $2
           AND requested_at > now() - interval '60 seconds'
         LIMIT 1`,
        [email, purpose],
      );
      if (recent.rowCount)
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: '验证码 60 秒内只能发送一次。',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );

      const shouldSend =
        purpose === 'registration' ||
        Boolean(
          (
            await client.query(
              `SELECT 1 FROM floorwalk.users
               WHERE login_name = $1 AND role = 'admin'
               LIMIT 1`,
              [email],
            )
          ).rowCount,
        );

      if (purpose === 'password_recovery')
        await client.query(
          `UPDATE floorwalk.email_verifications
           SET recovery_token_hash = NULL
           WHERE email = $1 AND purpose = $2 AND recovery_token_hash IS NOT NULL`,
          [email, purpose],
        );

      await client.query(
        `UPDATE floorwalk.email_verifications SET consumed_at = now()
         WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
        [email, purpose],
      );
      const code = shouldSend ? String(randomInt(100_000, 1_000_000)) : null;
      await client.query(
        `INSERT INTO floorwalk.email_verifications
           (email, purpose, code_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '5 minutes')`,
        [
          email,
          purpose,
          code ? hashVerificationCode(email, purpose, code) : null,
        ],
      );
      const message = code
        ? { recipient: email, subject: 'FloorWalk 邮箱验证码', code }
        : null;
      if (message && purpose === 'registration')
        await this.sender.sendVerificationCode(message);
      await client.query('COMMIT');
      inTransaction = false;
      if (message && purpose === 'password_recovery') {
        // Provider latency and failures must not reveal administrator existence.
        void this.sender.sendVerificationCode(message).catch(() => undefined);
      }
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeRegistrationCode(
    client: PoolClient,
    email: string,
    code: string,
  ) {
    return Boolean(await this.consumeCode(client, email, 'registration', code));
  }

  async verifyPasswordRecoveryCode(
    email: string,
    code: string,
  ): Promise<VerifyPasswordRecoveryCodeResponse> {
    const client = await this.pool.connect();
    let response: VerifyPasswordRecoveryCodeResponse | undefined;
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      const verification = await this.consumeCode(
        client,
        email,
        'password_recovery',
        code,
      );
      if (verification) {
        const organizations = await client.query<{ id: string; name: string }>(
          `SELECT o.id, o.name
           FROM floorwalk.users u
           JOIN floorwalk.organizations o ON o.id = u.org_id
           WHERE u.login_name = $1 AND u.role = 'admin'
           ORDER BY o.name, o.id`,
          [email],
        );
        if (organizations.rowCount) {
          const resetToken = randomBytes(32).toString('base64url');
          await client.query(
            `UPDATE floorwalk.email_verifications
             SET verified_at = now(), recovery_token_hash = $2,
                 expires_at = now() + interval '5 minutes'
             WHERE id = $1`,
            [verification.id, hashPasswordRecoveryToken(resetToken)],
          );
          response = verifyPasswordRecoveryCodeResponseSchema.parse({
            resetToken,
            organizations: organizations.rows,
          });
        }
      }
      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (!response) throw this.badCode();
    return response;
  }

  async resetPasswordRecovery(input: ResetPasswordRecoveryRequest) {
    const client = await this.pool.connect();
    let updated = false;
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      const verification = await client.query<{
        id: string;
        email: string;
      }>(
        `SELECT id, email FROM floorwalk.email_verifications
         WHERE purpose = 'password_recovery'
           AND recovery_token_hash = $1
           AND verified_at IS NOT NULL AND expires_at > now()
         FOR UPDATE`,
        [hashPasswordRecoveryToken(input.resetToken)],
      );
      const record = verification.rows[0];
      if (record) {
        const user = await client.query<{ id: string }>(
          `SELECT id FROM floorwalk.users
           WHERE org_id = $1 AND login_name = $2 AND role = 'admin'
           FOR UPDATE`,
          [input.orgId, record.email],
        );
        if (user.rows[0]) {
          const passwordHash = await argon2.hash(input.password);
          await client.query(
            `UPDATE floorwalk.users
             SET password_hash = $2, must_change_password = false
             WHERE id = $1`,
            [user.rows[0].id, passwordHash],
          );
          await client.query(
            `UPDATE floorwalk.sessions SET revoked_at = now()
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [user.rows[0].id],
          );
          updated = true;
        }
        await client.query(
          `UPDATE floorwalk.email_verifications
           SET recovery_token_hash = NULL, consumed_at = now()
           WHERE id = $1`,
          [record.id],
        );
      }
      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (!updated) throw this.badCode();
  }

  private async consumeCode(
    client: PoolClient,
    email: string,
    purpose: EmailPurpose,
    code: string,
  ) {
    const result = await client.query<{
      id: string;
      code_hash: string | null;
      attempt_count: number;
      valid_time: boolean;
    }>(
      `SELECT id, code_hash, attempt_count, expires_at > now() AS valid_time
       FROM floorwalk.email_verifications
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL
       FOR UPDATE`,
      [email, purpose],
    );
    const verification = result.rows[0];
    if (!verification) return false;
    if (!verification.valid_time || !verification.code_hash) {
      await client.query(
        'UPDATE floorwalk.email_verifications SET consumed_at = now() WHERE id = $1',
        [verification.id],
      );
      return false;
    }
    if (verification.attempt_count >= 5) {
      await client.query(
        'UPDATE floorwalk.email_verifications SET consumed_at = now() WHERE id = $1',
        [verification.id],
      );
      return false;
    }
    if (
      !matchesVerificationCode(verification.code_hash, email, purpose, code)
    ) {
      const attempts = verification.attempt_count + 1;
      await client.query(
        `UPDATE floorwalk.email_verifications
         SET attempt_count = $2,
             consumed_at = CASE WHEN $2 >= 5 THEN now() ELSE NULL END
         WHERE id = $1`,
        [verification.id, attempts],
      );
      return false;
    }
    await client.query(
      'UPDATE floorwalk.email_verifications SET consumed_at = now() WHERE id = $1',
      [verification.id],
    );
    return { id: verification.id };
  }

  badCode() {
    return new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: '邮箱验证码错误或已过期。',
    });
  }
}
