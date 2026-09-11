import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export async function loadSavedWords(client: Client, userId: string): Promise<string[]> {
  const ids: string[] = [];
  // API의 기본 조회 제한을 넘는 단어장도 빠짐없이 읽습니다.
  for (let offset = 0; ; ) {
    const { data, error } = await client.from("saved_words")
      .select("word_id").eq("user_id", userId).order("word_id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data.length) return ids;
    ids.push(...data.map((row) => row.word_id));
    offset += data.length;
  }
}

export async function saveWords(client: Client, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await client.from("saved_words").upsert(
    [...new Set(ids)].map((wordId) => ({ user_id: userId, word_id: wordId })),
    { onConflict: "user_id,word_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function removeSavedWord(client: Client, userId: string, wordId: string): Promise<void> {
  const { error } = await client.from("saved_words").delete()
    .eq("user_id", userId).eq("word_id", wordId);
  if (error) throw error;
}
