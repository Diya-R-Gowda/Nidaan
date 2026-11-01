import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  try {
    const [patients, doctors] = await Promise.all([
      pool.query(
        `SELECT patient_id, full_name
         FROM patient
         ORDER BY full_name, patient_id`,
      ),
      pool.query(
        `SELECT doctor.doctor_id, account.full_name
         FROM doctor
         JOIN user_account AS account ON account.user_id = doctor.user_id
         WHERE account.role = $1
           AND account.is_active = $2
         ORDER BY account.full_name, doctor.doctor_id`,
        ["prescriber", true],
      ),
    ]);

    return NextResponse.json({
      patients: patients.rows,
      doctors: doctors.rows,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load appointment options" },
      { status: 500 },
    );
  }
}
