// Types for the external operational database

export type InventoryMode = 'unclassified' | 'snapshot' | 'trusted_small_snapshot' | 'drop';
export type EventSeverity = 'info' | 'warn' | 'error';
export type CorridorSide = 'origin' | 'destination' | 'both';
export type LegStatus = 'active' | 'sold' | 'expired';
export type OperatorSourceType = 'email' | 'flyeasy' | 'jetinsight' | 'other_web';

export interface OperatorSource {
  id: string;
  operator_id: string;
  source_type: OperatorSourceType;
  enabled: boolean;
  source_config: Record<string, unknown> | null;
  poll_interval_minutes: number | null;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  failure_streak: number;
  created_at: string;
  updated_at: string;
}

export interface Operator {
  id: string;
  name: string;
  inventory_mode: InventoryMode;
  verified: boolean;
  notes: string | null;
  email_addresses: string[] | null;
  default_currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperatorAlias {
  id: string;
  operator_id: string;
  alias: string;
  created_at: string;
}

export interface OperatorInventoryRun {
  id: string;
  operator_id: string;
  received_at: string;
  seen_external_leg_ids: string[] | null;
}

export interface SystemEvent {
  id: string;
  created_at: string;
  event_type: string;
  severity: EventSeverity;
  observed_at: string;
  source_email_id: string | null;
  operator_id: string | null;
  payload: Record<string, unknown>;
  reason: string | null;
  operator_name?: string | null;
}

export interface AircraftCategory {
  id: string;
  display_name: string;
  sort_order?: number;
  created_at: string;
}

export interface AircraftType {
  id: string;
  manufacturer: string;
  model: string;
  category_id: string | null;
  category_name?: string;
  pax_capacity: number | null;
  range_nm: number | null;
  active: boolean;
  exterior_image_path: string | null;
  interior_image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface AircraftTypeAlias {
  id: string;
  aircraft_type_id: string;
  alias: string;
  created_at: string;
}

export interface Airport {
  id: string;
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  corridor_tags: string[] | null;
  admin_rank?: number | null;
  admin_exclude_from_search: boolean;
  search_city_override?: string | null;
  created_at: string;
  updated_at: string;
}

export type CorridorPurpose = 'expansion' | 'ingestion';

export interface Corridor {
  id: string;
  display_name: string;
  slug: string | null;
  purpose: CorridorPurpose;
  user_selectable: boolean;
  expansion_parent_id: string | null;
  picker_rank: number | null;
  synonyms: string[] | null;
  tag_rules: Record<string, unknown> | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// View for corridor list with computed fields
export interface CorridorSummary {
  id: string;
  display_name: string;
  slug: string | null;
  purpose: CorridorPurpose;
  user_selectable: boolean;
  expansion_parent_id: string | null;
  expansion_parent_display_name: string | null;
  picker_rank: number | null;
  synonyms: string[] | null;
  notes: string | null;
  active: boolean;
  airport_count: number;
  created_at: string;
  updated_at: string;
}

// Validation result from admin_corridor_validate_v1
export interface CorridorValidationIssue {
  severity: 'error' | 'warn' | 'info';
  issue: string;
  details: string | null;
}

export interface CorridorAirport {
  corridor_id: string;
  airport_code: string;
  side: CorridorSide;
  priority: number;
  created_at: string;
}

export interface OperatorSoldPolicy {
  operator_id: string;
  enabled: boolean;
  snapshot_trust_level: string | null;
  min_seen_hard: number | null;
  min_seen_review_low: number | null;
  min_seen_review_high: number | null;
  ratio_threshold: number | null;
  lookback_days: number | null;
  max_partial_streak: number | null;
  created_at: string;
  updated_at: string;
}

export interface OperatorSnapshotState {
  operator_id: string;
  last_good_snapshot_at: string | null;
  last_good_seen_count: number | null;
  partial_streak: number;
  updated_at: string;
}

export interface WorkflowLock {
  id: string;
  locked_at: string;
}

export interface EmptyLeg {
  id: string;
  operator_id: string;
  departure_airport_icao: string | null;
  arrival_airport_icao: string | null;
  departure_date_start: string;
  departure_date_end: string;
  departure_time_local: string | null;
  time_window: string | null;
  aircraft_model: string | null;
  aircraft_category: string | null;
  aircraft_type_id: string | null;
  price: number | null;
  price_currency: string | null;
  notes: string | null;
  first_seen_at: string;
  last_seen_at: string;
  status: LegStatus;
  sold_detected_at: string | null;
  confidence_score: number | null;
  source_email_id: string;
  created_at: string | null;
  departure_location_type: 'airport' | 'corridor';
  arrival_location_type: 'airport' | 'corridor';
  departure_corridor: string | null;
  arrival_corridor: string | null;
  departure_location_raw: string | null;
  arrival_location_raw: string | null;
  operator_name_raw: string | null;
  operator_match_reason: string | null;
  operator_match_confidence: number | null;
  external_leg_id: string;
}

// Database schema type for the Supabase client
export interface ExternalDatabase {
  public: {
    Tables: {
      operators: {
        Row: Operator;
        Insert: never;
        Update: never;
      };
      operator_aliases: {
        Row: OperatorAlias;
        Insert: never;
        Update: never;
      };
      operator_inventory_runs: {
        Row: OperatorInventoryRun;
        Insert: never;
        Update: never;
      };
      operator_sources: {
        Row: OperatorSource;
        Insert: never;
        Update: never;
      };
      system_events: {
        Row: SystemEvent;
        Insert: never;
        Update: never;
      };
      aircraft_categories: {
        Row: AircraftCategory;
        Insert: never;
        Update: never;
      };
      aircraft_types: {
        Row: AircraftType;
        Insert: never;
        Update: never;
      };
      aircraft_type_aliases: {
        Row: AircraftTypeAlias;
        Insert: never;
        Update: never;
      };
      airports: {
        Row: Airport;
        Insert: never;
        Update: never;
      };
      corridors: {
        Row: Corridor;
        Insert: never;
        Update: never;
      };
      corridor_airports: {
        Row: CorridorAirport;
        Insert: never;
        Update: never;
      };
      empty_legs: {
        Row: EmptyLeg;
        Insert: never;
        Update: never;
      };
    };
    Functions: {
      admin_corridor_upsert_v2: {
        Args: {
          p_id: string;
          p_display_name: string;
          p_purpose: CorridorPurpose;
          p_user_selectable?: boolean;
          p_expansion_parent_id?: string | null;
          p_picker_rank?: number | null;
          p_synonyms?: string[];
          p_notes?: string | null;
          p_active?: boolean;
          p_slug?: string | null;
        };
        Returns: Corridor;
      };
      admin_corridor_set_active_v2: {
        Args: {
          p_id: string;
          p_active: boolean;
        };
        Returns: { updated_count: number };
      };
      admin_corridor_airport_upsert_v2: {
        Args: {
          p_corridor_id: string;
          p_airport_code: string;
          p_side: CorridorSide;
          p_priority?: number;
        };
        Returns: CorridorAirport;
      };
      admin_corridor_airport_remove_v2: {
        Args: {
          p_corridor_id: string;
          p_airport_code: string;
        };
        Returns: { deleted_count: number };
      };
      admin_corridor_validate_v1: {
        Args: Record<string, never>;
        Returns: CorridorValidationIssue[];
      };
      admin_airports_batch_add_tags: {
        Args: {
          p_airport_ids: string[];
          p_tags: string[];
        };
        Returns: { updated_count: number };
      };
      admin_airports_batch_remove_tags: {
        Args: {
          p_airport_ids: string[];
          p_tags: string[];
        };
        Returns: { updated_count: number };
      };
      admin_airports_batch_set_admin_rank: {
        Args: {
          p_airport_ids: string[];
          p_admin_rank: number;
        };
        Returns: { updated_count: number };
      };
      admin_airports_batch_set_exclude_from_search: {
        Args: {
          p_airport_ids: string[];
          p_exclude: boolean;
        };
        Returns: { updated_count: number };
      };
      admin_operator_set_inventory_mode: {
        Args: {
          p_operator_id: string;
          p_inventory_mode: InventoryMode;
        };
        Returns: { updated_count: number };
      };
      admin_operator_set_verified: {
        Args: {
          p_operator_id: string;
          p_verified: boolean;
        };
        Returns: { updated_count: number };
      };
      admin_aircraft_type_create: {
        Args: {
          p_manufacturer: string;
          p_model: string;
          p_category_id?: string;
          p_pax_capacity?: number;
          p_range_nm?: number;
        };
        Returns: AircraftType;
      };
      admin_aircraft_type_add_alias: {
        Args: {
          p_aircraft_type_id: string;
          p_alias: string;
        };
        Returns: { created: boolean };
      };
      admin_aircraft_type_alias_lookup: {
        Args: {
          p_alias: string;
        };
        Returns: {
          aircraft_type_id: string;
          manufacturer: string;
          model: string;
          category_id: string | null;
        } | null;
      };
      admin_aircraft_type_remove_alias: {
        Args: {
          p_alias_id: string;
        };
        Returns: { deleted_count: number };
      };
      admin_delete_corridor_recommendation_v1: {
        Args: {
          p_id: string;
        };
        Returns: { deleted_count: number };
      };
    };
  };
}

export interface CandidateAirport {
  icao: string;
  iata?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  score?: number | null;
}

export interface CorridorRecommendation {
  id: string;
  raw_label: string;
  side: CorridorSide;
  source_vendor: string;
  suggested_display_name: string | null;
  suggested_synonyms: string[] | null;
  candidate_airport_icaos: string[] | null;
  candidate_airports: CandidateAirport[] | null;
  recommended_reason: string | null;
  operator_id: string | null;
  operator_source_id: string | null;
  notes: string | null;
  accepted_corridor_id: string | null;
  status: string;
  created_at: string;
}
