"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type UserRole =
  | "receptionist"
  | "prescriber"
  | "pharmacovigilance"
  | "admin";

const dashboardByRole: Record<UserRole, string> = {
  receptionist: "/reception",
  prescriber: "/doctor",
  pharmacovigilance: "/pharmacovigilance",
  admin: "/admin",
};

interface LoginResponse {
  role?: UserRole;
  error?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !result.role || !(result.role in dashboardByRole)) {
        setError(result.error ?? "Unable to sign in");
        return;
      }

      router.replace(dashboardByRole[result.role]);
    } catch {
      setError("Unable to reach the login service");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      style={{
        display: "grid",
        minHeight: "100vh",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: "1rem",
          width: "100%",
          maxWidth: "24rem",
        }}
      >
        <div>
          <h1>Sign in to Nidaan</h1>
          <p>Consultation Management and Adverse Drug Event Detection</p>
        </div>

        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
