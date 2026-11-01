import bcrypt from "bcrypt";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const SESSION_COOKIE = "nidaan_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type UserRole =
  | "receptionist"
  | "prescriber"
  | "pharmacovigilance"
  | "admin";

export interface Session {
  userId: number;
  role: UserRole;
  expiresAt: number;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET must be configured");
  }

  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string): Session | null {
  const separator = value.lastIndexOf(".");

  if (separator <= 0) {
    return null;
  }

  const payload = value.slice(0, separator);
  const providedSignature = value.slice(separator + 1);
  const expectedSignature = sign(payload);
  const providedBytes = Buffer.from(providedSignature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;

    if (
      !Number.isInteger(session.userId) ||
      !Number.isInteger(session.expiresAt) ||
      session.expiresAt <= Math.floor(Date.now() / 1000) ||
      ![
        "receptionist",
        "prescriber",
        "pharmacovigilance",
        "admin",
      ].includes(session.role)
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function createSessionCookie(
  userId: number,
  role: UserRole,
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const session: Session = { userId, role, expiresAt };

  (await cookies()).set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession(): Promise<Session | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!value) {
    return null;
  }

  const session = decodeSession(value);
  if (!session) return null;

  const accountResult = await pool.query<{ role: UserRole; is_active: boolean }>(
    `SELECT role, is_active
     FROM user_account
     WHERE user_id = $1`,
    [session.userId],
  );
  const account = accountResult.rows[0];
  if (!account || !account.is_active || account.role !== session.role) {
    return null;
  }
  return session;
}

export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<Session | NextResponse> {
  const session = await readSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return session;
}
