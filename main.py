"""
VisionAI Object Detector — FastAPI Backend
YOLOv11 powered real-time object detection engine
Author: Muhammad Majid Ali (FA23-BAI-045) | Quantum Coders
"""

import os, io, base64, time, json, logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, Query, Form
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)s │ %(message)s")
log = logging.getLogger("VisionAI")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
MODEL_DIR  = BASE_DIR.parent / "models"
MODEL_PATH = MODEL_DIR / "yolo11l.pt"

# ── Global model reference ────────────────────────────────────────────────────
model: Optional[YOLO] = None

# ── Colour palette for bounding boxes (one per class index, cycling) ──────────
PALETTE = [
    (16, 185, 129),   # emerald
    (6,  182, 212),   # cyan
    (249, 115, 22),   # orange
    (168, 85,  247),  # purple
    (236, 72,  153),  # pink
    (234, 179, 8),    # yellow
    (239, 68,  68),   # red
    (59,  130, 246),  # blue
]

def get_color(class_id: int) -> tuple:
    return PALETTE[class_id % len(PALETTE)]


# ── Lifespan: load model once on startup ─────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    MODEL_DIR.mkdir(exist_ok=True)

    if not MODEL_PATH.exists():
        log.info("⬇️  Downloading yolo11l.pt from Ultralytics …")
        model = YOLO("yolo11l.pt")
        model.save(str(MODEL_PATH))
    else:
        log.info(f"✅ Loading model from {MODEL_PATH}")
        model = YOLO(str(MODEL_PATH))

    log.info("🚀 VisionAI backend ready — YOLOv11l loaded")
    yield
    log.info("🛑 VisionAI backend shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VisionAI Object Detector",
    version="2.0.0",
    description="YOLOv11-powered real-time object detection API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ── Helpers ───────────────────────────────────────────────────────────────────

def run_inference(img_bgr: np.ndarray, conf: float = 0.40, imgsz: int = 1280) -> tuple[np.ndarray, dict]:
    """Run YOLO inference, draw premium bounding boxes, return annotated image + counts."""
    results = model.predict(
        img_bgr,
        conf=conf,
        verbose=False,
        iou=0.60,        # Higher IOU allows more overlapping boxes in dense crowds
        imgsz=imgsz,     # Use custom imgsz for performance control
        max_det=3000,    # Allow up to 3000 detections for extreme density
    )[0]
    counts: dict[str, int] = {}

    for box in results.boxes:
        cls_id   = int(box.cls[0])
        cls_name = model.names[cls_id]
        conf_val = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        color = get_color(cls_id)
        label = f"{cls_name}  {conf_val:.0%}"

        # Filled semi-transparent box overlay
        overlay = img_bgr.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
        cv2.addWeighted(overlay, 0.10, img_bgr, 0.90, 0, img_bgr)

        # Crisp border
        cv2.rectangle(img_bgr, (x1, y1), (x2, y2), color, 2)

        # Label pill background
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        pill_y = max(y1 - th - 6, 0)
        cv2.rectangle(img_bgr, (x1, pill_y), (x1 + tw + 6, pill_y + th + 4), color, -1)
        cv2.putText(img_bgr, label, (x1 + 3, pill_y + th + 1),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)

        # Corner accents
        clen = 8
        for (px, py), (dx1, dy1), (dx2, dy2) in [
            ((x1, y1), (1, 0), (0, 1)),
            ((x2, y1), (-1, 0), (0, 1)),
            ((x1, y2), (1, 0), (0, -1)),
            ((x2, y2), (-1, 0), (0, -1)),
        ]:
            cv2.line(img_bgr, (px, py), (px + dx1*clen, py + dy1*clen), color, 2)
            cv2.line(img_bgr, (px, py), (px + dx2*clen, py + dy2*clen), color, 2)

        counts[cls_name] = counts.get(cls_name, 0) + 1

    return img_bgr, counts


def encode_image(img_bgr: np.ndarray, quality: int = 88) -> str:
    """Encode BGR numpy array → base64 JPEG data-URL."""
    _, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    b64 = base64.b64encode(buf).decode()
    return f"data:image/jpeg;base64,{b64}"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def serve_index():
    from fastapi.responses import FileResponse
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": "yolo11m", "ready": model is not None}


@app.post("/api/detect/image")
async def detect_image(
    file: UploadFile = File(...),
    conf: float = Form(0.20),
):
    """Detect objects in a single uploaded image."""
    t0 = time.perf_counter()

    raw = await file.read()
    pil_img = Image.open(io.BytesIO(raw)).convert("RGB")
    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    annotated, counts = run_inference(img_bgr, conf, imgsz=2560)
    elapsed_ms = round((time.perf_counter() - t0) * 1000)

    return JSONResponse({
        "image":      encode_image(annotated),
        "counts":     counts,
        "total":      sum(counts.values()),
        "elapsed_ms": elapsed_ms,
    })


@app.websocket("/api/detect/stream")
async def detect_stream(ws: WebSocket):
    """WebSocket endpoint — receives JPEG frames, returns annotated frames."""
    await ws.accept()
    log.info("📡 WebSocket client connected")

    try:
        while True:
            raw = await ws.receive_text()
            payload = json.loads(raw)

            conf       = float(payload.get("conf", 0.40))
            data_url   = payload["image"]                        # data:image/jpeg;base64,…
            b64_data   = data_url.split(",", 1)[1]
            img_bytes  = base64.b64decode(b64_data)

            nparr    = np.frombuffer(img_bytes, np.uint8)
            img_bgr  = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img_bgr is None:
                await ws.send_text(json.dumps({"error": "bad frame"}))
                continue

            annotated, counts = run_inference(img_bgr, conf, imgsz=320)

            await ws.send_text(json.dumps({
                "image":  encode_image(annotated, quality=75),
                "counts": counts,
                "total":  sum(counts.values()),
            }))

    except WebSocketDisconnect:
        log.info("📡 WebSocket client disconnected")
    except Exception as e:
        log.error(f"WebSocket error: {e}")
        try:
            await ws.close()
        except Exception:
            pass