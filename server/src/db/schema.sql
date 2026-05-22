CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  stake_amount BIGINT NOT NULL,
  winner_wallet TEXT NOT NULL,
  loser_wallet TEXT NOT NULL,
  winner_player_id TEXT NOT NULL,
  loser_player_id TEXT NOT NULL,
  rounds_won_winner INT NOT NULL,
  rounds_won_loser INT NOT NULL,
  resolution_reason TEXT NOT NULL,
  payout_signature TEXT,
  total_pot BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches(winner_wallet);
CREATE INDEX IF NOT EXISTS idx_matches_loser ON matches(loser_wallet);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);

CREATE TABLE IF NOT EXISTS player_stats (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  total_wagered BIGINT DEFAULT 0,
  total_won BIGINT DEFAULT 0,
  last_played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stats_wins ON player_stats(wins DESC);
CREATE INDEX IF NOT EXISTS idx_stats_total_won ON player_stats(total_won DESC);
