import { createClient } from '@supabase/supabase-js'

// ⚠️  แก้ไข 2 บรรทัดนี้ด้วยค่าจาก Supabase Dashboard → Project Settings → API
const SUPABASE_URL      = 'PASTE_YOUR_PROJECT_URL_HERE'
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
