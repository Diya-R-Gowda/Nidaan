import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const prescriberPassword = process.env.DEMO_PRESCRIBER_PASSWORD;
const apiBase = process.env.NIDAAN_BASE_URL ?? "http://127.0.0.1:3000";

test(
  "prescriber upcoming dashboard and consultation-to-prescription workflow stay scoped",
  { skip: !databaseUrl || !prescriberPassword },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    let patientId;
    let appointmentId;
    let foreignAppointmentId;
    let foreignConsultationId;
    let otherDoctorUserId;
    let otherDoctorId;
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

      const otherDoctorUser = await client.query(
        `INSERT INTO user_account (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'prescriber', TRUE)
         RETURNING user_id`,
        [
          `consultation-page-owner-${randomUUID()}@example.invalid`,
          "synthetic-test-only-password-hash",
          "Synthetic other prescriber for ownership testing",
        ],
      );
      otherDoctorUserId = otherDoctorUser.rows[0].user_id;
      const otherDoctor = await client.query(
        `INSERT INTO doctor (user_id, registration_no, specialisation, consultation_fee)
         VALUES ($1, $2, $3, 0)
         RETURNING doctor_id`,
        [otherDoctorUserId, `SYN-CONSULT-${randomUUID()}`, "Synthetic test specialty"],
      );
      otherDoctorId = otherDoctor.rows[0].doctor_id;

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

      const nextDayStart = await client.query(
        `SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                  + INTERVAL '1 day' + INTERVAL '11 hours')
                  AT TIME ZONE 'Asia/Kolkata' AS slot_start`,
      );
      const start = new Date(nextDayStart.rows[0].slot_start);
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

      const foreignAppointment = await client.query(
        `INSERT INTO appointment (
           patient_id, doctor_id, created_by, slot_start, slot_end, mode, status
         ) VALUES ($1, $2, $3, $4, $5, 'in_person', 'booked')
         RETURNING appointment_id`,
        [
          patientId,
          otherDoctorId,
          accounts.rows[0].receptionist_user_id,
          new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
          new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
        ],
      );
      foreignAppointmentId = foreignAppointment.rows[0].appointment_id;
      const foreignConsultation = await client.query(
        `INSERT INTO consultation (appointment_id, chief_complaint)
         VALUES ($1, 'Synthetic foreign consultation for selector ownership test.')
         RETURNING consultation_id`,
        [foreignAppointmentId],
      );
      foreignConsultationId = foreignConsultation.rows[0].consultation_id;

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

      const unauthenticatedPage = await fetch(
        `${apiBase}/doctor/consult/${appointmentId}`,
        { redirect: "manual" },
      );
      assert.ok([307, 308].includes(unauthenticatedPage.status));
      assert.match(unauthenticatedPage.headers.get("location") ?? "", /\/login/);

      const ownConsultationPage = await fetch(
        `${apiBase}/doctor/consult/${appointmentId}`,
        { headers: { Cookie: sessionCookie } },
      );
      assert.equal(ownConsultationPage.status, 200);
      const ownConsultationHtml = (await ownConsultationPage.text()).replace(/<!-- -->/g, "");
      assert.ok(ownConsultationHtml.includes(`Appointment #${appointmentId}`));

      const otherDoctorPage = await fetch(
        `${apiBase}/doctor/consult/${foreignAppointmentId}`,
        { headers: { Cookie: sessionCookie }, redirect: "manual" },
      );
      assert.equal(otherDoctorPage.status, 404);

      const dashboardResponse = await fetch(`${apiBase}/doctor`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(dashboardResponse.status, 200);
      const dashboardHtml = await dashboardResponse.text();
      assert.match(dashboardHtml, new RegExp(`href="/doctor/consult/${appointmentId}"`));
      assert.match(dashboardHtml, /Start consultation/);
      assert.doesNotMatch(
        dashboardHtml,
        new RegExp(`href="/doctor/consult/${foreignAppointmentId}"`),
      );
      const formattedTomorrow = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(start);
      assert.ok(dashboardHtml.includes(formattedTomorrow), "Dashboard should show tomorrow in IST");

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

      const builderResponse = await fetch(
        `${apiBase}/doctor/prescriptions?consultationId=${consultationId}`,
        { headers: { Cookie: sessionCookie } },
      );
      assert.equal(builderResponse.status, 200);
      const builderHtml = (await builderResponse.text()).replace(/<!-- -->/g, "");
      assert.ok(
        builderHtml.includes(`Consultation #${consultationId}`) &&
          builderHtml.includes(`Appointment #${appointmentId}`),
        "Builder option should show both the consultation and appointment IDs",
      );
      assert.match(
        builderHtml,
        new RegExp(`<option[^>]*value="${consultationId}"[^>]*selected`),
        "Builder should preselect the consultation from consultationId query parameter",
      );
      assert.doesNotMatch(
        builderHtml,
        new RegExp(`<option[^>]*value="${foreignConsultationId}"`),
        "Builder should not list a consultation assigned to another prescriber",
      );

      const foreignSelectionResponse = await fetch(
        `${apiBase}/doctor/prescriptions?consultationId=${foreignConsultationId}`,
        { headers: { Cookie: sessionCookie } },
      );
      assert.equal(foreignSelectionResponse.status, 200);
      const foreignSelectionHtml = await foreignSelectionResponse.text();
      assert.doesNotMatch(
        foreignSelectionHtml,
        new RegExp(`<option[^>]*value="${foreignConsultationId}"`),
      );

      const existingConsultationPage = await fetch(
        `${apiBase}/doctor/consult/${appointmentId}`,
        { headers: { Cookie: sessionCookie } },
      );
      assert.equal(existingConsultationPage.status, 200);
      const existingConsultationHtml = await existingConsultationPage.text();
      assert.match(existingConsultationHtml, /Consultation already recorded/);
      assert.ok(existingConsultationHtml.includes(`consultationId=${consultationId}`));

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
                OR (entity_type = 'appointment' AND entity_id = $2)
                OR (entity_type = 'consultation' AND entity_id = $3)
                OR (entity_type = 'consultation' AND entity_id = $4)`,
            [appointmentId, foreignAppointmentId, consultationId ?? null, foreignConsultationId ?? null],
          );
          await client.query(
            "DELETE FROM consultation WHERE appointment_id = ANY($1::int[])",
            [[appointmentId, foreignAppointmentId].filter(Boolean)],
          );
          await client.query(
            "DELETE FROM appointment WHERE appointment_id = ANY($1::int[])",
            [[appointmentId, foreignAppointmentId].filter(Boolean)],
          );
          await client.query("DELETE FROM patient WHERE patient_id = $1", [patientId]);
          if (otherDoctorId) {
            await client.query("DELETE FROM doctor WHERE doctor_id = $1", [otherDoctorId]);
          }
          if (otherDoctorUserId) {
            await client.query("DELETE FROM user_account WHERE user_id = $1", [otherDoctorUserId]);
          }
          await client.query("COMMIT");
          const leftovers = await client.query(
            `SELECT
               (SELECT count(*)::int FROM patient WHERE patient_id = $1) AS patients,
               (SELECT count(*)::int FROM appointment WHERE appointment_id = ANY($2::int[])) AS appointments,
               (SELECT count(*)::int FROM consultation WHERE consultation_id = ANY($3::int[])) AS consultations,
               (SELECT count(*)::int FROM doctor WHERE doctor_id = $4) AS doctors,
               (SELECT count(*)::int FROM user_account WHERE user_id = $5) AS users`,
            [patientId, [appointmentId, foreignAppointmentId].filter(Boolean), [consultationId, foreignConsultationId].filter(Boolean), otherDoctorId, otherDoctorUserId],
          );
          assert.deepEqual(leftovers.rows[0], {
            patients: 0,
            appointments: 0,
            consultations: 0,
            doctors: 0,
            users: 0,
          });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      await client.end();
    }
  },
);
