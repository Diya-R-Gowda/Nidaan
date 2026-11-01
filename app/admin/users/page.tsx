import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type UserRow = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: Date | string;
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "22px clamp(18px, 4vw, 28px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.04)",
};

const fieldStyle = {
  width: "100%",
  minHeight: 42,
  boxSizing: "border-box" as const,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 11px",
  font: "inherit",
};

const notices: Record<string, { text: string; kind: "success" | "error" }> = {
  created: { text: "User account created.", kind: "success" },
  activated: { text: "User account activated.", kind: "success" },
  deactivated: { text: "User account deactivated.", kind: "success" },
  duplicate: { text: "The email or doctor registration number is already in use.", kind: "error" },
  invalid: { text: "Check the submitted fields. Prescriber accounts also need a complete doctor profile.", kind: "error" },
  missing: { text: "The selected user no longer exists.", kind: "error" },
  failed: { text: "The user change could not be saved. Please try again.", kind: "error" },
};

function formatCreatedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  let users: UserRow[] = [];
  let loadError = "";
  try {
    const result = await pool.query<UserRow>(
      `SELECT user_id, full_name, email, role, is_active, created_at
       FROM user_account
       ORDER BY created_at DESC, user_id DESC`,
    );
    users = result.rows;
  } catch {
    loadError = "User accounts could not be loaded. Please try again later.";
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto" }}>
        <a href="/admin" style={{ display: "inline-block", marginBottom: 20, color: "#3157a4" }}>
          ← Back to administration
        </a>
        <header style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Administration</p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>User management</h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>Create staff accounts and manage activation. Passwords are never listed or returned.</p>
        </header>

        {notice && (
          <p role={notice.kind === "error" ? "alert" : "status"} style={{ ...cardStyle, marginBottom: 18, color: notice.kind === "error" ? "#a32020" : "#067647" }}>
            {notice.text}
          </p>
        )}

        <section aria-labelledby="create-user-title" style={{ ...cardStyle, marginBottom: 22 }}>
          <h2 id="create-user-title" style={{ margin: "0 0 18px", fontSize: 20 }}>Create account</h2>
          <form action="/api/admin/users" method="post">
            <input type="hidden" name="intent" value="create" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>Full name<input name="full_name" autoComplete="name" maxLength={120} required style={fieldStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}>Email<input name="email" type="email" autoComplete="email" maxLength={255} required style={fieldStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}>Password<input name="password" type="password" autoComplete="new-password" required style={fieldStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}>Role<select name="role" defaultValue="receptionist" required style={fieldStyle}>
                <option value="receptionist">Receptionist</option>
                <option value="prescriber">Prescriber</option>
                <option value="pharmacovigilance">Pharmacovigilance</option>
                <option value="admin">Admin</option>
              </select></label>
              <label style={{ display: "grid", gap: 6 }}>Doctor registration number <span style={{ color: "#596579", fontSize: 13 }}>Required for prescriber accounts</span><input name="registration_no" maxLength={60} style={fieldStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}>Specialisation <span style={{ color: "#596579", fontSize: 13 }}>Required for prescriber accounts</span><input name="specialisation" maxLength={120} style={fieldStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}>Consultation fee (INR) <span style={{ color: "#596579", fontSize: 13 }}>Required for prescriber accounts</span><input name="consultation_fee" type="number" min="0" max="99999999.99" step="0.01" style={fieldStyle} /></label>
            </div>
            <p style={{ color: "#596579", fontSize: 13, lineHeight: 1.5 }}>Prescriber accounts require a linked doctor profile. These fields match the required columns in the database schema.</p>
            <button type="submit" style={{ minHeight: 42, border: 0, borderRadius: 9, background: "#3157a4", color: "#fff", padding: "10px 16px", font: "inherit", fontWeight: 700, cursor: "pointer" }}>Create user</button>
          </form>
        </section>

        <section aria-labelledby="user-list-title" style={cardStyle}>
          <h2 id="user-list-title" style={{ margin: "0 0 16px", fontSize: 20 }}>Accounts</h2>
          {loadError ? <p role="alert" style={{ color: "#a32020" }}>{loadError}</p> : users.length === 0 ? <p role="status">No user accounts found.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
                <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>Staff accounts and activation status. Password hashes are not included.</caption>
                <thead><tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>{["User", "Role", "Created", "Status", "Action"].map((heading) => <th key={heading} scope="col" style={{ borderBottom: "1px solid #e2e8f0", padding: "11px 12px" }}>{heading}</th>)}</tr></thead>
                <tbody>{users.map((user) => (
                  <tr key={user.user_id}>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px" }}><strong>{user.full_name}</strong><br /><span>{user.email}</span></td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px" }}>{user.role}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px", whiteSpace: "nowrap" }}>{formatCreatedAt(user.created_at)} IST</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px" }}>{user.is_active ? "Active" : "Inactive"}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px" }}>
                      <form action="/api/admin/users" method="post">
                        <input type="hidden" name="intent" value="set_active" />
                        <input type="hidden" name="user_id" value={user.user_id} />
                        <input type="hidden" name="is_active" value={user.is_active ? "false" : "true"} />
                        <button type="submit" aria-label={`${user.is_active ? "Deactivate" : "Activate"} ${user.full_name}`} style={{ minHeight: 36, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#344054", padding: "7px 10px", font: "inherit", cursor: "pointer" }}>{user.is_active ? "Deactivate" : "Activate"}</button>
                      </form>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
