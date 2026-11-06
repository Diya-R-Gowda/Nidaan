import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const prescriberPassword = process.env.DEMO_PRESCRIBER_PASSWORD;
const pvPassword = process.env.DEMO_PHARMACOVIGILANCE_PASSWORD;
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

async function postReport(cookie, body) {
  const response = await fetch(`${apiBase}/api/ade-reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => null) };
}

test(
  "ADE linking, PV review/search, aggregate threshold, and refresh stay synthetic and isolated",
  { skip: !databaseUrl || !prescriberPassword || !pvPassword },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    let connected = false;
    let safeDatabase = false;
    let doctorId;
    let receptionistId;
    let pvUserId;
    let syntheticDrugId;
    const patientIds = [];
    const appointmentIds = [];
    const consultationIds = [];
    const prescriptionIds = [];
    const itemIds = [];
    const reportIds = [];
    const suffix = randomUUID();

    try {
      await client.connect();
      connected = true;
      const database = await client.query("SELECT current_database() AS name");
      assert.equal(
        database.rows[0]?.name,
        "nidaan_verify",
        "Refusing to write fixtures outside the isolated nidaan_verify database",
      );
      safeDatabase = true;

      const accountRows = await client.query(`
        SELECT doctor.doctor_id,
               receptionist.user_id AS receptionist_id,
               pv.user_id AS pv_user_id
        FROM user_account AS prescriber
        JOIN doctor ON doctor.user_id = prescriber.user_id
        CROSS JOIN LATERAL (
          SELECT user_id FROM user_account
          WHERE role = 'receptionist' AND is_active = TRUE
          ORDER BY user_id LIMIT 1
        ) AS receptionist
        CROSS JOIN LATERAL (
          SELECT user_id FROM user_account
          WHERE email = 'pharmacovigilance@nidaan.local'
            AND role = 'pharmacovigilance' AND is_active = TRUE
        ) AS pv
        WHERE prescriber.email = 'prescriber@nidaan.local'
          AND prescriber.role = 'prescriber' AND prescriber.is_active = TRUE
        LIMIT 1
      `);
      assert.ok(accountRows.rows[0], "Seeded prescriber, receptionist, and PV account are required");
      ({ doctor_id: doctorId, receptionist_id: receptionistId, pv_user_id: pvUserId } = accountRows.rows[0]);

      const drug = await client.query(
        `INSERT INTO drug (drug_name, generic_name, drug_class, form, strength, unit_price, is_active)
         VALUES ($1, $2, $3, $4, $5, 0, TRUE)
         RETURNING drug_id`,
        [
          `SYNTHETIC TEST ONLY ADE signal ${suffix}`,
          `Synthetic signal test ${suffix}`,
          "Synthetic test data",
          "Tablet",
          "1 mg",
        ],
      );
      syntheticDrugId = drug.rows[0].drug_id;

      const baseline = await client.query(
        `SELECT count(DISTINCT appointment.patient_id)::int AS exposed,
                count(DISTINCT report.report_id)::int AS reports
         FROM prescription_item AS item
         JOIN prescription ON prescription.prescription_id = item.prescription_id
         JOIN consultation ON consultation.consultation_id = prescription.consultation_id
         JOIN appointment ON appointment.appointment_id = consultation.appointment_id
         LEFT JOIN ade_report AS report ON report.item_id = item.item_id
         WHERE item.drug_id = $1`,
        [syntheticDrugId],
      );
      assert.equal(baseline.rows[0]?.exposed, 0);
      assert.equal(baseline.rows[0]?.reports, 0);

      const now = Date.now();
      for (let index = 0; index < 10; index += 1) {
        const patient = await client.query(
          `INSERT INTO patient (full_name, date_of_birth, sex, phone, email)
           VALUES ($1, '1990-01-01', 'unspecified', '0000000000', $2)
           RETURNING patient_id`,
          [
            `SYNTHETIC TEST ONLY ADE patient ${suffix.slice(0, 8)}-${index}`,
            `ade-signal-${suffix}-${index}@example.invalid`,
          ],
        );
        const patientId = patient.rows[0].patient_id;
        patientIds.push(patientId);

        const start = new Date(now - (20 - index) * 24 * 60 * 60 * 1000);
        const appointment = await client.query(
          `INSERT INTO appointment (
             patient_id, doctor_id, created_by, slot_start, slot_end, mode, status
           ) VALUES ($1, $2, $3, $4, $5, 'in_person', 'completed')
           RETURNING appointment_id`,
          [patientId, doctorId, receptionistId, start.toISOString(), new Date(start.getTime() + 30 * 60_000).toISOString()],
        );
        const appointmentId = appointment.rows[0].appointment_id;
        appointmentIds.push(appointmentId);

        const consultation = await client.query(
          `INSERT INTO consultation (appointment_id, chief_complaint)
           VALUES ($1, 'Synthetic signal integration test only')
           RETURNING consultation_id`,
          [appointmentId],
        );
        const consultationId = consultation.rows[0].consultation_id;
        consultationIds.push(consultationId);

        const prescription = await client.query(
          "INSERT INTO prescription (consultation_id, notes) VALUES ($1, 'SYNTHETIC TEST ONLY') RETURNING prescription_id",
          [consultationId],
        );
        const prescriptionId = prescription.rows[0].prescription_id;
        prescriptionIds.push(prescriptionId);

        const item = await client.query(
          `INSERT INTO prescription_item (prescription_id, drug_id, dose, frequency, duration_days, quantity)
           VALUES ($1, $2, '1 synthetic tablet', 'once daily', 7, 7)
           RETURNING item_id`,
          [prescriptionId, syntheticDrugId],
        );
        itemIds.push(item.rows[0].item_id);

        if (index === 8) {
          await client.query("REFRESH MATERIALIZED VIEW public.vw_drug_signal_rates");
          const belowThreshold = await client.query(
            "SELECT drug_id FROM public.vw_drug_signal_rates WHERE drug_id = $1",
            [syntheticDrugId],
          );
          assert.equal(belowThreshold.rows.length, 0, "Nine exposed synthetic patients are suppressed");
        }
      }

      const prescriberCookie = await login("prescriber@nidaan.local", prescriberPassword);
      const pvCookie = await login("pharmacovigilance@nidaan.local", pvPassword);

      const seedPair = await client.query(
        `SELECT gums.report_id AS gums_id, brushing.report_id AS brushing_id
         FROM ade_report AS gums
         CROSS JOIN ade_report AS brushing
         WHERE gums.narrative ILIKE '%bleeding gums%'
           AND brushing.narrative ILIKE '%blood while brushing teeth%'
         LIMIT 1`,
      );
      assert.ok(seedPair.rows[0], "README full-text example seed narratives should exist");
      const lexicalQuery = await client.query(
        `SELECT report_id FROM ade_report
         WHERE narrative_tsv @@ plainto_tsquery('english', $1)`,
        ["bleeding gums"],
      );
      assert.ok(lexicalQuery.rows.some((row) => row.report_id === seedPair.rows[0].gums_id));
      assert.equal(lexicalQuery.rows.some((row) => row.report_id === seedPair.rows[0].brushing_id), false);
      const fulltextExample = await fetch(
        `${apiBase}/api/ade-reports/${seedPair.rows[0].gums_id}/similar?mode=fulltext`,
        { headers: { Cookie: pvCookie } },
      );
      assert.equal(fulltextExample.status, 200);
      const fulltextExampleBody = await fulltextExample.json();
      assert.equal(
        fulltextExampleBody.neighbours.some((row) => row.report_id === seedPair.rows[0].brushing_id),
        false,
        "Full-text comparison should not match the differently worded seed report",
      );

      const anonymousPost = await postReport(null, {
        patientId: patientIds[0], itemId: itemIds[0], onsetDate: "2026-11-01",
        narrative: "SYNTHETIC TEST ONLY: patient reports a fictional mild rash after a test medicine.",
      });
      assert.equal(anonymousPost.response.status, 401);

      const nullBody = await postReport(prescriberCookie, null);
      assert.equal(nullBody.response.status, 400);

      const invalidId = await postReport(prescriberCookie, {
        patientId: 0, itemId: itemIds[0], onsetDate: "2026-11-01",
        narrative: "SYNTHETIC TEST ONLY: an invalid patient identifier is rejected.",
      });
      assert.equal(invalidId.response.status, 400);

      const shortNarrative = await postReport(prescriberCookie, {
        patientId: patientIds[0], itemId: itemIds[0], onsetDate: "2026-11-01", narrative: "too short",
      });
      assert.equal(shortNarrative.response.status, 400);

      const invalidDate = await postReport(prescriberCookie, {
        patientId: patientIds[0], itemId: itemIds[0], onsetDate: "2026-02-30",
        narrative: "SYNTHETIC TEST ONLY: invalid date must not create a report.",
      });
      assert.equal(invalidDate.response.status, 400);

      const unrelatedItem = await postReport(prescriberCookie, {
        patientId: patientIds[1], itemId: itemIds[0], onsetDate: "2026-11-01",
        narrative: "SYNTHETIC TEST ONLY: unrelated item must not be accepted.",
      });
      assert.equal(unrelatedItem.response.status, 404);

      const narratives = [
        "SYNTHETIC TEST ONLY: a fictional patient developed an itchy red rash after taking the test tablet.",
        "SYNTHETIC TEST ONLY: pruritic rash and skin redness followed the fictional test medicine.",
      ];
      for (let index = 0; index < narratives.length; index += 1) {
        const submitted = await postReport(prescriberCookie, {
          patientId: patientIds[index],
          itemId: itemIds[index],
          onsetDate: "2026-11-01",
          narrative: narratives[index],
        });
        assert.equal(submitted.response.status, 201, JSON.stringify(submitted.body));
        assert.ok(Number.isSafeInteger(submitted.body.reportId));
        reportIds.push(submitted.body.reportId);
        assert.equal(Number.isFinite(Number(submitted.body.severityScore)), true);
      }

      const unknownItem = await postReport(prescriberCookie, {
        patientId: patientIds[2],
        itemId: null,
        onsetDate: "2026-11-01",
        narrative: "SYNTHETIC TEST ONLY: suspected medicine is unknown and remains unlinked.",
      });
      assert.equal(unknownItem.response.status, 201, JSON.stringify(unknownItem.body));
      reportIds.push(unknownItem.body.reportId);

      const persisted = await client.query(
        `SELECT report_id, patient_id, item_id, narrative_vec IS NOT NULL AS has_embedding,
                vector_dims(narrative_vec) AS embedding_dimensions,
                narrative_tsv IS NOT NULL AS has_fulltext, severity_score
         FROM ade_report WHERE report_id = ANY($1::int[]) ORDER BY report_id`,
        [reportIds],
      );
      assert.equal(persisted.rows.length, 3);
      assert.ok(persisted.rows.every((row) => row.has_embedding && row.embedding_dimensions === 384 && row.has_fulltext));
      assert.deepEqual(persisted.rows.map((row) => row.item_id), [...itemIds.slice(0, 2), null]);
      assert.ok(persisted.rows.every((row) => Number.isFinite(Number(row.severity_score))));

      const noAuthInbox = await fetch(`${apiBase}/api/ade-reports`);
      assert.equal(noAuthInbox.status, 401);
      const prescriberInbox = await fetch(`${apiBase}/api/ade-reports`, { headers: { Cookie: prescriberCookie } });
      assert.equal(prescriberInbox.status, 403);

      const inboxResponse = await fetch(`${apiBase}/api/ade-reports?page=1`, { headers: { Cookie: pvCookie } });
      assert.equal(inboxResponse.status, 200);
      const inbox = await inboxResponse.json();
      const inboxReports = inbox.reports.filter((row) => reportIds.includes(row.report_id));
      assert.equal(inboxReports.length, 3);
      assert.ok(inboxReports.every((row) => !("patient_id" in row) && !("patient_name" in row) && !("narrative" in row)));

      const dashboardPage = await fetch(`${apiBase}/pharmacovigilance`, { headers: { Cookie: pvCookie } });
      assert.equal(dashboardPage.status, 200);
      const dashboardHtml = await dashboardPage.text();
      assert.match(dashboardHtml, /No eligible signal rates/);
      assert.match(dashboardHtml, /minimum of 10 distinct exposed patients/);

      const inboxPage = await fetch(`${apiBase}/pharmacovigilance/reports`, { headers: { Cookie: pvCookie } });
      assert.equal(inboxPage.status, 200);
      const inboxHtml = await inboxPage.text();
      assert.match(inboxHtml, /ADE report inbox/);
      assert.doesNotMatch(inboxHtml, /patient_id|patient_name/);

      for (const [index, mode] of ["fulltext", "vector"].entries()) {
        const similar = await fetch(
          `${apiBase}/api/ade-reports/${reportIds[index]}/similar?mode=${mode}`,
          { headers: { Cookie: pvCookie } },
        );
        assert.equal(similar.status, 200);
        const body = await similar.json();
        assert.ok(body.neighbours.length <= 10);
        assert.ok(body.neighbours.every((row) => row.report_id !== reportIds[index]));
        assert.equal(body.neighbours.some((row) => "patient_id" in row || "patient_name" in row), false);
        if (mode === "fulltext") {
          assert.ok(body.neighbours.every((row) => Number.isFinite(Number(row.fulltext_relevance))));
          assert.equal(body.neighbours.some((row) => row.report_id === reportIds[1 - index]), false);
        } else {
          assert.ok(body.neighbours.every((row) => Number.isFinite(Number(row.cosine_similarity))));
          assert.ok(body.neighbours.some((row) => row.report_id === reportIds[1 - index]));
        }
      }

      const pairSimilarity = await client.query(
        `SELECT (1 - (source.narrative_vec <=> related.narrative_vec))::real AS similarity
         FROM ade_report AS source CROSS JOIN ade_report AS related
         WHERE source.report_id = $1 AND related.report_id = $2`,
        [reportIds[0], reportIds[1]],
      );
      assert.ok(Number(pairSimilarity.rows[0]?.similarity) > 0.7, "Paraphrased synthetic narratives should be semantically close");

      const wrongReviewer = await fetch(`${apiBase}/api/ade-reports/${reportIds[0]}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Cookie: prescriberCookie },
        body: JSON.stringify({ status: "confirmed" }),
      });
      assert.equal(wrongReviewer.status, 403);

      const confirmed = await fetch(`${apiBase}/api/ade-reports/${reportIds[0]}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Cookie: pvCookie },
        body: JSON.stringify({ status: "confirmed" }),
      });
      assert.equal(confirmed.status, 200);
      const repeatedConfirmation = await fetch(`${apiBase}/api/ade-reports/${reportIds[0]}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Cookie: pvCookie },
        body: JSON.stringify({ status: "confirmed" }),
      });
      assert.equal(repeatedConfirmation.status, 200);

      await client.query("REFRESH MATERIALIZED VIEW public.vw_drug_signal_rates");
      const suppressed = await client.query(
        "SELECT drug_id FROM public.vw_drug_signal_rates WHERE drug_id = $1",
        [syntheticDrugId],
      );
      assert.equal(suppressed.rows.length, 1, "10 exposed synthetic patients meet the documented threshold");
      const signal = await client.query(
        `SELECT drug_id, patients_exposed, adverse_events, rate_per_100
         FROM public.vw_drug_signal_rates WHERE drug_id = $1`,
        [syntheticDrugId],
      );
      assert.equal(Number(signal.rows[0]?.patients_exposed), 10);
      assert.equal(Number(signal.rows[0]?.adverse_events), 2);
      assert.equal(Number(signal.rows[0]?.rate_per_100), 20);

      const actorAudit = await client.query(
        `SELECT count(*)::int AS count FROM audit_log
         WHERE actor_user_id = $1 AND entity_type = 'ade_report'
           AND entity_id = ANY($2::int[]) AND action = 'UPDATE'`,
        [pvUserId, [reportIds[0]]],
      );
      assert.ok(actorAudit.rows[0].count >= 1, "PV status change is attributed to the authenticated reviewer");
    } finally {
      if (connected && safeDatabase) {
        try {
        await client.query("BEGIN");
        try {
          const insertedReports = await client.query(
            `SELECT report_id FROM ade_report
             WHERE item_id = ANY($1::int[])
               AND narrative LIKE 'SYNTHETIC TEST ONLY:%'`,
            [itemIds],
          );
          reportIds.push(...insertedReports.rows.map((row) => row.report_id));
          const uniqueReportIds = [...new Set(reportIds)];
          reportIds.splice(0, reportIds.length, ...uniqueReportIds);
          await client.query(
            `DELETE FROM audit_log
             WHERE (entity_type = 'ade_report' AND entity_id = ANY($1::int[]))
                OR (entity_type = 'appointment' AND entity_id = ANY($2::int[]))
                OR (entity_type = 'consultation' AND entity_id = ANY($3::int[]))
                OR (entity_type = 'prescription' AND entity_id = ANY($4::int[]))
                OR (entity_type = 'drug' AND entity_id = $5)`,
            [reportIds, appointmentIds, consultationIds, prescriptionIds, syntheticDrugId],
          );
          if (reportIds.length) await client.query("DELETE FROM ade_report WHERE report_id = ANY($1::int[])", [reportIds]);
          if (itemIds.length) {
            await client.query(
              "DELETE FROM interaction_alert WHERE item_id = ANY($1::int[]) OR conflicting_item_id = ANY($1::int[])",
              [itemIds],
            );
            await client.query("DELETE FROM prescription_item WHERE item_id = ANY($1::int[])", [itemIds]);
          }
          if (prescriptionIds.length) await client.query("DELETE FROM prescription WHERE prescription_id = ANY($1::int[])", [prescriptionIds]);
          if (consultationIds.length) await client.query("DELETE FROM consultation WHERE consultation_id = ANY($1::int[])", [consultationIds]);
          if (appointmentIds.length) await client.query("DELETE FROM appointment WHERE appointment_id = ANY($1::int[])", [appointmentIds]);
          if (patientIds.length) await client.query("DELETE FROM patient WHERE patient_id = ANY($1::int[])", [patientIds]);
          if (syntheticDrugId) await client.query("DELETE FROM drug WHERE drug_id = $1", [syntheticDrugId]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
        await client.query("REFRESH MATERIALIZED VIEW public.vw_drug_signal_rates");
        if (syntheticDrugId) {
          const cleanupCheck = await client.query(
            "SELECT count(*)::int AS count FROM public.vw_drug_signal_rates WHERE drug_id = $1",
            [syntheticDrugId],
          );
          assert.equal(cleanupCheck.rows[0]?.count, 0, "Synthetic aggregate must be removed after fixture cleanup");
        }
        } finally {
          await client.end();
        }
      } else if (connected) {
        await client.end();
      }
    }
  },
);
