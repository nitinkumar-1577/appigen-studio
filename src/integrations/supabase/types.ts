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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      project_versions: {
        Row: {
          code: string
          created_at: string
          id: string
          project_id: string
          prompt: string
          user_id: string
          version_number: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          project_id: string
          prompt: string
          user_id: string
          version_number?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          project_id?: string
          prompt?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          files: Json
          id: string
          messages: Json
          prompt: string
          thumbnail: string | null
          title: string
          updated_at: string
          user_id: string
          version_counter: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          files?: Json
          id?: string
          messages?: Json
          prompt: string
          thumbnail?: string | null
          title?: string
          updated_at?: string
          user_id: string
          version_counter?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          files?: Json
          id?: string
          messages?: Json
          prompt?: string
          thumbnail?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version_counter?: number
        }
        Relationships: []
      }
      anonymous_telemetry: {
        Row: {
          created_at: string
          event_name: string
          id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          created_at: string
          detail: string
          duration_ms: number | null
          id: string
          kind: string
          prompt_characters: number | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail: string
          duration_ms?: number | null
          id?: string
          kind: string
          prompt_characters?: number | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          duration_ms?: number | null
          id?: string
          kind?: string
          prompt_characters?: number | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_apps: {
        Row: {
          appigen_project_id: string | null
          backend_mode: string
          created_at: string
          id: string
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          appigen_project_id?: string | null
          backend_mode?: string
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          appigen_project_id?: string | null
          backend_mode?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      generated_app_backend_configs: {
        Row: {
          config: Json
          created_at: string
          dedicated_anon_key_hint: string | null
          dedicated_project_ref: string | null
          dedicated_project_url: string | null
          generated_app_id: string
          id: string
          last_health_checked_at: string | null
          last_health_status: string | null
          mode: string
          owner_id: string
          provisioning_error: string | null
          provisioning_status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dedicated_anon_key_hint?: string | null
          dedicated_project_ref?: string | null
          dedicated_project_url?: string | null
          generated_app_id: string
          id?: string
          last_health_checked_at?: string | null
          last_health_status?: string | null
          mode: string
          owner_id: string
          provisioning_error?: string | null
          provisioning_status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          dedicated_anon_key_hint?: string | null
          dedicated_project_ref?: string | null
          dedicated_project_url?: string | null
          generated_app_id?: string
          id?: string
          last_health_checked_at?: string | null
          last_health_status?: string | null
          mode?: string
          owner_id?: string
          provisioning_error?: string | null
          provisioning_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      generated_app_data: {
        Row: {
          collection: string
          created_at: string
          generated_app_id: string
          id: string
          owner_id: string
          record: Json
          updated_at: string
        }
        Insert: {
          collection: string
          created_at?: string
          generated_app_id: string
          id?: string
          owner_id: string
          record?: Json
          updated_at?: string
        }
        Update: {
          collection?: string
          created_at?: string
          generated_app_id?: string
          id?: string
          owner_id?: string
          record?: Json
          updated_at?: string
        }
        Relationships: []
      }
      generated_app_deployments: {
        Row: {
          created_at: string
          deployment_url: string | null
          error: string | null
          generated_app_id: string
          id: string
          logs: string | null
          metadata: Json
          owner_id: string
          provider: string
          provider_deployment_id: string | null
          repo_full_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deployment_url?: string | null
          error?: string | null
          generated_app_id: string
          id?: string
          logs?: string | null
          metadata?: Json
          owner_id: string
          provider?: string
          provider_deployment_id?: string | null
          repo_full_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deployment_url?: string | null
          error?: string | null
          generated_app_id?: string
          id?: string
          logs?: string | null
          metadata?: Json
          owner_id?: string
          provider?: string
          provider_deployment_id?: string | null
          repo_full_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      generated_app_env_vars: {
        Row: {
          created_at: string
          generated_app_id: string
          id: string
          is_secret: boolean
          key: string
          owner_id: string
          public_value: string | null
          secret_ref: string | null
          target: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_app_id: string
          id?: string
          is_secret?: boolean
          key: string
          owner_id: string
          public_value?: string | null
          secret_ref?: string | null
          target?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_app_id?: string
          id?: string
          is_secret?: boolean
          key?: string
          owner_id?: string
          public_value?: string | null
          secret_ref?: string | null
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
