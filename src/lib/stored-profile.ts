import { parseProfile, type Profile } from "./profile";

export const MAX_STORED_TOML_BYTES = 1_000_000;
const ID_BYTES = 16;
const EDIT_KEY_BYTES = 32;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

type StoredProfileRow = {
  id: string;
  toml: string;
  created_at: number;
  updated_at: number;
};

export type StoredProfile = {
  id: string;
  toml: string;
  profile: Profile;
  createdAt: number;
  updatedAt: number;
};

export type CreatedStoredProfile = StoredProfile & { editKey: string };

export class StoredProfileError extends Error {
  constructor(
    public readonly code: "invalid_id" | "invalid_toml" | "not_found" | "too_large",
    message: string,
  ) {
    super(message);
  }
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function hashEditKey(editKey: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(editKey));
}

function validateToml(toml: string): Profile {
  if (new TextEncoder().encode(toml).byteLength > MAX_STORED_TOML_BYTES) {
    throw new StoredProfileError("too_large", "The TOML must be 1 MB or smaller.");
  }
  try {
    return parseProfile(toml);
  } catch {
    throw new StoredProfileError(
      "invalid_toml",
      "The TOML does not match the dot-miru profile format.",
    );
  }
}

function validateId(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new StoredProfileError("invalid_id", "The profile ID is invalid.");
  }
}

function fromRow(row: StoredProfileRow): StoredProfile {
  return {
    id: row.id,
    toml: row.toml,
    profile: validateToml(row.toml),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createStoredProfile(
  db: D1Database,
  toml: string,
): Promise<CreatedStoredProfile> {
  const profile = validateToml(toml);
  const id = randomToken(ID_BYTES);
  const editKey = randomToken(EDIT_KEY_BYTES);
  const editKeyHash = await hashEditKey(editKey);
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO profiles (id, toml, edit_key_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
    )
    .bind(id, toml, editKeyHash, now)
    .run();

  return { id, editKey, toml, profile, createdAt: now, updatedAt: now };
}

export async function getStoredProfile(
  db: D1Database,
  id: string,
): Promise<StoredProfile> {
  validateId(id);
  const row = await db
    .prepare(
      "SELECT id, toml, created_at, updated_at FROM profiles WHERE id = ?1",
    )
    .bind(id)
    .first<StoredProfileRow>();
  if (!row) throw new StoredProfileError("not_found", "Profile not found.");
  return fromRow(row);
}

export async function updateStoredProfile(
  db: D1Database,
  id: string,
  editKey: string,
  toml: string,
): Promise<StoredProfile> {
  validateId(id);
  const profile = validateToml(toml);
  const editKeyHash = await hashEditKey(editKey);
  const updatedAt = Date.now();
  const result = await db
    .prepare(
      "UPDATE profiles SET toml = ?1, updated_at = ?2 WHERE id = ?3 AND edit_key_hash = ?4",
    )
    .bind(toml, updatedAt, id, editKeyHash)
    .run();
  if (result.meta.changes !== 1) {
    throw new StoredProfileError("not_found", "Profile or edit key not found.");
  }
  const stored = await getStoredProfile(db, id);
  return { ...stored, profile, updatedAt };
}

export async function deleteStoredProfile(
  db: D1Database,
  id: string,
  editKey: string,
): Promise<void> {
  validateId(id);
  const editKeyHash = await hashEditKey(editKey);
  const result = await db
    .prepare("DELETE FROM profiles WHERE id = ?1 AND edit_key_hash = ?2")
    .bind(id, editKeyHash)
    .run();
  if (result.meta.changes !== 1) {
    throw new StoredProfileError("not_found", "Profile or edit key not found.");
  }
}
