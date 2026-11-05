import type { QueryResultRow } from "pg";

import type { RegistrationInvite, UserProfile, UserRole } from "@/lib/types";
import { queryRows, withTransaction } from "./query.ts";
import { normalizeRow } from "./read.ts";

export type AuthUserRecord = {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  disabled: boolean;
};

export type AuthSessionContext = {
  sessionId: string;
  user: AuthUserRecord;
  profile: UserProfile;
};

type AuthUserRow = QueryResultRow & {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  disabled: boolean;
};

function mapAuthUser(row: AuthUserRow): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    email_verified_at: row.email_verified_at?.toISOString() ?? null,
    failed_login_attempts: row.failed_login_attempts,
    locked_until: row.locked_until?.toISOString() ?? null,
    disabled: row.disabled
  };
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const rows = await queryRows<AuthUserRow>(
    `select id, email, password_hash, email_verified_at, failed_login_attempts, locked_until, disabled
     from public.users
     where email = $1
     limit 1`,
    [email]
  );
  return rows[0] ? mapAuthUser(rows[0]) : null;
}

export async function recordLoginFailure(userId: string): Promise<void> {
  await queryRows(
    `update public.users
     set failed_login_attempts = failed_login_attempts + 1,
         locked_until = case
           when failed_login_attempts + 1 >= 5 then now() + interval '15 minutes'
           else locked_until
         end,
         updated_at = now()
     where id = $1`,
    [userId]
  );
}

export async function clearLoginFailures(userId: string): Promise<void> {
  await queryRows(
    `update public.users
     set failed_login_attempts = 0, locked_until = null, updated_at = now()
     where id = $1`,
    [userId]
  );
}

export async function createAuthSession(input: {
  userId: string;
  expiresAt: Date;
  userAgent: string | null;
}): Promise<string> {
  const rows = await queryRows<QueryResultRow>(
    `insert into public.auth_sessions (user_id, expires_at, user_agent)
     values ($1, $2, $3)
     returning id`,
    [input.userId, input.expiresAt, input.userAgent]
  );
  if (rows.length === 0) throw new Error("auth_sessions insert 未返回 id");
  return String(rows[0].id);
}

export async function getAuthSessionContext(sessionId: string): Promise<AuthSessionContext | null> {
  const rows = await queryRows<AuthUserRow & QueryResultRow>(
    `select
       s.id as session_id,
       u.id, u.email, u.password_hash, u.email_verified_at,
       u.failed_login_attempts, u.locked_until, u.disabled,
       p.created_at as profile_created_at,
       p.email as profile_email, p.role, p.customer_name
     from public.auth_sessions s
     join public.users u on u.id = s.user_id
     join public.user_profiles p on p.id = u.id
     where s.id = $1
       and s.revoked_at is null
       and s.expires_at > now()
       and u.disabled = false
     limit 1`,
    [sessionId]
  );
  const row = rows[0] as (AuthUserRow & {
    session_id: string;
    profile_created_at: Date;
    profile_email: string;
    role: UserRole;
    customer_name: string | null;
  }) | undefined;
  if (!row) return null;

  return {
    sessionId: row.session_id,
    user: mapAuthUser(row),
    profile: {
      id: row.id,
      created_at: row.profile_created_at.toISOString(),
      email: row.profile_email,
      role: row.role,
      customer_name: row.customer_name
    }
  };
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  await queryRows(
    "update public.auth_sessions set revoked_at = coalesce(revoked_at, now()) where id = $1",
    [sessionId]
  );
}

export async function registerUserWithInvite(input: {
  email: string;
  passwordHash: string;
  inviteCodeHash: string;
  adminEmail: string;
}): Promise<AuthSessionContext> {
  return withTransaction(async (client) => {
    const inviteResult = await client.query<QueryResultRow>(
      `select *
       from public.registration_invites
       where code_hash = $1
         and active = true
         and used_at is null
         and expires_at > now()
       for update`,
      [input.inviteCodeHash]
    );
    const invite = inviteResult.rows[0] as (RegistrationInvite & QueryResultRow) | undefined;
    if (!invite) throw new Error("INVALID_INVITE");

    const userResult = await client.query<QueryResultRow>(
      `insert into public.users (email, password_hash, email_verified_at)
       values ($1, $2, now())
       returning id, email`,
      [input.email, input.passwordHash]
    );
    const user = userResult.rows[0];
    if (!user) throw new Error("users insert 未返回数据");

    const role: UserRole = input.email === input.adminEmail ? "admin" : invite.role;

    const profileResult = await client.query<QueryResultRow>(
      `insert into public.user_profiles (id, email, role, customer_name)
       values ($1, $2, $3, $4)
       returning created_at`,
      [user.id, input.email, role, invite.customer_name]
    );

    await client.query(
      `update public.registration_invites
       set used_at = now(), used_by_email = $2, used_by_user_id = $1
       where id = $3`,
      [user.id, input.email, invite.id]
    );

    return {
      sessionId: "",
      user: {
        id: String(user.id),
        email: String(user.email),
        password_hash: input.passwordHash,
        email_verified_at: new Date().toISOString(),
        failed_login_attempts: 0,
        locked_until: null,
        disabled: false
      },
      profile: {
        id: String(user.id),
        created_at: (profileResult.rows[0]?.created_at as Date).toISOString(),
        email: input.email,
        role,
        customer_name: invite.customer_name
      }
    };
  });
}

export async function createRegistrationInvite(input: {
  createdByUserId: string;
  createdByEmail: string;
  codeHash: string;
  role: "staff" | "client" | "field_inspector";
  customerName: string | null;
  expiresAt: Date;
}): Promise<RegistrationInvite> {
  const rows = await queryRows<QueryResultRow>(
    `insert into public.registration_invites (
       created_by_user_id, created_by_email, code_hash, role, customer_name, expires_at
     ) values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [input.createdByUserId, input.createdByEmail, input.codeHash, input.role, input.customerName, input.expiresAt]
  );
  if (rows.length === 0) throw new Error("registration_invites insert 未返回数据");
  return normalizeRow<RegistrationInvite>(rows[0]);
}

export async function revokeRegistrationInvite(id: string): Promise<boolean> {
  const rows = await queryRows<QueryResultRow>(
    "update public.registration_invites set active = false where id = $1 and active = true returning id",
    [id]
  );
  return rows.length > 0;
}

export async function createPasswordResetToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      "update public.password_reset_tokens set used_at = coalesce(used_at, now()) where user_id = $1 and used_at is null",
      [input.userId]
    );
    await client.query(
      `insert into public.password_reset_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [input.userId, input.tokenHash, input.expiresAt]
    );
  });
}

export async function hasRecentPasswordResetRequest(userId: string, cooldownSeconds = 60): Promise<boolean> {
  const rows = await queryRows<QueryResultRow>(
    `select 1
     from public.password_reset_tokens
     where user_id = $1
       and created_at > now() - make_interval(secs => $2)
     limit 1`,
    [userId, cooldownSeconds]
  );
  return rows.length > 0;
}

export async function resetPasswordWithToken(input: {
  tokenHash: string;
  passwordHash: string;
}): Promise<boolean> {
  return withTransaction(async (client) => {
    const tokenResult = await client.query<QueryResultRow>(
      `select id, user_id
       from public.password_reset_tokens
       where token_hash = $1
         and used_at is null
         and expires_at > now()
       for update`,
      [input.tokenHash]
    );
    const token = tokenResult.rows[0];
    if (!token) return false;

    await client.query(
      `update public.users
       set password_hash = $2,
           email_verified_at = coalesce(email_verified_at, now()),
           failed_login_attempts = 0,
           locked_until = null,
           updated_at = now()
       where id = $1`,
      [token.user_id, input.passwordHash]
    );
    await client.query(
      "update public.password_reset_tokens set used_at = now() where id = $1",
      [token.id]
    );
    await client.query(
      "update public.auth_sessions set revoked_at = coalesce(revoked_at, now()) where user_id = $1",
      [token.user_id]
    );
    return true;
  });
}
