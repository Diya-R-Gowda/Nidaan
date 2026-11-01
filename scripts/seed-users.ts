import bcrypt from "bcrypt";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const demoUsers = [
  {
    email: "receptionist@nidaan.local",
    fullName: "Nidaan Receptionist",
    role: "receptionist",
    passwordVariable: "DEMO_RECEPTIONIST_PASSWORD",
  },
  {
    email: "prescriber@nidaan.local",
    fullName: "Nidaan Prescriber",
    role: "prescriber",
    passwordVariable: "DEMO_PRESCRIBER_PASSWORD",
  },
  {
    email: "pharmacovigilance@nidaan.local",
    fullName: "Nidaan Pharmacovigilance Officer",
    role: "pharmacovigilance",
    passwordVariable: "DEMO_PHARMACOVIGILANCE_PASSWORD",
  },
  {
    email: "admin@nidaan.local",
    fullName: "Nidaan Administrator",
    role: "admin",
    passwordVariable: "DEMO_ADMIN_PASSWORD",
  },
] as const;

async function seedUsers(): Promise<void> {
  const passwords = demoUsers.map(({ passwordVariable }) => {
    const password = process.env[passwordVariable];

    if (!password) {
      throw new Error(`Missing required environment variable: ${passwordVariable}`);
    }

    return password;
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userIds = new Map<string, number>();

    for (const [index, user] of demoUsers.entries()) {
      const passwordHash = await bcrypt.hash(passwords[index], 12);
      const result = await client.query<{ user_id: number }>(
        `INSERT INTO user_account (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name,
             role = EXCLUDED.role,
             is_active = TRUE
         RETURNING user_id`,
        [user.email, passwordHash, user.fullName, user.role],
      );

      userIds.set(user.role, result.rows[0].user_id);
    }

    const prescriberId = userIds.get("prescriber");

    if (prescriberId === undefined) {
      throw new Error("Prescriber user was not created");
    }

    await client.query(
      `INSERT INTO doctor (
         user_id, registration_no, specialisation, consultation_fee
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET registration_no = EXCLUDED.registration_no,
           specialisation = EXCLUDED.specialisation,
           consultation_fee = EXCLUDED.consultation_fee`,
      [prescriberId, "NIDAAN-DEMO-001", "General Medicine", 500.00],
    );

    await client.query("COMMIT");
    console.log("Seeded four demo users and one prescriber doctor.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedUsers().catch((error: unknown) => {
  console.error("User seeding failed:", error);
  process.exitCode = 1;
});
