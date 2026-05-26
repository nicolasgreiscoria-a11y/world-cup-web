CREATE TABLE match_score_picks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bracket_id       UUID NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
  match_id         UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  predicted_score1 SMALLINT NOT NULL DEFAULT 0,
  predicted_score2 SMALLINT NOT NULL DEFAULT 0,
  points_earned    SMALLINT NOT NULL DEFAULT 0,
  UNIQUE(bracket_id, match_id)
);

ALTER TABLE match_score_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own match_score_picks"
  ON match_score_picks FOR ALL
  USING (
    bracket_id IN (
      SELECT id FROM brackets WHERE user_id = auth.uid()
    )
  );
