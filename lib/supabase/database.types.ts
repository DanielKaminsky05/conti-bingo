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
      bingos: {
        Row: {
          achieved_at: string
          card_id: string
          id: string
          line_key: string
          player_card_id: string
          type: Database["public"]["Enums"]["bingo_type"]
          user_id: string
        }
        Insert: {
          achieved_at?: string
          card_id: string
          id?: string
          line_key: string
          player_card_id: string
          type: Database["public"]["Enums"]["bingo_type"]
          user_id: string
        }
        Update: {
          achieved_at?: string
          card_id?: string
          id?: string
          line_key?: string
          player_card_id?: string
          type?: Database["public"]["Enums"]["bingo_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bingos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bingos_player_card_id_fkey"
            columns: ["player_card_id"]
            isOneToOne: false
            referencedRelation: "player_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bingos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          free_space: boolean
          grid_size: number
          group_id: string
          id: string
          layout_mode: Database["public"]["Enums"]["card_layout_mode"]
          starts_at: string | null
          status: Database["public"]["Enums"]["card_status"]
          title: string
          updated_at: string
          win_condition: Database["public"]["Enums"]["card_win_condition"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          free_space?: boolean
          grid_size?: number
          group_id: string
          id?: string
          layout_mode: Database["public"]["Enums"]["card_layout_mode"]
          starts_at?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          title: string
          updated_at?: string
          win_condition?: Database["public"]["Enums"]["card_win_condition"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          free_space?: boolean
          grid_size?: number
          group_id?: string
          id?: string
          layout_mode?: Database["public"]["Enums"]["card_layout_mode"]
          starts_at?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          title?: string
          updated_at?: string
          win_condition?: Database["public"]["Enums"]["card_win_condition"]
        }
        Relationships: [
          {
            foreignKeyName: "cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          card_id: string
          created_at: string
          id: string
          points: number
          sort_index: number
          text: string
          updated_at: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          points?: number
          sort_index: number
          text: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          points?: number
          sort_index?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          nickname: string | null
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          background_path: string | null
          created_at: string
          description: string | null
          host_id: string
          id: string
          image_path: string | null
          join_code: string
          join_locked: boolean
          name: string
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
        }
        Insert: {
          background_path?: string | null
          created_at?: string
          description?: string | null
          host_id: string
          id?: string
          image_path?: string | null
          join_code: string
          join_locked?: boolean
          name: string
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
        }
        Update: {
          background_path?: string | null
          created_at?: string
          description?: string | null
          host_id?: string
          id?: string
          image_path?: string | null
          join_code?: string
          join_locked?: boolean
          name?: string
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string | null
          expires_at: string | null
          group_id: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          group_id: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          group_id?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          payload: Json
          read_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
      player_card_cells: {
        Row: {
          challenge_id: string | null
          id: string
          is_marked: boolean
          marked_at: string | null
          player_card_id: string
          position: number
        }
        Insert: {
          challenge_id?: string | null
          id?: string
          is_marked?: boolean
          marked_at?: string | null
          player_card_id: string
          position: number
        }
        Update: {
          challenge_id?: string | null
          id?: string
          is_marked?: boolean
          marked_at?: string | null
          player_card_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_card_cells_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_card_cells_player_card_id_fkey"
            columns: ["player_card_id"]
            isOneToOne: false
            referencedRelation: "player_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      player_cards: {
        Row: {
          bingo_count: number
          card_id: string
          completed_at: string | null
          created_at: string
          first_bingo_at: string | null
          id: string
          marks_count: number
          points_total: number
          shuffle_seed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bingo_count?: number
          card_id: string
          completed_at?: string | null
          created_at?: string
          first_bingo_at?: string | null
          id?: string
          marks_count?: number
          points_total?: number
          shuffle_seed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bingo_count?: number
          card_id?: string
          completed_at?: string | null
          created_at?: string
          first_bingo_at?: string | null
          id?: string
          marks_count?: number
          points_total?: number
          shuffle_seed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          id: string
          name: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard: {
        Row: {
          avatar_path: string | null
          bingo_count: number | null
          card_id: string | null
          first_bingo_at: string | null
          group_id: string | null
          marks_count: number | null
          name: string | null
          points_total: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          description: string | null
          host_id: string
          id: string
          image_path: string | null
          join_code: string
          join_locked: boolean
          name: string
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
        }
      }
      create_group: {
        Args: { p_description?: string; p_name: string }
        Returns: {
          created_at: string
          description: string | null
          host_id: string
          id: string
          image_path: string | null
          join_code: string
          join_locked: boolean
          name: string
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
        }
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          group_id: string
          group_image_path: string
          group_name: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["invite_status"]
        }[]
      }
      join_group: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          description: string | null
          host_id: string
          id: string
          image_path: string | null
          join_code: string
          join_locked: boolean
          name: string
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
        }
      }
      publish_card: {
        Args: { p_card_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          free_space: boolean
          grid_size: number
          group_id: string
          id: string
          layout_mode: Database["public"]["Enums"]["card_layout_mode"]
          starts_at: string | null
          status: Database["public"]["Enums"]["card_status"]
          title: string
          updated_at: string
          win_condition: Database["public"]["Enums"]["card_win_condition"]
        }
      }
      rebuild_player_cards: { Args: { p_card_id: string }; Returns: undefined }
      recount_card: { Args: { p_card_id: string }; Returns: undefined }
      reset_edited_challenge: { Args: { p_challenge_id: string }; Returns: undefined }
      transfer_ownership: {
        Args: { p_group_id: string; p_new_owner: string }
        Returns: undefined
      }
    }
    Enums: {
      bingo_type: "line" | "blackout"
      card_layout_mode: "shuffled" | "identical"
      card_status: "draft" | "active" | "archived"
      card_win_condition: "line" | "blackout"
      group_status: "active" | "archived"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      member_role: "owner" | "admin" | "member"
      notification_type:
        | "member_joined"
        | "invite_received"
        | "card_published"
        | "card_replaced"
        | "bingo_achieved"
        | "out_bingoed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      bingo_type: ["line", "blackout"],
      card_layout_mode: ["shuffled", "identical"],
      card_status: ["draft", "active", "archived"],
      card_win_condition: ["line", "blackout"],
      group_status: ["active", "archived"],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      member_role: ["owner", "admin", "member"],
      notification_type: [
        "member_joined",
        "invite_received",
        "card_published",
        "card_replaced",
        "bingo_achieved",
        "out_bingoed",
      ],
    },
  },
} as const
