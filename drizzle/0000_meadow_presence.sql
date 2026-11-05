CREATE TABLE meadow_presence (
  id TEXT PRIMARY KEY NOT NULL,
  species TEXT NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  yaw REAL NOT NULL,
  motion TEXT NOT NULL,
  seen INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX meadow_presence_seen ON meadow_presence(seen);
