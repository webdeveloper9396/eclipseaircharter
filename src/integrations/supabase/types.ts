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
      charter_digest_subscriptions: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
          id: string
          last_sent_at: string | null
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          unsubscribe_token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          unsubscribe_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      charter_enquiries: {
        Row: {
          contact_country: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          enquiry_number: number
          id: string
          legs: Json
          passengers: number
          preferred_contact: Database["public"]["Enums"]["charter_contact_method"]
          referrer: string | null
          return_date: string | null
          return_hour: number | null
          submitted_by_user_id: string | null
          trip_type: Database["public"]["Enums"]["charter_trip_type"]
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          contact_country: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          enquiry_number?: number
          id?: string
          legs: Json
          passengers: number
          preferred_contact: Database["public"]["Enums"]["charter_contact_method"]
          referrer?: string | null
          return_date?: string | null
          return_hour?: number | null
          submitted_by_user_id?: string | null
          trip_type: Database["public"]["Enums"]["charter_trip_type"]
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          contact_country?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          enquiry_number?: number
          id?: string
          legs?: Json
          passengers?: number
          preferred_contact?: Database["public"]["Enums"]["charter_contact_method"]
          referrer?: string | null
          return_date?: string | null
          return_hour?: number | null
          submitted_by_user_id?: string | null
          trip_type?: Database["public"]["Enums"]["charter_trip_type"]
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      excluded_ips: {
        Row: {
          created_at: string
          id: string
          ip_address: string
          label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address: string
          label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string
          label?: string | null
        }
        Relationships: []
      }
      featured_corridor_pairs: {
        Row: {
          corridor_a: string
          corridor_b: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
          weight: number
        }
        Insert: {
          corridor_a: string
          corridor_b: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          corridor_a?: string
          corridor_b?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      featured_settings: {
        Row: {
          id: boolean
          total_count: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          total_count?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      search_conversions: {
        Row: {
          created_at: string
          empty_leg_id: string | null
          enquiry_id: string | null
          event_type: string
          flow: string
          id: string
          match_section: string | null
          metadata: Json | null
          request_type: string | null
          search_log_id: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          empty_leg_id?: string | null
          enquiry_id?: string | null
          event_type: string
          flow?: string
          id?: string
          match_section?: string | null
          metadata?: Json | null
          request_type?: string | null
          search_log_id?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          empty_leg_id?: string | null
          enquiry_id?: string | null
          event_type?: string
          flow?: string
          id?: string
          match_section?: string | null
          metadata?: Json | null
          request_type?: string | null
          search_log_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_conversions_search_log_id_fkey"
            columns: ["search_log_id"]
            isOneToOne: false
            referencedRelation: "search_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          created_at: string
          date_end: string
          date_start: string
          destination_icao: string
          destination_label: string | null
          exact_count: number | null
          id: string
          include_nearby: boolean
          ip_address: string | null
          nearby_count: number | null
          origin_icao: string
          origin_label: string | null
          referrer: string | null
          result_count: number | null
          session_id: string | null
          user_agent: string | null
          wider_count: number | null
        }
        Insert: {
          created_at?: string
          date_end: string
          date_start: string
          destination_icao: string
          destination_label?: string | null
          exact_count?: number | null
          id?: string
          include_nearby?: boolean
          ip_address?: string | null
          nearby_count?: number | null
          origin_icao: string
          origin_label?: string | null
          referrer?: string | null
          result_count?: number | null
          session_id?: string | null
          user_agent?: string | null
          wider_count?: number | null
        }
        Update: {
          created_at?: string
          date_end?: string
          date_start?: string
          destination_icao?: string
          destination_label?: string | null
          exact_count?: number | null
          id?: string
          include_nearby?: boolean
          ip_address?: string | null
          nearby_count?: number | null
          origin_icao?: string
          origin_label?: string | null
          referrer?: string | null
          result_count?: number | null
          session_id?: string | null
          user_agent?: string | null
          wider_count?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "viewer" | "broker"
      charter_contact_method: "call" | "email" | "whatsapp"
      charter_trip_type: "one_way" | "multi_city"
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
      app_role: ["admin", "viewer", "broker"],
      charter_contact_method: ["call", "email", "whatsapp"],
      charter_trip_type: ["one_way", "multi_city"],
    },
  },
} as const
