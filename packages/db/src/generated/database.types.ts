export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking_attempts: {
        Row: {
          booking_id: string
          created_at: string
          ended_at: string | null
          error_message: string | null
          id: string
          offered_alternative: Json | null
          outcome: Database["public"]["Enums"]["attempt_outcome"] | null
          outcome_confidence: number | null
          rail: Database["public"]["Enums"]["rail_kind"]
          recording_ref: string | null
          sequence: number
          started_at: string
          thread_ref: string | null
          transcript_ref: string | null
          updated_at: string
          venue_channel_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          id?: string
          offered_alternative?: Json | null
          outcome?: Database["public"]["Enums"]["attempt_outcome"] | null
          outcome_confidence?: number | null
          rail: Database["public"]["Enums"]["rail_kind"]
          recording_ref?: string | null
          sequence: number
          started_at?: string
          thread_ref?: string | null
          transcript_ref?: string | null
          updated_at?: string
          venue_channel_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          id?: string
          offered_alternative?: Json | null
          outcome?: Database["public"]["Enums"]["attempt_outcome"] | null
          outcome_confidence?: number | null
          rail?: Database["public"]["Enums"]["rail_kind"]
          recording_ref?: string | null
          sequence?: number
          started_at?: string
          thread_ref?: string | null
          transcript_ref?: string | null
          updated_at?: string
          venue_channel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attempts_venue_channel_id_fkey"
            columns: ["venue_channel_id"]
            isOneToOne: false
            referencedRelation: "venue_booking_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reminders: {
        Row: {
          booking_id: string
          delivered_to: number
          error_message: string | null
          id: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          sent_at: string
        }
        Insert: {
          booking_id: string
          delivered_to?: number
          error_message?: string | null
          id?: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          sent_at?: string
        }
        Update: {
          booking_id?: string
          delivered_to?: number
          error_message?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["reminder_kind"]
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          calendar_event_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmation_evidence: Json | null
          confirmed_at: string | null
          created_at: string
          external_ref: string | null
          id: string
          no_show: boolean
          party_size: number
          provider_name: string | null
          rated_at: string | null
          rating: number | null
          rating_note: string | null
          request_id: string | null
          scheduled_for: string
          service_name: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_state"]
          suggestion_id: string | null
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_evidence?: Json | null
          confirmed_at?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          no_show?: boolean
          party_size: number
          provider_name?: string | null
          rated_at?: string | null
          rating?: number | null
          rating_note?: string | null
          request_id?: string | null
          scheduled_for: string
          service_name?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_state"]
          suggestion_id?: string | null
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          calendar_event_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_evidence?: Json | null
          confirmed_at?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          no_show?: boolean
          party_size?: number
          provider_name?: string | null
          rated_at?: string | null
          rating?: number | null
          rating_note?: string | null
          request_id?: string | null
          scheduled_for?: string
          service_name?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_state"]
          suggestion_id?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          is_bookable: boolean
          kind: string
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          is_bookable?: boolean
          kind: string
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          is_bookable?: boolean
          kind?: string
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          channel: string
          created_at: string
          id: string
          last_message_at: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events_log: {
        Row: {
          actor: Database["public"]["Enums"]["actor"]
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event: string
          from_state: Database["public"]["Enums"]["booking_state"] | null
          id: string
          occurred_at: string
          payload: Json
          reason: string | null
          to_state: Database["public"]["Enums"]["booking_state"] | null
        }
        Insert: {
          actor: Database["public"]["Enums"]["actor"]
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          occurred_at?: string
          payload?: Json
          reason?: string | null
          to_state?: Database["public"]["Enums"]["booking_state"] | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["actor"]
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          occurred_at?: string
          payload?: Json
          reason?: string | null
          to_state?: Database["public"]["Enums"]["booking_state"] | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_ref: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          metadata: Json
          request_id: string | null
          role: Database["public"]["Enums"]["message_role"]
          transcript_confidence: number | null
          user_id: string
        }
        Insert: {
          audio_ref?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          request_id?: string | null
          role: Database["public"]["Enums"]["message_role"]
          transcript_confidence?: number | null
          user_id: string
        }
        Update: {
          audio_ref?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          request_id?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          transcript_confidence?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_tasks: {
        Row: {
          assigned_to: string | null
          booking_attempt_id: string | null
          booking_id: string | null
          created_at: string
          detail: string | null
          due_at: string | null
          id: string
          kind: Database["public"]["Enums"]["ops_task_kind"]
          priority: number
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["ops_task_status"]
          title: string
          updated_at: string
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          booking_attempt_id?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ops_task_kind"]
          priority?: number
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ops_task_status"]
          title: string
          updated_at?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          booking_attempt_id?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ops_task_kind"]
          priority?: number
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ops_task_status"]
          title?: string
          updated_at?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_tasks_booking_attempt_id_fkey"
            columns: ["booking_attempt_id"]
            isOneToOne: false
            referencedRelation: "booking_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_tasks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          created_at: string
          kind: string
          label: string
          parent_slug: string | null
          slug: string
          sort_order: number
          timezone: string
        }
        Insert: {
          created_at?: string
          kind: string
          label: string
          parent_slug?: string | null
          slug: string
          sort_order?: number
          timezone?: string
        }
        Update: {
          created_at?: string
          kind?: string
          label?: string
          parent_slug?: string | null
          slug?: string
          sort_order?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["slug"]
          },
        ]
      }
      preference_signals: {
        Row: {
          agreements: number
          attribute: string
          confirmed_at: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          observations: number
          rejected_at: string | null
          source: string
          subject: string | null
          user_id: string
          value: string
        }
        Insert: {
          agreements?: number
          attribute: string
          confirmed_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          observations?: number
          rejected_at?: string | null
          source: string
          subject?: string | null
          user_id: string
          value: string
        }
        Update: {
          agreements?: number
          attribute?: string
          confirmed_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          observations?: number
          rejected_at?: string | null
          source?: string
          subject?: string | null
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "preference_signals_subject_fkey"
            columns: ["subject"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "preference_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_signals: {
        Row: {
          answer: string
          bookings_at_time: number
          comment: string | null
          created_at: string
          id: string
          price_aed: number
          user_id: string
        }
        Insert: {
          answer: string
          bookings_at_time?: number
          comment?: string | null
          created_at?: string
          id?: string
          price_aed: number
          user_id: string
        }
        Update: {
          answer?: string
          bookings_at_time?: number
          comment?: string | null
          created_at?: string
          id?: string
          price_aed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proactive_nudges: {
        Row: {
          acted_at: string | null
          created_at: string
          delivered_to: number
          id: string
          kind: Database["public"]["Enums"]["nudge_kind"]
          opened_at: string | null
          sent_at: string
          user_id: string
          venue_id: string | null
        }
        Insert: {
          acted_at?: string | null
          created_at?: string
          delivered_to?: number
          id?: string
          kind: Database["public"]["Enums"]["nudge_kind"]
          opened_at?: string | null
          sent_at?: string
          user_id: string
          venue_id?: string | null
        }
        Update: {
          acted_at?: string | null
          created_at?: string
          delivered_to?: number
          id?: string
          kind?: Database["public"]["Enums"]["nudge_kind"]
          opened_at?: string | null
          sent_at?: string
          user_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proactive_nudges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proactive_nudges_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          allergies: string[]
          created_at: string
          dietary: string[]
          id: string
          name: string
          notes: string | null
          relation: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string[]
          created_at?: string
          dietary?: string[]
          id?: string
          name: string
          notes?: string | null
          relation: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string[]
          created_at?: string
          dietary?: string[]
          id?: string
          name?: string
          notes?: string | null
          relation?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          clarifying_question: string | null
          conversation_id: string | null
          created_at: string
          id: string
          input: Json
          parsed_intent: Json | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          clarifying_question?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          input: Json
          parsed_intent?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          clarifying_question?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          input?: Json
          parsed_intent?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          price_aed: number | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_aed?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_aed?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          created_at: string
          decided_at: string | null
          distance_metres: number | null
          id: string
          outcome: Database["public"]["Enums"]["suggestion_outcome"]
          proposed_ends_at: string
          proposed_starts_at: string
          rank: number
          rationale: string
          reasoning_snapshot: Json
          request_id: string
          slot_is_verified: boolean
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          distance_metres?: number | null
          id?: string
          outcome?: Database["public"]["Enums"]["suggestion_outcome"]
          proposed_ends_at: string
          proposed_starts_at: string
          rank: number
          rationale: string
          reasoning_snapshot?: Json
          request_id: string
          slot_is_verified?: boolean
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          distance_metres?: number | null
          id?: string
          outcome?: Database["public"]["Enums"]["suggestion_outcome"]
          proposed_ends_at?: string
          proposed_starts_at?: string
          rank?: number
          rationale?: string
          reasoning_snapshot?: Json
          request_id?: string
          slot_is_verified?: boolean
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          allergies: string[]
          created_at: string
          cuisines_avoided: string[]
          cuisines_loved: string[]
          default_party_size: number
          dietary: string[]
          favourite_venue_ids: string[]
          home_zone: string | null
          notes: string | null
          preferred_zones: string[]
          price_band_max: number
          price_band_min: number
          standing_providers: Json
          updated_at: string
          user_id: string
          work_zone: string | null
        }
        Insert: {
          allergies?: string[]
          created_at?: string
          cuisines_avoided?: string[]
          cuisines_loved?: string[]
          default_party_size?: number
          dietary?: string[]
          favourite_venue_ids?: string[]
          home_zone?: string | null
          notes?: string | null
          preferred_zones?: string[]
          price_band_max?: number
          price_band_min?: number
          standing_providers?: Json
          updated_at?: string
          user_id: string
          work_zone?: string | null
        }
        Update: {
          allergies?: string[]
          created_at?: string
          cuisines_avoided?: string[]
          cuisines_loved?: string[]
          default_party_size?: number
          dietary?: string[]
          favourite_venue_ids?: string[]
          home_zone?: string | null
          notes?: string | null
          preferred_zones?: string[]
          price_band_max?: number
          price_band_min?: number
          standing_providers?: Json
          updated_at?: string
          user_id?: string
          work_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_home_zone_fkey"
            columns: ["home_zone"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_work_zone_fkey"
            columns: ["work_zone"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          calendar_sync_enabled: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          invite_code: string | null
          locale: string
          notification_prefs: Json
          onboarded_at: string | null
          phone_e164: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          calendar_sync_enabled?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          invite_code?: string | null
          locale?: string
          notification_prefs?: Json
          onboarded_at?: string | null
          phone_e164?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          calendar_sync_enabled?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invite_code?: string | null
          locale?: string
          notification_prefs?: Json
          onboarded_at?: string | null
          phone_e164?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      venue_booking_channels: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          kind: Database["public"]["Enums"]["rail_kind"]
          last_verified_at: string | null
          priority: number
          responsive_hours: Json
          sla_minutes: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          config: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          kind: Database["public"]["Enums"]["rail_kind"]
          last_verified_at?: string | null
          priority: number
          responsive_hours?: Json
          sla_minutes: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          kind?: Database["public"]["Enums"]["rail_kind"]
          last_verified_at?: string | null
          priority?: number
          responsive_hours?: Json
          sla_minutes?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_booking_channels_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone_e164: string | null
          role: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone_e164?: string | null
          role?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone_e164?: string | null
          role?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_contacts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_messages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          booking_attempt_id: string | null
          booking_id: string | null
          bsp: string | null
          bsp_message_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          drafted_by: string | null
          error_message: string | null
          id: string
          parsed_confidence: number | null
          parsed_outcome: Database["public"]["Enums"]["attempt_outcome"] | null
          payload_ref: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["venue_message_status"]
          template_name: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          booking_attempt_id?: string | null
          booking_id?: string | null
          bsp?: string | null
          bsp_message_id?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          drafted_by?: string | null
          error_message?: string | null
          id?: string
          parsed_confidence?: number | null
          parsed_outcome?: Database["public"]["Enums"]["attempt_outcome"] | null
          payload_ref?: string | null
          sent_at?: string | null
          status: Database["public"]["Enums"]["venue_message_status"]
          template_name?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          booking_attempt_id?: string | null
          booking_id?: string | null
          bsp?: string | null
          bsp_message_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          drafted_by?: string | null
          error_message?: string | null
          id?: string
          parsed_confidence?: number | null
          parsed_outcome?: Database["public"]["Enums"]["attempt_outcome"] | null
          payload_ref?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["venue_message_status"]
          template_name?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_messages_booking_attempt_id_fkey"
            columns: ["booking_attempt_id"]
            isOneToOne: false
            referencedRelation: "booking_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_policies: {
        Row: {
          blackout_windows: Json
          cancellation_notice_hours: number
          cancellation_terms: string | null
          created_at: string
          id: string
          max_lead_time_days: number
          max_party_size: number
          min_lead_time_minutes: number
          min_party_size: number
          notes: string | null
          requires_deposit: boolean
          updated_at: string
          venue_id: string
        }
        Insert: {
          blackout_windows?: Json
          cancellation_notice_hours?: number
          cancellation_terms?: string | null
          created_at?: string
          id?: string
          max_lead_time_days?: number
          max_party_size?: number
          min_lead_time_minutes?: number
          min_party_size?: number
          notes?: string | null
          requires_deposit?: boolean
          updated_at?: string
          venue_id: string
        }
        Update: {
          blackout_windows?: Json
          cancellation_notice_hours?: number
          cancellation_terms?: string | null
          created_at?: string
          id?: string
          max_lead_time_days?: number
          max_party_size?: number
          min_lead_time_minutes?: number
          min_party_size?: number
          notes?: string | null
          requires_deposit?: boolean
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_policies_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          best_times: string[]
          booking_consent_obtained_at: string | null
          created_at: string
          description: string | null
          house_note: string | null
          id: string
          is_demo: boolean
          lat: number | null
          lng: number | null
          name: string
          onboarding_status: Database["public"]["Enums"]["venue_onboarding_status"]
          opening_hours: Json
          photo_urls: string[]
          price_band: number
          tags: string[]
          updated_at: string
          vertical: string
          zone: string
        }
        Insert: {
          address?: string | null
          best_times?: string[]
          booking_consent_obtained_at?: string | null
          created_at?: string
          description?: string | null
          house_note?: string | null
          id?: string
          is_demo?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          onboarding_status?: Database["public"]["Enums"]["venue_onboarding_status"]
          opening_hours?: Json
          photo_urls?: string[]
          price_band: number
          tags?: string[]
          updated_at?: string
          vertical: string
          zone: string
        }
        Update: {
          address?: string | null
          best_times?: string[]
          booking_consent_obtained_at?: string | null
          created_at?: string
          description?: string | null
          house_note?: string | null
          id?: string
          is_demo?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          onboarding_status?: Database["public"]["Enums"]["venue_onboarding_status"]
          opening_hours?: Json
          photo_urls?: string[]
          price_band?: number
          tags?: string[]
          updated_at?: string
          vertical?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_vertical_fkey"
            columns: ["vertical"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "venues_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["slug"]
          },
        ]
      }
      webhook_events: {
        Row: {
          external_id: string
          id: string
          payload_ref: string | null
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          external_id: string
          id?: string
          payload_ref?: string | null
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          external_id?: string
          id?: string
          payload_ref?: string | null
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_booking_transition: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor"]
          p_actor_id?: string
          p_booking_id: string
          p_correlation_id?: string
          p_event: Database["public"]["Enums"]["booking_event"]
          p_evidence?: Json
          p_external_ref?: string
          p_from: Database["public"]["Enums"]["booking_state"]
          p_metadata?: Json
          p_reason?: string
          p_to: Database["public"]["Enums"]["booking_state"]
        }
        Returns: Database["public"]["Enums"]["booking_state"]
      }
      bookings_needing_reminder: {
        Args: {
          p_kind: Database["public"]["Enums"]["reminder_kind"]
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          booking_id: string
          party_size: number
          scheduled_for: string
          user_id: string
          venue_name: string
        }[]
      }
      bookings_past_sla: {
        Args: { p_now: string }
        Returns: {
          booking_id: string
          rail: Database["public"]["Enums"]["rail_kind"]
          sla_minutes: number
          status: Database["public"]["Enums"]["booking_state"]
          waited_minutes: number
        }[]
      }
      claim_webhook_event: {
        Args: {
          p_external_id: string
          p_payload_ref?: string
          p_provider: string
        }
        Returns: boolean
      }
      grant_role_by_email: {
        Args: {
          target_email: string
          target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_ops: { Args: never; Returns: boolean }
      ops_effort: {
        Args: { p_from: string; p_to: string }
        Returns: {
          bookings: number
          median_open_minutes: number
          ops_tasks: number
          tasks_per_booking: number
          week: string
        }[]
      }
      pilot_funnel: {
        Args: { p_from: string; p_to: string }
        Returns: {
          approved: number
          clarified: number
          completed: number
          confirmed: number
          confirmed_of_all: number
          confirmed_of_served: number
          requests: number
          suggested: number
        }[]
      }
      proactive_candidates: {
        Args: { p_now: string }
        Returns: {
          avg_rating: number
          days_since_visit: number
          has_upcoming: boolean
          last_nudge_at: string
          last_visit: string
          median_gap_days: number
          nudges_last_30d: number
          user_id: string
          venue_id: string
          venue_name: string
          vertical: string
          visits: number
          worst_rating: number
        }[]
      }
      record_ops_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event: string
          p_payload?: Json
          p_reason?: string
        }
        Returns: string
      }
      record_preference_signal: {
        Args: {
          p_agreed?: boolean
          p_attribute: string
          p_source: string
          p_subject: string
          p_user_id: string
          p_value: string
        }
        Returns: undefined
      }
      retention_cohorts: {
        Args: never
        Returns: {
          cohort_week: string
          returned: number
          returned_pct: number
          users: number
        }[]
      }
      time_to_confirmation: {
        Args: { p_from: string; p_to: string }
        Returns: {
          bookings: number
          median_minutes: number
          p90_minutes: number
          rail: Database["public"]["Enums"]["rail_kind"]
          target_minutes: number
        }[]
      }
      user_taste_signals: {
        Args: { p_user_id: string }
        Returns: {
          acceptance_rate: number
          accepted: number
          shown: number
          tag: string
        }[]
      }
      user_venue_history: {
        Args: { p_user_id: string }
        Returns: {
          avg_rating: number
          last_visit: string
          median_gap_days: number
          venue_id: string
          venue_name: string
          vertical: string
          visits: number
          worst_rating: number
        }[]
      }
      venue_reliability: {
        Args: never
        Returns: {
          bookings: number
          confirmed: number
          failed: number
          median_response_minutes: number
          no_show_at_venue: number
          venue_id: string
          venue_name: string
        }[]
      }
      willingness_to_pay: {
        Args: { p_price?: number }
        Returns: {
          asked: number
          maybe: number
          no: number
          price_aed: number
          yes: number
          yes_or_maybe_pct: number
          yes_pct: number
        }[]
      }
    }
    Enums: {
      actor: "user" | "ops" | "system" | "api_webhook" | "parsed_confirmation"
      app_role: "user" | "ops" | "admin"
      attempt_outcome:
        | "confirmed"
        | "alternative_offered"
        | "declined"
        | "no_response"
        | "unclear"
        | "error"
      booking_event:
        | "user_approve"
        | "start_attempt"
        | "await_venue"
        | "retry_next_rail"
        | "confirm"
        | "decline"
        | "escalate"
        | "remind"
        | "complete"
        | "cancel"
      booking_platform: "sevenrooms" | "eat_app" | "fresha" | "other"
      booking_state:
        | "draft"
        | "user_approved"
        | "attempting"
        | "pending_venue"
        | "escalated"
        | "confirmed"
        | "reminded"
        | "completed"
        | "cancelled"
        | "failed"
      day_of_week: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
      message_direction: "outbound" | "inbound"
      message_kind: "text" | "voice"
      message_role: "user" | "assistant"
      nudge_kind: "rebook_cadence" | "favourite_idle"
      ops_task_kind:
        | "manual_booking"
        | "approve_outbound_message"
        | "sla_breach"
        | "unclear_venue_reply"
        | "out_of_bounds_negotiation"
        | "venue_data_gap"
      ops_task_status: "open" | "in_progress" | "resolved" | "dismissed"
      rail_kind: "api" | "whatsapp" | "voice" | "manual"
      reminder_kind: "day_before" | "two_hours" | "rate_visit"
      request_status:
        | "received"
        | "needs_clarification"
        | "parsed"
        | "suggested"
        | "converted"
        | "abandoned"
      subscription_status:
        | "none"
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
      suggestion_outcome: "pending" | "accepted" | "rejected" | "expired"
      venue_message_status:
        | "drafted"
        | "awaiting_approval"
        | "approved"
        | "sending"
        | "sent"
        | "delivered"
        | "failed"
        | "received"
      venue_onboarding_status:
        | "lead"
        | "contacted"
        | "agreed"
        | "live"
        | "paused"
        | "lost"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor: ["user", "ops", "system", "api_webhook", "parsed_confirmation"],
      app_role: ["user", "ops", "admin"],
      attempt_outcome: [
        "confirmed",
        "alternative_offered",
        "declined",
        "no_response",
        "unclear",
        "error",
      ],
      booking_event: [
        "user_approve",
        "start_attempt",
        "await_venue",
        "retry_next_rail",
        "confirm",
        "decline",
        "escalate",
        "remind",
        "complete",
        "cancel",
      ],
      booking_platform: ["sevenrooms", "eat_app", "fresha", "other"],
      booking_state: [
        "draft",
        "user_approved",
        "attempting",
        "pending_venue",
        "escalated",
        "confirmed",
        "reminded",
        "completed",
        "cancelled",
        "failed",
      ],
      day_of_week: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      message_direction: ["outbound", "inbound"],
      message_kind: ["text", "voice"],
      message_role: ["user", "assistant"],
      nudge_kind: ["rebook_cadence", "favourite_idle"],
      ops_task_kind: [
        "manual_booking",
        "approve_outbound_message",
        "sla_breach",
        "unclear_venue_reply",
        "out_of_bounds_negotiation",
        "venue_data_gap",
      ],
      ops_task_status: ["open", "in_progress", "resolved", "dismissed"],
      rail_kind: ["api", "whatsapp", "voice", "manual"],
      reminder_kind: ["day_before", "two_hours", "rate_visit"],
      request_status: [
        "received",
        "needs_clarification",
        "parsed",
        "suggested",
        "converted",
        "abandoned",
      ],
      subscription_status: [
        "none",
        "trialing",
        "active",
        "past_due",
        "cancelled",
      ],
      suggestion_outcome: ["pending", "accepted", "rejected", "expired"],
      venue_message_status: [
        "drafted",
        "awaiting_approval",
        "approved",
        "sending",
        "sent",
        "delivered",
        "failed",
        "received",
      ],
      venue_onboarding_status: [
        "lead",
        "contacted",
        "agreed",
        "live",
        "paused",
        "lost",
      ],
    },
  },
} as const

