"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

const API = "http://127.0.0.1:8000";
const BUFFER_MINS = 10;
const DAY_START = "07:00:00";
const DAY_END = "21:00:00";

const PALETTE = [
"#378ADD","#1D9E75","#BA7517","#D4537E",
"#7F77DD","#D85A30","#639922","#185FA5",
];

const DAY_MAP = {
monday:"2024-01-01",tuesday:"2024-01-02",wednesday:"2024-01-03",
thursday:"2024-01-04",friday:"2024-01-05",
mon:"2024-01-01",tue:"2024-01-02",wed:"2024-01-03",
thu:"2024-01-04",fri:"2024-01-05",
};

function normalizeTime(raw) {
if (!raw) return "00:00:00";
const clean = raw.trim().toLowerCase().replace(/\./g,"");
const ampm = clean.match(/(am|pm)/)?.[1];
const parts = clean.replace(/(am|pm)/g,"").trim().split(":");
let h = parseInt(parts[0]);
const m = parseInt(parts[1]||0);
if (ampm==="pm"&&h!==12) h+=12;
if (ampm==="am"&&h===12) h=0;
return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`;
}

function timeToMins(raw) {
const t = normalizeTime(raw);
const [h,m] = t.split(":").map(Number);
return h*60+m;
}

function minsToTime(mins) {
const clamped = Math.max(0,Math.round(mins));
return `${String(Math.floor(clamped/60)).padStart(2,"0")}:${String(clamped%60).padStart(2,"0")}:00`;
}

function normDay(d) {
const map={monday:"mon",tuesday:"tue",wednesday:"wed",thursday:"thu",friday:"fri",mon:"mon",tue:"tue",wed:"wed",thu:"thu",fri:"fri"};
return map[(d||"").toLowerCase().trim()]||"";
}

function toEvents(name,slots,color) {
return (slots||[]).map(slot=>{
    const date=DAY_MAP[(slot.day||"").toLowerCase().trim()];
    if(!date) return null;
    return {
    title:name,
    start:`${date}T${normalizeTime(slot.start_time)}`,
    end:`${date}T${normalizeTime(slot.end_time)}`,
    backgroundColor:color,borderColor:color,
    extendedProps:{employee:name},
    };
}).filter(Boolean);
}

function computeFreeSlots(slots) {
const dayStart=timeToMins(DAY_START), dayEnd=timeToMins(DAY_END);
const byDay=new Map();
for(const s of slots||[]){
    const d=normDay(s.day); if(!d) continue;
    const start=Math.max(dayStart,timeToMins(s.start_time));
    const end=Math.min(dayEnd,timeToMins(s.end_time)+BUFFER_MINS);
    if(end<=start) continue;
    if(!byDay.has(d)) byDay.set(d,[]);
    byDay.get(d).push({start,end});
}
const free=[];
for(const day of["mon","tue","wed","thu","fri"]){
    const iv=(byDay.get(day)||[]).sort((a,b)=>a.start-b.start);
    const merged=[];
    for(const it of iv){const last=merged[merged.length-1];if(!last||it.start>last.end) merged.push({...it});else last.end=Math.max(last.end,it.end);}
    let cur=dayStart;
    for(const it of merged){if(it.start>cur) free.push({day,start_time:minsToTime(cur),end_time:minsToTime(it.start)});cur=Math.max(cur,it.end);}
    if(cur<dayEnd) free.push({day,start_time:minsToTime(cur),end_time:minsToTime(dayEnd)});
}
return free;
}

function hexToRgba(hex,a){
const c=(hex||"").replace("#","");
if(c.length!==6) return `rgba(136,136,136,${a})`;
return `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${a})`;
}

function initials(name){return (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();}

export default function ScheduleViewer() {
const [db, setDb] = useState({});
const [colorMap, setColorMap] = useState({});
const [colorIdx, setColorIdx] = useState(0);
const [hidden, setHidden] = useState({});
const [viewMode, setViewMode] = useState("busy");

// Add form
const [newName, setNewName] = useState("");
const [newFile, setNewFile] = useState(null);
const [addStatus, setAddStatus] = useState({msg:"",type:""});

// Per-employee update
const [updateTarget, setUpdateTarget] = useState(null);
const [updateFile, setUpdateFile] = useState(null);
const [updateStatus, setUpdateStatus] = useState({msg:"",type:""});

const [deleteConfirm, setDeleteConfirm] = useState(null);

// Calendar view
const [calView, setCalView] = useState("week"); // "week" | "day"
const [selectedDay, setSelectedDay] = useState("mon");
const calRef = useRef(null);

const DAYS = [
    {key:"mon",label:"Monday",date:"2024-01-01"},
    {key:"tue",label:"Tuesday",date:"2024-01-02"},
    {key:"wed",label:"Wednesday",date:"2024-01-03"},
    {key:"thu",label:"Thursday",date:"2024-01-04"},
    {key:"fri",label:"Friday",date:"2024-01-05"},
];

useEffect(()=>{
    const api = calRef.current?.getApi();
    if (!api) return;
    if (calView==="week") {
    api.changeView("timeGridWeek","2024-01-01");
    } else {
    const d = DAYS.find(x=>x.key===selectedDay);
    api.changeView("timeGridDay", d?.date||"2024-01-01");
    }
},[calView, selectedDay]);

useEffect(()=>{ fetchAll(); },[]);

async function fetchAll(){
    try{
    const res=await fetch(`${API}/employees`);
    const data=await res.json();
    let idx=0; const colors={};
    Object.keys(data).forEach(name=>{ colors[name]=PALETTE[idx++%PALETTE.length]; });
    setColorMap(colors); setColorIdx(idx); setDb(data);
    }catch{ setAddStatus({msg:"Could not reach API",type:"error"}); }
}

async function addEmployee(){
    if(!newName.trim()) return setAddStatus({msg:"Enter a name",type:"error"});
    if(!newFile) return setAddStatus({msg:"Choose a file",type:"error"});
    setAddStatus({msg:"Scanning…",type:"info"});
    const fd=new FormData(); fd.append("file",newFile);
    try{
    const res=await fetch(`${API}/scan?employee_name=${encodeURIComponent(newName)}`,{method:"POST",body:fd});
    const data=await res.json();
    if(data.error) return setAddStatus({msg:data.error,type:"error"});
    const color=colorMap[newName]||PALETTE[colorIdx%PALETTE.length];
    setColorMap(prev=>({...prev,[newName]:color}));
    setColorIdx(i=>i+1);
    setDb(prev=>({...prev,[newName]:data.data.busy_slots}));
    setAddStatus({msg:`Added ${newName}!`,type:"success"});
    setTimeout(()=>setAddStatus({msg:"",type:""}),3000);
    setNewName(""); setNewFile(null);
    }catch{ setAddStatus({msg:"Could not reach API",type:"error"}); }
}

async function updateEmployee(name){
    if(!updateFile) return setUpdateStatus({msg:"Choose a file",type:"error"});
    setUpdateStatus({msg:"Scanning…",type:"info"});
    const fd=new FormData(); fd.append("file",updateFile);
    try{
    const res=await fetch(`${API}/scan?employee_name=${encodeURIComponent(name)}`,{method:"POST",body:fd});
    const data=await res.json();
    if(data.error) return setUpdateStatus({msg:data.error,type:"error"});
    setDb(prev=>({...prev,[name]:data.data.busy_slots}));
    setUpdateStatus({msg:"Updated!",type:"success"});
    setTimeout(()=>{ setUpdateStatus({msg:"",type:""}); setUpdateTarget(null); setUpdateFile(null); },2000);
    }catch{ setUpdateStatus({msg:"Could not reach API",type:"error"}); }
}

async function deleteEmployee(name){
    try{
    await fetch(`${API}/employees/${encodeURIComponent(name)}`,{method:"DELETE"});
    setDb(prev=>{ const n={...prev}; delete n[name]; return n; });
    setDeleteConfirm(null);
    if(updateTarget===name){ setUpdateTarget(null); setUpdateFile(null); }
    }catch{ setAddStatus({msg:"Delete failed",type:"error"}); }
}

const allEvents=Object.entries(db).flatMap(([name,slots])=>{
    if(hidden[name]) return [];
    const color=colorMap[name]||"#888";
    if(viewMode==="busy") return toEvents(name,slots,color);
    return toEvents(name,computeFreeSlots(slots),hexToRgba(color,0.3));
});

const employees=Object.keys(db);

return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f7f7f5",overflow:"hidden"}}>

    {/* LEFT PANEL */}
    <aside style={{width:260,minWidth:260,background:"#fff",borderRight:"1px solid #ebebE8",display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"20px 20px 16px",borderBottom:"1px solid #ebebE8"}}>
        <p style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"#bbb",textTransform:"uppercase",marginBottom:4}}>Team planner</p>
        <h1 style={{fontSize:19,fontWeight:600,color:"#111",lineHeight:1.2,margin:0}}>Schedules</h1>
        </div>

        {/* Busy / Available toggle */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid #ebebE8"}}>
        <div style={{display:"flex",background:"#f2f2ef",borderRadius:8,padding:2,gap:2}}>
            {["busy","available"].map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{
                flex:1,fontSize:12,fontWeight:500,padding:"5px 0",border:"none",borderRadius:6,cursor:"pointer",
                background:viewMode===m?"#fff":"transparent",
                color:viewMode===m?"#111":"#999",
                boxShadow:viewMode===m?"0 1px 3px rgba(0,0,0,0.07)":"none",
                transition:"all 0.15s",textTransform:"capitalize",
            }}>{m}</button>
            ))}
        </div>
        </div>

        {/* Employee list */}
        <div style={{flex:1,overflowY:"auto"}}>
        {employees.length===0 && (
            <p style={{fontSize:12,color:"#ccc",padding:"20px",textAlign:"center"}}>No employees yet</p>
        )}
        {employees.map(name=>{
            const color=colorMap[name]||"#888";
            const isHidden=!!hidden[name];
            const isUpdating=updateTarget===name;
            return (
            <div key={name} style={{borderBottom:"1px solid #f2f2ef"}}>
                {/* Row */}
                <div
                onClick={()=>{ setUpdateTarget(isUpdating?null:name); setUpdateFile(null); setUpdateStatus({msg:"",type:""}); }}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",background:isUpdating?"#fafaf8":"transparent",transition:"background 0.1s"}}
                >
                {/* Avatar */}
                <div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,background:isHidden?"#eee":color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:isHidden?"#bbb":"#fff",transition:"all 0.2s"}}>
                    {initials(name)}
                </div>
                {/* Name */}
                <span style={{flex:1,fontSize:13,fontWeight:500,color:isHidden?"#bbb":"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",transition:"color 0.2s"}}>
                    {name}
                </span>
                {/* Visibility dot */}
                <button
                    onClick={e=>{e.stopPropagation();setHidden(h=>({...h,[name]:!h[name]}));}}
                    title={isHidden?"Show":"Hide"}
                    style={{width:9,height:9,borderRadius:"50%",background:isHidden?"#ddd":color,border:"none",cursor:"pointer",flexShrink:0,padding:0,transition:"background 0.2s"}}
                />
                {/* Delete */}
                {deleteConfirm===name ? (
                    <span onClick={e=>e.stopPropagation()} style={{display:"flex",gap:4}}>
                    <button onClick={()=>deleteEmployee(name)} style={{fontSize:11,padding:"2px 6px",borderRadius:4,border:"none",background:"#e74c3c",color:"#fff",cursor:"pointer"}}>Yes</button>
                    <button onClick={()=>setDeleteConfirm(null)} style={{fontSize:11,padding:"2px 6px",borderRadius:4,border:"1px solid #ddd",background:"transparent",cursor:"pointer",color:"#666"}}>No</button>
                    </span>
                ) : (
                    <button
                    onClick={e=>{e.stopPropagation();setDeleteConfirm(name);}}
                    style={{fontSize:15,lineHeight:1,padding:"0 2px",border:"none",background:"transparent",cursor:"pointer",color:"#d0d0cc",flexShrink:0}}
                    title="Delete"
                    >×</button>
                )}
                </div>

                {/* Inline update panel */}
                {isUpdating && (
                <div style={{padding:"0 14px 12px",display:"flex",flexDirection:"column",gap:6}}>
                    <label style={{cursor:"pointer",fontSize:12,padding:"7px 10px",border:"1.5px dashed #ddd",borderRadius:7,textAlign:"center",color:"#777",background:"#fafaf8",lineHeight:1.4}}>
                    {updateFile ? updateFile.name : "Upload new schedule image"}
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>setUpdateFile(e.target.files[0]||null)} />
                    </label>
                    <button
                    onClick={()=>updateEmployee(name)}
                    style={{fontSize:12,fontWeight:500,padding:"7px",border:"none",borderRadius:6,background:color,color:"#fff",cursor:"pointer"}}
                    >
                    Update schedule
                    </button>
                    {updateStatus.msg && (
                    <span style={{fontSize:11,color:updateStatus.type==="error"?"#c00":updateStatus.type==="success"?"#070":"#185FA5"}}>
                        {updateStatus.msg}
                    </span>
                    )}
                </div>
                )}
            </div>
            );
        })}
        </div>

        {/* Add employee */}
        <div style={{borderTop:"1px solid #ebebE8",padding:"14px",background:"#fafaf8"}}>
        <p style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"#bbb",textTransform:"uppercase",marginBottom:8}}>Add employee</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <input
            value={newName}
            onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addEmployee()}
            placeholder="Full name"
            style={{fontSize:13,padding:"7px 10px",border:"1px solid #e0e0da",borderRadius:6,outline:"none",color:"#111",background:"#fff"}}
            />
            <label style={{cursor:"pointer",fontSize:12,padding:"7px 10px",border:"1.5px dashed #ddd",borderRadius:7,textAlign:"center",color:"#777",background:"#fff",lineHeight:1.4}}>
            {newFile ? newFile.name : "Choose schedule image"}
            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>setNewFile(e.target.files[0]||null)} />
            </label>
            <button
            onClick={addEmployee}
            style={{fontSize:13,fontWeight:500,padding:"8px",border:"none",borderRadius:6,background:"#111",color:"#fff",cursor:"pointer"}}
            >
            + Add &amp; scan
            </button>
            {addStatus.msg && (
            <span style={{fontSize:11,color:addStatus.type==="error"?"#c00":addStatus.type==="success"?"#070":"#185FA5"}}>
                {addStatus.msg}
            </span>
            )}
        </div>
        </div>
    </aside>

    {/* MAIN CALENDAR */}
    <main style={{flex:1,overflow:"auto",padding:"24px",display:"flex",flexDirection:"column",gap:0}}>

        {/* Toolbar */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        {/* Week / Day toggle */}
        <div style={{display:"flex",background:"#f2f2ef",borderRadius:8,padding:2,gap:2}}>
            {["week","day"].map(v=>(
            <button key={v} onClick={()=>setCalView(v)} style={{
                fontSize:12,fontWeight:500,padding:"5px 16px",border:"none",borderRadius:6,cursor:"pointer",
                background:calView===v?"#fff":"transparent",
                color:calView===v?"#111":"#999",
                boxShadow:calView===v?"0 1px 3px rgba(0,0,0,0.07)":"none",
                transition:"all 0.15s",textTransform:"capitalize",
            }}>{v==="week"?"Weekly":"Daily"}</button>
            ))}
        </div>

        {/* Day dropdown — only shown in day view */}
        {calView==="day" && (
            <select
            value={selectedDay}
            onChange={e=>setSelectedDay(e.target.value)}
            style={{fontSize:13,fontWeight:500,padding:"6px 10px",border:"1px solid #e0e0da",borderRadius:6,background:"#fff",color:"#111",cursor:"pointer",outline:"none"}}
            >
            {DAYS.map(d=>(
                <option key={d.key} value={d.key}>{d.label}</option>
            ))}
            </select>
        )}
        </div>

        <div style={{background:"#fff",borderRadius:12,border:"1px solid #ebebE8",padding:"20px",flex:1}}>
        {employees.length===0 ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:420,color:"#ccc",gap:10}}>
            <span style={{fontSize:36}}>📅</span>
            <p style={{fontSize:14}}>Add an employee to get started</p>
            </div>
        ) : (
            <FullCalendar
            ref={calRef}
            plugins={[timeGridPlugin]}
            initialView="timeGridWeek"
            initialDate="2024-01-01"
            headerToolbar={false}
            dayHeaderFormat={{weekday:"long"}}
            slotMinTime={DAY_START}
            slotMaxTime={DAY_END}
            slotDuration="00:30:00"
            allDaySlot={false}
            events={allEvents}
            height="auto"
            weekends={false}
            eventContent={arg=>(
                <div style={{fontSize:11,fontWeight:500,padding:"1px 4px",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                {arg.event.title}
                </div>
            )}
            />
        )}
        </div>
    </main>
    </div>
);
}