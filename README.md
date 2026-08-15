# Visionary AI - Real-Time Object Detection

Visionary AI is an advanced, high-performance web application designed for real-time object detection and counting. Powered by YOLOv8 and FastAPI, it boasts a breathtaking glassmorphic UI with dynamic animated backgrounds, engineered to provide a seamless user experience.

## ✨ Features
- **True Real-Time Processing:** Streams webcam feed directly via WebSockets for zero-latency inference.
- **YOLOv8 Integration:** State-of-the-art object detection model embedded into an asynchronous pipeline.
- **Image Processing:** Drag-and-drop capability for high-resolution static image analysis.
- **Glassmorphic UI:** Modern, lightweight, and visually stunning interface with dynamic ambient lighting.
- **Live Metrics:** Real-time FPS monitoring and dynamic object counting.

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- OpenCV
- Ultralytics YOLOv8

### Installation

1. Clone the repository:
```bash
git clone https://github.com/malikmajid161/Visionary-AI-Detector.git
cd Visionary-AI-Detector
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
uvicorn main:app --reload --port 8000
```

4. Open your browser and navigate to `http://localhost:8000`.

## 🛠️ Tech Stack
- **Backend:** FastAPI, Python, WebSockets, Ultralytics YOLOv8
- **Frontend:** Vanilla JS, HTML5, CSS3 (Glassmorphism)
- **Computer Vision:** OpenCV (Headless)

## 👨‍💻 Developed By
Architected and engineered using industry best practices.
