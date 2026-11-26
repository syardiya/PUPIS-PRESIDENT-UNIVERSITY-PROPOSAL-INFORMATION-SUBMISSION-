export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "student" | "staff" | "admin";

export type ProposalStatusDb =
  | "draft"
  | "pending_ttd"
  | "needs_revision"
  | "approved"
  | "rejected";

export type SignerStatusDb =
  | "pending"
  | "signed"
  | "rejected"
  | "revision_requested";

export type SignatureTypeDb = "drawn" | "stamp";

export type RevisionActionTypeDb =
  | "submitted"
  | "signed"
  | "rejected"
  | "revision_requested"
  | "resubmitted";

export type AttachmentKindDb = "primary_proposal_pdf" | "supporting";

export interface BudgetLineItemDb {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          organization_unit: string | null;
          role: UserRole;
          signature_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          organization_unit?: string | null;
          role?: UserRole;
          signature_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          organization_unit?: string | null;
          role?: UserRole;
          signature_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          id: string;
          proposal_code: string;
          submitter_id: string;
          title: string;
          activity_type: string | null;
          organization_name: string;
          person_in_charge: string;
          event_date: string;
          event_end_date: string | null;
          venue: string;
          background: string | null;
          objectives: string | null;
          target_audience: string | null;
          budget_items: Json;
          total_budget: number;
          status: ProposalStatusDb;
          current_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          proposal_code: string;
          submitter_id: string;
          title?: string;
          activity_type?: string | null;
          organization_name?: string;
          person_in_charge?: string;
          event_date?: string;
          event_end_date?: string | null;
          venue?: string;
          background?: string | null;
          objectives?: string | null;
          target_audience?: string | null;
          budget_items?: Json;
          total_budget?: number;
          status?: ProposalStatusDb;
          current_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          proposal_code?: string;
          submitter_id?: string;
          title?: string;
          activity_type?: string | null;
          organization_name?: string;
          person_in_charge?: string;
          event_date?: string;
          event_end_date?: string | null;
          venue?: string;
          background?: string | null;
          objectives?: string | null;
          target_audience?: string | null;
          budget_items?: Json;
          total_budget?: number;
          status?: ProposalStatusDb;
          current_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposals_submitter_id_fkey";
            columns: ["submitter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_versions: {
        Row: {
          id: string;
          proposal_id: string;
          version_number: number;
          budget_breakdown: string;
          executive_summary: string;
          pdf_storage_path: string;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          version_number: number;
          budget_breakdown: string;
          executive_summary: string;
          pdf_storage_path: string;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          version_number?: number;
          budget_breakdown?: string;
          executive_summary?: string;
          pdf_storage_path?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_signers: {
        Row: {
          id: string;
          proposal_id: string;
          approver_id: string;
          role_title: string;
          step_order: number;
          status: SignerStatusDb;
          signature_type: SignatureTypeDb | null;
          signature_storage_path: string | null;
          signed_on_version: number | null;
          signed_at: string | null;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          approver_id: string;
          role_title?: string;
          step_order: number;
          status?: SignerStatusDb;
          signature_type?: SignatureTypeDb | null;
          signature_storage_path?: string | null;
          signed_on_version?: number | null;
          signed_at?: string | null;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          approver_id?: string;
          role_title?: string;
          step_order?: number;
          status?: SignerStatusDb;
          signature_type?: SignatureTypeDb | null;
          signature_storage_path?: string | null;
          signed_on_version?: number | null;
          signed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_signers_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposal_signers_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_cc: {
        Row: {
          id: string;
          proposal_id: string;
          stakeholder_id: string;
          added_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          stakeholder_id: string;
          added_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          stakeholder_id?: string;
          added_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_cc_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposal_cc_stakeholder_id_fkey";
            columns: ["stakeholder_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_attachments: {
        Row: {
          id: string;
          proposal_id: string;
          uploaded_by: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          storage_path: string;
          attachment_kind: AttachmentKindDb;
          version_number: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          uploaded_by: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          storage_path: string;
          attachment_kind?: AttachmentKindDb;
          version_number?: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "proposal_attachments_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposal_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      revision_logs: {
        Row: {
          id: string;
          proposal_id: string;
          actor_id: string;
          from_version: number | null;
          to_version: number;
          action_type: RevisionActionTypeDb;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          actor_id: string;
          from_version?: number | null;
          to_version: number;
          action_type: RevisionActionTypeDb;
          note?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "revision_logs_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "revision_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          proposal_id: string | null;
          title: string;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          proposal_id?: string | null;
          title: string;
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          is_read?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: { p_user_id?: string };
        Returns: boolean;
      };
      is_proposal_submitter: {
        Args: { p_proposal_id: string; p_user_id?: string };
        Returns: boolean;
      };
      is_proposal_editable_by_submitter: {
        Args: { p_proposal_id: string; p_user_id?: string };
        Returns: boolean;
      };
      is_proposal_signer: {
        Args: { p_proposal_id: string; p_user_id?: string };
        Returns: boolean;
      };
      can_view_proposal: {
        Args: { p_proposal_id: string; p_user_id?: string };
        Returns: boolean;
      };
      can_view_signature_object: {
        Args: { p_object_name: string; p_user_id?: string };
        Returns: boolean;
      };
      try_parse_uuid: {
        Args: { p_value: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
