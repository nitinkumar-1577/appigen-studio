
import { supabase } from "@/integrations/supabase/client";
import type {
  AppPreferences,
  GenerationSettings,
} from "@/lib/appPreferences";

export interface AccountSettings {
  user_id: string;
  app_preferences: AppPreferences;
  generation_settings: GenerationSettings;
  accent_color: string | null;
  updated_at: string;
}

export interface AccountSettingsInput {
  app_preferences: AppPreferences;
  generation_settings: GenerationSettings;
  accent_color?: string | null;
}

export async function loadAccountSettings(
  userId: string
): Promise<AccountSettings | null> {
  const { data, error } = await (supabase as any)
    .from("user_settings")
    .select(
      "user_id, app_preferences, generation_settings, accent_color, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as AccountSettings | null) ?? null;
}

export async function saveAccountSettings(
  userId: string,
  settings: AccountSettingsInput
): Promise<void> {
  const { error } = await (supabase as any)
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        app_preferences: settings.app_preferences,
        generation_settings: settings.generation_settings,
        accent_color: settings.accent_color ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}

export function subscribeToAccountSettings(
  userId: string,
  onChange: (settings: AccountSettings) => void
) {
  const channel = supabase
    .channel(`account-settings-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_settings",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new && Object.keys(payload.new).length > 0) {
          onChange(payload.new as AccountSettings);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
