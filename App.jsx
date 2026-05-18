import { useState, useEffect, useCallback } from "react";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyZpoJd5UqDnSE9B7ltoAi-tPWcpJQN5O82uW4prPeAwFCMMDwN_lw7PcL0jCyHuyEy0w/exec";

const PRESET_SERVICES = [
  "Manicura básica","Pedicura básica","Gel semipermanente",
  "Uñas de acrílico (un tono)","Uñas de acrílico con diseño","Otro",
];
const PAYMENT_METHODS = ["Efectivo","Transferencia","Tarjeta"];
const COLOR_PALETTE = [
  "#B5606B","#5B6FA8","#6B9E78","#C4894A","#7B5EA8","#A07B5E",
  "#5E8FA0","#A85E7B","#7A9E5B","#8B6BA0",
];

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:0}).format(Math.round(n));

const getWeekKey = () => {
  const now = new Date(), start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return `week-${start.toISOString().slice(0,10)}`;
};
const getWeekLabel = () => {
  const now = new Date(), start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate()+6);
  const fmt = (d) => d.toLocaleDateString("es-MX",{day:"numeric",month:"short"});
  return `${fmt(start)} – ${fmt(end)}`;
};
const todayLabel = () =>
  new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});

const DEFAULT_MANICURISTS = {
  Irene:  { goal:5000, commission:0.10, color:"#B5606B" },
  Naylea: { goal:5000, commission:0.15, color:"#5B6FA8" },
};

const EMPTY = (manicurists) => {
  const m = manicurists || DEFAULT_MANICURISTS;
  const entries = {};
  Object.keys(m).forEach(k => entries[k] = []);
  return { weekKey: getWeekKey(), manicurists: m, entries, history: [] };
};

const EMPTY_FORM = () => ({
  svc: PRESET_SERVICES[0], svcManual: "", useManual: false,
  amount: "", tip: "", payment: "Efectivo", note: "",
});

async function sheetLoad() {
  try {
    const res = await fetch(SCRIPT_URL);
    const text = await res.text();
    if (!text || text==="{}") return null;
    return JSON.parse(text);
  } catch { return null; }
}
async function sheetSave(payload) {
  try {
    await fetch(SCRIPT_URL,{
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"text/plain"},
      body: JSON.stringify(payload),
    });
  } catch {}
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncOk, setSyncOk]   = useState(null);
  const [view, setView]       = useState("tracker");
  const [forms, setForms]     = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const saved = await sheetLoad();
    const wk = getWeekKey();
    if (saved && saved.weekKey === wk) {
      if (!saved.manicurists) saved.manicurists = DEFAULT_MANICURISTS;
      setData(saved);
      initForms(saved.manicurists);
    } else if (saved && saved.weekKey !== wk) {
      const m = saved.manicurists || DEFAULT_MANICURISTS;
      const fresh = EMPTY(m);
      fresh.history = [...(saved.history||[]), {weekKey:saved.weekKey, entries:saved.entries, manicurists:m}];
      setData(fresh); initForms(m);
      await sheetSave(fresh);
    } else {
      const fresh = EMPTY();
      setData(fresh); initForms(fresh.manicurists);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const initForms = (m) => {
    const f = {};
    Object.keys(m).forEach(k => f[k] = EMPTY_FORM());
    setForms(f);
  };

  const persist = async (nd) => {
    setSyncing(true); setSyncOk(null);
    await sheetSave(nd);
    setSyncing(false); setSyncOk(true);
    setTimeout(() => setSyncOk(null), 2500);
  };

  const setForm = (name, patch) =>
    setForms(p => ({ ...p, [name]: { ...p[name], ...patch } }));

  const addEntry = (name) => {
    const f = forms[name];
    const amount = parseFloat(f.amount);
    if (!amount || amount <= 0) return;
    const tip = parseFloat(f.tip) || 0;
    const svcLabel = f.useManual ? (f.svcManual.trim() || "Otro") : f.svc;
    const entry = {
      id: Date.now(), amount, tip, service: svcLabel,
      payment: f.payment, note: f.note,
      time: new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}),
      day:  new Date().toLocaleDateString("es-MX",{weekday:"short",day:"numeric"}),
    };
    const nd = { ...data, entries: { ...data.entries, [name]: [...data.entries[name], entry] } };
    setData(nd); persist(nd);
    setForm(name, EMPTY_FORM());
  };

  const updateEntry = (name, id, fields) => {
    const nd = {
      ...data,
      entries: { ...data.entries, [name]: data.entries[name].map(e => e.id===id ? {...e,...fields} : e) },
    };
    setData(nd); persist(nd);
  };

  const removeEntry = (name, id) => {
    const nd = { ...data, entries: { ...data.entries, [name]: data.entries[name].filter(e => e.id!==id) } };
    setData(nd); persist(nd);
  };

  const resetWeek = async () => {
    if (!confirm("¿Cerrar la semana y empezar una nueva?\nSe guardará en el historial.")) return;
    const m = data.manicurists;
    const fresh = EMPTY(m);
    fresh.history = [...(data.history||[]), {weekKey:data.weekKey, entries:data.entries, manicurists:m}];
    setData(fresh); initForms(m); await persist(fresh);
  };

  const addManicurist = (name, goal, commission, color) => {
    const m = { ...data.manicurists, [name]: { goal, commission, color } };
    const entries = { ...data.entries, [name]: [] };
    const nd = { ...data, manicurists: m, entries };
    setData(nd); persist(nd);
    setForms(p => ({ ...p, [name]: EMPTY_FORM() }));
  };

  const removeManicurist = (name) => {
    if (!confirm(`¿Eliminar a ${name}? Se borrarán todos sus registros de esta semana.`)) return;
    const m = { ...data.manicurists };
    const entries = { ...data.entries };
    delete m[name]; delete entries[name];
    const nd = { ...data, manicurists: m, entries };
    setData(nd); persist(nd);
    setForms(p => { const f={...p}; delete f[name]; return f; });
  };

  if (loading || !data) return (
    <div style={{padding:"3rem",textAlign:"center"}}>
      <p style={{color:"var(--color-text-secondary)",fontSize:14}}>Conectando con Google Sheets…</p>
    </div>
  );

  const manicurists = data.manicurists || DEFAULT_MANICURISTS;
  const names = Object.keys(manicurists);
  const totals = {};
  const tips   = {};
  names.forEach(n => {
    totals[n] = data.entries[n].reduce((s,e) => s + e.amount, 0);
    tips[n]   = data.entries[n].reduce((s,e) => s + (e.tip||0), 0);
  });

  const syncIcon  = syncing ? "ti-loader-2" : syncOk ? "ti-circle-check" : "ti-brand-google";
  const syncColor = syncing ? "var(--color-text-secondary)" : syncOk ? "#3B6D11" : "var(--color-text-secondary)";
  const syncMsg   = syncing ? "Guardando…" : syncOk ? "Guardado en Google Sheets ✓" : todayLabel();

  const NAV = [
    {id:"tracker", icon:"ti-layout-columns", label:"Tracker"},
    {id:"resumen", icon:"ti-chart-bar",      label:"Resumen"},
    {id:"historial",icon:"ti-history",       label:"Historial"},
    {id:"config",  icon:"ti-settings",       label:"Manicuristas"},
  ];

  return (
    <div style={{padding:"1.25rem 1rem 2.5rem",fontFamily:"var(--font-sans)"}}>
      <h2 className="sr-only">Nail Spa — Registro semanal</h2>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.5rem",flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{fontSize:20,fontWeight:500,margin:0,color:"var(--color-text-primary)"}}>
            Nail Spa · Semana {getWeekLabel()}
          </p>
          <p style={{fontSize:12,color:syncOk?"#3B6D11":"var(--color-text-secondary)",margin:"3px 0 0",display:"flex",alignItems:"center",gap:5}}>
            <i className={`ti ${syncIcon}`} style={{fontSize:13,color:syncColor}} aria-hidden="true"/>
            {syncMsg}
          </p>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {NAV.map(btn => (
            <button key={btn.id} onClick={() => setView(btn.id)}
              style={{fontSize:12, background: view===btn.id ? "var(--color-background-secondary)" : undefined}}>
              <i className={`ti ${btn.icon}`} aria-hidden="true" style={{marginRight:4}}/>{btn.label}
            </button>
          ))}
          <button onClick={resetWeek} style={{fontSize:12}}>
            <i className="ti ti-calendar-plus" aria-hidden="true" style={{marginRight:4}}/>Nueva semana
          </button>
        </div>
      </div>

      {view==="tracker"   && <TrackerView data={data} manicurists={manicurists} names={names} totals={totals} tips={tips} forms={forms} setForm={setForm} addEntry={addEntry} updateEntry={updateEntry} removeEntry={removeEntry}/>}
      {view==="resumen"   && <ResumenView data={data} manicurists={manicurists} names={names} totals={totals} tips={tips}/>}
      {view==="historial" && <HistorialView history={data.history||[]}/>}
      {view==="config"    && <ConfigView manicurists={manicurists} names={names} addManicurist={addManicurist} removeManicurist={removeManicurist}/>}
    </div>
  );
}

// ── Entry Form ────────────────────────────────────────────────────────────────

function EntryForm({ name, meta, form, setForm, addEntry }) {
  return (
    <div style={{border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"12px",marginBottom:14}}>
      <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 10px",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em"}}>
        Registrar servicio
      </p>

      {/* Service toggle */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--color-text-secondary)",cursor:"pointer"}}>
          <input type="checkbox" checked={form.useManual}
            onChange={e => setForm(name,{useManual:e.target.checked})}
            style={{width:14,height:14,cursor:"pointer"}}/>
          Escribir manualmente
        </label>
      </div>

      {form.useManual ? (
        <input type="text" placeholder="Nombre del servicio" value={form.svcManual}
          onChange={e => setForm(name,{svcManual:e.target.value})}
          style={{width:"100%",marginBottom:8,fontSize:13}}/>
      ) : (
        <select value={form.svc} onChange={e => setForm(name,{svc:e.target.value})}
          style={{width:"100%",marginBottom:8,fontSize:13}}>
          {PRESET_SERVICES.map(s => <option key={s}>{s}</option>)}
        </select>
      )}

      {/* Amount + tip row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
        <div>
          <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Monto $</label>
          <input type="number" min="0" placeholder="0" value={form.amount}
            onChange={e => setForm(name,{amount:e.target.value})}
            onKeyDown={e => e.key==="Enter" && addEntry(name)}
            style={{width:"100%",fontSize:14}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Propina $</label>
          <input type="number" min="0" placeholder="0" value={form.tip}
            onChange={e => setForm(name,{tip:e.target.value})}
            onKeyDown={e => e.key==="Enter" && addEntry(name)}
            style={{width:"100%",fontSize:14}}/>
        </div>
      </div>

      {/* Payment method */}
      <div style={{marginBottom:8}}>
        <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Método de pago</label>
        <div style={{display:"flex",gap:6}}>
          {PAYMENT_METHODS.map(pm => {
            const active = form.payment===pm;
            return (
              <button key={pm} onClick={() => setForm(name,{payment:pm})}
                style={{flex:1,fontSize:12,padding:"5px 4px",
                  background: active ? meta.color : undefined,
                  color: active ? "#fff" : undefined,
                  border: active ? "none" : undefined,
                  borderRadius:"var(--border-radius-md)",cursor:"pointer"}}>
                {pm}
              </button>
            );
          })}
        </div>
      </div>

      {/* Note */}
      <input type="text" placeholder="Nota (opcional)" value={form.note}
        onChange={e => setForm(name,{note:e.target.value})}
        onKeyDown={e => e.key==="Enter" && addEntry(name)}
        style={{width:"100%",marginBottom:10,fontSize:13}}/>

      <button onClick={() => addEntry(name)}
        style={{width:"100%",fontSize:13,background:meta.color,color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",padding:"8px 0",cursor:"pointer"}}>
        <i className="ti ti-plus" aria-hidden="true" style={{marginRight:5}}/>Agregar servicio
      </button>
    </div>
  );
}

// ── Entry Card (with inline edit) ─────────────────────────────────────────────

function EntryCard({ entry, meta, name, updateEntry, removeEntry }) {
  const [editing, setEditing] = useState(false);
  const [ea, setEa] = useState(String(entry.amount));
  const [et, setEt] = useState(String(entry.tip||0));
  const [es, setEs] = useState(entry.service);
  const [em, setEm] = useState(entry.payment||"Efectivo");
  const [en, setEn] = useState(entry.note||"");
  const [useManual, setUseManual] = useState(!PRESET_SERVICES.includes(entry.service));

  const save = () => {
    const amount = parseFloat(ea);
    if (!amount||amount<=0) return;
    updateEntry(name, entry.id, { amount, tip:parseFloat(et)||0, service:es, payment:em, note:en });
    setEditing(false);
  };
  const cancel = () => {
    setEa(String(entry.amount)); setEt(String(entry.tip||0));
    setEs(entry.service); setEm(entry.payment||"Efectivo"); setEn(entry.note||"");
    setUseManual(!PRESET_SERVICES.includes(entry.service));
    setEditing(false);
  };

  const payIcon = entry.payment==="Transferencia" ? "ti-transfer" : entry.payment==="Tarjeta" ? "ti-credit-card" : "ti-cash";

  if (editing) return (
    <div style={{padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",border:`1px solid ${meta.color}55`}}>
      <p style={{fontSize:11,color:meta.color,margin:"0 0 8px",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em"}}>Editando</p>

      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--color-text-secondary)",cursor:"pointer",marginBottom:7}}>
        <input type="checkbox" checked={useManual} onChange={e => { setUseManual(e.target.checked); if(!e.target.checked) setEs(PRESET_SERVICES[0]); }} style={{width:14,height:14}}/>
        Escribir manualmente
      </label>
      {useManual
        ? <input type="text" value={es} onChange={e=>setEs(e.target.value)} style={{width:"100%",marginBottom:7,fontSize:13}}/>
        : <select value={es} onChange={e=>setEs(e.target.value)} style={{width:"100%",marginBottom:7,fontSize:13}}>
            {PRESET_SERVICES.map(s=><option key={s}>{s}</option>)}
          </select>
      }
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:7}}>
        <div>
          <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Monto $</label>
          <input type="number" value={ea} onChange={e=>setEa(e.target.value)} style={{width:"100%",fontSize:13}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Propina $</label>
          <input type="number" value={et} onChange={e=>setEt(e.target.value)} style={{width:"100%",fontSize:13}}/>
        </div>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:7}}>
        {PAYMENT_METHODS.map(pm=>(
          <button key={pm} onClick={()=>setEm(pm)}
            style={{flex:1,fontSize:11,padding:"4px 2px",background:em===pm?meta.color:undefined,color:em===pm?"#fff":undefined,border:em===pm?"none":undefined,borderRadius:"var(--border-radius-md)",cursor:"pointer"}}>
            {pm}
          </button>
        ))}
      </div>
      <input type="text" placeholder="Nota" value={en} onChange={e=>setEn(e.target.value)} style={{width:"100%",marginBottom:9,fontSize:13}}/>
      <div style={{display:"flex",gap:7}}>
        <button onClick={save} style={{flex:1,fontSize:12,background:meta.color,color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",padding:"7px 0",cursor:"pointer"}}>
          <i className="ti ti-check" aria-hidden="true" style={{marginRight:4}}/>Guardar
        </button>
        <button onClick={cancel} style={{flex:1,fontSize:12,padding:"7px 0"}}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 10px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",fontSize:13}}>
      <div style={{flex:1}}>
        <span style={{color:meta.color,fontWeight:500}}>{fmtMXN(entry.amount)}</span>
        {entry.tip>0 && <span style={{fontSize:11,color:"#3B6D11",marginLeft:5}}>+{fmtMXN(entry.tip)} propina</span>}
        <span style={{color:"var(--color-text-secondary)",marginLeft:6,fontSize:12}}>{entry.service}</span>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
          <i className={`ti ${payIcon}`} style={{fontSize:11,color:"var(--color-text-tertiary)"}}/>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{entry.payment||"Efectivo"} · {entry.day} · {entry.time}</span>
        </div>
        {entry.note && <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"2px 0 0"}}>{entry.note}</p>}
      </div>
      <div style={{display:"flex",gap:4,marginLeft:8,flexShrink:0}}>
        <button onClick={()=>setEditing(true)}
          style={{background:"var(--color-background-tertiary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"4px 8px",cursor:"pointer",fontSize:13,lineHeight:1}}
          aria-label="Editar">
          ✏️
        </button>
        <button onClick={()=>{ if(confirm("¿Eliminar este servicio?")) removeEntry(name,entry.id); }}
          style={{background:"#fff0f0",border:"0.5px solid #f5c0c0",borderRadius:"var(--border-radius-md)",padding:"4px 8px",cursor:"pointer",fontSize:13,lineHeight:1}}
          aria-label="Eliminar">
          🗑️
        </button>
      </div>
    </div>
  );
}

// ── Tracker View ──────────────────────────────────────────────────────────────

function TrackerView({ data, manicurists, names, totals, tips, forms, setForm, addEntry, updateEntry, removeEntry }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:"1.25rem"}}>
      {names.map(name => {
        const meta = manicurists[name];
        const total = totals[name];
        const tip   = tips[name];
        const pct   = Math.min((total/meta.goal)*100, 100);
        const commission = total * meta.commission;
        const reached = total >= meta.goal;
        const entries = data.entries[name] || [];
        const form = forms[name] || EMPTY_FORM();

        return (
          <div key={name} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",overflow:"hidden"}}>
            <div style={{background:meta.color,padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:500,fontSize:16,color:"#fff"}}>{name}</span>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.88)"}}>comisión {(meta.commission*100).toFixed(0)}%</span>
            </div>

            <div style={{padding:"14px 16px"}}>
              {/* Progress */}
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                  <span style={{color:"var(--color-text-secondary)"}}>Meta semanal</span>
                  <span style={{fontWeight:500,color:reached?meta.color:"var(--color-text-primary)"}}>
                    {fmtMXN(total)} / {fmtMXN(meta.goal)}
                  </span>
                </div>
                <div style={{background:"var(--color-background-tertiary)",borderRadius:99,height:7,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:meta.color,borderRadius:99,transition:"width 0.5s"}}/>
                </div>
                {reached && <p style={{fontSize:12,color:meta.color,margin:"4px 0 0",fontWeight:500}}><i className="ti ti-circle-check" aria-hidden="true" style={{marginRight:4}}/>¡Meta alcanzada!</p>}
              </div>

              {/* Stats row */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"8px 11px"}}>
                  <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 2px"}}>Comisión</p>
                  <p style={{fontSize:15,fontWeight:500,margin:0,color:meta.color}}>{fmtMXN(commission)}</p>
                </div>
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"8px 11px"}}>
                  <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 2px"}}>Propinas</p>
                  <p style={{fontSize:15,fontWeight:500,margin:0,color:"#3B6D11"}}>{fmtMXN(tip)}</p>
                </div>
              </div>

              <EntryForm name={name} meta={meta} form={form} setForm={setForm} addEntry={addEntry}/>

              {entries.length===0
                ? <p style={{fontSize:13,color:"var(--color-text-tertiary)",textAlign:"center",padding:"6px 0"}}>Sin servicios registrados</p>
                : <>
                    <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:320,overflowY:"auto"}}>
                      {[...entries].reverse().map(e =>
                        <EntryCard key={e.id} entry={e} meta={meta} name={name} updateEntry={updateEntry} removeEntry={removeEntry}/>
                      )}
                    </div>
                    <p style={{fontSize:11,color:"var(--color-text-tertiary)",textAlign:"right",margin:"6px 0 0"}}>
                      {entries.length} servicio{entries.length!==1?"s":""} · toca ✏️ para editar o 🗑️ para eliminar
                    </p>
                  </>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Resumen View ──────────────────────────────────────────────────────────────

function ResumenView({ data, manicurists, names, totals, tips }) {
  const grandTotal  = names.reduce((s,n) => s+totals[n], 0);
  const grandTips   = names.reduce((s,n) => s+tips[n], 0);
  const grandCom    = names.reduce((s,n) => s+(totals[n]*manicurists[n].commission), 0);

  // payment breakdown (all entries)
  const byPayment = {Efectivo:0, Transferencia:0, Tarjeta:0};
  names.forEach(n => data.entries[n].forEach(e => {
    byPayment[e.payment||"Efectivo"] += e.amount;
  }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:9}}>
        <MetricCard label="Venta total" value={fmtMXN(grandTotal)}/>
        <MetricCard label="Comisiones" value={fmtMXN(grandCom)}/>
        <MetricCard label="Propinas totales" value={fmtMXN(grandTips)}/>
        <MetricCard label="Ganancia neta" value={fmtMXN(grandTotal-grandCom)}/>
      </div>

      {/* Payment method breakdown */}
      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
        <p style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",margin:"0 0 10px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Ventas por método de pago</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
          {Object.entries(byPayment).map(([pm,amt]) => {
            const icon = pm==="Transferencia"?"ti-transfer":pm==="Tarjeta"?"ti-credit-card":"ti-cash";
            return (
              <div key={pm} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"9px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                  <i className={`ti ${icon}`} style={{fontSize:13,color:"var(--color-text-secondary)"}} aria-hidden="true"/>
                  <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{pm}</span>
                </div>
                <p style={{fontSize:15,fontWeight:500,margin:0,color:"var(--color-text-primary)"}}>{fmtMXN(amt)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per manicurist */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:"1rem"}}>
        {names.map(name => {
          const meta = manicurists[name];
          const total = totals[name];
          const tip   = tips[name];
          const commission = total * meta.commission;
          const reached = total >= meta.goal;
          const entries = data.entries[name]||[];
          const byService = {};
          entries.forEach(e => { byService[e.service]=(byService[e.service]||0)+e.amount; });
          const entByPayment = {Efectivo:0,Transferencia:0,Tarjeta:0};
          entries.forEach(e => { entByPayment[e.payment||"Efectivo"]+=(e.amount||0); });

          return (
            <div key={name} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",overflow:"hidden"}}>
              <div style={{background:meta.color,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:500,fontSize:15,color:"#fff"}}>{name}</span>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.85)"}}>
                  {reached?"✓ Meta":"Pendiente"}
                </span>
              </div>
              <div style={{padding:"14px 16px"}}>
                <Row label="Venta total" value={fmtMXN(total)} big/>
                <Row label={`Comisión (${(meta.commission*100).toFixed(0)}%)`} value={fmtMXN(commission)} accent={meta.color}/>
                <Row label="Propinas" value={fmtMXN(tip)} accent="#3B6D11"/>
                <Row label="Servicios" value={entries.length}/>
                <Row label={`Meta ${fmtMXN(meta.goal)}`} value={reached?"Alcanzada":"Pendiente"} ok={reached}/>

                {Object.keys(byService).length>0 && (
                  <div style={{marginTop:10}}>
                    <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em"}}>Por servicio</p>
                    {Object.entries(byService).sort((a,b)=>b[1]-a[1]).map(([srv,amt])=>(
                      <div key={srv} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                        <span style={{color:"var(--color-text-secondary)"}}>{srv}</span>
                        <span style={{color:"var(--color-text-primary)",fontWeight:500}}>{fmtMXN(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{marginTop:12,background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"9px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>Total a pagar</span>
                  <span style={{fontSize:17,fontWeight:500,color:meta.color}}>{fmtMXN(commission)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Historial View ────────────────────────────────────────────────────────────

function HistorialView({ history }) {
  if (!history||history.length===0) return (
    <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",fontSize:14}}>
      Aún no hay semanas cerradas en el historial.
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      {[...history].reverse().map((week,i) => {
        const m = week.manicurists || DEFAULT_MANICURISTS;
        const ns = Object.keys(m);
        const label = week.weekKey.replace("week-","Semana del ");
        const grandT = ns.reduce((s,n)=>s+(week.entries[n]||[]).reduce((a,e)=>a+e.amount,0),0);
        const grandC = ns.reduce((s,n)=>s+(week.entries[n]||[]).reduce((a,e)=>a+e.amount,0)*m[n].commission,0);
        const grandTips = ns.reduce((s,n)=>s+(week.entries[n]||[]).reduce((a,e)=>a+(e.tip||0),0),0);
        return (
          <div key={i} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",overflow:"hidden"}}>
            <div style={{background:"var(--color-background-secondary)",padding:"9px 16px",borderBottom:"0.5px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{label}</span>
              <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{fmtMXN(grandT)} total</span>
            </div>
            <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}}>
              {ns.map(n => {
                const tot = (week.entries[n]||[]).reduce((s,e)=>s+e.amount,0);
                const com = tot*m[n].commission;
                const tp  = (week.entries[n]||[]).reduce((s,e)=>s+(e.tip||0),0);
                return <SmallCard key={n} label={n} value={fmtMXN(tot)} sub={`Com: ${fmtMXN(com)} · Prop: ${fmtMXN(tp)}`} color={m[n].color}/>;
              })}
              <SmallCard label="Comisiones pagadas" value={fmtMXN(grandC)} sub={`Propinas: ${fmtMXN(grandTips)}`} color="var(--color-text-primary)"/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Config View ───────────────────────────────────────────────────────────────

function ConfigView({ manicurists, names, addManicurist, removeManicurist }) {
  const [newName,   setNewName]   = useState("");
  const [newGoal,   setNewGoal]   = useState("5000");
  const [newCom,    setNewCom]    = useState("10");
  const [newColor,  setNewColor]  = useState(COLOR_PALETTE[2]);
  const [error,     setError]     = useState("");

  const submit = () => {
    const n = newName.trim();
    if (!n) { setError("Escribe el nombre."); return; }
    if (manicurists[n]) { setError("Ya existe una manicurista con ese nombre."); return; }
    if (!parseFloat(newGoal)||!parseFloat(newCom)) { setError("Revisa meta y comisión."); return; }
    addManicurist(n, parseFloat(newGoal), parseFloat(newCom)/100, newColor);
    setNewName(""); setNewGoal("5000"); setNewCom("10"); setError("");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
      {/* Current manicurists */}
      <div>
        <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-secondary)",margin:"0 0 10px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Manicuristas activas</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {names.map(name => {
            const m = manicurists[name];
            return (
              <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:m.color,flexShrink:0}}/>
                  <div>
                    <span style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{name}</span>
                    <span style={{fontSize:12,color:"var(--color-text-secondary)",marginLeft:8}}>
                      Meta {fmtMXN(m.goal)} · Comisión {(m.commission*100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <button onClick={()=>removeManicurist(name)}
                  style={{background:"none",border:"none",cursor:"pointer",padding:"4px 6px"}} aria-label="Eliminar">
                  <i className="ti ti-user-minus" style={{fontSize:15,color:"#A32D2D"}}/>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add new */}
      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"16px"}}>
        <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-secondary)",margin:"0 0 12px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Agregar manicurista</p>

        <input type="text" placeholder="Nombre" value={newName}
          onChange={e=>{setNewName(e.target.value);setError("");}}
          style={{width:"100%",marginBottom:9,fontSize:14}}/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
          <div>
            <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Meta semanal $</label>
            <input type="number" value={newGoal} onChange={e=>setNewGoal(e.target.value)} style={{width:"100%",fontSize:13}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Comisión %</label>
            <input type="number" value={newCom} onChange={e=>setNewCom(e.target.value)} style={{width:"100%",fontSize:13}}/>
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Color</label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {COLOR_PALETTE.map(c=>(
              <button key={c} onClick={()=>setNewColor(c)} aria-label={c}
                style={{width:26,height:26,borderRadius:"50%",background:c,border:newColor===c?"3px solid var(--color-text-primary)":"2px solid transparent",cursor:"pointer",padding:0}}/>
            ))}
          </div>
        </div>

        {error && <p style={{fontSize:12,color:"#A32D2D",margin:"0 0 8px"}}>{error}</p>}

        <button onClick={submit}
          style={{width:"100%",fontSize:13,background:newColor,color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",padding:"8px 0",cursor:"pointer"}}>
          <i className="ti ti-user-plus" aria-hidden="true" style={{marginRight:5}}/>Agregar manicurista
        </button>
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function MetricCard({ label, value }) {
  return (
    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"11px 13px"}}>
      <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 3px"}}>{label}</p>
      <p style={{fontSize:18,fontWeight:500,margin:0,color:"var(--color-text-primary)"}}>{value}</p>
    </div>
  );
}
function SmallCard({ label, value, sub, color }) {
  return (
    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"9px 11px"}}>
      <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 2px"}}>{label}</p>
      <p style={{fontSize:14,fontWeight:500,margin:0,color}}>{value}</p>
      {sub&&<p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"2px 0 0"}}>{sub}</p>}
    </div>
  );
}
function Row({ label, value, big, accent, ok }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",fontSize:big?14:13,padding:"5px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
      <span style={{color:"var(--color-text-secondary)"}}>{label}</span>
      <span style={{fontWeight:big?500:400,color:accent||(ok===true?"#3B6D11":ok===false?"#A32D2D":"var(--color-text-primary)")}}>
        {value}
      </span>
    </div>
  );
}
