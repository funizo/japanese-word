/** 연결된 Supabase 데이터베이스의 스키마 타입입니다. */
export type Database = {
  public: {
    Tables: {
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
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
