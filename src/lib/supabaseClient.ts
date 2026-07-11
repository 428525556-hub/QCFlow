import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/src/config/env";
import type { Database } from "@/lib/types";

export const supabase = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);

