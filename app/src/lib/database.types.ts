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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          machine_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          machine_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          machine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_api_keys_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_group_machines: {
        Row: {
          created_at: string
          group_id: string
          machine_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          machine_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          machine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_group_machines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "machine_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_group_machines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_groups: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          line: string | null
          name: string
          plant_id: string
          primary_metric: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          line?: string | null
          name: string
          plant_id: string
          primary_metric: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          line?: string | null
          name?: string
          plant_id?: string
          primary_metric?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      plants: {
        Row: {
          company_id: string | null
          id: string
          name: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "plants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      readings: {
        Row: {
          id: number
          machine_id: string
          metric: string
          ts_device: string | null
          ts_server: string
          value: number
        }
        Insert: {
          id?: number
          machine_id: string
          metric: string
          ts_device?: string | null
          ts_server?: string
          value: number
        }
        Update: {
          id?: number
          machine_id?: string
          metric?: string
          ts_device?: string | null
          ts_server?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_control: {
        Row: {
          enabled: boolean
          id: number
        }
        Insert: {
          enabled?: boolean
          id?: number
        }
        Update: {
          enabled?: boolean
          id?: number
        }
        Relationships: []
      }
      sim_tick: {
        Row: {
          id: number
          t: number
        }
        Insert: {
          id?: number
          t?: number
        }
        Update: {
          id?: number
          t?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_company_with_owner: { Args: { p_name: string }; Returns: string }
      create_plant_for_company: {
        Args: { p_company_id: string; p_name: string }
        Returns: string
      }
      create_machine_group: {
        Args: { p_company_id: string; p_name: string }
        Returns: string
      }
      create_machine_with_group: {
        Args: {
          p_group_id?: string
          p_line: string
          p_name: string
          p_plant_id: string
          p_primary_metric: string
        }
        Returns: string
      }
      get_machine_activity_metrics: {
        Args: {
          p_freshness_seconds?: number
          p_from: string
          p_machine_id: string
          p_to: string
        }
        Returns: {
          active_seconds: number
          avg_stop_duration_seconds: number
          idle_seconds: number
          rotations_total: number
          runtime_hours: number
          stop_count: number
          utilization_pct: number
        }[]
      }
      get_machine_cards:
        | {
            Args: { p_plant_id: string }
            Returns: {
              last_update: string
              latest_value: number
              line: string
              machine_id: string
              name: string
              primary_metric: string
            }[]
          }
        | {
            Args: { p_freshness_seconds?: number; p_plant_id: string }
            Returns: {
              is_fresh: boolean
              is_running: boolean
              last_ts: string
              last_value: number
              machine_id: string
              machine_name: string
              primary_metric: string
            }[]
          }
      get_machine_state_timeline: {
        Args: { p_from: string; p_machine_id: string; p_to: string }
        Returns: {
          duration_seconds: number
          end_ts: string
          start_ts: string
          state: string
        }[]
      }
      get_my_companies: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
        }[]
      }
      get_plant_daily_activity_metrics: {
        Args: {
          p_day: string
          p_freshness_seconds?: number
          p_plant_id: string
          p_tz?: string
        }
        Returns: {
          avg_stop_duration_seconds: number
          line: string
          machine_id: string
          machine_name: string
          rotations_total: number
          runtime_hours: number
          stop_count: number
          utilization_pct: number
        }[]
      }
      is_company_admin: { Args: { p_company_id: string }; Returns: boolean }
      is_company_member: { Args: { p_company_id: string }; Returns: boolean }
      sim_call_ingest: {
        Args: {
          p_machine_id: string
          p_value: number
          p_vault_key_name: string
        }
        Returns: undefined
      }
      sim_next_tick: { Args: never; Returns: number }
      sim_run_step: { Args: { p_rate_label?: string }; Returns: undefined }
      sim_value: { Args: { p_base: number; p_tick: number }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
