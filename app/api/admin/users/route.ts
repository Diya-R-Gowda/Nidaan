import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { hashPassword, requireRole, type UserRole } from "@/lib/auth";
import { pool } from "@/lib/db";

const roles: readonly UserRole[] = [
  "receptionist",
  "prescriber",
  "pharmacovigilance",
  "admin",
];

type UserRow = {
  user_id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date | string;
};

type CreateUser = {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  registration_no?: string;
  specialisation?: string;
  consultation_fee?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value.trim()).length <= maxLength;
}

function parseCreateUser(value: unknown): CreateUser | null {
  if (!isRecord(value)) return null;
  const { full_name, email, password, role } = value;
  if (
    !isText(full_name, 120) ||
    !isText(email, 255) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !isText(password, 72) ||
    Buffer.byteLength(password, "utf8") > 72 ||
    typeof role !== "string" ||
    !roles.includes(role as UserRole)
  ) {
    return null;
  }

  const user: CreateUser = {
    full_name: full_name.trim(),
    email: email.trim().toLowerCase(),
    password,
    role: role as UserRole,
  };

  if (user.role === "prescriber") {
    const { registration_no, specialisation } = value;
    const rawFee = value.consultation_fee;
    const feeText = typeof rawFee === "number" ? String(rawFee) : rawFee;
    if (
      !isText(registration_no, 60) ||
      !isText(specialisation, 120) ||
      typeof feeText !== "string" ||
      !/^\d{1,8}(?:\.\d{1,2})?$/.test(feeText.trim())
    ) {
      return null;
    }
    const fee = Number(feeText);
    if (!Number.isFinite(fee) || fee < 0 || fee > 99_999_999.99) return null;
    user.registration_no = registration_no.trim();
    user.specialisation = specialisation.trim();
    user.consultation_fee = fee;
  }

  return user;
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function formResponse(request: Request, formSubmission: boolean, status: number, errorCode: string) {
  if (formSubmission) {
    const url = new URL("/admin/users", request.url);
    url.searchParams.set("notice", errorCode);
    return NextResponse.redirect(url, 303);
  }
  const messages: Record<string, string> = {
    invalid: "Provide valid user details and, for prescribers, a complete doctor profile.",
    duplicate: "The email address or doctor registration number is already in use.",
    missing: "The selected user was not found.",
    failed: "Unable to save the user changes.",
  };
  return NextResponse.json({ error: messages[errorCode] ?? messages.failed }, { status });
}

async function readRequestBody(request: Request): Promise<{ body: unknown; isForm: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { body: await request.json(), isForm: false };
  }
  const form = await request.formData();
  return { body: Object.fromEntries(form.entries()), isForm: true };
}

export async function GET() {
  try {
    const authorization = await requireRole(["admin"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json({ error: "Unable to verify authorization" }, { status: 500 });
  }

  try {
    const result = await pool.query<UserRow>(
      `SELECT user_id, full_name, email, role, is_active, created_at
       FROM user_account
       ORDER BY created_at DESC, user_id DESC`,
    );
    return NextResponse.json({ users: result.rows });
  } catch {
    return NextResponse.json({ error: "Unable to load users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let authorization;
  try {
    authorization = await requireRole(["admin"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json({ error: "Unable to verify authorization" }, { status: 500 });
  }

  let body: unknown;
  let isForm = false;
  try {
    ({ body, isForm } = await readRequestBody(request));
  } catch {
    return formResponse(request, isForm, 400, "invalid");
  }

  if (isRecord(body) && body.intent === "set_active") {
    const userId = typeof body.user_id === "string" ? Number(body.user_id) : body.user_id;
    const isActive = body.is_active === "true" || body.is_active === true
      ? true
      : body.is_active === "false" || body.is_active === false ? false : null;
    if (!Number.isSafeInteger(userId) || (userId as number) < 1 || (userId as number) > 2_147_483_647 || isActive === null) {
      return formResponse(request, isForm, 400, "invalid");
    }
    try {
      const result = await pool.query<UserRow>(
        `UPDATE user_account
         SET is_active = $2
         WHERE user_id = $1
         RETURNING user_id, full_name, email, role, is_active, created_at`,
        [userId, isActive],
      );
      if (!result.rows[0]) return formResponse(request, isForm, 404, "missing");
      if (isForm) {
        const url = new URL("/admin/users", request.url);
        url.searchParams.set("notice", isActive ? "activated" : "deactivated");
        return NextResponse.redirect(url, 303);
      }
      return NextResponse.json({ user: result.rows[0] });
    } catch {
      return formResponse(request, isForm, 500, "failed");
    }
  }

  const user = parseCreateUser(body);
  if (!user) return formResponse(request, isForm, 400, "invalid");

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    const passwordHash = await hashPassword(user.password);
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const inserted = await client.query<UserRow>(
      `INSERT INTO user_account (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, full_name, email, role, is_active, created_at`,
      [user.email, passwordHash, user.full_name, user.role],
    );
    const createdUser = inserted.rows[0];

    if (user.role === "prescriber") {
      await client.query(
        `INSERT INTO doctor (user_id, registration_no, specialisation, consultation_fee)
         VALUES ($1, $2, $3, $4)`,
        [createdUser.user_id, user.registration_no, user.specialisation, user.consultation_fee],
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;
    if (isForm) {
      const url = new URL("/admin/users", request.url);
      url.searchParams.set("notice", "created");
      return NextResponse.redirect(url, 303);
    }
    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Do not expose database errors in the response.
      }
    }
    if (isUniqueViolation(error)) return formResponse(request, isForm, 409, "duplicate");
    return formResponse(request, isForm, 500, "failed");
  } finally {
    client?.release();
  }
}
