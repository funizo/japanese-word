"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { parseSavedWords } from "@/lib/words";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadSavedWords, removeSavedWord, saveWords } from "@/lib/supabase/saved-words";

const storageKey = "japanese-word:saved";
type State = { owner: string | null | undefined; saved: string[]; ready: boolean; busy: boolean; error: string };
type Controller = { owner: string | null; active: boolean; busy: boolean; refresh: () => Promise<void> };

function readLocal() {
  return parseSavedWords(localStorage.getItem(storageKey));
}

export function useSavedWords(enabled: boolean) {
  const auth = useAuth();
  const owner = auth.user?.id ?? null;
  const [state, setState] = useState<State>({ owner: undefined, saved: [], ready: false, busy: false, error: "" });
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
        const saved = owner
          ? parseSavedWords(JSON.stringify(await loadSavedWords(getSupabaseClient(), owner)))
          : readLocal();
        if (current.active) setState({ owner, saved, ready: true, busy: false, error: "" });
      } catch {
        if (current.active) setState({ owner, saved: [], ready: false, busy: false, error: "단어장을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요." });
      } finally {
        current.busy = false;
      }
    }
    function onStorage(event: StorageEvent) {
      if (!owner && (event.key === storageKey || event.key === null)) void refresh();
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

  const matches = state.owner === owner && !auth.loading && !auth.error;
  const ready = Boolean(matches && state.ready);

  async function mutate(id: string | null, remove = false) {
    const current = controller.current;
    if (!ready || !current?.active || current.busy || current.owner !== owner) return false;
    current.busy = true;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const ids = id === null ? readLocal() : [id];
      let localSaved: string[] | undefined;
      if (owner) {
        const client = getSupabaseClient();
        if (remove && id) await removeSavedWord(client, owner, id);
        else await saveWords(client, owner, ids);
      } else {
        const previous = readLocal();
        const next = remove ? previous.filter((item) => item !== id) : [...new Set([...previous, ...ids])];
        localStorage.setItem(storageKey, JSON.stringify(next));
        localSaved = next;
      }
      if (!current.active) return false;
      setState((previous) => ({
        ...previous,
        saved: localSaved ?? (remove ? previous.saved.filter((item) => item !== id) : [...new Set([...previous.saved, ...ids])]),
        busy: false,
      }));
      return true;
    } catch {
      if (current.active) setState((previous) => ({ ...previous, busy: false, error: "단어장 변경을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요." }));
      return false;
    } finally {
      current.busy = false;
    }
  }

  return {
    saved: matches ? state.saved : [],
    ready,
    busy: Boolean(matches && state.busy),
    error: auth.error || (matches ? state.error : ""),
    account: Boolean(owner),
    updateSaved: (id: string, remove = false) => mutate(id, remove),
    importLocal: () => mutate(null),
    reload: () => auth.error ? window.location.reload() : controller.current?.refresh(),
  };
}
