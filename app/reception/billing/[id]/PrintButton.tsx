"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{
        minHeight: 42,
        border: 0,
        borderRadius: 9,
        background: "#3157a4",
        color: "#fff",
        padding: "10px 16px",
        font: "inherit",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Print invoice
    </button>
  );
}
