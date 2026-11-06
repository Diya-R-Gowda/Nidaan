import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const receptionistPassword = process.env.DEMO_RECEPTIONIST_PASSWORD;
const prescriberPassword = process.env.DEMO_PRESCRIBER_PASSWORD;
const apiBase = process.env.NIDAAN_BASE_URL ?? "http://127.0.0.1:3000";

async function login(email, password) {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.equal(response.status, 200, "Seeded role login should succeed");
  assert.ok(cookie);
  return cookie;
}

async function postJson(path, cookie, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => null) };
}

test(
  "receptionist registration and appointment management are validated and authorized",
  { skip: !databaseUrl || !receptionistPassword || !prescriberPassword },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    let connected = false;
    const patientIds = [];
    const appointmentIds = [];
    let receptionistId;
    try {
      await client.connect();
      connected = true;
      const database = await client.query("SELECT current_database() AS name");
      assert.equal(database.rows[0]?.name, "nidaan_verify", "Refusing fixture writes outside nidaan_verify");

      const receptionistCookie = await login("receptionist@nidaan.local", receptionistPassword);
      const prescriberCookie = await login("prescriber@nidaan.local", prescriberPassword);
      const accounts = await client.query(`
        SELECT receptionist.user_id AS receptionist_id,
               doctor.doctor_id,
               prescriber.user_id AS prescriber_id
        FROM user_account AS receptionist
        CROSS JOIN LATERAL (
          SELECT doctor.doctor_id, account.user_id
          FROM doctor
          JOIN user_account AS account ON account.user_id = doctor.user_id
          WHERE account.role = 'prescriber' AND account.is_active = TRUE
          ORDER BY doctor.doctor_id LIMIT 1
        ) AS doctor
        JOIN user_account AS prescriber ON prescriber.user_id = doctor.user_id
        WHERE receptionist.email = 'receptionist@nidaan.local'
          AND receptionist.role = 'receptionist' AND receptionist.is_active = TRUE
      `);
      assert.ok(accounts.rows[0], "Seeded receptionist and prescriber profiles are required");
      receptionistId = accounts.rows[0].receptionist_id;

      const anonymousRegistration = await postJson("/api/patients", null, {});
      assert.equal(anonymousRegistration.response.status, 401);
      const invalidRegistration = await postJson("/api/patients", receptionistCookie, {
        full_name: "", date_of_birth: "2026-02-31", sex: "", phone: "",
      });
      assert.equal(invalidRegistration.response.status, 400);
      const futureDob = await postJson("/api/patients", receptionistCookie, {
        full_name: "Synthetic invalid date test", date_of_birth: "2999-01-01",
        sex: "unspecified", phone: "0000000000",
      });
      assert.equal(futureDob.response.status, 400);

      const suffixA = randomUUID();
      const registerA = {
        full_name: `Synthetic reception test ${suffixA.slice(0, 8)}`,
        date_of_birth: "1991-04-05", sex: "unspecified", phone: "0000000000",
        email: `reception-test-${suffixA}@example.invalid`, blood_group: null,
      };
      const createdA = await postJson("/api/patients", receptionistCookie, registerA);
      assert.equal(createdA.response.status, 201, JSON.stringify(createdA.body));
      const patientA = createdA.body.patient;
      assert.ok(Number.isSafeInteger(patientA.patient_id));
      assert.deepEqual(Object.keys(patientA).sort(), ["full_name", "patient_id"]);
      patientIds.push(patientA.patient_id);
      const patientAudit = await client.query(
        `SELECT count(*)::int AS count FROM audit_log
         WHERE actor_user_id = $1 AND entity_type = 'patient'
           AND entity_id = $2 AND action = 'INSERT'`,
        [receptionistId, patientA.patient_id],
      );
      assert.equal(patientAudit.rows[0].count, 1);

      const duplicateA = await postJson("/api/patients", receptionistCookie, registerA);
      assert.equal(duplicateA.response.status, 409);
      const concurrentEmail = `reception-race-${randomUUID()}@example.invalid`;
      const concurrentPatientBody = { ...registerA, email: concurrentEmail };
      const concurrentRegistrations = await Promise.all([
        postJson("/api/patients", receptionistCookie, concurrentPatientBody),
        postJson("/api/patients", receptionistCookie, concurrentPatientBody),
      ]);
      assert.deepEqual(concurrentRegistrations.map((item) => item.response.status).sort(), [201, 409]);
      const concurrentPatient = concurrentRegistrations.find((item) => item.response.status === 201);
      assert.ok(concurrentPatient?.body.patient?.patient_id);
      patientIds.push(concurrentPatient.body.patient.patient_id);
      const suffixB = randomUUID();
      const createdB = await postJson("/api/patients", receptionistCookie, {
        ...registerA,
        full_name: `Synthetic reception test ${suffixB.slice(0, 8)}`,
        email: `reception-test-${suffixB}@example.invalid`,
      });
      assert.equal(createdB.response.status, 201, JSON.stringify(createdB.body));
      const patientB = createdB.body.patient;
      patientIds.push(patientB.patient_id);

      const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
      future.setUTCMinutes(0, 0, 0);
      const slotAStart = new Date(future.getTime() + 5 * 60 * 60 * 1000).toISOString();
      const slotAEnd = new Date(Date.parse(slotAStart) + 30 * 60 * 1000).toISOString();
      const slotBStart = new Date(Date.parse(slotAStart) + 3 * 60 * 60 * 1000).toISOString();
      const slotBEnd = new Date(Date.parse(slotBStart) + 30 * 60 * 1000).toISOString();
      const doctorId = accounts.rows[0].doctor_id;
      const book = async (patientId, start, end) => postJson("/api/appointments", receptionistCookie, {
        patient_id: patientId, doctor_id: doctorId, slot_start: start, slot_end: end,
        mode: "in_person", meeting_link: null,
      });
      const first = await book(patientA.patient_id, slotAStart, slotAEnd);
      assert.equal(first.response.status, 201, JSON.stringify(first.body));
      appointmentIds.push(first.body.appointment.appointment_id);
      const second = await book(patientB.patient_id, slotBStart, slotBEnd);
      assert.equal(second.response.status, 201, JSON.stringify(second.body));
      appointmentIds.push(second.body.appointment.appointment_id);
      const bookingConflict = await book(patientB.patient_id, slotAStart, slotAEnd);
      assert.equal(bookingConflict.response.status, 409);

      const slotCStart = new Date(Date.parse(slotBStart) + 3 * 60 * 60 * 1000).toISOString();
      const slotCEnd = new Date(Date.parse(slotCStart) + 30 * 60 * 1000).toISOString();
      const concurrentBookings = await Promise.all([
        book(patientA.patient_id, slotCStart, slotCEnd),
        book(patientB.patient_id, slotCStart, slotCEnd),
      ]);
      assert.deepEqual(concurrentBookings.map((item) => item.response.status).sort(), [201, 409]);
      const concurrentWinner = concurrentBookings.find((item) => item.response.status === 201);
      assert.ok(concurrentWinner?.body.appointment?.appointment_id);
      appointmentIds.push(concurrentWinner.body.appointment.appointment_id);

      const unauthList = await fetch(`${apiBase}/api/appointments?from=2027-12-01&to=2027-12-02`);
      assert.equal(unauthList.status, 401);
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date(slotAStart)).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
      const date = `${localDate.year}-${localDate.month}-${localDate.day}`;
      const listed = await fetch(`${apiBase}/api/appointments?from=${date}&to=${date}&limit=1`, {
        headers: { Cookie: receptionistCookie },
      });
      assert.equal(listed.status, 200);
      const listing = await listed.json();
      assert.ok(listing.appointments.some((item) => item.appointment_id === appointmentIds[0]));
      assert.equal(listing.appointments.length, 1);
      assert.equal(listing.pagination.has_more, true);
      assert.equal(listing.appointments[0].patient_name.startsWith("Synthetic reception test "), true);
      assert.equal("phone" in listing.appointments[0], false);

      const prescriberListing = await fetch(`${apiBase}/api/appointments?from=${date}&to=${date}&limit=200`, {
        headers: { Cookie: prescriberCookie },
      });
      assert.equal(prescriberListing.status, 200);
      const prescriberRows = await prescriberListing.json();
      assert.ok(prescriberRows.appointments.every((item) => item.doctor_id === doctorId));

      const invalidList = await fetch(`${apiBase}/api/appointments?from=2027-02-30&to=2027-03-01`, {
        headers: { Cookie: receptionistCookie },
      });
      assert.equal(invalidList.status, 400);
      const wrongRoleReschedule = await postJson(`/api/appointments/${appointmentIds[0]}/reschedule`, prescriberCookie, {
        slot_start: slotBStart, slot_end: slotBEnd,
      });
      assert.equal(wrongRoleReschedule.response.status, 403);
      const unauthenticatedCancel = await postJson(`/api/appointments/${appointmentIds[0]}/cancel`, null, {});
      assert.equal(unauthenticatedCancel.response.status, 401);
      const invalidReschedule = await postJson(`/api/appointments/${appointmentIds[0]}/reschedule`, receptionistCookie, {
        slot_start: "invalid", slot_end: slotBEnd,
      });
      assert.equal(invalidReschedule.response.status, 400);
      const impossibleDate = await postJson(`/api/appointments/${appointmentIds[0]}/reschedule`, receptionistCookie, {
        slot_start: "2026-02-31T10:00:00Z", slot_end: "2026-02-31T10:30:00Z",
      });
      assert.equal(impossibleDate.response.status, 400);
      const conflict = await postJson(`/api/appointments/${appointmentIds[0]}/reschedule`, receptionistCookie, {
        slot_start: slotBStart, slot_end: slotBEnd,
      });
      assert.equal(conflict.response.status, 409);

      const freeStart = new Date(Date.parse(slotCEnd) + 2 * 60 * 60 * 1000).toISOString();
      const freeEnd = new Date(Date.parse(freeStart) + 30 * 60 * 1000).toISOString();
      const rescheduled = await postJson(`/api/appointments/${appointmentIds[0]}/reschedule`, receptionistCookie, {
        slot_start: freeStart, slot_end: freeEnd,
      });
      assert.equal(rescheduled.response.status, 200, JSON.stringify(rescheduled.body));
      assert.equal(new Date(rescheduled.body.appointment.slot_start).toISOString(), freeStart);

      const cancelled = await postJson(`/api/appointments/${appointmentIds[0]}/cancel`, receptionistCookie, {});
      assert.equal(cancelled.response.status, 200);
      assert.equal(cancelled.body.appointment.status, "cancelled");
      const duplicateCancel = await postJson(`/api/appointments/${appointmentIds[0]}/cancel`, receptionistCookie, {});
      assert.equal(duplicateCancel.response.status, 200);
      assert.equal(duplicateCancel.body.already_cancelled, true);
      const cancelledConsultation = await postJson("/api/consultations", prescriberCookie, {
        appointment_id: appointmentIds[0], chief_complaint: "Synthetic cancelled appointment test.",
      });
      assert.equal(cancelledConsultation.response.status, 409);

      const audit = await client.query(
        `SELECT count(*)::int AS count FROM audit_log
         WHERE actor_user_id = $1 AND entity_type = 'appointment'
           AND entity_id = ANY($2::int[])
           AND action IN ('INSERT', 'UPDATE', 'RESCHEDULE', 'CANCEL')`,
        [receptionistId, appointmentIds],
      );
      assert.ok(audit.rows[0].count >= 6, "Create/reschedule/cancel actor and history entries should be recorded");
    } finally {
      if (connected && (patientIds.length || appointmentIds.length)) {
        await client.query("BEGIN");
        try {
          const database = await client.query("SELECT current_database() AS name");
          assert.equal(database.rows[0]?.name, "nidaan_verify", "Refusing cleanup outside nidaan_verify");
          if (appointmentIds.length) {
            await client.query("DELETE FROM audit_log WHERE entity_type = 'appointment' AND entity_id = ANY($1::int[])", [appointmentIds]);
            await client.query("DELETE FROM reminder_queue WHERE appointment_id = ANY($1::int[])", [appointmentIds]);
            await client.query("DELETE FROM appointment WHERE appointment_id = ANY($1::int[])", [appointmentIds]);
          }
          if (patientIds.length) {
            await client.query("DELETE FROM audit_log WHERE entity_type = 'patient' AND entity_id = ANY($1::int[])", [patientIds]);
            await client.query("DELETE FROM patient WHERE patient_id = ANY($1::int[])", [patientIds]);
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      if (connected) {
        const leftovers = await client.query(
          `SELECT (SELECT count(*)::int FROM patient WHERE email LIKE 'reception-test-%@example.invalid') AS patients,
                  (SELECT count(*)::int FROM appointment WHERE appointment_id = ANY($1::int[])) AS appointments`,
          [appointmentIds],
        );
        assert.equal(leftovers.rows[0].patients, 0);
        assert.equal(leftovers.rows[0].appointments, 0);
        await client.end();
      }
    }
  },
);
