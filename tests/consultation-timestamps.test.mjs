import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptionalTimestamp } from "../lib/consultation-timestamps.ts";

test("omitted optional timestamps are SQL NULL", () => {
  assert.equal(parseOptionalTimestamp(undefined), null);
});

test("explicit null optional timestamps remain SQL NULL", () => {
  assert.equal(parseOptionalTimestamp(null), null);
});

test("valid timestamps are normalized to ISO strings", () => {
  assert.equal(
    parseOptionalTimestamp("2026-01-02T03:04:05+05:30"),
    "2026-01-01T21:34:05.000Z",
  );
});

test("malformed and non-string timestamps are rejected", () => {
  assert.equal(parseOptionalTimestamp("not-a-timestamp"), undefined);
  assert.equal(parseOptionalTimestamp("   "), undefined);
  assert.equal(parseOptionalTimestamp(123), undefined);
});
