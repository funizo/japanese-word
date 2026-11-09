export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

/** 연결된 Supabase 데이터베이스의 스키마 타입입니다. */
export type Database = {
  public: {
    Tables: {
      ai_study_days: Table<
        { user_id: string; study_date: string; lessons: Json; model: string; created_at: string },
        { user_id: string; study_date: string; lessons: Json; model: string; created_at?: string }
      >;
      ai_study_terms: Table<
        { user_id: string; term_key: string; term: string; reading: string; meaning: string; study_date: string },
        { user_id: string; term_key: string; term: string; reading: string; meaning: string; study_date: string }
      >;
      ai_study_progress: Table<
        { user_id: string; study_date: string; lesson_index: number; completed_at: string },
        { user_id: string; study_date: string; lesson_index: number; completed_at?: string }
      >;
      ai_generation_requests: Table<
        { id: string; user_id: string; study_date: string; slot: number; kind: string; created_at: string; finished_at: string | null },
        { user_id: string; slot: number; kind: string },
        { finished_at: string }
      >;
      completed_study_days: {
        Row: { user_id: string; day_id: string; completed_at: string };
        Insert: { user_id: string; day_id: string; completed_at?: string };
        Update: { user_id?: string; day_id?: string; completed_at?: string };
        Relationships: [];
      };
      saved_words: {
        Row: { user_id: string; word_id: string; created_at: string };
        Insert: { user_id: string; word_id: string; created_at?: string };
        Update: { user_id?: string; word_id?: string; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_ai_generation: { Args: { p_kind: string }; Returns: string };
      save_ai_study_day: { Args: { p_request_id: string; p_lessons: Json; p_terms: Json; p_model: string }; Returns: undefined };
      append_ai_study_examples: { Args: { p_request_id: string; p_date: string; p_index: number; p_examples: Json }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
