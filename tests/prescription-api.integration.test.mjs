import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const prescriberPassword = process.env.DEMO_PRESCRIBER_PASSWORD;
const receptionistPassword = process.env.DEMO_RECEPTIONIST_PASSWORD;
const apiBase = process.env.NIDAAN_BASE_URL ?? "http://127.0.0.1:3000";

async function login(email, password) {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.equal(response.status, 200, `Seeded ${email.split("@")[0]} login should succeed`);
  assert.ok(cookie, "Login should return a session cookie");
  return cookie;
}

async function postPrescription(cookie, body) {
  const response = await fetch(`${apiBase}/api/prescriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test(
  "prescription API validates, authorizes, saves atomically, and replays idempotently",
  { skip: !databaseUrl || !prescriberPassword || !receptionistPassword },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    const appointmentIds = [];
    const consultationIds = [];
    const testUserIds = [];
    let connected = false;
    let patientId;
    let prescriptionIds = [];

    try {
      await client.connect();
      connected = true;
      const database = await client.query("SELECT current_database() AS name");
      assert.equal(
        database.rows[0]?.name,
        "nidaan_verify",
        "Refusing to write test fixtures outside the isolated nidaan_verify database",
      );

      const accounts = await client.query(`
        SELECT prescriber.user_id AS prescriber_user_id,
               doctor.doctor_id,
               receptionist.user_id AS receptionist_user_id
        FROM user_account AS prescriber
        JOIN doctor ON doctor.user_id = prescriber.user_id
        CROSS JOIN LATERAL (
          SELECT user_id
          FROM user_account
          WHERE email = 'receptionist@nidaan.local'
            AND role = 'receptionist'
            AND is_active = TRUE
        ) AS receptionist
        WHERE prescriber.email = 'prescriber@nidaan.local'
          AND prescriber.role = 'prescriber'
          AND prescriber.is_active = TRUE
        LIMIT 1
      `);
      assert.ok(accounts.rows[0], "Seeded active prescriber and receptionist must exist");

      const drugs = await client.query(`
        SELECT drug_a.drug_id AS drug_a_id,
               drug_b.drug_id AS drug_b_id
        FROM drug_interaction AS interaction
        JOIN drug AS drug_a ON drug_a.drug_id = interaction.drug_a_id
        JOIN drug AS drug_b ON drug_b.drug_id = interaction.drug_b_id
        WHERE drug_a.is_active = TRUE AND drug_b.is_active = TRUE
        ORDER BY drug_a.drug_id, drug_b.drug_id
        LIMIT 1
      `);
      assert.ok(drugs.rows[0], "At least one active interaction pair is needed for the alert test");
      const drugIds = [drugs.rows[0].drug_a_id, drugs.rows[0].drug_b_id];
      const missingDrug = await client.query(
        "SELECT COALESCE(MAX(drug_id), 0)::int + 10000 AS drug_id FROM drug",
      );
      const invalidDrugId = missingDrug.rows[0].drug_id;
      assert.ok(invalidDrugId <= 2_147_483_647);

      const otherDoctorUser = await client.query(
        `INSERT INTO user_account (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'prescriber', TRUE)
         RETURNING user_id`,
        [
          `prescription-test-${randomUUID()}@example.invalid`,
          "synthetic-test-only-password-hash",
          "Synthetic prescription ownership test doctor",
        ],
      );
      const otherDoctorUserId = otherDoctorUser.rows[0].user_id;
      testUserIds.push(otherDoctorUserId);
      const otherDoctor = await client.query(
        `INSERT INTO doctor (user_id, registration_no, specialisation, consultation_fee)
         VALUES ($1, $2, $3, 0)
         RETURNING doctor_id`,
        [
          otherDoctorUserId,
          `SYN-PRESC-${randomUUID()}`,
          "Synthetic test specialty",
        ],
      );
      const otherDoctorId = otherDoctor.rows[0].doctor_id;

      const suffix = randomUUID();
      const patient = await client.query(
        `INSERT INTO patient (full_name, date_of_birth, sex, phone, email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING patient_id`,
        [
          `Synthetic prescription API test ${suffix.slice(0, 8)}`,
          "1990-01-01",
          "unspecified",
          "0000000000",
          `prescription-test-${suffix}@example.invalid`,
        ],
      );
      patientId = patient.rows[0].patient_id;

      const receptionistId = accounts.rows[0].receptionist_user_id;
      const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const createConsultation = async (doctorId, offsetMinutes) => {
        const slotStart = new Date(start.getTime() + offsetMinutes * 60 * 1000);
        const appointment = await client.query(
          `INSERT INTO appointment (
             patient_id, doctor_id, created_by, slot_start, slot_end, mode, status
           ) VALUES ($1, $2, $3, $4, $5, 'in_person', 'completed')
           RETURNING appointment_id`,
          [
            patientId,
            doctorId,
            receptionistId,
            slotStart.toISOString(),
            new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(),
          ],
        );
        const appointmentId = appointment.rows[0].appointment_id;
        appointmentIds.push(appointmentId);
        const consultation = await client.query(
          `INSERT INTO consultation (appointment_id, chief_complaint)
           VALUES ($1, $2)
           RETURNING consultation_id`,
          [appointmentId, "Synthetic test-only consultation; no real patient data."],
        );
        consultationIds.push(consultation.rows[0].consultation_id);
        return consultation.rows[0].consultation_id;
      };

      const targetConsultationId = await createConsultation(
        accounts.rows[0].doctor_id,
        0,
      );
      const otherConsultationId = await createConsultation(
        otherDoctorId,
        60,
      );
      const prescriberCookie = await login(
        "prescriber@nidaan.local",
        prescriberPassword,
      );
      const receptionistCookie = await login(
        "receptionist@nidaan.local",
        receptionistPassword,
      );
      const requestItems = drugIds.map((drugId, index) => ({
        drug_id: drugId,
        dose: `Synthetic test dose ${index + 1}`,
        frequency: "once daily",
        duration_days: 5,
        quantity: 5,
      }));

      const missingFields = await postPrescription(prescriberCookie, {
        action: "review",
        consultation_id: targetConsultationId,
        items: [{ ...requestItems[0], dose: " " }],
      });
      assert.equal(missingFields.response.status, 400);

      const invalidDrug = await postPrescription(prescriberCookie, {
        action: "review",
        consultation_id: targetConsultationId,
        items: [{ ...requestItems[0], drug_id: invalidDrugId }],
      });
      assert.equal(invalidDrug.response.status, 400);
      const noInvalidPrescription = await client.query(
        "SELECT count(*)::int AS count FROM prescription WHERE consultation_id = $1",
        [targetConsultationId],
      );
      assert.equal(noInvalidPrescription.rows[0]?.count, 0);

      const unauthorized = await postPrescription(receptionistCookie, {
        action: "review",
        consultation_id: targetConsultationId,
        items: requestItems,
      });
      assert.equal(unauthorized.response.status, 403);

      const wrongOwner = await postPrescription(prescriberCookie, {
        action: "review",
        consultation_id: otherConsultationId,
        items: requestItems,
      });
      assert.equal(wrongOwner.response.status, 403);
      const noWrongOwnerPrescription = await client.query(
        "SELECT count(*)::int AS count FROM prescription WHERE consultation_id = $1",
        [otherConsultationId],
      );
      assert.equal(noWrongOwnerPrescription.rows[0]?.count, 0);

      const review = await postPrescription(prescriberCookie, {
        action: "review",
        consultation_id: targetConsultationId,
        notes: "Synthetic test-only prescription.",
        items: requestItems,
      });
      assert.equal(review.response.status, 200);
      assert.ok(review.body.interaction_review_token);
      assert.ok(review.body.interaction_alerts.length > 0);
      assert.match(review.body.warning, /not a guarantee/i);

      const saveRequest = {
        action: "save",
        consultation_id: targetConsultationId,
        notes: "Synthetic test-only prescription.",
        items: requestItems,
        interaction_review_token: review.body.interaction_review_token,
      };
      const saved = await postPrescription(prescriberCookie, saveRequest);
      assert.equal(saved.response.status, 201, JSON.stringify(saved.body));
      assert.equal(saved.body.prescription?.consultation_id, targetConsultationId);
      assert.equal(saved.body.items?.length, requestItems.length);
      assert.ok(saved.body.interaction_alerts.length > 0);
      assert.match(saved.body.warning, /not a guarantee/i);
      prescriptionIds.push(saved.body.prescription.prescription_id);

      const persisted = await client.query(
        `SELECT prescription.consultation_id,
                prescription_item.item_id,
                prescription_item.drug_id
         FROM prescription
         JOIN prescription_item USING (prescription_id)
         WHERE prescription.prescription_id = $1
         ORDER BY prescription_item.item_id`,
        [saved.body.prescription.prescription_id],
      );
      assert.equal(persisted.rows.length, requestItems.length);
      assert.ok(persisted.rows.every((row) => row.consultation_id === targetConsultationId));
      assert.deepEqual(
        persisted.rows.map((row) => row.drug_id),
        drugIds,
      );
      const persistedAlertCount = await client.query(
        `SELECT count(*)::int AS count
         FROM interaction_alert
         WHERE item_id = ANY($1::int[])
            OR conflicting_item_id = ANY($1::int[])`,
        [persisted.rows.map((row) => row.item_id)],
      );
      assert.equal(
        persistedAlertCount.rows[0]?.count,
        saved.body.interaction_alerts.length,
      );

      const replay = await postPrescription(prescriberCookie, saveRequest);
      assert.equal(replay.response.status, 200);
      assert.equal(replay.body.replayed, true);
      assert.equal(
        replay.body.prescription?.prescription_id,
        saved.body.prescription.prescription_id,
      );
      assert.equal(replay.body.items?.length, requestItems.length);
      const prescriptionCount = await client.query(
        "SELECT count(*)::int AS count FROM prescription WHERE consultation_id = $1",
        [targetConsultationId],
      );
      assert.equal(prescriptionCount.rows[0]?.count, 1);
      const receiptHash = createHash("sha256")
        .update(review.body.interaction_review_token)
        .digest("hex");
      const receiptCount = await client.query(
        `SELECT count(*)::int AS count
         FROM audit_log
         WHERE actor_user_id = $1
           AND action = 'prescription_idempotency_receipt'
           AND details ->> 'review_token_sha256' = $2`,
        [accounts.rows[0].prescriber_user_id, receiptHash],
      );
      assert.equal(receiptCount.rows[0]?.count, 1);

      const rollbackBaseline = await client.query(
        "SELECT count(*)::int AS count FROM prescription WHERE consultation_id = $1",
        [targetConsultationId],
      );
      const rollbackItems = [
        {
          ...requestItems[0],
          dose: "Synthetic rollback trigger overflow first item",
          duration_days: 2_147_483_647,
        },
        {
          ...requestItems[0],
          dose: "Synthetic rollback trigger failure second item",
          duration_days: 1,
        },
      ];
      const rollbackReview = await postPrescription(prescriberCookie, {
        action: "review",
        consultation_id: targetConsultationId,
        items: rollbackItems,
      });
      assert.equal(rollbackReview.response.status, 200);
      const failedSave = await postPrescription(prescriberCookie, {
        action: "save",
        consultation_id: targetConsultationId,
        items: rollbackItems,
        interaction_review_token: rollbackReview.body.interaction_review_token,
      });
      assert.equal(failedSave.response.status, 500);
      const rollbackReceiptHash = createHash("sha256")
        .update(rollbackReview.body.interaction_review_token)
        .digest("hex");
      const rollbackReceipts = await client.query(
        `SELECT count(*)::int AS count
         FROM audit_log
         WHERE actor_user_id = $1
           AND action = 'prescription_idempotency_receipt'
           AND details ->> 'review_token_sha256' = $2`,
        [accounts.rows[0].prescriber_user_id, rollbackReceiptHash],
      );
      assert.equal(rollbackReceipts.rows[0]?.count, 0);
      const rollbackAfter = await client.query(
        `SELECT count(*)::int AS prescriptions,
                (SELECT count(*)::int
                 FROM prescription_item AS item
                 JOIN prescription AS p USING (prescription_id)
                 WHERE p.consultation_id = $1) AS items
         FROM prescription
         WHERE consultation_id = $1`,
        [targetConsultationId],
      );
      assert.equal(rollbackAfter.rows[0]?.prescriptions, rollbackBaseline.rows[0]?.count);
      assert.equal(rollbackAfter.rows[0]?.items, requestItems.length);
    } finally {
      if (connected && (patientId || appointmentIds.length || testUserIds.length)) {
        await client.query("BEGIN");
        try {
          const existingPrescriptions = consultationIds.length
            ? await client.query(
                "SELECT prescription_id FROM prescription WHERE consultation_id = ANY($1::int[])",
                [consultationIds],
              )
            : { rows: [] };
          prescriptionIds = [
            ...new Set([
              ...prescriptionIds,
              ...existingPrescriptions.rows.map((row) => row.prescription_id),
            ]),
          ];
          const itemRows = prescriptionIds.length
            ? await client.query(
                "SELECT item_id FROM prescription_item WHERE prescription_id = ANY($1::int[])",
                [prescriptionIds],
              )
            : { rows: [] };
          const itemIds = itemRows.rows.map((row) => row.item_id);
          await client.query(
            `DELETE FROM audit_log
             WHERE (entity_type = 'appointment' AND entity_id = ANY($1::int[]))
                OR (entity_type = 'consultation' AND entity_id = ANY($2::int[]))
                OR (entity_type = 'prescription' AND entity_id = ANY($3::int[]))`,
            [appointmentIds, consultationIds, prescriptionIds],
          );
          if (itemIds.length) {
            await client.query(
              `DELETE FROM interaction_alert
               WHERE item_id = ANY($1::int[]) OR conflicting_item_id = ANY($1::int[])`,
              [itemIds],
            );
            await client.query(
              "DELETE FROM prescription_item WHERE item_id = ANY($1::int[])",
              [itemIds],
            );
          }
          if (prescriptionIds.length) {
            await client.query(
              "DELETE FROM prescription WHERE prescription_id = ANY($1::int[])",
              [prescriptionIds],
            );
          }
          if (consultationIds.length) {
            await client.query(
              "DELETE FROM consultation WHERE consultation_id = ANY($1::int[])",
              [consultationIds],
            );
          }
          if (appointmentIds.length) {
            await client.query(
              "DELETE FROM appointment WHERE appointment_id = ANY($1::int[])",
              [appointmentIds],
            );
          }
          if (patientId) {
            await client.query("DELETE FROM patient_allergy WHERE patient_id = $1", [patientId]);
            await client.query("DELETE FROM patient WHERE patient_id = $1", [patientId]);
          }
          for (const userId of testUserIds) {
            await client.query("DELETE FROM doctor WHERE user_id = $1", [userId]);
            await client.query("DELETE FROM user_account WHERE user_id = $1", [userId]);
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      if (connected) await client.end();
    }
  },
);
