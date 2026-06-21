export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          body: string
          created_at: string
          game_id: string
          id: string
          is_system: boolean
          room_id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          game_id: string
          id?: string
          is_system?: boolean
          room_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          game_id?: string
          id?: string
          is_system?: boolean
          room_id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          game_id: string
          id: string
          name: string | null
          type: Database["public"]["Enums"]["chat_room_type"]
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          name?: string | null
          type: Database["public"]["Enums"]["chat_room_type"]
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          name?: string | null
          type?: Database["public"]["Enums"]["chat_room_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_events: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          event_type: string
          game_id: string
          id: string
          phase_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          event_type: string
          game_id: string
          id?: string
          phase_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          event_type?: string
          game_id?: string
          id?: string
          phase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "game_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      game_phases: {
        Row: {
          created_at: string
          day_number: number
          ended_at: string | null
          ends_at: string | null
          game_id: string
          id: string
          phase_number: number
          phase_type: Database["public"]["Enums"]["game_phase_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["game_phase_status"]
        }
        Insert: {
          created_at?: string
          day_number?: number
          ended_at?: string | null
          ends_at?: string | null
          game_id: string
          id?: string
          phase_number: number
          phase_type: Database["public"]["Enums"]["game_phase_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_phase_status"]
        }
        Update: {
          created_at?: string
          day_number?: number
          ended_at?: string | null
          ends_at?: string | null
          game_id?: string
          id?: string
          phase_number?: number
          phase_type?: Database["public"]["Enums"]["game_phase_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_phase_status"]
        }
        Relationships: [
          {
            foreignKeyName: "game_phases_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_player_roles: {
        Row: {
          alignment: Database["public"]["Enums"]["role_alignment"]
          created_at: string
          game_id: string
          player_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          alignment: Database["public"]["Enums"]["role_alignment"]
          created_at?: string
          game_id: string
          player_id: string
          role_id: string
          user_id: string
        }
        Update: {
          alignment?: Database["public"]["Enums"]["role_alignment"]
          created_at?: string
          game_id?: string
          player_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_player_roles_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_player_roles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_player_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_player_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          eliminated_at: string | null
          game_id: string
          id: string
          is_host: boolean
          is_ready: boolean
          joined_at: string
          role_id: string | null
          seat: number | null
          status: Database["public"]["Enums"]["game_player_status"]
          user_id: string
        }
        Insert: {
          eliminated_at?: string | null
          game_id: string
          id?: string
          is_host?: boolean
          is_ready?: boolean
          joined_at?: string
          role_id?: string | null
          seat?: number | null
          status?: Database["public"]["Enums"]["game_player_status"]
          user_id: string
        }
        Update: {
          eliminated_at?: string | null
          game_id?: string
          id?: string
          is_host?: boolean
          is_ready?: boolean
          joined_at?: string
          role_id?: string | null
          seat?: number | null
          status?: Database["public"]["Enums"]["game_player_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          code: string
          created_at: string
          current_phase_id: string | null
          ended_at: string | null
          host_id: string
          id: string
          max_players: number
          min_players: number
          name: string | null
          preset_id: string | null
          settings: Json
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          updated_at: string
          winner_alignment: Database["public"]["Enums"]["role_alignment"] | null
        }
        Insert: {
          code: string
          created_at?: string
          current_phase_id?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          max_players?: number
          min_players?: number
          name?: string | null
          preset_id?: string | null
          settings?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
          winner_alignment?:
            | Database["public"]["Enums"]["role_alignment"]
            | null
        }
        Update: {
          code?: string
          created_at?: string
          current_phase_id?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          max_players?: number
          min_players?: number
          name?: string | null
          preset_id?: string | null
          settings?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
          winner_alignment?:
            | Database["public"]["Enums"]["role_alignment"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "games_current_phase_id_fkey"
            columns: ["current_phase_id"]
            isOneToOne: false
            referencedRelation: "game_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "role_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      host_actions: {
        Row: {
          action_type: string
          created_at: string
          game_id: string
          host_id: string
          id: string
          payload: Json
          target_player_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          game_id: string
          host_id: string
          id?: string
          payload?: Json
          target_player_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          game_id?: string
          host_id?: string
          id?: string
          payload?: Json
          target_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_actions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_actions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_actions_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          game_id: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      role_actions: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          game_id: string
          id: string
          phase_id: string
          resolved: boolean
          result: Json | null
          target_id: string | null
        }
        Insert: {
          action_type: string
          actor_id: string
          created_at?: string
          game_id: string
          id?: string
          phase_id: string
          resolved?: boolean
          result?: Json | null
          target_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string
          created_at?: string
          game_id?: string
          id?: string
          phase_id?: string
          resolved?: boolean
          result?: Json | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_actions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_actions_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "game_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      role_preset_items: {
        Row: {
          count: number
          id: string
          preset_id: string
          role_id: string
        }
        Insert: {
          count: number
          id?: string
          preset_id: string
          role_id: string
        }
        Update: {
          count?: number
          id?: string
          preset_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_preset_items_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "role_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_preset_items_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_presets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          max_players: number
          min_players: number
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          max_players: number
          min_players: number
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          max_players?: number
          min_players?: number
          name?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          ability: string
          alignment: Database["public"]["Enums"]["role_alignment"]
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          ability?: string
          alignment: Database["public"]["Enums"]["role_alignment"]
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          ability?: string
          alignment?: Database["public"]["Enums"]["role_alignment"]
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          game_id: string
          id: string
          phase_id: string
          target_id: string | null
          voter_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          phase_id: string
          target_id?: string | null
          voter_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          phase_id?: string
          target_id?: string | null
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "game_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      chat_room_type: "town" | "mafia" | "dead" | "system"
      game_phase_status: "pending" | "active" | "completed"
      game_phase_type: "day" | "night" | "discussion" | "voting" | "results"
      game_player_status: "alive" | "dead" | "left"
      game_status: "lobby" | "in_progress" | "completed" | "cancelled"
      role_alignment: "town" | "mafia" | "neutral"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chat_room_type: ["town", "mafia", "dead", "system"],
      game_phase_status: ["pending", "active", "completed"],
      game_phase_type: ["day", "night", "discussion", "voting", "results"],
      game_player_status: ["alive", "dead", "left"],
      game_status: ["lobby", "in_progress", "completed", "cancelled"],
      role_alignment: ["town", "mafia", "neutral"],
    },
  },
} as const
