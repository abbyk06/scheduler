import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

load_dotenv()

class TimeSlot(BaseModel):
    day: str
    start_time: str
    end_time: str

class Schedule(BaseModel):
    student_name: str
    busy_slots: List[TimeSlot]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Allow your React app
    allow_credentials=True,
    allow_methods=["*"], # Allow POST, GET, etc.
    allow_headers=["*"], # Allow all headers
)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

database = {}

@app.post("/scan")
async def scan_schedule(employee_name: str, file: UploadFile = File(...)):
    print(f"--- Scanning schedule for: {employee_name} ---")
    try:
        image_bytes = await file.read()
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                "Extract all busy class times from this schedule. Output ONLY JSON.",
                types.Part.from_bytes(data=image_bytes, mime_type=file.content_type)
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Schedule,
            )
        )

        scanned_data = Schedule.model_validate_json(response.text)
        
        database[employee_name] = scanned_data.busy_slots
        
        return {
            "message": f"Schedule saved for {employee_name}",
            "currently_stored_employees": list(database.keys()),
            "data": scanned_data
        }

    except Exception as e:
        return {"error": str(e)}

@app.get("/employees")
async def get_all_schedules():
    return database

@app.delete("/employees/{name}")
async def delete_employee(name: str):
    if name in database:
        del database[name]
        return {"message": f"Deleted {name}"}
    return {"error": "Not found"}