import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { DEFAULT_SETTINGS, type UserSettings } from "./shared";

const KEY = ["settings"];

/** The signed-in person's settings, plus an optimistic `update`. */
export function useSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => ({ ...DEFAULT_SETTINGS, ...(await api<Partial<UserSettings>>("/settings")) }),
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (next: UserSettings) => api<UserSettings>("/settings", { method: "PUT", json: next }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<UserSettings>(KEY);
      qc.setQueryData(KEY, next);
      return { prev };
    },
    onError: (_e, _next, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
  });
  const settings = query.data ?? DEFAULT_SETTINGS;
  return {
    settings,
    // Only real, loaded settings may be written back: saving before the load
    // finishes would overwrite the stored settings with the defaults.
    loaded: query.isSuccess,
    update: (patch: Partial<UserSettings>) => {
      if (!query.isSuccess) return;
      mutation.mutate({ ...settings, ...patch });
    },
  };
}
