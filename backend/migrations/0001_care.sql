CREATE TABLE IF NOT EXISTS care_spaces (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES care_spaces(id),
  role TEXT NOT NULL CHECK(role IN ('Patient','Family','Doctor','Nurse','Admin')),
  provider_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, space_id)
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES care_spaces(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS attachments_space ON attachments(space_id);
