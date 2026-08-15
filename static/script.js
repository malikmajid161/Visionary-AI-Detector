document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const btnImage = document.getElementById('btn-image');
    const btnCamera = document.getElementById('btn-camera');
    const viewUpload = document.getElementById('image-upload-view');
    const viewResult = document.getElementById('result-view');
    const viewCamera = document.getElementById('camera-view');
    const viewLoader = document.getElementById('loader');
    
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const resultImage = document.getElementById('result-image');
    const btnReset = document.getElementById('btn-reset');
    
    const videoElement = document.getElementById('webcam-video');
    const streamResult = document.getElementById('stream-result');
    const btnStopCamera = document.getElementById('btn-stop-camera');
    
    const totalObjectsEl = document.getElementById('total-objects');
    const fpsCounterEl = document.getElementById('fps-counter');
    const objectListEl = document.getElementById('object-list');

    // State
    let currentStream = null;
    let ws = null;
    let isStreaming = false;
    let framesProcessed = 0;
    let lastFpsTime = Date.now();

    // Tab Switching
    function switchTab(tab) {
        btnImage.classList.remove('active');
        btnCamera.classList.remove('active');
        
        viewUpload.classList.add('hidden');
        viewResult.classList.add('hidden');
        viewCamera.classList.add('hidden');
        viewLoader.classList.add('hidden');

        if (tab === 'image') {
            btnImage.classList.add('active');
            viewUpload.classList.remove('hidden');
            stopCamera();
        } else if (tab === 'camera') {
            btnCamera.classList.add('active');
            viewCamera.classList.remove('hidden');
            startCamera();
        }
        
        resetStats();
    }

    btnImage.addEventListener('click', () => switchTab('image'));
    btnCamera.addEventListener('click', () => switchTab('camera'));

    // --- Image Upload Logic ---
    uploadZone.addEventListener('click', () => fileInput.click());
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleImageUpload(e.target.files[0]);
        }
    });

    async function handleImageUpload(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }

        viewUpload.classList.add('hidden');
        viewLoader.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/detect/image', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('Detection failed');
            
            const data = await response.json();
            
            // Show result
            resultImage.src = data.image;
            viewLoader.classList.add('hidden');
            viewResult.classList.remove('hidden');
            
            updateStats(data.counts, data.total_objects);
            fpsCounterEl.textContent = '--';
            
        } catch (error) {
            console.error(error);
            alert('An error occurred during detection.');
            viewLoader.classList.add('hidden');
            viewUpload.classList.remove('hidden');
        }
    }

    btnReset.addEventListener('click', () => {
        viewResult.classList.add('hidden');
        viewUpload.classList.remove('hidden');
        fileInput.value = '';
        resetStats();
    });

    // --- Camera Stream Logic ---
    async function startCamera() {
        try {
            currentStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" } 
            });
            videoElement.srcObject = currentStream;
            videoElement.play();
            
            isStreaming = true;
            connectWebSocket();
            
        } catch (error) {
            console.error("Camera access error:", error);
            alert("Could not access the camera.");
            switchTab('image');
        }
    }

    function stopCamera() {
        isStreaming = false;
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
        streamResult.src = '';
    }
    
    btnStopCamera.addEventListener('click', () => {
        switchTab('image');
    });

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/api/detect/stream`);
        
        ws.onopen = () => {
            console.log('WebSocket Connected');
            sendFrame();
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            streamResult.src = data.image;
            updateStats(data.counts, data.total_objects);
            
            // Calculate FPS
            framesProcessed++;
            const now = Date.now();
            if (now - lastFpsTime >= 1000) {
                fpsCounterEl.textContent = framesProcessed;
                framesProcessed = 0;
                lastFpsTime = now;
            }
            
            if (isStreaming) {
                requestAnimationFrame(sendFrame);
            }
        };
        
        ws.onclose = () => {
            console.log('WebSocket Disconnected');
            if (isStreaming) {
                setTimeout(connectWebSocket, 1000); // Reconnect
            }
        };
    }

    function sendFrame() {
        if (!isStreaming || !ws || ws.readyState !== WebSocket.OPEN) return;
        
        // Only send if video is ready
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            
            // Compress heavily for real-time
            const dataURL = canvas.toDataURL('image/jpeg', 0.6);
            ws.send(dataURL);
        } else {
            requestAnimationFrame(sendFrame);
        }
    }

    // --- UI Updates ---
    function updateStats(counts, total) {
        totalObjectsEl.textContent = total;
        
        if (Object.keys(counts).length === 0) {
            objectListEl.innerHTML = `
                <div class="empty-state" style="padding: 1rem 0;">
                    <i class="fa-solid fa-check"></i>
                    <p style="margin-top: 0.5rem; font-size: 0.9rem;">No objects detected</p>
                </div>`;
            return;
        }
        
        objectListEl.innerHTML = '';
        for (const [objName, count] of Object.entries(counts)) {
            const item = document.createElement('div');
            item.className = 'object-item';
            item.innerHTML = `
                <span class="obj-name">${objName}</span>
                <span class="obj-count">${count}</span>
            `;
            objectListEl.appendChild(item);
        }
    }

    function resetStats() {
        totalObjectsEl.textContent = '0';
        fpsCounterEl.textContent = '--';
        objectListEl.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-box-open"></i>
                <p>No objects detected yet. Upload an image or start the camera.</p>
            </div>
        `;
    }
});
