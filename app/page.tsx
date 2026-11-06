import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        display: "grid",
        minHeight: "100vh",
        placeItems: "center",
        padding: "24px",
        background: "#f4f7fb",
        color: "#172033",
      }}
    >
      <section
        aria-labelledby="home-title"
        style={{
          width: "100%",
          maxWidth: 640,
          padding: "clamp(24px, 6vw, 48px)",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          background: "#fff",
          boxShadow: "0 12px 32px rgba(22, 34, 57, 0.06)",
        }}
      >
        <h1 id="home-title" style={{ margin: 0, fontSize: 36, letterSpacing: "-0.03em" }}>
          Nidaan
        </h1>
        <p style={{ margin: "12px 0 24px", color: "#53627b", lineHeight: 1.6 }}>
          Consultation Management and Adverse Drug Event Detection
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-flex",
            minHeight: 46,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 9,
            padding: "10px 18px",
            background: "#3157a4",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}
