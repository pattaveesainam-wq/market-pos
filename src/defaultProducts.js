// สินค้าเริ่มต้น — จะถูกบันทึกลง Supabase ครั้งแรกอัตโนมัติ
// แก้ไข/เพิ่ม/ลบได้เองในแอปผ่านหน้า "จัดการสินค้า"
export const DEFAULT_PRODUCTS = [
  // ── ไข่ไก่ ──────────────────────────────────────────────
  { id:"c0",    name:"ไข่ไก่ #0",       cat:"chicken", emoji:"🥚", color:"#F59E0B", bg:"#FFFBEB", price_unit:5.0,  price_pack10:48,  price_tray:140, cost_unit:4.0,  sort_order:10 },
  { id:"c1",    name:"ไข่ไก่ #1",       cat:"chicken", emoji:"🥚", color:"#F59E0B", bg:"#FFFBEB", price_unit:4.5,  price_pack10:43,  price_tray:125, cost_unit:3.5,  sort_order:11 },
  { id:"c2",    name:"ไข่ไก่ #2",       cat:"chicken", emoji:"🥚", color:"#F59E0B", bg:"#FFFBEB", price_unit:4.0,  price_pack10:38,  price_tray:110, cost_unit:3.2,  sort_order:12 },
  { id:"c3",    name:"ไข่ไก่ #3",       cat:"chicken", emoji:"🥚", color:"#F59E0B", bg:"#FFFBEB", price_unit:3.8,  price_pack10:36,  price_tray:105, cost_unit:3.0,  sort_order:13 },
  { id:"c4",    name:"ไข่ไก่ #4",       cat:"chicken", emoji:"🥚", color:"#F59E0B", bg:"#FFFBEB", price_unit:3.5,  price_pack10:33,  price_tray:98,  cost_unit:2.8,  sort_order:14 },
  { id:"c5",    name:"ไข่ไก่ #5",       cat:"chicken", emoji:"🥚", color:"#F59E0B", bg:"#FFFBEB", price_unit:3.0,  price_pack10:28,  price_tray:82,  cost_unit:2.5,  sort_order:15 },
  // ── ไข่เปลือกบาง ────────────────────────────────────────
  { id:"thin1", name:"เปลือกบาง #1",    cat:"thin",    emoji:"🫧", color:"#84CC16", bg:"#F7FEE7", price_unit:3.5,  price_pack10:33,  price_tray:95,  cost_unit:2.8,  sort_order:20 },
  { id:"thin2", name:"เปลือกบาง #2",    cat:"thin",    emoji:"🫧", color:"#65A30D", bg:"#F7FEE7", price_unit:3.0,  price_pack10:28,  price_tray:82,  cost_unit:2.4,  sort_order:21 },
  { id:"thin3", name:"เปลือกบาง #3",    cat:"thin",    emoji:"🫧", color:"#65A30D", bg:"#F7FEE7", price_unit:2.5,  price_pack10:23,  price_tray:68,  cost_unit:2.0,  sort_order:22 },
  // ── ไข่เป็ด ─────────────────────────────────────────────
  { id:"d0",    name:"ไข่เป็ด #0",      cat:"duck",    emoji:"🩶", color:"#64748B", bg:"#F1F5F9", price_unit:6.0,  price_pack10:58,  price_tray:168, cost_unit:5.0,  sort_order:30 },
  { id:"d1",    name:"ไข่เป็ด #1",      cat:"duck",    emoji:"🩶", color:"#64748B", bg:"#F1F5F9", price_unit:5.5,  price_pack10:53,  price_tray:155, cost_unit:4.5,  sort_order:31 },
  { id:"d2",    name:"ไข่เป็ด #2",      cat:"duck",    emoji:"🩶", color:"#64748B", bg:"#F1F5F9", price_unit:5.0,  price_pack10:48,  price_tray:140, cost_unit:4.2,  sort_order:32 },
  { id:"d3",    name:"ไข่เป็ด #3",      cat:"duck",    emoji:"🩶", color:"#64748B", bg:"#F1F5F9", price_unit:4.8,  price_pack10:46,  price_tray:135, cost_unit:4.0,  sort_order:33 },
  // ── ไข่เยี่ยวม้า ─────────────────────────────────────────
  { id:"cent1", name:"เยี่ยวม้า เล็ก", cat:"century", emoji:"🖤", color:"#7C3AED", bg:"#FAF5FF", price_unit:8.0,  price_pack10:75,  price_tray:0,   cost_unit:6.5,  sort_order:40 },
  { id:"cent2", name:"เยี่ยวม้า ใหญ่", cat:"century", emoji:"🖤", color:"#5B21B6", bg:"#FAF5FF", price_unit:10.0, price_pack10:95,  price_tray:0,   cost_unit:8.5,  sort_order:41 },
  // ── ไข่เค็ม ─────────────────────────────────────────────
  { id:"salt1", name:"ไข่เค็ม ดิบ",    cat:"salty",   emoji:"🧂", color:"#DC2626", bg:"#FFF1F2", price_unit:7.0,  price_pack10:65,  price_tray:0,   cost_unit:5.5,  sort_order:50 },
  { id:"salt2", name:"ไข่เค็ม สุก",    cat:"salty",   emoji:"🧂", color:"#B91C1C", bg:"#FFF1F2", price_unit:8.0,  price_pack10:75,  price_tray:0,   cost_unit:6.5,  sort_order:51 },
  { id:"salt3", name:"เค็ม ไชยา",       cat:"salty",   emoji:"🧂", color:"#9F1239", bg:"#FFF1F2", price_unit:12.0, price_pack10:115, price_tray:0,   cost_unit:10.0, sort_order:52 },
  // ── ปลาทู 4 ขนาด ────────────────────────────────────────
  { id:"fish1", name:"ปลาทู XL",       cat:"fish",    emoji:"🐟", color:"#0369A1", bg:"#EFF6FF", price_unit:60,   price_pack10:0,   price_tray:0,   cost_unit:48,   sort_order:60 },
  { id:"fish2", name:"ปลาทู L",        cat:"fish",    emoji:"🐟", color:"#0EA5E9", bg:"#F0F9FF", price_unit:35,   price_pack10:0,   price_tray:0,   cost_unit:28,   sort_order:61 },
  { id:"fish3", name:"ปลาทู M",        cat:"fish",    emoji:"🐟", color:"#38BDF8", bg:"#F0F9FF", price_unit:25,   price_pack10:0,   price_tray:0,   cost_unit:20,   sort_order:62 },
  { id:"fish4", name:"ปลาทู S",        cat:"fish",    emoji:"🐟", color:"#7DD3FC", bg:"#F0F9FF", price_unit:20,   price_pack10:0,   price_tray:0,   cost_unit:16,   sort_order:63 },
];

export const CAT_META = {
  chicken: { label:"🥚 ไข่ไก่สด",     hBg:"#FFFBEB", hBorder:"#FDE68A" },
  thin:    { label:"🫧 ไข่เปลือกบาง", hBg:"#F7FEE7", hBorder:"#BEF264" },
  duck:    { label:"🩶 ไข่เป็ด",       hBg:"#F1F5F9", hBorder:"#CBD5E1" },
  century: { label:"🖤 ไข่เยี่ยวม้า",  hBg:"#FAF5FF", hBorder:"#DDD6FE" },
  salty:   { label:"🧂 ไข่เค็ม",       hBg:"#FFF1F2", hBorder:"#FECDD3" },
  fish:    { label:"🐟 ปลาทูสด",       hBg:"#EFF6FF", hBorder:"#BAE6FD" },
  custom:  { label:"📦 สินค้าอื่น",    hBg:"#F8FAFC", hBorder:"#E2E8F0" },
};

export const CAT_OPTIONS = [
  { value:"chicken", label:"ไข่ไก่" },
  { value:"thin",    label:"ไข่เปลือกบาง" },
  { value:"duck",    label:"ไข่เป็ด" },
  { value:"century", label:"ไข่เยี่ยวม้า" },
  { value:"salty",   label:"ไข่เค็ม" },
  { value:"fish",    label:"ปลาทู" },
  { value:"custom",  label:"สินค้าอื่น" },
];

export const EMOJI_OPTIONS = ["🥚","🫧","🩶","🖤","🧂","🐟","📦","🐔","🦆","🛒","🍳","🐠"];

export const COLOR_OPTIONS = [
  { color:"#F59E0B", bg:"#FFFBEB" },
  { color:"#84CC16", bg:"#F7FEE7" },
  { color:"#64748B", bg:"#F1F5F9" },
  { color:"#7C3AED", bg:"#FAF5FF" },
  { color:"#DC2626", bg:"#FFF1F2" },
  { color:"#0EA5E9", bg:"#F0F9FF" },
  { color:"#0369A1", bg:"#EFF6FF" },
  { color:"#059669", bg:"#ECFDF5" },
  { color:"#EC4899", bg:"#FDF2F8" },
  { color:"#374151", bg:"#F9FAFB" },
];
