import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { DEFAULT_PRODUCTS, CAT_META, CAT_OPTIONS, EMOJI_OPTIONS, COLOR_OPTIONS } from "./defaultProducts";


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt     = n => new Intl.NumberFormat("th-TH",{minimumFractionDigits:0,maximumFractionDigits:2}).format(n||0);
const fmtFull = n => new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:4}).format(n||0);
const todayStr= () => new Date().toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});
const timeStr = ts => new Date(ts).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
const dateKey = d  => new Date(d).toISOString().split("T")[0];
const thDate  = d  => new Date(d).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});

function getUnits(p) {
  if (p.cat === "fish" || (p.price_pack10===0 && p.price_tray===0))
    return [{ name:"ถาด/ตัว", price:p.price_unit, size:1, icon:p.emoji, note:"1 ชิ้น" }];
  const u = [];
  if (p.price_tray   > 0) u.push({ name:"ทั้งแผง", price:p.price_tray,   size:30, icon:"📦", note:"30 ฟอง" });
  if (p.price_pack10 > 0) u.push({ name:"ถุง 10",  price:p.price_pack10, size:10, icon:"🛍️", note:"10 ฟอง" });
  u.push({ name:"ฟอง", price:p.price_unit, size:1, icon:p.emoji, note:"1 ฟอง" });
  return u;
}

const CAT_ORDER = ["chicken","fish","thin","duck","century","salty","custom"];

// ─────────────────────────────────────────────
// APP (Supabase version)
// ─────────────────────────────────────────────
export default function App() {
  const [tab,          setTab]          = useState("pos");
  const [products,     setProducts]     = useState([]);
  const [sales,        setSales]        = useState([]);
  const [purchases,    setPurchases]    = useState([]);
  const [cart,         setCart]         = useState([]);
  const [modal,        setModal]        = useState(null);
  const [toast,        setToast]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [dbError,      setDbError]      = useState(false);
  const [voiceConfirm, setVoiceConfirm] = useState(null);

  useEffect(() => { initData(); }, []);

  async function initData() {
    setLoading(true);
    try {
      let { data: prods, error: pErr } = await supabase.from("products").select("*").eq("active",true).order("sort_order").order("name");
      if (pErr) throw pErr;
      if (!prods?.length) {
        const { error: sErr } = await supabase.from("products").insert(DEFAULT_PRODUCTS);
        if (sErr) throw sErr;
        prods = DEFAULT_PRODUCTS;
      }
      setProducts(prods);
      const since30 = new Date(); since30.setDate(since30.getDate()-30);
      const { data: sData, error: sErr2 } = await supabase.from("sales").select("*").gte("ts",since30.toISOString()).order("ts",{ascending:false});
      if (sErr2) throw sErr2;
      setSales(sData||[]);
      const { data: pData, error: pErr2 } = await supabase.from("purchases").select("*").gte("ts",since30.toISOString()).order("ts",{ascending:false});
      if (pErr2) throw pErr2;
      setPurchases(pData||[]);
    } catch(e) { console.error(e); setDbError(true); }
    setLoading(false);
  }

  const showToast = (msg, color="#22C55E") => { setToast({msg,color}); setTimeout(()=>setToast(null),2800); };

  // ── Cart ────────────────────────────────────
  const addToCart = useCallback((product, unit) => {
    setCart(prev => {
      const key = `${product.id}_${unit.name}`;
      const ex  = prev.find(i => i.key===key);
      if (ex) return prev.map(i => i.key===key ? {...i, qty:i.qty+1} : i);
      return [...prev, { key, id:product.id, name:product.name, cat:product.cat, emoji:product.emoji, color:product.color,
        unit:unit.name, size:unit.size, qty:1, price:unit.price, cost_unit:product.cost_unit||0 }];
    });
    setModal(null);
  }, []);

  const removeFromCart  = key => setCart(prev=>prev.filter(i=>i.key!==key));
  const changeQty       = (key,d) => setCart(prev=>prev.map(i=>i.key===key?{...i,qty:i.qty+d}:i).filter(i=>i.qty>0));
  const updateCartPrice = (key,price) => setCart(prev=>prev.map(i=>i.key===key?{...i,price:parseFloat(price)||i.price}:i));

  const cartRevenue = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const cartCost    = cart.reduce((s,i)=>s+i.cost_unit*i.size*i.qty,0);
  const cartProfit  = cartRevenue-cartCost;
  const cartCount   = cart.reduce((s,i)=>s+i.qty,0);

  // ── Checkout ────────────────────────────────
  const checkout = async (method) => {
    if (!cart.length) return;
    const items = cart.map(i=>({ id:i.id, name:i.name, emoji:i.emoji, unit:i.unit, size:i.size,
      qty:i.qty, price:i.price, cost:i.cost_unit*i.size, subtotal:i.price*i.qty, subtotal_cost:i.cost_unit*i.size*i.qty }));
    try {
      const { data, error } = await supabase.from("sales")
        .insert([{ method, total:cartRevenue, total_cost:cartCost, profit:cartProfit, items }])
        .select().single();
      if (error) throw error;
      setSales(prev=>[data,...prev]);
      setCart([]); setModal(null);
      showToast(`✅ ฿${fmt(cartRevenue)}  กำไร ฿${fmt(cartProfit)}`);
    } catch(e) { showToast("❌ "+e.message,"#EF4444"); }
  };

  // ── Save Purchase ───────────────────────────
  const savePurchase = async ({ productId, productName, qtyDisplay, unitLabel, unitsPerPack, totalCost }) => {
    const qtyUnit = qtyDisplay * unitsPerPack;
    const costPerUnit = totalCost / qtyUnit;
    try {
      const { data: pRow, error } = await supabase.from("purchases")
        .insert([{ product_id:productId, product_name:productName, qty_unit:qtyUnit,
          qty_display:qtyDisplay, unit_label:unitLabel, total_cost:totalCost }])
        .select().single();
      if (error) throw error;
      setPurchases(prev=>[pRow,...prev]);
      await supabase.from("products").update({ cost_unit:parseFloat(costPerUnit.toFixed(4)) }).eq("id",productId);
      setProducts(prev=>prev.map(p=>p.id===productId?{...p,cost_unit:parseFloat(costPerUnit.toFixed(4))}:p));
      showToast(`✅ บันทึกการซื้อ — ต้นทุน/หน่วย ฿${fmtFull(costPerUnit)}`);
      return true;
    } catch(e) { showToast("❌ "+e.message,"#EF4444"); return false; }
  };

  // ── Product CRUD ────────────────────────────
  const saveProduct = async (prod) => {
    try {
      if (prod.id) {
        const { error } = await supabase.from("products").update(prod).eq("id",prod.id);
        if (error) throw error;
        setProducts(prev=>prev.map(p=>p.id===prod.id?{...p,...prod}:p));
      } else {
        const newProd = {...prod, active:true, sort_order:99};
        const { data, error } = await supabase.from("products").insert([newProd]).select().single();
        if (error) throw error;
        setProducts(prev=>[...prev,data].sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name)));
      }
      showToast("✅ บันทึกสินค้าแล้ว"); return true;
    } catch(e) { showToast("❌ "+e.message,"#EF4444"); return false; }
  };

  const deleteProduct = async (id) => {
    try {
      await supabase.from("products").update({ active:false }).eq("id",id);
      setProducts(prev=>prev.filter(p=>p.id!==id));
      showToast("🗑 ลบสินค้าแล้ว","#64748B");
    } catch(e) { showToast("❌ "+e.message,"#EF4444"); }
  };

  // ── Stats ───────────────────────────────────
  const todayKey    = dateKey(new Date());
  const todaySales  = sales.filter(s=>dateKey(s.ts)===todayKey);
  const todayRev    = todaySales.reduce((s,t)=>s+(t.total||0),0);
  const todayCost   = todaySales.reduce((s,t)=>s+(t.total_cost||0),0);
  const todayProfit = todaySales.reduce((s,t)=>s+(t.profit||0),0);

  const dailyStats = (() => {
    const map = {};
    sales.forEach(s=>{ const k=dateKey(s.ts); if(!map[k])map[k]={date:k,revenue:0,cost:0,profit:0,count:0,purchase_cost:0};
      map[k].revenue+=s.total||0; map[k].cost+=s.total_cost||0; map[k].profit+=s.profit||0; map[k].count+=1; });
    purchases.forEach(p=>{ const k=dateKey(p.ts); if(!map[k])map[k]={date:k,revenue:0,cost:0,profit:0,count:0,purchase_cost:0};
      map[k].purchase_cost+=(p.total_cost||0); });
    return Object.values(map).sort((a,b)=>b.date.localeCompare(a.date));
  })();

  // ── Voice POS ───────────────────────────────
  const posVoice = useVoiceInput(products, useCallback(({ product, unitHint, qty }) => {
    if (!product) return;
    const units = getUnits(product);
    const matchedUnit = unitHint ? units.find(u=>u.name.includes(unitHint.split(" ")[0]))||units[0] : units[0];
    setVoiceConfirm({ product, unit: matchedUnit, qty: qty||1 });
  }, []));

  const groupedProducts = {};
  products.forEach(p=>{ if(!groupedProducts[p.cat])groupedProducts[p.cat]=[]; groupedProducts[p.cat].push(p); });

  // ── Loading / Error ──────────────────────────
  if (loading) return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#FFFBEB",fontFamily:"'Noto Sans Thai',sans-serif"}}>
      <div style={{fontSize:52,animation:"spin 2s linear infinite",marginBottom:14}}>🥚</div>
      <div style={{color:"#92400E",fontWeight:700,fontSize:16}}>กำลังโหลด...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (dbError) return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#FEF2F2",fontFamily:"'Noto Sans Thai',sans-serif",padding:28,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:12}}>⚠️</div>
      <div style={{color:"#B91C1C",fontWeight:800,fontSize:18,marginBottom:10}}>เชื่อมต่อ Supabase ไม่ได้</div>
      <div style={{color:"#6B7280",fontSize:13,lineHeight:2,background:"#fff",borderRadius:16,padding:"16px 20px",border:"1.5px solid #FECACA"}}>
        แก้ไข <b>src/supabase.js</b><br/>ใส่ SUPABASE_URL และ ANON_KEY<br/>แล้ว deploy ใหม่
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Noto Sans Thai',sans-serif",background:"#F1F5F9",minHeight:"100vh",display:"flex",flexDirection:"column",maxWidth:430,margin:"0 auto"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#F59E0B,#B45309)",padding:"16px 18px 10px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 14px rgba(180,83,9,0.28)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:17,fontWeight:900,color:"#fff"}}>🛒 ร้านไข่ &amp; ปลาทู</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.8)",marginTop:1}}>{todayStr()}</div>
          </div>
          <div style={{textAlign:"right",background:"rgba(0,0,0,0.2)",borderRadius:12,padding:"6px 12px"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.7)"}}>วันนี้ · {todaySales.length} บิล</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff",lineHeight:1.2}}>฿{fmt(todayRev)}</div>
            <div style={{fontSize:11,fontWeight:700,color:todayProfit>=0?"#BBF7D0":"#FCA5A5"}}>กำไร ฿{fmt(todayProfit)}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,marginTop:12,background:"rgba(0,0,0,0.18)",borderRadius:12,padding:3}}>
          {[["pos","🛒 ขาย"],["buy","🧾 ซื้อของ"],["dashboard","📊 กำไร"],["manage","⚙️ สินค้า"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"7px 0",borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,background:tab===id?"#fff":"transparent",color:tab===id?"#B45309":"rgba(255,255,255,0.9)",transition:"all 0.15s"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div style={{flex:1,overflowY:"auto"}}>

        {/* POS */}
        {tab==="pos" && (
          <div style={{paddingBottom:cart.length>0?240:28}}>
            <div style={{padding:"12px 14px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,color:"#94A3B8"}}>กดสินค้าเพื่อเพิ่ม หรือ</div>
              <VoiceButton voice={posVoice} hint="เช่น 'ปลาทู XL 3 ถาด'" />
            </div>
            {posVoice.listening && !posVoice.transcript && (
              <div style={{margin:"8px 14px 0",background:"#FAF5FF",border:"1.5px solid #DDD6FE",borderRadius:10,padding:"8px 14px",fontSize:13,color:"#8B5CF6",display:"flex",alignItems:"center",gap:8}}>
                <span style={{animation:"pulse 1s infinite",display:"inline-block"}}>🎤</span> <span style={{color:"#C4B5FD"}}>กำลังฟัง...</span>
              </div>
            )}
            {posVoice.transcript && (
              <div style={{margin:"8px 14px 0",background:"#FAF5FF",border:"1.5px solid #8B5CF6",borderRadius:10,padding:"8px 14px",fontSize:14,color:"#6D28D9",fontWeight:600}}>
                🎤 "{posVoice.transcript}"
              </div>
            )}
            {posVoice.voiceError && (
              <div style={{margin:"8px 14px 0",background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"7px 12px",fontSize:12,color:"#DC2626"}}>
                ⚠️ {posVoice.voiceError}
              </div>
            )}
            {CAT_ORDER.map(cat=>{
              const prods=groupedProducts[cat];
              if(!prods?.length) return null;
              const meta=CAT_META[cat]||CAT_META.custom;
              return (
                <div key={cat} style={{padding:"14px 14px 4px"}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#334155",marginBottom:10,padding:"7px 12px",background:meta.hBg,borderRadius:10,border:`1.5px solid ${meta.hBorder}`}}>{meta.label}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                    {prods.map(p=>(
                      <button key={p.id} onClick={()=>setModal({type:"unit",product:p})}
                        style={{background:"#fff",border:`2px solid ${p.color}22`,borderRadius:16,padding:"11px 10px",display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",boxShadow:"0 1px 5px rgba(0,0,0,0.06)"}}>
                        <div style={{fontSize:32,marginBottom:4}}>{p.emoji}</div>
                        <div style={{fontWeight:700,fontSize:12,color:"#374151",textAlign:"center",marginBottom:6,lineHeight:1.3}}>{p.name}</div>
                        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:4}}>
                          {getUnits(p).map(u=>(
                            <div key={u.name} style={{background:u.size>=10?p.bg:"#F8FAFC",borderRadius:8,padding:"3px 7px",display:"flex",justifyContent:"space-between"}}>
                              <span style={{fontSize:10,color:"#64748B",fontWeight:600}}>{u.icon} {u.name}</span>
                              <span style={{fontSize:12,fontWeight:800,color:u.size>=10?p.color:"#94A3B8"}}>฿{fmt(u.price)}</span>
                            </div>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab==="buy" && <PurchaseTab products={products} purchases={purchases} onSave={savePurchase} />}

        {tab==="dashboard" && (
          <div style={{padding:14}}>
            <div style={{fontWeight:800,fontSize:17,color:"#1E293B",marginBottom:14}}>📊 กำไร-ขาดทุน</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              <StatCard label="ยอดขาย" value={`฿${fmt(todayRev)}`}    sub="วันนี้" color="#0F172A" bg="#ECFDF5" border="#A7F3D0"/>
              <StatCard label="ต้นทุน"  value={`฿${fmt(todayCost)}`}   sub="วันนี้" color="#DC2626" bg="#FEF2F2" border="#FECACA"/>
              <StatCard label="กำไร"   value={`฿${fmt(todayProfit)}`} sub={todayRev>0?`${((todayProfit/todayRev)*100).toFixed(1)}%`:"-"}
                color={todayProfit>=0?"#16A34A":"#DC2626"} bg={todayProfit>=0?"#F0FDF4":"#FEF2F2"} border={todayProfit>=0?"#BBF7D0":"#FECACA"}/>
            </div>
            {todayRev>0&&(
              <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",marginBottom:14,boxShadow:"0 1px 5px rgba(0,0,0,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#64748B"}}>Margin วันนี้</span>
                  <span style={{fontSize:12,fontWeight:800,color:"#16A34A"}}>{((todayProfit/todayRev)*100).toFixed(1)}%</span>
                </div>
                <div style={{height:10,background:"#E2E8F0",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(100,Math.max(0,(todayProfit/todayRev)*100))}%`,background:"linear-gradient(90deg,#22C55E,#16A34A)",borderRadius:99}}/>
                </div>
              </div>
            )}
            <div style={{fontWeight:700,fontSize:12,color:"#94A3B8",marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>ย้อนหลัง 30 วัน</div>
            {dailyStats.length===0
              ?<div style={{textAlign:"center",padding:"36px 0",color:"#CBD5E1",fontSize:14}}>ยังไม่มีข้อมูล — ลองขายสินค้าในแท็บ 🛒</div>
              :dailyStats.map(d=>(
                <div key={d.date} style={{background:"#fff",borderRadius:14,marginBottom:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                  <div style={{padding:"10px 14px 6px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>{thDate(d.date)}</div>
                      <div style={{fontSize:11,color:"#94A3B8"}}>{d.count} บิล · ต้นทุนขาย ฿{fmt(d.cost)}</div>
                      {d.purchase_cost>0&&<div style={{fontSize:11,color:"#F59E0B",fontWeight:600}}>ซื้อของเข้า ฿{fmt(d.purchase_cost)}</div>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}}>฿{fmt(d.revenue)}</div>
                      <div style={{fontSize:13,fontWeight:800,color:d.profit>=0?"#16A34A":"#DC2626"}}>{d.profit>=0?"+":""}฿{fmt(d.profit)}</div>
                    </div>
                  </div>
                  <div style={{height:4,background:"#F1F5F9",margin:"0 14px 10px"}}>
                    <div style={{height:"100%",width:`${Math.min(100,Math.max(0,d.revenue>0?(d.profit/d.revenue)*100:0))}%`,background:d.profit>=0?"#22C55E":"#EF4444",borderRadius:99}}/>
                  </div>
                </div>
              ))
            }
            {purchases.length>0&&(
              <>
                <div style={{fontWeight:700,fontSize:12,color:"#94A3B8",marginBottom:8,marginTop:8,textTransform:"uppercase",letterSpacing:0.5}}>ประวัติการซื้อสินค้า</div>
                {purchases.slice(0,20).map(p=>(
                  <div key={p.id} style={{background:"#fff",borderRadius:12,marginBottom:6,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:"#1E293B"}}>{p.product_name}</div>
                      <div style={{fontSize:11,color:"#94A3B8"}}>{timeStr(p.ts)} · {fmt(p.qty_display)} {p.unit_label} ({fmt(p.qty_unit)} หน่วย)</div>
                      <div style={{fontSize:11,color:"#64748B"}}>ต้นทุน/หน่วย ฿{fmtFull(p.cost_per_unit)}</div>
                    </div>
                    <div style={{fontWeight:800,fontSize:15,color:"#DC2626"}}>฿{fmt(p.total_cost)}</div>
                  </div>
                ))}
              </>
            )}
            {todaySales.length>0&&(
              <>
                <div style={{fontWeight:700,fontSize:12,color:"#94A3B8",marginBottom:8,marginTop:8,textTransform:"uppercase",letterSpacing:0.5}}>บิลขายวันนี้</div>
                {todaySales.map(sale=>(
                  <div key={sale.id} style={{background:"#fff",borderRadius:14,marginBottom:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                    <div style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #F1F5F9"}}>
                      <div>
                        <div style={{fontSize:12,color:"#64748B"}}>{timeStr(sale.ts)}</div>
                        <div style={{fontSize:13,fontWeight:700,color:sale.method==="cash"?"#059669":"#2563EB"}}>{sale.method==="cash"?"💵 เงินสด":"📱 QR Code"}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:18,fontWeight:900,color:"#1E293B"}}>฿{fmt(sale.total)}</div>
                        <div style={{fontSize:11,fontWeight:700,color:"#16A34A"}}>กำไร ฿{fmt(sale.profit)}</div>
                      </div>
                    </div>
                    <div style={{padding:"8px 14px 10px"}}>
                      {(sale.items||[]).map((item,idx)=>(
                        <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#475569",padding:"2px 0"}}>
                          <span>{item.emoji} {item.name} ({item.unit}) ×{item.qty}</span>
                          <span style={{fontWeight:600}}>฿{fmt(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab==="manage" && <ManageTab products={products} onSave={saveProduct} onDelete={deleteProduct} />}
      </div>

      {/* CART BAR */}
      {tab==="pos"&&cart.length>0&&(
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#fff",borderTop:"1.5px solid #E2E8F0",zIndex:90,boxShadow:"0 -4px 20px rgba(0,0,0,0.1)"}}>
          <div style={{maxHeight:168,overflowY:"auto",padding:"8px 12px 4px"}}>
            {cart.map(item=>(
              <div key={item.key} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #F8FAFC"}}>
                <span style={{fontSize:18}}>{item.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {item.name} <span style={{color:"#94A3B8"}}>({item.unit})</span>
                  </div>
                  <button onClick={()=>setModal({type:"price_edit",item})} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:600}}>
                    ฿{fmt(item.price)}/{item.unit} ✏️
                  </button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <SBtn label="−" onClick={()=>changeQty(item.key,-1)}/>
                  <span style={{fontWeight:800,fontSize:16,minWidth:22,textAlign:"center"}}>{item.qty}</span>
                  <SBtn label="+" onClick={()=>changeQty(item.key,1)} color="#16A34A"/>
                  <SBtn label="×" onClick={()=>removeFromCart(item.key)} color="#DC2626"/>
                </div>
                <div style={{fontWeight:800,fontSize:14,minWidth:52,textAlign:"right",color:"#1E293B"}}>฿{fmt(item.price*item.qty)}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"8px 14px 20px",display:"flex",alignItems:"center",gap:10}}>
            <div>
              <div style={{fontSize:11,color:"#94A3B8"}}>{cartCount} รายการ</div>
              <div style={{fontSize:23,fontWeight:900,color:"#0F172A",lineHeight:1.1}}>฿{fmt(cartRevenue)}</div>
              <div style={{fontSize:11,fontWeight:700,color:"#16A34A"}}>กำไร ~฿{fmt(cartProfit)}</div>
            </div>
            <button onClick={()=>setModal({type:"payment"})} style={{flex:1,background:"linear-gradient(135deg,#22C55E,#15803D)",color:"#fff",border:"none",borderRadius:16,padding:"15px 0",fontSize:18,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 14px rgba(34,197,94,0.35)"}}>
              💳 ชำระเงิน
            </button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {modal?.type==="unit"&&(
        <BottomSheet onClose={()=>setModal(null)}>
          <UnitPicker product={modal.product} onAdd={addToCart}/>
        </BottomSheet>
      )}
      {modal?.type==="payment"&&(
        <BottomSheet onClose={()=>setModal(null)}>
          <div style={{padding:"28px 20px 38px",textAlign:"center"}}>
            <div style={{fontSize:13,color:"#64748B",marginBottom:4}}>ยอดชำระทั้งหมด</div>
            <div style={{fontSize:50,fontWeight:900,color:"#0F172A",letterSpacing:-1,lineHeight:1.1}}>฿{fmt(cartRevenue)}</div>
            <div style={{fontSize:14,fontWeight:700,color:"#16A34A",marginBottom:28}}>กำไร ~฿{fmt(cartProfit)}</div>
            <button onClick={()=>checkout("cash")} style={{width:"100%",padding:"18px",background:"linear-gradient(135deg,#22C55E,#15803D)",color:"#fff",border:"none",borderRadius:16,fontSize:19,fontWeight:800,cursor:"pointer",marginBottom:12,boxShadow:"0 4px 16px rgba(34,197,94,0.35)"}}>💵 เงินสด</button>
            <button onClick={()=>checkout("qr")}  style={{width:"100%",padding:"18px",background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"#fff",border:"none",borderRadius:16,fontSize:19,fontWeight:800,cursor:"pointer",marginBottom:18,boxShadow:"0 4px 16px rgba(59,130,246,0.3)"}}>📱 สแกน QR</button>
            <button onClick={()=>setModal(null)} style={{background:"none",border:"none",color:"#94A3B8",fontSize:15,cursor:"pointer"}}>ยกเลิก</button>
          </div>
        </BottomSheet>
      )}
      {modal?.type==="price_edit"&&(
        <BottomSheet onClose={()=>setModal(null)}>
          <PriceEditInner item={modal.item} onSave={(k,p)=>{updateCartPrice(k,p);setModal(null);}} onClose={()=>setModal(null)}/>
        </BottomSheet>
      )}

      {/* Voice Confirm */}
      {voiceConfirm&&(
        <BottomSheet onClose={()=>setVoiceConfirm(null)}>
          <div style={{padding:"22px 20px 32px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#8B5CF6",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>🎤 ยืนยันรายการที่พูด</div>
            <div style={{background:voiceConfirm.product.bg,border:`2px solid ${voiceConfirm.product.color}44`,borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:44}}>{voiceConfirm.product.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:18,color:"#1E293B"}}>{voiceConfirm.product.name}</div>
                <div style={{fontSize:14,color:"#64748B",marginTop:2}}>{voiceConfirm.unit.name} · ฿{fmt(voiceConfirm.unit.price)}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:20}}>
              <button onClick={()=>setVoiceConfirm(v=>({...v,qty:Math.max(1,v.qty-1)}))}
                style={{width:44,height:44,borderRadius:12,border:"2px solid #E2E8F0",background:"#F8FAFC",fontSize:22,fontWeight:800,cursor:"pointer",color:"#64748B"}}>−</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:36,fontWeight:900,color:"#1E293B",lineHeight:1}}>{voiceConfirm.qty}</div>
                <div style={{fontSize:12,color:"#94A3B8"}}>{voiceConfirm.unit.note}</div>
              </div>
              <button onClick={()=>setVoiceConfirm(v=>({...v,qty:v.qty+1}))}
                style={{width:44,height:44,borderRadius:12,border:"2px solid #E2E8F0",background:"#F8FAFC",fontSize:22,fontWeight:800,cursor:"pointer",color:"#16A34A"}}>+</button>
            </div>
            <div style={{textAlign:"center",fontSize:14,fontWeight:700,color:"#64748B",marginBottom:18}}>
              รวม <span style={{fontSize:22,color:"#1E293B",fontWeight:900}}>฿{fmt(voiceConfirm.unit.price*voiceConfirm.qty)}</span>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setVoiceConfirm(null)}
                style={{flex:1,padding:"14px",background:"#F1F5F9",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",color:"#64748B"}}>ยกเลิก</button>
              <button onClick={()=>{
                for(let i=0;i<voiceConfirm.qty;i++) addToCart(voiceConfirm.product, voiceConfirm.unit);
                setVoiceConfirm(null);
                showToast(`✅ เพิ่ม ${voiceConfirm.product.name} ×${voiceConfirm.qty}`);
              }} style={{flex:2,padding:"14px",background:"linear-gradient(135deg,#8B5CF6,#6D28D9)",border:"none",borderRadius:14,fontWeight:800,fontSize:15,cursor:"pointer",color:"#fff",boxShadow:"0 4px 14px rgba(109,40,217,0.35)"}}>
                🛒 เพิ่มเข้าตะกร้า
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {toast&&(
        <div style={{position:"fixed",top:86,left:"50%",transform:"translateX(-50%)",background:toast.color,color:"#fff",padding:"12px 20px",borderRadius:50,fontWeight:700,fontSize:14,zIndex:999,whiteSpace:"nowrap",maxWidth:"88vw",textAlign:"center",boxShadow:"0 4px 20px rgba(0,0,0,0.2)",animation:"toastIn 0.25s ease"}}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;}
        button,input,select{font-family:inherit;}
        button:active{transform:scale(0.94)!important;}
        @keyframes toastIn{from{opacity:0;top:66px}to{opacity:1;top:86px}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// VOICE PARSER — แยก logic การแปลงเสียง
// ─────────────────────────────────────────────
function parseVoiceText(text, products) {
  const t = text.trim();
  const tl = t.toLowerCase();

  // ── หาตัวเลข (รองรับทั้ง ๑๒๓ และ 123) ──
  const thaiNums = {"๐":0,"๑":1,"๒":2,"๓":3,"๔":4,"๕":5,"๖":6,"๗":7,"๘":8,"๙":9};
  const normalized = t.replace(/[๐-๙]/g, c => thaiNums[c]||0);
  const nums = normalized.match(/\d+(\.\d+)?/g)?.map(Number) || [];

  // ── หาสินค้าจากชื่อเต็ม (priority สูงสุด) ──
  let matchedProd = null;
  for (const p of products) {
    if (tl.includes(p.name.toLowerCase())) { matchedProd = p; break; }
  }

  // ── ถ้าไม่เจอ ใช้ keyword + ขนาด ──
  if (!matchedProd) {
    // ปลาทู — จับขนาดจากหลายรูปแบบ
    if (tl.includes("ปลาทู") || tl.includes("ปลา")) {
      const fish = products.filter(p=>p.cat==="fish");
      if (tl.includes("xl") || tl.includes("หกสิบ") || tl.includes("60")) matchedProd=fish.find(p=>p.id==="fish1")||fish[0];
      else if (tl.includes("สามสิบห้า")||tl.includes("35")) matchedProd=fish.find(p=>p.id==="fish2")||fish[0];
      else if (tl.includes("ยี่สิบห้า")||tl.includes("25")||tl.includes(" m ")) matchedProd=fish.find(p=>p.id==="fish3")||fish[0];
      else if (tl.includes(" s ")||tl.includes("ยี่สิบ")||tl.includes("20")) matchedProd=fish.find(p=>p.id==="fish4")||fish[0];
      else if (tl.includes("ใหญ่")) matchedProd=fish.find(p=>p.id==="fish1")||fish[0];
      else if (tl.includes("เล็ก")) matchedProd=fish.find(p=>p.id==="fish4")||fish[0];
      else matchedProd=fish[0];
    }
    // ไข่ไก่ — จับเบอร์
    else if (tl.includes("ไข่ไก่")||tl.includes("ไก่")) {
      const chk = products.filter(p=>p.cat==="chicken");
      const gradeMatch = normalized.match(/เบอร์?\s*(\d)|#\s*(\d)|หมายเลข\s*(\d)/);
      const grade = gradeMatch ? parseInt(gradeMatch[1]||gradeMatch[2]||gradeMatch[3]) : (nums.length>0?nums[0]:null);
      if (grade!==null && grade>=0 && grade<=5) matchedProd=chk.find(p=>p.id===`c${grade}`)||chk[0];
      else matchedProd=chk[0];
    }
    // ไข่เป็ด
    else if (tl.includes("เป็ด")||tl.includes("ไข่เป็ด")) {
      const dk = products.filter(p=>p.cat==="duck");
      const gradeMatch = normalized.match(/เบอร์?\s*(\d)|#\s*(\d)/);
      const grade = gradeMatch ? parseInt(gradeMatch[1]||gradeMatch[2]) : null;
      if (grade!==null) matchedProd=dk.find(p=>p.id===`d${grade}`)||dk[0];
      else matchedProd=dk[0];
    }
    // เปลือกบาง
    else if (tl.includes("เปลือกบาง")||tl.includes("บาง")) {
      const th = products.filter(p=>p.cat==="thin");
      matchedProd = th[0];
    }
    // เยี่ยวม้า
    else if (tl.includes("เยี่ยวม้า")||tl.includes("ม้า")) {
      const c = products.filter(p=>p.cat==="century");
      matchedProd = tl.includes("ใหญ่") ? c.find(p=>p.id==="cent2")||c[0] : c[0];
    }
    // ไข่เค็ม
    else if (tl.includes("เค็ม")||tl.includes("ไชยา")) {
      const s = products.filter(p=>p.cat==="salty");
      if (tl.includes("ไชยา")) matchedProd=s.find(p=>p.id==="salt3")||s[0];
      else if (tl.includes("สุก")) matchedProd=s.find(p=>p.id==="salt2")||s[0];
      else matchedProd=s[0];
    }
  }

  // ── หาหน่วย ──
  let unitHint = null;
  if (tl.includes("แผง")||tl.includes("เพลง")) unitHint="ทั้งแผง";       // "เพลง" เพราะ STT บางครั้งได้ยินผิด
  else if (tl.includes("ถุง")) unitHint="ถุง 10";
  else if (tl.includes("ถาด")) unitHint="ถาด/ตัว";
  else if (tl.includes("ฟอง")||tl.includes("ตัว")||tl.includes("อัน")) unitHint="ฟอง";

  // ── หาจำนวน (เอาตัวเลขแรกที่ไม่ใช่เบอร์สินค้า) ──
  let qty = null;
  if (nums.length > 0) {
    // ถ้าเป็นไข่ไก่และมีตัวเลขเดียว อาจเป็นเบอร์ไม่ใช่จำนวน
    // ดูจาก context — ถ้ามีคำว่าแผง/ถุง/ฟอง ตัวเลขน่าจะเป็นจำนวน
    if (unitHint || nums.length >= 2) {
      qty = unitHint ? nums[0] : nums[nums.length-1];
    } else if (matchedProd?.cat === "fish") {
      qty = nums[0]; // ปลาทูตัวเลขมักเป็นจำนวน
    }
  }

  return { product: matchedProd, unitHint, qty, raw: text };
}

// ─────────────────────────────────────────────
// VOICE INPUT HOOK
// ─────────────────────────────────────────────
function useVoiceInput(products, onParsed) {
  const [listening,   setListening]   = useState(false);
  const [transcript,  setTranscript]  = useState("");
  const [interim,     setInterim]     = useState("");
  const [voiceError,  setVoiceError]  = useState("");
  const recRef = useRef(null);

  const SpeechRec = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = !!SpeechRec;

  const startListening = useCallback(() => {
    if (!supported) { setVoiceError("เบราว์เซอร์นี้ไม่รองรับ — ใช้ Chrome หรือ Safari"); return; }
    setVoiceError(""); setTranscript(""); setInterim("");
    const rec = new SpeechRec();
    rec.lang = "th-TH";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onstart  = () => setListening(true);
    rec.onresult = (e) => {
      let final = "", inter = "";
      for (const res of e.results) {
        if (res.isFinal) final += res[0].transcript;
        else inter += res[0].transcript;
      }
      setInterim(inter);
      if (final) {
        setTranscript(final);
        setInterim("");
        const parsed = parseVoiceText(final, products);
        onParsed(parsed);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") setVoiceError("ไม่ได้ยินเสียง — ลองอีกครั้ง");
      else if (e.error === "not-allowed") setVoiceError("กรุณาอนุญาต microphone ในเบราว์เซอร์");
      else setVoiceError("เกิดข้อผิดพลาด: " + e.error);
      setListening(false);
    };
    rec.onend = () => { setListening(false); setInterim(""); };
    recRef.current = rec;
    try { rec.start(); } catch(e) { setVoiceError("ไม่สามารถเริ่มฟังได้"); }
  }, [products, onParsed, supported]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const displayText = interim || transcript;
  return { listening, transcript: displayText, voiceError, supported, startListening, stopListening };
}

// ─────────────────────────────────────────────
// PURCHASE TAB
// ─────────────────────────────────────────────
function PurchaseTab({ products, purchases, onSave }) {
  const [sel,          setSel]          = useState(null);
  const [qtyDisplay,   setQtyDisplay]   = useState("");
  const [unitLabel,    setUnitLabel]    = useState("แผง");
  const [unitsPerPack, setUnitsPerPack] = useState(30);
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [totalCost,    setTotalCost]    = useState("");
  const [saving,       setSaving]       = useState(false);

  const isFish = sel?.cat === "fish";
  const qtyNum  = parseFloat(qtyDisplay) || 0;
  const ppuNum  = parseFloat(pricePerUnit) || 0;
  const costPerUnit = qtyNum > 0 && parseFloat(totalCost) > 0
    ? parseFloat(totalCost) / (qtyNum * unitsPerPack) : 0;
  const todayPurchases = purchases.filter(p => dateKey(p.ts) === dateKey(new Date()));

  // เมื่อเลือกสินค้า ให้ดึงราคาต้นทุนเดิมมาใส่อัตโนมัติ
  const selectProduct = (p) => {
    const fish = p.cat === "fish";
    setSel(p);
    const defUnit = fish ? "ถาด" : "แผง";
    const defPack = fish ? 1 : 30;
    setUnitLabel(defUnit);
    setUnitsPerPack(defPack);
    setQtyDisplay("");
    setTotalCost("");
    // ดึงต้นทุนต่อหน่วยที่บันทึกไว้มาแสดง (cost_unit คือต่อฟอง/ตัว)
    // แปลงกลับเป็นต่อแผง/ถาด
    const defaultPpu = fish
      ? (p.cost_unit > 0 ? String(p.cost_unit) : "")
      : (p.cost_unit > 0 ? String(parseFloat((p.cost_unit * defPack).toFixed(2))) : "");
    setPricePerUnit(defaultPpu);
  };

  const handlePricePerUnit = (val) => {
    setPricePerUnit(val);
    const ppu = parseFloat(val) || 0;
    if (ppu > 0 && qtyNum > 0) setTotalCost(String(ppu * qtyNum));
  };
  const handleQty = (val) => {
    setQtyDisplay(val);
    const qty = parseFloat(val) || 0;
    if (ppuNum > 0 && qty > 0) setTotalCost(String(ppuNum * qty));
  };
  const handleUnit = (label, pack) => {
    setUnitLabel(label);
    setUnitsPerPack(pack);
    // คำนวณ pricePerUnit ใหม่จาก cost_unit ของสินค้า
    if (sel) {
      const ppu = sel.cost_unit > 0 ? parseFloat((sel.cost_unit * pack).toFixed(2)) : 0;
      setPricePerUnit(ppu > 0 ? String(ppu) : "");
      if (ppu > 0 && qtyNum > 0) setTotalCost(String(ppu * qtyNum));
    }
  };

  const resetForm = () => { setQtyDisplay(""); setTotalCost(""); setPricePerUnit(""); setSel(null); };

  const handleSave = () => {
    if (!sel || !qtyDisplay || !totalCost) return;
    setSaving(true);
    onSave({ productId:sel.id, productName:sel.name, qtyDisplay:parseFloat(qtyDisplay),
      unitLabel, unitsPerPack:parseFloat(unitsPerPack), totalCost:parseFloat(totalCost) });
    resetForm();
    setSaving(false);
  };

  // Voice
  const voice = useVoiceInput(products, ({ product, unit, qty }) => {
    if (product) selectProduct(product);
    if (qty) { setQtyDisplay(String(qty)); }
  });

  return (
    <div style={{padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
        <div style={{fontWeight:800,fontSize:17,color:"#1E293B"}}>🧾 บันทึกการซื้อสินค้า</div>
        <VoiceButton voice={voice} hint="พูดชื่อสินค้า เช่น 'ปลาทู XL 5 ถาด'" />
      </div>
      <div style={{fontSize:12,color:"#94A3B8",marginBottom:voice.transcript?8:14}}>บันทึกทุกครั้งที่ซื้อของมา — ระบบคำนวณต้นทุนให้อัตโนมัติ</div>

      {voice.transcript && (
        <div style={{background:"#F8FAFC",border:"1.5px solid #CBD5E1",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:13,color:"#475569"}}>
          🎤 "{voice.transcript}"
        </div>
      )}
      {voice.voiceError && (
        <div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#DC2626"}}>
          {voice.voiceError}
        </div>
      )}

      {/* ① เลือกสินค้า */}
      <div style={{background:"#fff",borderRadius:16,padding:14,marginBottom:12,boxShadow:"0 1px 5px rgba(0,0,0,0.06)"}}>
        <div style={{fontWeight:700,fontSize:13,color:"#374151",marginBottom:10}}>① เลือกสินค้าที่ซื้อมา</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {products.map(p => (
            <button key={p.id} onClick={() => selectProduct(p)}
              style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${sel?.id===p.id?p.color:"#E2E8F0"}`,background:sel?.id===p.id?p.bg:"#fff",fontWeight:700,fontSize:12,color:sel?.id===p.id?p.color:"#64748B",cursor:"pointer",transition:"all 0.1s"}}>
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* ② กรอกข้อมูล */}
      {sel && (
        <div style={{background:"#fff",borderRadius:16,padding:14,marginBottom:12,boxShadow:"0 1px 5px rgba(0,0,0,0.06)"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#374151",marginBottom:12}}>② ใส่ข้อมูลที่ซื้อ</div>
          <div style={{background:sel.bg,border:`1.5px solid ${sel.color}33`,borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:28}}>{sel.emoji}</span>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#1E293B"}}>{sel.name}</div>
              <div style={{fontSize:11,color:"#64748B"}}>ต้นทุนครั้งก่อน ฿{fmtFull(sel.cost_unit)}/หน่วย</div>
            </div>
          </div>

          {/* หน่วยที่ซื้อ */}
          {!isFish && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:6}}>หน่วยที่ซื้อ</div>
              <div style={{display:"flex",gap:6}}>
                {[{label:"แผง",units:30},{label:"ถุง 10",units:10},{label:"ฟอง",units:1}].map(u => (
                  <button key={u.label} onClick={() => handleUnit(u.label, u.units)}
                    style={{flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${unitLabel===u.label?"#F59E0B":"#E2E8F0"}`,background:unitLabel===u.label?"#FFFBEB":"#fff",fontWeight:700,fontSize:13,color:unitLabel===u.label?"#D97706":"#64748B",cursor:"pointer"}}>
                    {u.label}<br/><span style={{fontSize:10,fontWeight:500,color:"#94A3B8"}}>{u.units} ฟอง</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* จำนวน + ราคาต่อหน่วย */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:4}}>จำนวน ({isFish?"ถาด":unitLabel})</div>
              <input type="number" value={qtyDisplay} onChange={e=>handleQty(e.target.value)} placeholder="เช่น 10"
                style={{width:"100%",padding:"10px 12px",border:"2px solid #E2E8F0",borderRadius:10,fontSize:16,fontWeight:700,outline:"none",color:"#1E293B"}}/>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#3B82F6",marginBottom:4}}>
                ราคาต่อ{isFish?"ถาด":unitLabel} (฿)
                {ppuNum>0&&sel.cost_unit>0&&parseFloat((sel.cost_unit*(isFish?1:unitsPerPack)).toFixed(2))===ppuNum
                  &&<span style={{fontSize:10,color:"#94A3B8",marginLeft:4}}>← ครั้งก่อน</span>}
              </div>
              <input type="number" value={pricePerUnit} onChange={e=>handlePricePerUnit(e.target.value)}
                placeholder={`ครั้งก่อน ${fmtFull(sel.cost_unit*(isFish?1:unitsPerPack))}`}
                style={{width:"100%",padding:"10px 12px",border:"2px solid #93C5FD",borderRadius:10,fontSize:16,fontWeight:700,outline:"none",color:"#1E293B",background:"#EFF6FF"}}/>
            </div>
          </div>

          {/* ราคารวม */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:4}}>
              ราคาที่จ่ายทั้งหมด (฿)
              {ppuNum>0&&qtyNum>0&&<span style={{fontSize:11,color:"#22C55E",fontWeight:600,marginLeft:6}}>✓ คำนวณอัตโนมัติ</span>}
            </div>
            <input type="number" value={totalCost} onChange={e=>setTotalCost(e.target.value)} placeholder="เช่น 900"
              style={{width:"100%",padding:"10px 12px",border:`2px solid ${ppuNum>0&&qtyNum>0?"#86EFAC":"#E2E8F0"}`,borderRadius:10,fontSize:18,fontWeight:800,outline:"none",color:"#1E293B",background:ppuNum>0&&qtyNum>0?"#F0FDF4":"#fff"}}/>
          </div>

          {/* สรุป */}
          {costPerUnit > 0 && (
            <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:13,color:"#15803D",marginBottom:3}}>📊 สรุปการซื้อ</div>
              <div style={{fontSize:13,color:"#166534",lineHeight:1.8}}>
                ซื้อ {qtyDisplay} {isFish?"ถาด":unitLabel} = <b>{qtyNum*unitsPerPack}</b> {isFish?"ถาด":"ฟอง"}<br/>
                ต้นทุนใหม่/หน่วย: <b style={{fontSize:16}}>฿{fmtFull(costPerUnit)}</b>
                {sel.cost_unit>0&&costPerUnit!==sel.cost_unit&&(
                  <span style={{fontSize:11,marginLeft:6,color:costPerUnit<sel.cost_unit?"#16A34A":"#DC2626"}}>
                    ({costPerUnit<sel.cost_unit?"↓ ถูกลง":"↑ แพงขึ้น"} จาก ฿{fmtFull(sel.cost_unit)})
                  </span>
                )}<br/>
                <span style={{fontSize:11,opacity:0.75}}>(จะอัปเดตต้นทุนสินค้านี้ทันที)</span>
              </div>
            </div>
          )}

          <button onClick={handleSave} disabled={saving||!qtyDisplay||!totalCost}
            style={{width:"100%",padding:"14px",background:(!qtyDisplay||!totalCost)?"#E2E8F0":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:(!qtyDisplay||!totalCost)?"#94A3B8":"#fff",border:"none",borderRadius:14,fontWeight:800,fontSize:16,cursor:(!qtyDisplay||!totalCost)?"not-allowed":"pointer",transition:"all 0.2s"}}>
            {saving?"⏳ บันทึก...":"💾 บันทึกการซื้อ"}
          </button>
        </div>
      )}

      {/* วันนี้ซื้อไปแล้ว */}
      {todayPurchases.length > 0 && (
        <>
          <div style={{fontWeight:700,fontSize:13,color:"#64748B",marginBottom:8}}>✅ ซื้อวันนี้แล้ว</div>
          {todayPurchases.map(p => (
            <div key={p.id} style={{background:"#fff",borderRadius:12,padding:"10px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>{p.product_name}</div>
                <div style={{fontSize:11,color:"#64748B"}}>{timeStr(p.ts)} · {fmt(p.qty_display)} {p.unit_label} ({fmt(p.qty_unit)} หน่วย)</div>
                <div style={{fontSize:11,color:"#16A34A",fontWeight:600}}>ต้นทุน/หน่วย ฿{fmtFull(p.cost_per_unit)}</div>
              </div>
              <div style={{fontWeight:800,fontSize:16,color:"#DC2626"}}>฿{fmt(p.total_cost)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MANAGE TAB
// ─────────────────────────────────────────────
function ManageTab({ products, onSave, onDelete }) {
  const [editing,  setEditing]  = useState(null);
  const [confirmId,setConfirmId]= useState(null);
  const blank = {name:"",cat:"chicken",emoji:"🥚",color:"#F59E0B",bg:"#FFFBEB",price_unit:0,price_pack10:0,price_tray:0,cost_unit:0};
  const confirmProd = products.find(p=>p.id===confirmId);

  return (
    <div style={{padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontWeight:800,fontSize:17,color:"#1E293B"}}>⚙️ จัดการสินค้า</div>
        <button onClick={()=>setEditing({...blank})} style={{padding:"8px 16px",background:"#3B82F6",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:14,cursor:"pointer"}}>+ เพิ่มสินค้า</button>
      </div>
      {CAT_ORDER.map(cat=>{
        const cp=products.filter(p=>p.cat===cat);
        if(!cp.length) return null;
        const meta=CAT_META[cat]||CAT_META.custom;
        return (
          <div key={cat} style={{background:"#fff",borderRadius:16,marginBottom:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{padding:"10px 16px",background:meta.hBg,fontWeight:700,fontSize:13,color:"#374151",borderBottom:`1.5px solid ${meta.hBorder}`}}>{meta.label}</div>
            {cp.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderTop:"1px solid #F8FAFC"}}>
                <span style={{fontSize:22}}>{p.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#64748B"}}>
                    หน่วย ฿{p.price_unit}{p.price_pack10>0?` · ถุง10 ฿${p.price_pack10}`:""}{p.price_tray>0?` · แผง ฿${p.price_tray}`:""} · ต้นทุน ฿{p.cost_unit}
                  </div>
                </div>
                <button onClick={()=>setEditing({...p})} style={{padding:"6px 12px",background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:8,color:"#2563EB",fontWeight:700,fontSize:12,cursor:"pointer"}}>แก้ไข</button>
                <button onClick={()=>setConfirmId(p.id)} style={{padding:"6px 10px",background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:8,color:"#DC2626",fontWeight:700,fontSize:12,cursor:"pointer"}}>ลบ</button>
              </div>
            ))}
          </div>
        );
      })}

      {editing&&(
        <BottomSheet onClose={()=>setEditing(null)}>
          <ProductEditInner product={editing} onSave={(p)=>{onSave(p);setEditing(null);}} onClose={()=>setEditing(null)}/>
        </BottomSheet>
      )}
      {confirmId&&confirmProd&&(
        <BottomSheet onClose={()=>setConfirmId(null)}>
          <div style={{padding:"24px 20px 36px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
            <div style={{fontWeight:800,fontSize:16,color:"#1E293B",marginBottom:8}}>ลบ "{confirmProd.name}"?</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:24}}>สินค้าจะหายจากหน้าขาย<br/>ประวัติการขายจะยังคงอยู่</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmId(null)} style={{flex:1,padding:"14px",background:"#F1F5F9",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",color:"#64748B"}}>ยกเลิก</button>
              <button onClick={()=>{onDelete(confirmId);setConfirmId(null);}} style={{flex:1,padding:"14px",background:"#EF4444",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",color:"#fff"}}>🗑 ลบเลย</button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PRODUCT EDIT FORM (inside BottomSheet)
// ─────────────────────────────────────────────
function ProductEditInner({ product, onSave, onClose }) {
  const [form, setForm] = useState(product);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const isFish    = ["fish"].includes(form.cat);
  const hasPack10 = !isFish;
  const hasTray   = ["chicken","thin","duck"].includes(form.cat);

  return (
    <div style={{padding:"20px 18px 36px"}}>
      <div style={{fontWeight:800,fontSize:17,color:"#1E293B",marginBottom:16}}>{product.id?"✏️ แก้ไขสินค้า":"➕ เพิ่มสินค้าใหม่"}</div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:5}}>ชื่อสินค้า</div>
        <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="เช่น ไข่ไก่ #0"
          style={{width:"100%",padding:"10px 12px",border:"2px solid #E2E8F0",borderRadius:10,fontSize:14,fontWeight:600,outline:"none",color:"#1E293B",background:"#FAFAFA"}}/>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:5}}>หมวดหมู่</div>
        <select value={form.cat} onChange={e=>set("cat",e.target.value)} style={{width:"100%",padding:"10px 12px",border:"2px solid #E2E8F0",borderRadius:10,fontSize:14,fontWeight:600,outline:"none",color:"#1E293B",background:"#FAFAFA"}}>
          {CAT_OPTIONS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:5}}>ไอคอน</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {EMOJI_OPTIONS.map(e=>(
            <button key={e} onClick={()=>set("emoji",e)} style={{fontSize:22,width:40,height:40,borderRadius:10,border:`2px solid ${form.emoji===e?"#3B82F6":"#E2E8F0"}`,background:form.emoji===e?"#EFF6FF":"#fff",cursor:"pointer"}}>{e}</button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:5}}>สี</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {COLOR_OPTIONS.map(c=>(
            <button key={c.color} onClick={()=>{set("color",c.color);set("bg",c.bg);}} style={{width:32,height:32,borderRadius:8,background:c.color,border:`3px solid ${form.color===c.color?"#1E293B":"transparent"}`,cursor:"pointer"}}/>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:hasTray?"1fr 1fr 1fr 1fr":"hasPack10"?"1fr 1fr":"1fr 1fr",gap:8,marginBottom:16}}>
        <NumInput label="ต่อหน่วย ฿"  value={form.price_unit}   onChange={v=>set("price_unit",v)}   color="#F59E0B"/>
        {hasPack10&&<NumInput label="ถุง 10 ฿"   value={form.price_pack10} onChange={v=>set("price_pack10",v)} color="#3B82F6"/>}
        {hasTray&&  <NumInput label="แผง 30 ฿"   value={form.price_tray}   onChange={v=>set("price_tray",v)}   color="#8B5CF6"/>}
        <NumInput label="ต้นทุน ฿"   value={form.cost_unit}    onChange={v=>set("cost_unit",v)}    color="#DC2626"/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"13px",background:"#F1F5F9",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",color:"#64748B"}}>ยกเลิก</button>
        <button onClick={()=>onSave(form)} disabled={!form.name} style={{flex:2,padding:"13px",background:!form.name?"#E2E8F0":"#3B82F6",border:"none",borderRadius:14,fontWeight:800,fontSize:15,cursor:!form.name?"not-allowed":"pointer",color:!form.name?"#94A3B8":"#fff"}}>✅ บันทึก</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED SMALL COMPONENTS
// ─────────────────────────────────────────────
function UnitPicker({ product: p, onAdd }) {
  const units = getUnits(p);
  return (
    <div style={{padding:"20px 18px 30px"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,paddingBottom:14,borderBottom:"1.5px solid #F1F5F9"}}>
        <div style={{fontSize:46}}>{p.emoji}</div>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:"#1E293B"}}>{p.name}</div>
          <div style={{fontSize:12,color:"#64748B"}}>ต้นทุน ฿{fmtFull(p.cost_unit)}/หน่วย</div>
        </div>
      </div>
      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>เลือกรูปแบบ</div>
      {units.map(unit=>{
        const est = unit.price - p.cost_unit*unit.size;
        return (
          <button key={unit.name} onClick={()=>onAdd(p,unit)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",marginBottom:8,background:unit.size>=10?p.bg:"#fff",border:`2px solid ${unit.size>=10?p.color+"44":"#E2E8F0"}`,borderRadius:14,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>{unit.icon}</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontWeight:800,fontSize:16,color:"#1E293B"}}>{unit.name}</div>
                <div style={{fontSize:11,color:"#64748B"}}>{unit.note} · กำไร ~฿{fmt(est)}</div>
              </div>
            </div>
            <div style={{fontWeight:900,fontSize:22,color:p.color}}>฿{fmt(unit.price)}</div>
          </button>
        );
      })}
    </div>
  );
}

function PriceEditInner({ item, onSave, onClose }) {
  const [val, setVal] = useState(item.price);
  return (
    <div style={{padding:"20px 20px 36px"}}>
      <div style={{fontWeight:800,fontSize:17,color:"#1E293B",marginBottom:4}}>แก้ไขราคาเฉพาะบิลนี้</div>
      <div style={{fontSize:14,color:"#64748B",marginBottom:16}}>{item.emoji} {item.name} ({item.unit})</div>
      <input type="number" value={val} onChange={e=>setVal(e.target.value)} autoFocus
        style={{width:"100%",padding:"16px",fontSize:30,fontWeight:900,textAlign:"center",border:"2px solid #3B82F6",borderRadius:14,outline:"none",color:"#1E293B",marginBottom:16}}/>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"14px",background:"#F1F5F9",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",color:"#64748B"}}>ยกเลิก</button>
        <button onClick={()=>onSave(item.key,val)} style={{flex:2,padding:"14px",background:"#3B82F6",border:"none",borderRadius:16,fontSize:15,fontWeight:700,cursor:"pointer",color:"#fff"}}>✅ บันทึก</button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, bg, border }) {
  return (
    <div style={{background:bg,border:`1.5px solid ${border}`,borderRadius:14,padding:"10px 8px",textAlign:"center"}}>
      <div style={{fontSize:10,color:"#64748B",fontWeight:700,marginBottom:3}}>{label}</div>
      <div style={{fontSize:14,fontWeight:900,color,lineHeight:1.2}}>{value}</div>
      <div style={{fontSize:10,color,opacity:0.7,marginTop:2}}>{sub}</div>
    </div>
  );
}

function SBtn({ label, onClick, color="#64748B" }) {
  return (
    <button onClick={onClick} style={{width:28,height:28,borderRadius:8,border:`1.5px solid ${color}33`,background:`${color}11`,color,fontWeight:800,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{label}</button>
  );
}

function BottomSheet({ children, onClose }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,maxHeight:"92vh",overflowY:"auto",animation:"slideUp 0.22s ease"}}>
        <div style={{width:36,height:4,background:"#E2E8F0",borderRadius:4,margin:"12px auto 0"}}/>
        {children}
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, color }) {
  return (
    <div>
      <div style={{fontSize:10,fontWeight:700,color,marginBottom:4}}>{label}</div>
      <input type="number" value={value} onChange={e=>onChange(parseFloat(e.target.value)||0)}
        style={{width:"100%",padding:"8px",border:`2px solid ${color}44`,borderRadius:8,fontSize:14,fontWeight:800,color:"#0F172A",textAlign:"right",outline:"none",background:"#FAFAFA"}}/>
    </div>
  );
}

// ─────────────────────────────────────────────
// VOICE BUTTON — ปุ่มไมค์ใช้ร่วมกัน
// ─────────────────────────────────────────────
function VoiceButton({ voice, hint }) {
  if (!voice.supported) return null;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
      <button
        onClick={voice.listening ? voice.stopListening : voice.startListening}
        style={{
          display:"flex",alignItems:"center",gap:6,
          padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",
          background:voice.listening?"linear-gradient(135deg,#EF4444,#DC2626)":"linear-gradient(135deg,#8B5CF6,#6D28D9)",
          color:"#fff",fontWeight:700,fontSize:13,
          boxShadow:voice.listening?"0 0 0 4px rgba(239,68,68,0.25)":"0 2px 8px rgba(109,40,217,0.35)",
          animation:voice.listening?"pulse 1s infinite":"none",
        }}>
        {voice.listening ? "⏹ หยุดฟัง" : "🎤 พูด"}
      </button>
      {hint && !voice.listening && <div style={{fontSize:10,color:"#94A3B8",textAlign:"right",maxWidth:160}}>{hint}</div>}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}`}</style>
    </div>
  );
}
