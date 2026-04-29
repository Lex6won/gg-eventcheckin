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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      attendees: {
        Row: {
          car_number: string | null
          checked_in_at: string | null
          created_at: string | null
          department: string | null
          email: string | null
          event_id: string
          id: string
          inquiry: string | null
          lookup_code: string | null
          name: string
          org_type: string | null
          organization: string
          phone: string | null
          position: string | null
          privacy_agreed: boolean
          registered_at: string
          signature_url: string | null
          status: string
        }
        Insert: {
          car_number?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          event_id: string
          id?: string
          inquiry?: string | null
          lookup_code?: string | null
          name: string
          org_type?: string | null
          organization: string
          phone?: string | null
          position?: string | null
          privacy_agreed?: boolean
          registered_at?: string
          signature_url?: string | null
          status?: string
        }
        Update: {
          car_number?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          event_id?: string
          id?: string
          inquiry?: string | null
          lookup_code?: string | null
          name?: string
          org_type?: string | null
          organization?: string
          phone?: string | null
          position?: string | null
          privacy_agreed?: boolean
          registered_at?: string
          signature_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          access_code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string
          event_date: string
          id: string
          location: string
          organizer: string
          poster_url: string | null
          pre_registration_close_at: string | null
          qr_code_url: string | null
          show_car_number: boolean
          start_time: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          access_code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time: string
          event_date: string
          id?: string
          location: string
          organizer: string
          poster_url?: string | null
          pre_registration_close_at?: string | null
          qr_code_url?: string | null
          show_car_number?: boolean
          start_time: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          access_code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string
          event_date?: string
          id?: string
          location?: string
          organizer?: string
          poster_url?: string | null
          pre_registration_close_at?: string | null
          qr_code_url?: string | null
          show_car_number?: boolean
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      export_audit_logs: {
        Row: {
          created_at: string
          file_type: string
          id: string
          includes_signature: boolean
          row_count: number
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_type: string
          id?: string
          includes_signature?: boolean
          row_count?: number
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_type?: string
          id?: string
          includes_signature?: boolean
          row_count?: number
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          department: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      trainees: {
        Row: {
          car_number: string | null
          confirmed_at: string | null
          created_at: string | null
          department: string | null
          email: string | null
          id: string
          inquiry: string | null
          lookup_code: string | null
          name: string
          org_type: string | null
          organization: string
          position: string | null
          privacy_agreed: boolean
          registered_at: string
          signature_url: string
          status: string
          training_id: string
        }
        Insert: {
          car_number?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          inquiry?: string | null
          lookup_code?: string | null
          name: string
          org_type?: string | null
          organization: string
          position?: string | null
          privacy_agreed?: boolean
          registered_at?: string
          signature_url: string
          status?: string
          training_id: string
        }
        Update: {
          car_number?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          inquiry?: string | null
          lookup_code?: string | null
          name?: string
          org_type?: string | null
          organization?: string
          position?: string | null
          privacy_agreed?: boolean
          registered_at?: string
          signature_url?: string
          status?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainees_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          access_code: string
          allow_waitlist: boolean
          capacity: number | null
          capacity_enabled: boolean
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string
          event_date: string
          id: string
          instructor: string | null
          location: string
          organizer: string
          poster_url: string | null
          pre_registration_close_at: string | null
          show_car_number: boolean
          start_time: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          access_code: string
          allow_waitlist?: boolean
          capacity?: number | null
          capacity_enabled?: boolean
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time: string
          event_date: string
          id?: string
          instructor?: string | null
          location: string
          organizer: string
          poster_url?: string | null
          pre_registration_close_at?: string | null
          show_car_number?: boolean
          start_time: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          access_code?: string
          allow_waitlist?: boolean
          capacity?: number | null
          capacity_enabled?: boolean
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string
          event_date?: string
          id?: string
          instructor?: string | null
          location?: string
          organizer?: string
          poster_url?: string | null
          pre_registration_close_at?: string | null
          show_car_number?: boolean
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      _assert_event_open_for_onsite: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      _assert_event_open_for_pre_reg: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      _assert_training_open_for_onsite: {
        Args: { p_training_id: string }
        Returns: undefined
      }
      _assert_training_open_for_pre_reg: {
        Args: { p_training_id: string }
        Returns: undefined
      }
      auto_transition_event_statuses: { Args: never; Returns: undefined }
      checkin_attendee: {
        Args: { p_email: string; p_event_id: string; p_signature_url: string }
        Returns: Json
      }
      checkin_trainee: {
        Args: {
          p_email: string
          p_signature_url: string
          p_training_id: string
        }
        Returns: Json
      }
      gen_lookup_code_for_event: {
        Args: { p_event_id: string }
        Returns: string
      }
      gen_lookup_code_for_training: {
        Args: { p_training_id: string }
        Returns: string
      }
      get_event_public_status: { Args: { p_code: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_attendee: {
        Args: { p_event_id: string; p_query: string }
        Returns: Json
      }
      lookup_trainee: {
        Args: { p_query: string; p_training_id: string }
        Returns: Json
      }
      normalize_email: { Args: { p: string }; Returns: string }
      promote_trainee_from_waitlist: {
        Args: { p_trainee_id: string }
        Returns: Json
      }
      purge_expired_signatures: { Args: never; Returns: number }
      register_attendee_pre: {
        Args: {
          p_car_number: string
          p_department: string
          p_email: string
          p_event_id: string
          p_name: string
          p_org_type: string
          p_organization: string
          p_phone: string
          p_position: string
          p_privacy_agreed: boolean
        }
        Returns: Json
      }
      register_trainee: {
        Args: {
          p_car_number: string
          p_department: string
          p_email?: string
          p_inquiry: string
          p_name: string
          p_org_type: string
          p_organization: string
          p_position: string
          p_privacy_agreed: boolean
          p_signature_url: string
          p_training_id: string
        }
        Returns: Json
      }
      walk_in_attendee: {
        Args: {
          p_car_number: string
          p_department: string
          p_email: string
          p_event_id: string
          p_name: string
          p_org_type: string
          p_organization: string
          p_phone: string
          p_position: string
          p_privacy_agreed: boolean
          p_signature_url: string
        }
        Returns: Json
      }
      walk_in_trainee: {
        Args: {
          p_car_number: string
          p_department: string
          p_email: string
          p_inquiry: string
          p_name: string
          p_org_type: string
          p_organization: string
          p_position: string
          p_privacy_agreed: boolean
          p_signature_url: string
          p_training_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "admin"
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
      app_role: ["super_admin", "admin"],
    },
  },
} as const
