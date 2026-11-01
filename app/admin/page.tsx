import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type CountRow = {
  count: string;
};

export default async function AdminPage() {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/");
  }

  const [{ rows: userRows }, { rows: drugRows }, { rows: auditRows }] =
    await Promise.all([
      pool.query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM user_account WHERE user_id >= $1",
        [1],
      ),
      pool.query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM drug WHERE drug_id >= $1",
        [1],
      ),
      pool.query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM audit_log WHERE audit_id >= $1",
        [1],
      ),
    ]);

  const counts = [
    { label: "Users", value: userRows[0]?.count ?? "0" },
    { label: "Drugs", value: drugRows[0]?.count ?? "0" },
    { label: "Audit rows", value: auditRows[0]?.count ?? "0" },
  ];

  const links = [
    {
      href: "/admin/drugs",
      title: "Drug catalogue",
      description: "Manage active medicines and catalogue entries.",
    },
    {
      href: "/admin/audit-logs",
      title: "Audit logs",
      description: "Review administrative and clinical change metadata.",
    },
    {
      href: "/admin/interactions",
      title: "Interactions",
      description: "Review and manage drug interaction rules.",
    },
    {
      href: "/admin/users",
      title: "Users",
      description: "Review user accounts and role assignments.",
    },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        padding: "36px 20px 56px",
        color: "#172033",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: 30 }}>
          <p
            style={{
              margin: 0,
              color: "#53627b",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Administration
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>
            Admin dashboard
          </h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>
            Manage catalogue data, access, interactions, and system history.
          </p>
        </header>

        <section
          aria-label="System counts"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 30,
          }}
        >
          {counts.map((count) => (
            <article
              key={count.label}
              style={{
                padding: "20px 22px",
                background: "#fff",
                border: "1px solid #e1e7f0",
                borderRadius: 12,
              }}
            >
              <p style={{ margin: 0, color: "#596579", fontSize: 14 }}>{count.label}</p>
              <strong style={{ display: "block", marginTop: 8, fontSize: 30 }}>
                {count.value}
              </strong>
            </article>
          ))}
        </section>

        <section
          aria-label="Administration links"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                display: "block",
                padding: 22,
                background: "#fff",
                border: "1px solid #e1e7f0",
                borderRadius: 12,
                color: "#172033",
                textDecoration: "none",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 19 }}>{link.title}</h2>
              <p style={{ margin: "9px 0 0", color: "#596579", lineHeight: 1.5 }}>
                {link.description}
              </p>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
