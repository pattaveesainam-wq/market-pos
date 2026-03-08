import { createClient } from '@supabase/supabase-js'

// ⚠️  แก้ไข 2 บรรทัดนี้ด้วยค่าจาก Supabase Dashboard → Project Settings → API
const SUPABASE_URL      = 'https://evajcpkcwbqqlblaefyr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YWpjcGtjd2JxcWxibGFlZnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTM3MjksImV4cCI6MjA4ODUyOTcyOX0.pq1Iy_0Ga1JwZCUWVLsEyaPjiYaFs4_os6GhYztGFiA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
