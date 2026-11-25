-- Migration additive, exécutée sous verrou transactionnel au démarrage.
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 32),
  token_hash text NOT NULL UNIQUE,
  quest text NOT NULL DEFAULT 'available' CHECK (quest IN ('available','active','complete')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (player_id, item_id)
);
CREATE TABLE IF NOT EXISTS interactions (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128),
  signature text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, request_key)
);
