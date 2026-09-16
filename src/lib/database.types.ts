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
      cards: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avoid_notes: string | null
          brief_snapshot: Json | null
          brief_text: string
          client_id: string
          client_submission: Json
          created_at: string
          current_generation_id: string | null
          due_on: string | null
          garment_color: string | null
          id: string
          last_error: string | null
          n8n_execution_id: string | null
          placement: string | null
          previous_stage: Database["public"]["Enums"]["card_stage"] | null
          print_text: Json
          reference_analysis: Json | null
          reference_paths: string[]
          similarity_tier: number | null
          stage: Database["public"]["Enums"]["card_stage"]
          stage_entered_at: string
          stage_note: string | null
          style_card_id: string | null
          style_card_version: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avoid_notes?: string | null
          brief_snapshot?: Json | null
          brief_text: string
          client_id: string
          client_submission?: Json
          created_at?: string
          current_generation_id?: string | null
          due_on?: string | null
          garment_color?: string | null
          id?: string
          last_error?: string | null
          n8n_execution_id?: string | null
          placement?: string | null
          previous_stage?: Database["public"]["Enums"]["card_stage"] | null
          print_text?: Json
          reference_analysis?: Json | null
          reference_paths?: string[]
          similarity_tier?: number | null
          stage?: Database["public"]["Enums"]["card_stage"]
          stage_entered_at?: string
          stage_note?: string | null
          style_card_id?: string | null
          style_card_version?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avoid_notes?: string | null
          brief_snapshot?: Json | null
          brief_text?: string
          client_id?: string
          client_submission?: Json
          created_at?: string
          current_generation_id?: string | null
          due_on?: string | null
          garment_color?: string | null
          id?: string
          last_error?: string | null
          n8n_execution_id?: string | null
          placement?: string | null
          previous_stage?: Database["public"]["Enums"]["card_stage"] | null
          print_text?: Json
          reference_analysis?: Json | null
          reference_paths?: string[]
          similarity_tier?: number | null
          stage?: Database["public"]["Enums"]["card_stage"]
          stage_entered_at?: string
          stage_note?: string | null
          style_card_id?: string | null
          style_card_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_current_generation_fk"
            columns: ["current_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_style_card_id_fkey"
            columns: ["style_card_id"]
            isOneToOne: false
            referencedRelation: "style_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          created_at: string
          default_similarity_tier: number
          form_token: string
          garment_colors: string[]
          id: string
          model_override: string | null
          name: string
          notes: string | null
          target_px_h: number
          target_px_w: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_similarity_tier?: number
          form_token?: string
          garment_colors?: string[]
          id?: string
          model_override?: string | null
          name: string
          notes?: string | null
          target_px_h?: number
          target_px_w?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_similarity_tier?: number
          form_token?: string
          garment_colors?: string[]
          id?: string
          model_override?: string | null
          name?: string
          notes?: string | null
          target_px_h?: number
          target_px_w?: number
          updated_at?: string
        }
        Relationships: []
      }
      design_lessons: {
        Row: {
          active: boolean
          category: string
          client_id: string | null
          created_at: string
          id: string
          rule: string
          source_generation_ids: string[]
        }
        Insert: {
          active?: boolean
          category: string
          client_id?: string | null
          created_at?: string
          id?: string
          rule: string
          source_generation_ids?: string[]
        }
        Update: {
          active?: boolean
          category?: string
          client_id?: string | null
          created_at?: string
          id?: string
          rule?: string
          source_generation_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "design_lessons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_job_events: {
        Row: {
          at: string
          id: number
          job_id: string
          message: string | null
          ok: boolean
          step: string
        }
        Insert: {
          at?: string
          id?: number
          job_id: string
          message?: string | null
          ok?: boolean
          step: string
        }
        Update: {
          at?: string
          id?: number
          job_id?: string
          message?: string | null
          ok?: boolean
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "fin_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_jobs: {
        Row: {
          attempt: number
          card_id: string
          created_at: string
          final_path: string | null
          final_upload_token: string | null
          finished_at: string | null
          generation_id: string
          id: string
          last_error: string | null
          metrics: Json | null
          n8n_execution_id: string | null
          original_url: string | null
          prep_path: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          attempt?: number
          card_id: string
          created_at?: string
          final_path?: string | null
          final_upload_token?: string | null
          finished_at?: string | null
          generation_id: string
          id?: string
          last_error?: string | null
          metrics?: Json | null
          n8n_execution_id?: string | null
          original_url?: string | null
          prep_path?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          attempt?: number
          card_id?: string
          created_at?: string
          final_path?: string | null
          final_upload_token?: string | null
          finished_at?: string | null
          generation_id?: string
          id?: string
          last_error?: string | null
          metrics?: Json | null
          n8n_execution_id?: string | null
          original_url?: string | null
          prep_path?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_jobs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_jobs_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          attempt: number
          brief_snapshot: Json | null
          card_id: string
          created_at: string
          drift_pct: number | null
          edit_instruction: string | null
          final_prompt: string | null
          finished_at: string | null
          id: string
          image_path: string | null
          kind: Database["public"]["Enums"]["generation_kind"]
          last_error: string | null
          magic_prompt_json: Json | null
          mask_path: string | null
          model: string | null
          n8n_execution_id: string | null
          needs_regen: boolean | null
          new_text: string | null
          old_text: string | null
          parent_generation_id: string | null
          qc_report: Json | null
          rejection_note: string | null
          rejection_reason:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at: string | null
          reviewed_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          style_card_id: string | null
          style_card_snapshot: Json | null
          style_card_version: number | null
          text_elements: Json | null
          updated_at: string
          vendor: string | null
          vendor_job_id: string | null
        }
        Insert: {
          attempt?: number
          brief_snapshot?: Json | null
          card_id: string
          created_at?: string
          drift_pct?: number | null
          edit_instruction?: string | null
          final_prompt?: string | null
          finished_at?: string | null
          id?: string
          image_path?: string | null
          kind?: Database["public"]["Enums"]["generation_kind"]
          last_error?: string | null
          magic_prompt_json?: Json | null
          mask_path?: string | null
          model?: string | null
          n8n_execution_id?: string | null
          needs_regen?: boolean | null
          new_text?: string | null
          old_text?: string | null
          parent_generation_id?: string | null
          qc_report?: Json | null
          rejection_note?: string | null
          rejection_reason?:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          style_card_id?: string | null
          style_card_snapshot?: Json | null
          style_card_version?: number | null
          text_elements?: Json | null
          updated_at?: string
          vendor?: string | null
          vendor_job_id?: string | null
        }
        Update: {
          attempt?: number
          brief_snapshot?: Json | null
          card_id?: string
          created_at?: string
          drift_pct?: number | null
          edit_instruction?: string | null
          final_prompt?: string | null
          finished_at?: string | null
          id?: string
          image_path?: string | null
          kind?: Database["public"]["Enums"]["generation_kind"]
          last_error?: string | null
          magic_prompt_json?: Json | null
          mask_path?: string | null
          model?: string | null
          n8n_execution_id?: string | null
          needs_regen?: boolean | null
          new_text?: string | null
          old_text?: string | null
          parent_generation_id?: string | null
          qc_report?: Json | null
          rejection_note?: string | null
          rejection_reason?:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          style_card_id?: string | null
          style_card_snapshot?: Json | null
          style_card_version?: number | null
          text_elements?: Json | null
          updated_at?: string
          vendor?: string | null
          vendor_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_parent_generation_id_fkey"
            columns: ["parent_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_style_card_id_fkey"
            columns: ["style_card_id"]
            isOneToOne: false
            referencedRelation: "style_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          active: boolean
          body: string
          created_at: string
          id: string
          slug: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          active?: boolean
          body: string
          created_at?: string
          id?: string
          slug: string
          version: number
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          slug?: string
          version?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: number
          max_active_finish: number
          max_active_generations: number
          n8n_base_url: string
          per_card_price_usd: number
          pipeline_paused: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          max_active_finish?: number
          max_active_generations?: number
          n8n_base_url?: string
          per_card_price_usd?: number
          pipeline_paused?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          max_active_finish?: number
          max_active_generations?: number
          n8n_base_url?: string
          per_card_price_usd?: number
          pipeline_paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      style_cards: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          json: Json
          locked_at: string | null
          locked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["style_card_status"]
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          json?: Json
          locked_at?: string | null
          locked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["style_card_status"]
          version: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          json?: Json
          locked_at?: string | null
          locked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["style_card_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "style_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_generation: {
        Args: {
          p_final_upload_token?: string
          p_generation_id: string
          p_original_url?: string
        }
        Returns: {
          attempt: number
          card_id: string
          created_at: string
          final_path: string | null
          final_upload_token: string | null
          finished_at: string | null
          generation_id: string
          id: string
          last_error: string | null
          metrics: Json | null
          n8n_execution_id: string | null
          original_url: string | null
          prep_path: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fin_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_card: {
        Args: { p_card_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          avoid_notes: string | null
          brief_snapshot: Json | null
          brief_text: string
          client_id: string
          client_submission: Json
          created_at: string
          current_generation_id: string | null
          due_on: string | null
          garment_color: string | null
          id: string
          last_error: string | null
          n8n_execution_id: string | null
          placement: string | null
          previous_stage: Database["public"]["Enums"]["card_stage"] | null
          print_text: Json
          reference_analysis: Json | null
          reference_paths: string[]
          similarity_tier: number | null
          stage: Database["public"]["Enums"]["card_stage"]
          stage_entered_at: string
          stage_note: string | null
          style_card_id: string | null
          style_card_version: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_generations: {
        Args: { p_max?: number }
        Returns: {
          attempt: number
          brief_snapshot: Json | null
          card_id: string
          created_at: string
          drift_pct: number | null
          edit_instruction: string | null
          final_prompt: string | null
          finished_at: string | null
          id: string
          image_path: string | null
          kind: Database["public"]["Enums"]["generation_kind"]
          last_error: string | null
          magic_prompt_json: Json | null
          mask_path: string | null
          model: string | null
          n8n_execution_id: string | null
          needs_regen: boolean | null
          new_text: string | null
          old_text: string | null
          parent_generation_id: string | null
          qc_report: Json | null
          rejection_note: string | null
          rejection_reason:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at: string | null
          reviewed_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          style_card_id: string | null
          style_card_snapshot: Json | null
          style_card_version: number | null
          text_elements: Json | null
          updated_at: string
          vendor: string | null
          vendor_job_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "generations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_style_card: {
        Args: { p_client_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          json: Json
          locked_at: string | null
          locked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["style_card_status"]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "style_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_card: {
        Args: { p_card_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          avoid_notes: string | null
          brief_snapshot: Json | null
          brief_text: string
          client_id: string
          client_submission: Json
          created_at: string
          current_generation_id: string | null
          due_on: string | null
          garment_color: string | null
          id: string
          last_error: string | null
          n8n_execution_id: string | null
          placement: string | null
          previous_stage: Database["public"]["Enums"]["card_stage"] | null
          print_text: Json
          reference_analysis: Json | null
          reference_paths: string[]
          similarity_tier: number | null
          stage: Database["public"]["Enums"]["card_stage"]
          stage_entered_at: string
          stage_note: string | null
          style_card_id: string | null
          style_card_version: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fin_claim_jobs: {
        Args: { p_max?: number }
        Returns: {
          attempt: number
          card_id: string
          created_at: string
          final_path: string | null
          final_upload_token: string | null
          finished_at: string | null
          generation_id: string
          id: string
          last_error: string | null
          metrics: Json | null
          n8n_execution_id: string | null
          original_url: string | null
          prep_path: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fin_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fin_job_update: {
        Args: {
          p_event?: string
          p_fields?: Json
          p_job_id: string
          p_message?: string
          p_ok?: boolean
          p_status: Database["public"]["Enums"]["job_status"]
        }
        Returns: {
          attempt: number
          card_id: string
          created_at: string
          final_path: string | null
          final_upload_token: string | null
          finished_at: string | null
          generation_id: string
          id: string
          last_error: string | null
          metrics: Json | null
          n8n_execution_id: string | null
          original_url: string | null
          prep_path: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fin_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_lead: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      lock_style_card: {
        Args: { p_note?: string; p_style_card_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          json: Json
          locked_at: string | null
          locked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["style_card_status"]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "style_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_card: {
        Args: {
          p_card_id: string
          p_force?: boolean
          p_note?: string
          p_stage: Database["public"]["Enums"]["card_stage"]
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          avoid_notes: string | null
          brief_snapshot: Json | null
          brief_text: string
          client_id: string
          client_submission: Json
          created_at: string
          current_generation_id: string | null
          due_on: string | null
          garment_color: string | null
          id: string
          last_error: string | null
          n8n_execution_id: string | null
          placement: string | null
          previous_stage: Database["public"]["Enums"]["card_stage"] | null
          print_text: Json
          reference_analysis: Json | null
          reference_paths: string[]
          similarity_tier: number | null
          stage: Database["public"]["Enums"]["card_stage"]
          stage_entered_at: string
          stage_note: string | null
          style_card_id: string | null
          style_card_version: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      new_style_card_version: {
        Args: { p_client_id: string; p_json?: Json }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          json: Json
          locked_at: string | null
          locked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["style_card_status"]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "style_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refs_upload_ok: { Args: { p_name: string }; Returns: boolean }
      request_edit: {
        Args: {
          p_generation_id: string
          p_kind: Database["public"]["Enums"]["generation_kind"]
          p_payload?: Json
        }
        Returns: {
          attempt: number
          brief_snapshot: Json | null
          card_id: string
          created_at: string
          drift_pct: number | null
          edit_instruction: string | null
          final_prompt: string | null
          finished_at: string | null
          id: string
          image_path: string | null
          kind: Database["public"]["Enums"]["generation_kind"]
          last_error: string | null
          magic_prompt_json: Json | null
          mask_path: string | null
          model: string | null
          n8n_execution_id: string | null
          needs_regen: boolean | null
          new_text: string | null
          old_text: string | null
          parent_generation_id: string | null
          qc_report: Json | null
          rejection_note: string | null
          rejection_reason:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at: string | null
          reviewed_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          style_card_id: string | null
          style_card_snapshot: Json | null
          style_card_version: number | null
          text_elements: Json | null
          updated_at: string
          vendor: string | null
          vendor_job_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "generations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      requeue_stale: {
        Args: never
        Returns: {
          fin_failed: number
          fin_requeued: number
          generations_failed: number
          generations_requeued: number
        }[]
      }
      resolve_form_token: {
        Args: { p_token: string }
        Returns: {
          client_id: string
          client_name: string
          garment_colors: string[]
        }[]
      }
      retry_card: {
        Args: { p_card_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          avoid_notes: string | null
          brief_snapshot: Json | null
          brief_text: string
          client_id: string
          client_submission: Json
          created_at: string
          current_generation_id: string | null
          due_on: string | null
          garment_color: string | null
          id: string
          last_error: string | null
          n8n_execution_id: string | null
          placement: string | null
          previous_stage: Database["public"]["Enums"]["card_stage"] | null
          print_text: Json
          reference_analysis: Json | null
          reference_paths: string[]
          similarity_tier: number | null
          stage: Database["public"]["Enums"]["card_stage"]
          stage_entered_at: string
          stage_note: string | null
          style_card_id: string | null
          style_card_version: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_current_generation: {
        Args: { p_generation_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          avoid_notes: string | null
          brief_snapshot: Json | null
          brief_text: string
          client_id: string
          client_submission: Json
          created_at: string
          current_generation_id: string | null
          due_on: string | null
          garment_color: string | null
          id: string
          last_error: string | null
          n8n_execution_id: string | null
          placement: string | null
          previous_stage: Database["public"]["Enums"]["card_stage"] | null
          print_text: Json
          reference_analysis: Json | null
          reference_paths: string[]
          similarity_tier: number | null
          stage: Database["public"]["Enums"]["card_stage"]
          stage_entered_at: string
          stage_note: string | null
          style_card_id: string | null
          style_card_version: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stage_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["card_stage"]
          p_to: Database["public"]["Enums"]["card_stage"]
        }
        Returns: boolean
      }
      start_brief: { Args: { p_token: string }; Returns: Json }
      studio_notify: { Args: { p_body: Json; p_path: string }; Returns: number }
      studio_secret_ok: { Args: never; Returns: boolean }
      studio_sweep: { Args: never; Returns: Json }
      submit_brief: {
        Args: {
          p_brief: string
          p_card_id: string
          p_due_on?: string
          p_garment_color: string
          p_placement: string
          p_print_text: Json
          p_reference_paths: string[]
          p_token: string
        }
        Returns: string
      }
    }
    Enums: {
      card_stage:
        | "intake"
        | "review"
        | "approved"
        | "generating"
        | "needs_review"
        | "editing"
        | "finishing"
        | "delivered"
        | "waiting"
        | "failed"
      generation_kind: "generate" | "edit_text" | "edit_region" | "regenerate"
      job_status: "queued" | "dispatched" | "working" | "done" | "failed"
      rejection_reason:
        | "text_wrong"
        | "spelling"
        | "colour"
        | "style_drift"
        | "subject"
        | "background_artifact"
        | "placement"
        | "other"
      staff_role: "designer" | "lead"
      style_card_status: "draft" | "locked"
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
      card_stage: [
        "intake",
        "review",
        "approved",
        "generating",
        "needs_review",
        "editing",
        "finishing",
        "delivered",
        "waiting",
        "failed",
      ],
      generation_kind: ["generate", "edit_text", "edit_region", "regenerate"],
      job_status: ["queued", "dispatched", "working", "done", "failed"],
      rejection_reason: [
        "text_wrong",
        "spelling",
        "colour",
        "style_drift",
        "subject",
        "background_artifact",
        "placement",
        "other",
      ],
      staff_role: ["designer", "lead"],
      style_card_status: ["draft", "locked"],
    },
  },
} as const
