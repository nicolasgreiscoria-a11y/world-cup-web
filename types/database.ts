export type Round = "group" | "r32" | "r16" | "qf" | "sf" | "final" | "third_place"
export type MatchStatus = "scheduled" | "live" | "finished"

export interface Database {
  public: {
    PostgrestVersion: "12"
    Tables: {
      teams: {
        Row: {
          id: string
          name: string
          country_code: string
          flag_url: string | null
          group_name: string
          fifa_ranking: number | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["teams"]["Row"], "id" | "created_at"> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["teams"]["Insert"]>
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          round: Round
          match_number: number
          team1_id: string | null
          team2_id: string | null
          score1: number | null
          score2: number | null
          winner_id: string | null
          status: MatchStatus
          kickoff_at: string | null
          external_id: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["matches"]["Row"], "id" | "created_at"> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>
        Relationships: []
      }
      group_standings: {
        Row: {
          id: string
          team_id: string
          group_name: string
          played: number
          wins: number
          draws: number
          losses: number
          goals_for: number
          goals_against: number
          points: number
          position: number | null
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["group_standings"]["Row"], "id" | "updated_at"> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["group_standings"]["Insert"]>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at"> & {
          created_at?: string
        }
        Update: Partial<Omit<Database["public"]["Tables"]["profiles"]["Row"], "id">>
        Relationships: []
      }
      pools: {
        Row: {
          id: string
          name: string
          invite_code: string
          created_by: string
          locked_at: string
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["pools"]["Row"], "id" | "created_at"> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Database["public"]["Tables"]["pools"]["Row"], "id">>
        Relationships: []
      }
      pool_members: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          joined_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["pool_members"]["Row"], "id" | "joined_at"> & {
          id?: string
          joined_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["pool_members"]["Insert"]>
        Relationships: []
      }
      brackets: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          submitted_at: string | null
          total_points: number
          picks_json: Record<string, unknown> | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["brackets"]["Row"], "id" | "created_at" | "picks_json"> & {
          id?: string
          created_at?: string
          picks_json?: Record<string, unknown> | null
        }
        Update: Partial<Omit<Database["public"]["Tables"]["brackets"]["Row"], "id">>
        Relationships: []
      }
      group_picks: {
        Row: {
          id: string
          bracket_id: string
          group_name: string
          picked_1st_id: string | null
          picked_2nd_id: string | null
          picked_3rd_id: string | null
          points_earned: number
        }
        Insert: Omit<Database["public"]["Tables"]["group_picks"]["Row"], "id"> & {
          id?: string
        }
        Update: Partial<Omit<Database["public"]["Tables"]["group_picks"]["Row"], "id">>
        Relationships: []
      }
      bracket_picks: {
        Row: {
          id: string
          bracket_id: string
          match_id: string
          picked_winner_id: string | null
          points_earned: number
        }
        Insert: Omit<Database["public"]["Tables"]["bracket_picks"]["Row"], "id"> & {
          id?: string
        }
        Update: Partial<Omit<Database["public"]["Tables"]["bracket_picks"]["Row"], "id">>
        Relationships: []
      }
    }
    Views: {
      leaderboard: {
        Row: {
          pool_id: string
          user_id: string
          display_name: string
          avatar_url: string | null
          total_points: number
          rank: number
        }
        Relationships: []
      }
    }
    Functions: {
      is_pool_member: {
        Args: { p_pool_id: string }
        Returns: boolean
      }
    }
  }
}

// Convenience types for common query results
export type Team = Database["public"]["Tables"]["teams"]["Row"]
export type Match = Database["public"]["Tables"]["matches"]["Row"]
export type GroupStanding = Database["public"]["Tables"]["group_standings"]["Row"]
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type Pool = Database["public"]["Tables"]["pools"]["Row"]
export type PoolMember = Database["public"]["Tables"]["pool_members"]["Row"]
export type Bracket = Database["public"]["Tables"]["brackets"]["Row"]
export type GroupPick = Database["public"]["Tables"]["group_picks"]["Row"]
export type BracketPick = Database["public"]["Tables"]["bracket_picks"]["Row"]
export type LeaderboardEntry = Database["public"]["Views"]["leaderboard"]["Row"]

// Joined types used in components
export type MatchWithTeams = Match & {
  team1: Team | null
  team2: Team | null
  winner: Team | null
}

export type BracketPickWithMatch = BracketPick & {
  match: MatchWithTeams
}
