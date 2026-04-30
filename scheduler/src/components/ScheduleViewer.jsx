"use client";

import { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

const API = "http://127.0.0.1:8000";

const PALETTE = [
"#378ADD", "#1D9E75", "#BA7517", "#D4537E",
"#7F77DD", "#D85A30", "#639922", "#185FA5",
];

function toCalendarEvents(name, slots, color) {
// Map day names to ISO weekday numbers (week of 2024-01-01 = Mon–Fri)
const DAY_MAP = {
    monday: "2024-01-01", tuesday: "2024-01-02", wednesday: "2024-01-03",
    thursday: "2024-01-04", friday: "2024-01-05",
    mon: "2024-01-01", tue: "2024-01-02", wed: "2024-01-03",
    thu: "2024-01-04", fri: "2024-01-05",
};

return slots
    .map((slot) => {
    const date = DAY_MAP[(slot.day || "").toLowerCase().trim()];
    if (!date) return null;
    return {
        title: name,
        start: `${date}T${normalizeTime(slot.start_time)}`,
        end: `${date}T${normalizeTime(slot.end_time)}`,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { employee: name },
    };
    })
    .filter(Boolean);
}

// Convert "9:00 AM" / "9am" → "09:00:00"
function normalizeTime(raw) {
if (!raw) return "00:00:00";
const clean = raw.trim().toLowerCase().replace(/\./g, "");
const ampm = clean.match(/(am|pm)/)?.[1];
const parts = clean.replace(/(am|pm)/g, "").trim().split(":");
let h = parseInt(parts[0]);
const m = parseInt(parts[1] || 0);
if (ampm === "pm" && h !== 12) h += 12;
if (ampm === "am" && h === 12) h = 0;
return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export default function ScheduleViewer() {
const [db, setDb] = useState({});         // { name: [TimeSlot] }
const [colorMap, setColorMap] = useState({});
const [colorIdx, setColorIdx] = useState(0);
const [empName, setEmpName] = useState("");
const [file, setFile] = useState(null);
const [status, setStatus] = useState({ msg: "", type: "" });
const [hidden, setHidden] = useState({});  // { name: true } = hidden
const calRef = useRef(null);

useEffect(() => { fetchAll(); }, []);

async function fetchAll() {
    try {
    const res = await fetch(`${API}/employees`);
    const data = await res.json();
    const newColors = {};
    let idx = colorIdx;
    Object.keys(data).forEach((name) => {
        newColors[name] = PALETTE[idx++ % PALETTE.length];
    });
    setColorMap((prev) => ({ ...prev, ...newColors }));
    setColorIdx(idx);
    setDb(data);
    } catch {
    setStatus({ msg: "Could not reach API", type: "error" });
    }
}

async function scanSchedule() {
    if (!empName.trim()) return setStatus({ msg: "Enter a name", type: "error" });
    if (!file) return setStatus({ msg: "Choose a file", type: "error" });

    setStatus({ msg: "Scanning…", type: "info" });
    const fd = new FormData();
    fd.append("file", file);

    try {
    const res = await fetch(
        `${API}/scan?employee_name=${encodeURIComponent(empName)}`,
        { method: "POST", body: fd }
    );
    const data = await res.json();
    if (data.error) return setStatus({ msg: data.error, type: "error" });

    const newDb = { ...db, [empName]: data.data.busy_slots };
    setDb(newDb);

    if (!colorMap[empName]) {
        setColorMap((prev) => ({
        ...prev,
        [empName]: PALETTE[colorIdx % PALETTE.length],
        }));
        setColorIdx((i) => i + 1);
    }

    setStatus({ msg: `Saved for ${empName}!`, type: "success" });
    setTimeout(() => setStatus({ msg: "", type: "" }), 3000);
    setEmpName("");
    setFile(null);
    } catch {
    setStatus({ msg: "Could not reach API", type: "error" });
    }
}

const allEvents = Object.entries(db).flatMap(([name, slots]) =>
    hidden[name] ? [] : toCalendarEvents(name, slots, colorMap[name] || "#888")
);

return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 900 }}>
    <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: "1.25rem" }}>
        Schedule viewer
    </h1>

    {/* Upload row */}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
        <input
        style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, width: 150 }}
        placeholder="Employee name"
        value={empName}
        onChange={(e) => setEmpName(e.target.value)}
        />
        <label style={{ cursor: "pointer", fontSize: 13, padding: "6px 12px", border: "1px solid #ddd", borderRadius: 6, background: "#f5f5f5" }}>
        {file ? file.name : "Choose image"}
        <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files[0] || null)}
        />
        </label>
        <button
        onClick={scanSchedule}
        style={{ padding: "6px 14px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
        Scan schedule
        </button>
        {status.msg && (
        <span style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 6,
            background: status.type === "error" ? "#fee" : status.type === "success" ? "#efe" : "#e8f0fe",
            color: status.type === "error" ? "#c00" : status.type === "success" ? "#070" : "#185FA5",
        }}>
            {status.msg}
        </span>
        )}
    </div>

    {/* Legend / toggles */}
    {Object.keys(db).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
        {Object.keys(db).map((name) => (
            <button
            key={name}
            onClick={() => setHidden((h) => ({ ...h, [name]: !h[name] }))}
            style={{
                fontSize: 12, padding: "3px 10px", borderRadius: 20, cursor: "pointer",
                border: `2px solid ${colorMap[name] || "#888"}`,
                background: hidden[name] ? "transparent" : colorMap[name] || "#888",
                color: hidden[name] ? (colorMap[name] || "#888") : "#fff",
                transition: "all 0.15s",
            }}
            >
            {name}
            </button>
        ))}
        </div>
    )}

    {/* FullCalendar */}
    <FullCalendar
        ref={calRef}
        plugins={[timeGridPlugin]}
        initialView="timeGridWeek"
        initialDate="2024-01-01"
        headerToolbar={false}
        dayHeaderFormat={{ weekday: "short" }}
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        slotDuration="00:30:00"
        allDaySlot={false}
        events={allEvents}
        height="auto"
        weekends={false}
    />
    </div>
);
}