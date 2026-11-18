"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { parseSavedWords } from "@/lib/words";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadSavedWords, removeSavedWord, saveWords, setSavedWordsStarred } from "@/lib/supabase/saved-words";

const storageKey = "japanese-word:saved";
const starredStorageKey = "japanese-word:starred";
type State = { owner: string | null | undefined; saved: string[]; starred: string[]; ready: boolean; busy: boolean; error: string };
type Controller = { owner: string | null; active: boolean; busy: boolean; refresh: () => Promise<void> };
type Mutation = { type: "save" | "remove"; id: string } | { type: "star"; id: string; value: boolean } | { type: "import" };

function readLocal() {
  return parseSavedWords(localStorage.getItem(storageKey));
}

function readLocalStarred(saved: string[]) {
  return parseSavedWords(localStorage.getItem(starredStorageKey)).filter((id) => saved.includes(id));
}

export function useSavedWords(enabled: boolean) {
  const auth = useAuth();
  const owner = auth.user?.id ?? null;
  const [state, setState] = useState<State>({ owner: undefined, saved: [], starred: [], ready: false, busy: false, error: "" });
  const controller = useRef<Controller | null>(null);

  useEffect(() => {
    if (!enabled || auth.loading || auth.error) return;
    const current: Controller = { owner, active: true, busy: false, refresh };
    controller.current = current;

    async function refresh() {
      if (!current.active || current.busy) return;
      current.busy = true;
      setState((previous) => ({ ...previous, ready: false, error: "" }));
      try {
        let saved: string[];
        let starred: string[];
        if (owner) {
          const rows = await loadSavedWords(getSupabaseClient(), owner);
          saved = parseSavedWords(JSON.stringify(rows.map((row) => row.word_id)));
          starred = rows.filter((row) => row.is_starred && saved.includes(row.word_id)).map((row) => row.word_id);
        } else {
          saved = readLocal();
          starred = readLocalStarred(saved);
        }
        if (current.active) setState({ owner, saved, starred, ready: true, busy: false, error: "" });
      } catch {
        if (current.active) setState({ owner, saved: [], starred: [], ready: false, busy: false, error: "단어장을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요." });
      } finally {
        current.busy = false;
      }
    }
    function onStorage(event: StorageEvent) {
      if (!owner && (event.key === storageKey || event.key === starredStorageKey || event.key === null)) void refresh();
    }
    function onFocus() { void refresh(); }
    void refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      // 계정 전환이나 화면 이동 전에 시작한 요청은 새 화면에 반영하지 않습니다.
      current.active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, owner, auth.loading, auth.error]);

  const matches = enabled && state.owner === owner && !auth.loading && !auth.error;
  const ready = Boolean(matches && state.ready);

  async function mutate(action: Mutation) {
    const current = controller.current;
    if (!ready || !current?.active || current.busy || current.owner !== owner) return false;
    current.busy = true;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const ids = action.type === "import" ? readLocal() : [action.id];
      const importedStarred = action.type === "import" ? readLocalStarred(ids) : [];
      let nextSaved = state.saved;
      let nextStarred = state.starred;
      if (action.type === "star") {
        if (!nextSaved.includes(action.id)) throw new Error("저장한 단어에만 별표를 표시할 수 있어요.");
        nextStarred = action.value ? [...new Set([...nextStarred, action.id])] : nextStarred.filter((id) => id !== action.id);
      } else if (action.type === "remove") {
        nextSaved = nextSaved.filter((id) => id !== action.id);
        nextStarred = nextStarred.filter((id) => id !== action.id);
      } else {
        nextSaved = [...new Set([...nextSaved, ...ids])];
        nextStarred = [...new Set([...nextStarred, ...importedStarred])];
      }
      if (owner) {
        const client = getSupabaseClient();
        if (action.type === "remove") await removeSavedWord(client, owner, action.id);
        else if (action.type === "star") await setSavedWordsStarred(client, owner, ids, action.value);
        else {
          await saveWords(client, owner, ids);
          // 가져오기는 이미 계정에서 표시한 별표를 지우지 않습니다.
          await setSavedWordsStarred(client, owner, importedStarred, true);
        }
      } else {
        const previous = readLocal();
        const previousStarred = readLocalStarred(previous);
        nextSaved = action.type === "remove" ? previous.filter((id) => id !== action.id) : [...new Set([...previous, ...ids])];
        nextStarred = action.type === "star"
          ? action.value ? [...new Set([...previousStarred, action.id])] : previousStarred.filter((id) => id !== action.id)
          : previousStarred.filter((id) => nextSaved.includes(id));
        localStorage.setItem(starredStorageKey, JSON.stringify(nextStarred));
        localStorage.setItem(storageKey, JSON.stringify(nextSaved));
      }
      if (!current.active) return false;
      setState((previous) => ({
        ...previous,
        saved: nextSaved,
        starred: nextStarred,
        busy: false,
      }));
      return true;
    } catch {
      if (current.active) setState((previous) => ({ ...previous, busy: false, error: action.type === "star" ? "별표 변경을 저장하지 못했어요. 연결을 확인하거나 단어장을 다시 불러와 주세요." : "단어장 변경을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요." }));
      return false;
    } finally {
      current.busy = false;
    }
  }

  return {
    saved: matches ? state.saved : [],
    starred: matches ? state.starred : [],
    ready,
    busy: Boolean(matches && state.busy),
    error: auth.error || (matches ? state.error : ""),
    account: Boolean(owner),
    updateSaved: (id: string, remove = false) => mutate({ type: remove ? "remove" : "save", id }),
    updateStarred: (id: string, value: boolean) => mutate({ type: "star", id, value }),
    importLocal: () => mutate({ type: "import" }),
    reload: () => auth.error ? window.location.reload() : controller.current?.refresh(),
  };
}
