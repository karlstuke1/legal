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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string
          date: string
          description: string
          id: string
          keywords: string[]
          published: boolean
          read_time: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          created_by: string
          date?: string
          description?: string
          id?: string
          keywords?: string[]
          published?: boolean
          read_time?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          id?: string
          keywords?: string[]
          published?: boolean
          read_time?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          created_by: string
          id: string
          jurisdiction: Json
          matter_id: string | null
          mode: Database["public"]["Enums"]["chat_mode"]
          sources: Json
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          jurisdiction?: Json
          matter_id?: string | null
          mode?: Database["public"]["Enums"]["chat_mode"]
          sources?: Json
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          jurisdiction?: Json
          matter_id?: string | null
          mode?: Database["public"]["Enums"]["chat_mode"]
          sources?: Json
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      citations: {
        Row: {
          created_at: string
          doc_date: string | null
          doc_ref: string | null
          id: string
          message_id: string
          pinpoint: string | null
          provider: string
          snippet: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          doc_date?: string | null
          doc_ref?: string | null
          id?: string
          message_id: string
          pinpoint?: string | null
          provider: string
          snippet?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          doc_date?: string | null
          doc_ref?: string | null
          id?: string
          message_id?: string
          pinpoint?: string | null
          provider?: string
          snippet?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          chat_id: string | null
          created_at: string
          id: string
          matter_id: string | null
          mime: string
          name: string
          size: number
          storage_path: string
          uploaded_by: string
          workspace_id: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string | null
          mime: string
          name: string
          size?: number
          storage_path: string
          uploaded_by: string
          workspace_id: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string | null
          mime?: string
          name?: string
          size?: number
          storage_path?: string
          uploaded_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          chunk_index: number | null
          content: string
          content_hash: string
          created_at: string
          doc_date: string | null
          doc_ref: string | null
          embedding: string | null
          fts: unknown
          id: string
          jurisdiction: string
          metadata: Json | null
          parent_doc_id: string | null
          source_provider: string
          source_url: string | null
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          chunk_index?: number | null
          content: string
          content_hash: string
          created_at?: string
          doc_date?: string | null
          doc_ref?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          jurisdiction?: string
          metadata?: Json | null
          parent_doc_id?: string | null
          source_provider: string
          source_url?: string | null
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          chunk_index?: number | null
          content?: string
          content_hash?: string
          created_at?: string
          doc_date?: string | null
          doc_ref?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          jurisdiction?: string
          metadata?: Json | null
          parent_doc_id?: string | null
          source_provider?: string
          source_url?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_parent_doc_id_fkey"
            columns: ["parent_doc_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_analyses: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          matter_id: string
          questions: Json | null
          status: Database["public"]["Enums"]["analysis_status"]
          summary: string | null
          type: Database["public"]["Enums"]["analysis_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          matter_id: string
          questions?: Json | null
          status?: Database["public"]["Enums"]["analysis_status"]
          summary?: string | null
          type: Database["public"]["Enums"]["analysis_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          matter_id?: string
          questions?: Json | null
          status?: Database["public"]["Enums"]["analysis_status"]
          summary?: string | null
          type?: Database["public"]["Enums"]["analysis_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_analyses_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_analyses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_analysis_results: {
        Row: {
          analysis_id: string
          created_at: string
          doc_date: string | null
          doc_summary: string | null
          extracted_data: Json | null
          file_id: string
          file_name_suggestion: string | null
          id: string
          included: boolean
          sort_order: number
        }
        Insert: {
          analysis_id: string
          created_at?: string
          doc_date?: string | null
          doc_summary?: string | null
          extracted_data?: Json | null
          file_id: string
          file_name_suggestion?: string | null
          id?: string
          included?: boolean
          sort_order?: number
        }
        Update: {
          analysis_id?: string
          created_at?: string
          doc_date?: string | null
          doc_summary?: string | null
          extracted_data?: Json | null
          file_id?: string
          file_name_suggestion?: string | null
          id?: string
          included?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "matter_analysis_results_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "matter_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_analysis_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          matter_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          id?: string
          matter_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          matter_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_notes_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          matter_id: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          matter_id: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          matter_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_tags_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matters: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          metadata: Json | null
          rating: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          metadata?: Json | null
          rating: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          metadata?: Json | null
          rating?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          content: Json
          created_at: string
          id: string
          role: string
        }
        Insert: {
          chat_id: string
          content?: Json
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          chat_id?: string
          content?: Json
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          message_id: string
          note: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          message_id: string
          note?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          message_id?: string
          note?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          current_period_end: string | null
          hard_limit: boolean
          id: string
          monthly_budget_cents: number
          monthly_pseudonymizations_limit: number
          monthly_queries_limit: number
          monthly_uploads_limit: number
          plan: string
          seats_limit: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          hard_limit?: boolean
          id?: string
          monthly_budget_cents?: number
          monthly_pseudonymizations_limit?: number
          monthly_queries_limit?: number
          monthly_uploads_limit?: number
          plan?: string
          seats_limit?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          hard_limit?: boolean
          id?: string
          monthly_budget_cents?: number
          monthly_pseudonymizations_limit?: number
          monthly_queries_limit?: number
          monthly_uploads_limit?: number
          plan?: string
          seats_limit?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auto_pseudonymize_chat: boolean
          created_at: string
          custom_instructions: string | null
          default_jurisdiction: Json | null
          default_legal_area: string | null
          default_mode: Database["public"]["Enums"]["chat_mode"] | null
          default_sources: Json | null
          display_name: string | null
          id: string
          onboarding_completed: boolean
          privacy_no_store: boolean | null
          response_style: string | null
          updated_at: string
          user_id: string
          user_role: string | null
        }
        Insert: {
          auto_pseudonymize_chat?: boolean
          created_at?: string
          custom_instructions?: string | null
          default_jurisdiction?: Json | null
          default_legal_area?: string | null
          default_mode?: Database["public"]["Enums"]["chat_mode"] | null
          default_sources?: Json | null
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          privacy_no_store?: boolean | null
          response_style?: string | null
          updated_at?: string
          user_id: string
          user_role?: string | null
        }
        Update: {
          auto_pseudonymize_chat?: boolean
          created_at?: string
          custom_instructions?: string | null
          default_jurisdiction?: Json | null
          default_legal_area?: string | null
          default_mode?: Database["public"]["Enums"]["chat_mode"] | null
          default_sources?: Json | null
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          privacy_no_store?: boolean | null
          response_style?: string | null
          updated_at?: string
          user_id?: string
          user_role?: string | null
        }
        Relationships: []
      }
      pseudonymization_logs: {
        Row: {
          created_at: string
          entities_found: Json | null
          file_id: string
          id: string
          original_text: string | null
          pseudonymized_text: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          entities_found?: Json | null
          file_id: string
          id?: string
          original_text?: string | null
          pseudonymized_text?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          entities_found?: Json | null
          file_id?: string
          id?: string
          original_text?: string | null
          pseudonymized_text?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pseudonymization_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pseudonymization_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_payouts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          referral_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          referral_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          referral_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          referred_user_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referred_user_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      retrieval_logs: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          message_id: string | null
          provider: string
          query: string
          status: string
          top_results: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          provider: string
          query: string
          status?: string
          top_results?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          provider?: string
          query?: string
          status?: string
          top_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_chats: {
        Row: {
          chat_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          token: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_chats_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          description: string
          id: string
          status: string
          subject: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          status?: string
          subject: string
          type?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          status?: string
          subject?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          chat_id: string | null
          cost_estimate: number
          created_at: string
          id: string
          input_tokens: number
          message_id: string | null
          model: string
          output_tokens: number
          workspace_id: string
        }
        Insert: {
          chat_id?: string | null
          cost_estimate?: number
          created_at?: string
          id?: string
          input_tokens?: number
          message_id?: string | null
          model: string
          output_tokens?: number
          workspace_id: string
        }
        Update: {
          chat_id?: string | null
          cost_estimate?: number
          created_at?: string
          id?: string
          input_tokens?: number
          message_id?: string | null
          model?: string
          output_tokens?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_audit_logs: { Args: never; Returns: undefined }
      cleanup_old_retrieval_logs: { Args: never; Returns: undefined }
      cleanup_old_usage_ledger: { Args: never; Returns: undefined }
      cleanup_rate_limit_log: { Args: never; Returns: undefined }
      get_auth_email: { Args: never; Returns: string }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_member: {
        Args: { _chat_id: string; _user_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      match_legal_documents: {
        Args: {
          match_count?: number
          match_jurisdiction?: string
          match_provider?: string
          match_threshold?: number
          match_workspace_id?: string
          query_embedding: string
          query_text?: string
        }
        Returns: {
          combined_score: number
          content: string
          doc_date: string
          doc_ref: string
          fts_rank: number
          id: string
          jurisdiction: string
          metadata: Json
          similarity: number
          source_provider: string
          source_url: string
          title: string
        }[]
      }
    }
    Enums: {
      analysis_status: "pending" | "processing" | "done" | "error"
      analysis_type: "flow" | "extraction"
      app_role: "admin" | "user"
      chat_mode:
        | "research"
        | "document_review"
        | "draft"
        | "playbook"
        | "vault"
        | "exam"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
      analysis_status: ["pending", "processing", "done", "error"],
      analysis_type: ["flow", "extraction"],
      app_role: ["admin", "user"],
      chat_mode: [
        "research",
        "document_review",
        "draft",
        "playbook",
        "vault",
        "exam",
      ],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
