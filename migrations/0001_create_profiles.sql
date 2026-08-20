CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  toml TEXT NOT NULL CHECK (length(CAST(toml AS BLOB)) <= 1000000),
  edit_key_hash BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
