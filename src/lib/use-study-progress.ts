"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { days } from "@/lib/words";

const storageKey = "japanese-word:completed-days:v1";
const changeEvent = "japanese-word:study-progress-changed";
type State = { owner: string | null | undefined; completed: string[]; ready: boolean; busy: boolean; error: string };
type Controller = { owner: string | null; active: boolean; busy: boolean; refresh: () => Promise<void> };

function readLocal(): string[] {
  const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) {
    throw new Error("학습 기록 형식이 올바르지 않아요.");
  }
  return [...new Set(value)].filter((id) => days.some((day) => day.id === id));
}

export function useStudyProgress(enabled = true) {
  const auth = useAuth();
  const owner = auth.user?.id ?? null;
  const [state, setState] = useState<State>({ owner: undefined, completed: [], ready: false, busy: false, error: "" });
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
        let completed: string[];
        if (owner) {
          const { data, error } = await getSupabaseClient().from("completed_study_days")
            .select("day_id").eq("user_id", owner);
          if (error) throw error;
          completed = data.map((row) => row.day_id);
        } else {
          completed = readLocal();
        }
        if (current.active) setState({ owner, completed, ready: true, busy: false, error: "" });
      } catch {
        if (current.active) setState({ owner, completed: [], ready: false, busy: false, error: "학습 기록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요." });
      } finally {
        current.busy = false;
      }
    }
    function onStorage(event: StorageEvent) {
      if (!owner && (event.key === storageKey || event.key === null)) void refresh();
    }
    function onChange() { void refresh(); }
    void refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onChange);
    window.addEventListener(changeEvent, onChange);
    return () => {
      // 이전 계정이나 화면에서 시작한 요청 결과는 반영하지 않습니다.
      current.active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onChange);
      window.removeEventListener(changeEvent, onChange);
    };
  }, [enabled, owner, auth.loading, auth.error]);

  const matches = enabled && state.owner === owner && !auth.loading && !auth.error;
  const ready = Boolean(matches && state.ready);

  async function completeDay(dayId: string): Promise<boolean> {
    const current = controller.current;
    if (!ready || !current?.active || current.busy || current.owner !== owner || !days.some((day) => day.id === dayId)) return false;
    current.busy = true;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      let completed: string[] | undefined;
      if (owner) {
        const { error } = await getSupabaseClient().from("completed_study_days")
          .upsert({ user_id: owner, day_id: dayId }, { onConflict: "user_id,day_id", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        completed = [...new Set([...readLocal(), dayId])];
        localStorage.setItem(storageKey, JSON.stringify(completed));
      }
      if (!current.active) return false;
      setState((previous) => ({ ...previous, completed: completed ?? [...new Set([...previous.completed, dayId])], busy: false }));
      window.dispatchEvent(new Event(changeEvent));
      return true;
    } catch {
      if (current.active) setState((previous) => ({ ...previous, busy: false, error: "학습 완료를 저장하지 못했어요. 마지막 단어의 버튼을 눌러 다시 시도해 주세요." }));
      return false;
    } finally {
      current.busy = false;
    }
  }

  return {
    completedDays: matches ? state.completed : [],
    ready,
    busy: Boolean(matches && state.busy),
    error: enabled ? auth.error || (matches ? state.error : "") : "",
    completeDay,
    reload: () => auth.error ? window.location.reload() : controller.current?.refresh(),
  };
}
