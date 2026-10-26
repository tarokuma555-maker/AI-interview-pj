import { backendMode } from "@/lib/backend/mode";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createMemoryPracticeRepo } from "./memory-repo";
import { createSupabasePracticeRepo } from "./supabase-repo";
export function practiceRepo() {
  return backendMode() === "memory" ? createMemoryPracticeRepo() : createSupabasePracticeRepo(createSupabaseServiceClient());
}
