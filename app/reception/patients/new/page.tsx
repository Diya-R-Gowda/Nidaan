import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import PatientRegistrationForm from "@/app/reception/patients/new/PatientRegistrationForm";

export const dynamic = "force-dynamic";

export default async function NewPatientPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "receptionist") redirect("/");

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#172033", padding: "36px 20px 56px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <a href="/reception" style={{ color: "#3157a4", fontWeight: 600 }}>← Reception</a>
        <header style={{ margin: "24px 0" }}>
          <h1 style={{ margin: 0, fontSize: 32 }}>Register a patient</h1>
          <p style={{ color: "#53627b", lineHeight: 1.6 }}>Enter the demographic details needed to create a patient record.</p>
        </header>
        <PatientRegistrationForm />
      </div>
    </main>
  );
}
