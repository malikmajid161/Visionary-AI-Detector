import os
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import base64
import asyncio
from collections import Counter

app = FastAPI(title="YOLO Object Detector")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Load YOLO model
model = YOLO('yolov8n.pt')  # Downloads the model if not present

# Create uploads and outputs dirs
os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

def process_frame(frame):
    # Run YOLOv8 inference on the frame
    results = model(frame, verbose=False)
    
    # Extract counts
    counts = Counter()
    
    for r in results:
        boxes = r.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]
            counts[cls_name] += 1
            
    # Plot results on the frame
    annotated_frame = results[0].plot()
    return annotated_frame, dict(counts)

@app.post("/api/detect/image")
async def detect_image(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    annotated_img, counts = process_frame(img)
    
    _, buffer = cv2.imencode('.jpg', annotated_img)
    encoded_image = base64.b64encode(buffer).decode('utf-8')
    
    return JSONResponse({
        "counts": counts,
        "image": f"data:image/jpeg;base64,{encoded_image}",
        "total_objects": sum(counts.values())
    })

@app.websocket("/api/detect/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # data is a base64 encoded image
            if data.startswith("data:image"):
                data = data.split(",")[1]
                
            image_bytes = base64.b64decode(data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                annotated_img, counts = process_frame(img)
                _, buffer = cv2.imencode('.jpg', annotated_img)
                encoded_image = base64.b64encode(buffer).decode('utf-8')
                
                await websocket.send_json({
                    "counts": counts,
                    "image": f"data:image/jpeg;base64,{encoded_image}",
                    "total_objects": sum(counts.values())
                })
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        try:
            await websocket.close()
        except:
            pass
