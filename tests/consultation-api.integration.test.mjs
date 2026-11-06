import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const prescriberPassword = process.env.DEMO_PRESCRIBER_PASSWORD;
const apiBase = process.env.NIDAAN_BASE_URL ?? "http://127.0.0.1:3000";

test(
  "consultation API saves a consultation when optional timestamps are omitted",
  { skip: !databaseUrl || !prescriberPassword },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    let patientId;
    let appointmentId;
    let consultationId;

    try {
      await client.connect();
      const database = await client.query("SELECT current_database() AS name");
      assert.equal(
        database.rows[0]?.name,
        "nidaan_verify",
        "Refusing to write fixtures outside the isolated nidaan_verify database",
      );

      const accounts = await client.query(`
        SELECT doctor.doctor_id,
               prescriber.user_id AS prescriber_user_id,
               receptionist.user_id AS receptionist_user_id
        FROM doctor
        JOIN user_account AS prescriber
          ON prescriber.user_id = doctor.user_id
         AND prescriber.role = 'prescriber'
         AND prescriber.is_active = TRUE
        CROSS JOIN LATERAL (
          SELECT user_id
          FROM user_account
          WHERE role = 'receptionist' AND is_active = TRUE
          ORDER BY user_id
          LIMIT 1
        ) AS receptionist
        ORDER BY doctor.doctor_id
        LIMIT 1
      `);
      assert.ok(accounts.rows[0], "Test prescriber and receptionist must be seeded");

      const suffix = randomUUID();
      const patient = await client.query(
        `INSERT INTO patient (full_name, date_of_birth, sex, phone, email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING patient_id`,
        [
          `Automated consultation test ${suffix.slice(0, 8)}`,
          "1990-01-01",
          "unspecified",
          "0000000000",
          `consultation-test-${suffix}@example.invalid`,
        ],
      );
      patientId = patient.rows[0].patient_id;

      const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const appointment = await client.query(
        `INSERT INTO appointment (
           patient_id, doctor_id, created_by, slot_start, slot_end, mode, status
         ) VALUES ($1, $2, $3, $4, $5, 'in_person', 'booked')
         RETURNING appointment_id`,
        [
          patientId,
          accounts.rows[0].doctor_id,
          accounts.rows[0].receptionist_user_id,
          start.toISOString(),
          end.toISOString(),
        ],
      );
      appointmentId = appointment.rows[0].appointment_id;

      const login = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "prescriber@nidaan.local",
          password: prescriberPassword,
        }),
      });
      assert.equal(login.status, 200, "Seeded prescriber login should succeed");
      const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
      assert.ok(sessionCookie, "Login should return the session cookie");

      const invalidResponse = await fetch(`${apiBase}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          appointment_id: appointmentId,
          chief_complaint: "Automated test rejects an invalid timestamp.",
          started_at: "not-a-timestamp",
        }),
      });
      assert.equal(invalidResponse.status, 400);
      const invalidBody = await invalidResponse.json();
      assert.match(invalidBody.error, /valid timestamp/i);

      const unchangedAppointment = await client.query(
        `SELECT appointment.status,
                EXISTS (
                  SELECT 1 FROM consultation
                  WHERE consultation.appointment_id = appointment.appointment_id
                ) AS has_consultation
         FROM appointment
         WHERE appointment_id = $1`,
        [appointmentId],
      );
      assert.equal(unchangedAppointment.rows[0]?.status, "booked");
      assert.equal(unchangedAppointment.rows[0]?.has_consultation, false);

      const response = await fetch(`${apiBase}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          appointment_id: appointmentId,
          chief_complaint: "Automated test consultation without optional timestamps.",
          notes: "Fictional integration-test note.",
          diagnosis: "Fictional test diagnosis.",
        }),
      });
      const body = await response.json();
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.ok(Number.isSafeInteger(body.consultation?.consultation_id));
      consultationId = body.consultation.consultation_id;
      assert.equal(body.consultation.started_at, null);
      assert.equal(body.consultation.ended_at, null);

      const saved = await client.query(
        `SELECT consultation_id, started_at, ended_at
         FROM consultation
         WHERE appointment_id = $1`,
        [appointmentId],
      );
      assert.equal(saved.rows[0]?.consultation_id, consultationId);
      assert.equal(saved.rows[0]?.started_at, null);
      assert.equal(saved.rows[0]?.ended_at, null);

      const completed = await client.query(
        "SELECT status FROM appointment WHERE appointment_id = $1",
        [appointmentId],
      );
      assert.equal(completed.rows[0]?.status, "completed");

      const duplicateResponse = await fetch(`${apiBase}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          appointment_id: appointmentId,
          chief_complaint: "Repeated test submission must not create a duplicate.",
        }),
      });
      const duplicateBody = await duplicateResponse.json();
      assert.equal(duplicateResponse.status, 409);
      assert.equal(duplicateBody.consultation_id, consultationId);
      assert.match(duplicateBody.error, /already recorded/i);

      const duplicateCount = await client.query(
        "SELECT count(*)::int AS count FROM consultation WHERE appointment_id = $1",
        [appointmentId],
      );
      assert.equal(duplicateCount.rows[0]?.count, 1);
    } finally {
      if (patientId) {
        await client.query("BEGIN");
        try {
          await client.query(
            `DELETE FROM audit_log
             WHERE (entity_type = 'appointment' AND entity_id = $1)
                OR (entity_type = 'consultation' AND entity_id = $2)`,
            [appointmentId, consultationId ?? null],
          );
          await client.query(
            "DELETE FROM consultation WHERE appointment_id = $1",
            [appointmentId],
          );
          await client.query(
            "DELETE FROM appointment WHERE appointment_id = $1",
            [appointmentId],
          );
          await client.query("DELETE FROM patient WHERE patient_id = $1", [patientId]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      await client.end();
    }
  },
);
