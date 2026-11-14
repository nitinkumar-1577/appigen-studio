import { supabase } from "@/integrations/supabase/client";
import { readAppPreferences } from "./appPreferences";

export type AnonymousUsageEvent = "build_completed" | "project_pushed";

export async function trackAnonymousUsage(eventName: AnonymousUsageEvent): Promise<void> {
  if (!readAppPreferences().telemetry) return;
  const { error } = await supabase.from("anonymous_telemetry").insert({ event_name: eventName });
  if (error) throw error;
}
