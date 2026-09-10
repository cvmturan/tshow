CREATE TABLE IF NOT EXISTS account_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 username TEXT UNIQUE COLLATE NOCASE,
 verified_at INTEGER
);
CREATE TABLE IF NOT EXISTS email_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_token_expiry ON email_tokens(expires_at);

