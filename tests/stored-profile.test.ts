import { describe, expect, it } from "vitest";
import { ApiRequestError, readEditKey, readJsonObject } from "../src/lib/api-request";
import {
  createStoredProfile,
  MAX_STORED_TOML_BYTES,
  StoredProfileError,
} from "../src/lib/stored-profile";

describe("stored profiles", () => {
  it("creates separate public and edit tokens and stores only the edit-key hash", async () => {
    let bound: unknown[] = [];
    const statement = Object.create(null) as D1PreparedStatement;
    statement.bind = (...values) => {
      bound = values;
      return statement;
    };
    statement.run = async <T = Record<string, unknown>>() => ({
      success: true,
      results: [] as T[],
      meta: {
        changes: 1,
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 1,
        last_row_id: 0,
        changed_db: true,
      },
    });
    const db = Object.create(null) as D1Database;
    db.prepare = () => statement;

    const stored = await createStoredProfile(db, 'name = "Stored"\n');

    expect(stored.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(stored.editKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored.id).not.toBe(stored.editKey);
    expect(bound[0]).toBe(stored.id);
    expect(bound[1]).toBe(stored.toml);
    expect(bound[2]).toBeInstanceOf(ArrayBuffer);
    expect(bound).not.toContain(stored.editKey);
  });

  it("validates TOML and its byte size before writing", async () => {
    const db = Object.create(null) as D1Database;
    db.prepare = () => { throw new Error("should not write"); };
    await expect(createStoredProfile(db, "summary = 'missing name'")).rejects.toMatchObject({
      code: "invalid_toml",
    } satisfies Partial<StoredProfileError>);
    await expect(
      createStoredProfile(db, `name = "${"a".repeat(MAX_STORED_TOML_BYTES)}"`),
    ).rejects.toMatchObject({ code: "too_large" } satisfies Partial<StoredProfileError>);
  });
});

describe("profile API request parsing", () => {
  it("accepts bounded JSON objects", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toml: 'name = "X"' }),
    });
    await expect(readJsonObject(request, 100)).resolves.toEqual({ toml: 'name = "X"' });
  });

  it("rejects oversized and non-JSON request bodies", async () => {
    await expect(readJsonObject(new Request("https://example.test"), 10)).rejects.toBeInstanceOf(ApiRequestError);
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "4096" },
      body: "{}",
    });
    await expect(readJsonObject(request, 10)).rejects.toThrow("too large");
  });

  it("requires a correctly shaped bearer edit key", () => {
    const key = "a".repeat(43);
    expect(readEditKey(new Request("https://example.test", {
      headers: { Authorization: `Bearer ${key}` },
    }))).toBe(key);
    expect(() => readEditKey(new Request("https://example.test"))).toThrow("edit key");
  });
});
