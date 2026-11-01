import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  createSessionCookie,
  type UserRole,
  verifyPassword,
} from "@/lib/auth";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface UserRow {
  user_id: number;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
}

export async function POST(request: Request) {
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.trim() === "" ||
    body.password === ""
  ) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query<UserRow>(
      `SELECT user_id, password_hash, role, is_active
       FROM user_account
       WHERE email = $1`,
      [body.email.trim().toLowerCase()],
    );
    const user = result.rows[0];

    if (
      !user ||
      !user.is_active ||
      !(await verifyPassword(body.password, user.password_hash))
    ) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    await createSessionCookie(user.user_id, user.role);

    return NextResponse.json({ role: user.role });
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json(
      { error: "Unable to complete login" },
      { status: 500 },
    );
  }
}
