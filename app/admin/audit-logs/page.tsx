import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import AuditLogViewer from "./AuditLogViewer";

export default async function AdminAuditLogsPage() {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto" }}>
        <a href="/admin" style={{ display: "inline-block", marginBottom: 20, color: "#3157a4" }}>
          ← Back to administration
        </a>
        <header style={{ margin: "0 0 26px" }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Administration
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>
            Audit log
          </h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>
            Review administrative and clinical change metadata. Sensitive detail payloads are omitted.
          </p>
        </header>
        <AuditLogViewer />
      </div>
    </main>
  );
}
