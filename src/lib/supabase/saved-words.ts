import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;
type SavedWord = Pick<Database["public"]["Tables"]["saved_words"]["Row"], "word_id" | "is_starred">;

export async function loadSavedWords(client: Client, userId: string): Promise<SavedWord[]> {
  const saved: SavedWord[] = [];
  // API의 기본 조회 제한을 넘는 단어장도 빠짐없이 읽습니다.
  for (let offset = 0; ; ) {
    const { data, error } = await client.from("saved_words")
      .select("word_id,is_starred").eq("user_id", userId).order("word_id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data.length) return saved;
    saved.push(...data);
    offset += data.length;
  }
}

export async function setSavedWordsStarred(client: Client, userId: string, ids: string[], starred: boolean): Promise<void> {
  if (!ids.length) return;
  const uniqueIds = [...new Set(ids)];
  const { data, error } = await client.from("saved_words").update({ is_starred: starred })
    .eq("user_id", userId).in("word_id", uniqueIds).select("word_id");
  if (error) throw error;
  // 다른 화면에서 삭제되었거나 접근할 수 없는 단어를 저장 성공으로 표시하지 않습니다.
  if (data.length !== uniqueIds.length) throw new Error("별표를 변경할 단어를 찾지 못했어요. 단어장을 다시 불러와 주세요.");
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
