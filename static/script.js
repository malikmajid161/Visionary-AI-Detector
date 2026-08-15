document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const btnImage = document.getElementById('btn-image');
    const btnVideo = document.getElementById('btn-video');
    const btnCamera = document.getElementById('btn-camera');
    
    const viewUpload = document.getElementById('image-upload-view');
    const viewResult = document.getElementById('result-view');
    const viewVideo = document.getElementById('video-view');
    const viewCamera = document.getElementById('camera-view');
    const viewLoader = document.getElementById('loader');
    
    const uploadZone = document.getElementById('upload-area');
    const fileInput = document.getElementById('image-input');
    const resultImage = document.getElementById('result-image');
    const btnReset = document.getElementById('btn-reset');
    const btnNew = document.getElementById('btn-new');
    
    const videoUploadArea = document.getElementById('video-upload-area');
    const videoInput = document.getElementById('video-input');
    const videoMediaContainer = document.getElementById('video-media-container');
    const uploadedVideo = document.getElementById('uploaded-video');
    const videoStreamResult = document.getElementById('video-stream-result');
    const btnStopVideo = document.getElementById('btn-stop-video');
    
    const webcamVideo = document.getElementById('webcam-video');
    const streamResult = document.getElementById('stream-result');
    const btnStopCamera = document.getElementById('btn-stop-camera');
    
    const totalObjectsEl = document.getElementById('total-objects');
    const fpsCounterEl = document.getElementById('fps-counter');
    const objectListEl = document.getElementById('object-list');
    const typesCountEl = document.getElementById('types-count');
    const confSlider = document.getElementById('conf-slider');
    const confVal = document.getElementById('conf-val');

    if (confSlider) {
        confSlider.addEventListener('input', (e) => {
            if(confVal) confVal.textContent = e.target.value + '%';
        });
    }

    // State
    let currentStream = null;
    let ws = null;
    let isStreaming = false;
    let framesProcessed = 0;
    let lastFpsTime = Date.now();
    let currentVideoTarget = null; // Either uploadedVideo or webcamVideo
    let currentResultTarget = null;

    // Tab Switching
    function switchTab(tab) {
        if(btnImage) btnImage.classList.remove('active');
        if(btnVideo) btnVideo.classList.remove('active');
        if(btnCamera) btnCamera.classList.remove('active');
        
        if(viewUpload) viewUpload.classList.remove('active');
        if(viewResult) viewResult.classList.remove('active');
        if(viewVideo) viewVideo.classList.remove('active');
        if(viewCamera) viewCamera.classList.remove('active');
        if(viewLoader) viewLoader.classList.remove('active');

        stopStreaming();

        if (tab === 'image') {
            if(btnImage) btnImage.classList.add('active');
            if(viewUpload) viewUpload.classList.add('active');
        } else if (tab === 'video') {
            if(btnVideo) btnVideo.classList.add('active');
            if(viewVideo) viewVideo.classList.add('active');
            if(videoUploadArea) videoUploadArea.style.display = 'flex';
            if(videoMediaContainer) videoMediaContainer.style.display = 'none';
            if(btnStopVideo) btnStopVideo.parentElement.style.display = 'none';
        } else if (tab === 'camera') {
            if(btnCamera) btnCamera.classList.add('active');
            if(viewCamera) viewCamera.classList.add('active');
            startWebcam();
        }
        
        resetStats();
    }

    if(btnImage) btnImage.addEventListener('click', () => switchTab('image'));
    if(btnVideo) btnVideo.addEventListener('click', () => switchTab('video'));
    if(btnCamera) btnCamera.addEventListener('click', () => switchTab('camera'));

    // --- Image Upload Logic ---
    if(uploadZone) {
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => { uploadZone.classList.remove('dragover'); });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0]);
        });
    }
    
    if(fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleImageUpload(e.target.files[0]);
        });
    }

    async function handleImageUpload(file) {
        if (!file.type.startsWith('image/')) { alert('Please upload an image.'); return; }
        if(viewUpload) viewUpload.classList.remove('active');
        if(viewLoader) viewLoader.classList.add('active');

        const formData = new FormData();
        formData.append('file', file);
        let cv = 0.25; if(confSlider) cv = confSlider.value / 100;
        formData.append('conf', cv);

        try {
            const res = await fetch('/api/detect/image', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            
            resultImage.src = data.image;
            if(viewLoader) viewLoader.classList.remove('active');
            if(viewResult) viewResult.classList.add('active');
            
            updateStats(data.counts, data.total);
            if(fpsCounterEl) fpsCounterEl.textContent = '--';
        } catch (error) {
            console.error(error);
            alert('Error during detection.');
            if(viewLoader) viewLoader.classList.remove('active');
            if(viewUpload) viewUpload.classList.add('active');
        }
    }

    if(btnNew) btnNew.addEventListener('click', () => switchTab('image'));
    if(btnReset) btnReset.addEventListener('click', () => {
        const link = document.createElement('a'); link.download = 'detection.jpg';
        link.href = resultImage.src; link.click();
    });

    // --- Video Upload Logic ---
    if(videoUploadArea) {
        videoUploadArea.addEventListener('click', () => videoInput.click());
        videoUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); videoUploadArea.classList.add('dragover'); });
        videoUploadArea.addEventListener('dragleave', () => { videoUploadArea.classList.remove('dragover'); });
        videoUploadArea.addEventListener('drop', (e) => {
            e.preventDefault(); videoUploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleVideoUpload(e.dataTransfer.files[0]);
        });
    }
    
    if(videoInput) {
        videoInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleVideoUpload(e.target.files[0]);
        });
    }

    function handleVideoUpload(file) {
        if (!file.type.startsWith('video/')) return;
        const url = URL.createObjectURL(file);
        uploadedVideo.src = url;
        uploadedVideo.volume = 0;
        
        videoUploadArea.style.display = 'none';
        videoMediaContainer.style.display = 'block';
        btnStopVideo.parentElement.style.display = 'flex';
        
        currentVideoTarget = uploadedVideo;
        currentResultTarget = videoStreamResult;
        
        uploadedVideo.play();
        isStreaming = true;
        connectWebSocket();
    }
    
    if(btnStopVideo) btnStopVideo.addEventListener('click', () => switchTab('video'));

    // --- Webcam Logic ---
    async function startWebcam() {
        try {
            currentStream = await navigator.mediaDevices.getUserMedia({ video: { ideal: 640 } });
            webcamVideo.srcObject = currentStream;
            webcamVideo.play();
            
            currentVideoTarget = webcamVideo;
            currentResultTarget = streamResult;
            
            isStreaming = true;
            connectWebSocket();
        } catch (e) {
            alert('Camera error'); switchTab('image');
        }
    }
    
    if(btnStopCamera) btnStopCamera.addEventListener('click', () => switchTab('image'));

    // --- Streaming Shared ---
    function stopStreaming() {
        isStreaming = false;
        if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
        if(uploadedVideo) { uploadedVideo.pause(); uploadedVideo.src = ''; }
        if(webcamVideo) { webcamVideo.pause(); webcamVideo.srcObject = null; }
        if (ws) { ws.close(); ws = null; }
        if(videoStreamResult) videoStreamResult.src = '';
        if(streamResult) streamResult.src = '';
    }

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(protocol + '//' + window.location.host + '/api/detect/stream');
        ws.onopen = () => { console.log('WS Open'); sendFrame(); };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if(currentResultTarget) currentResultTarget.src = data.image;
            updateStats(data.counts, data.total);
            
            framesProcessed++;
            const now = Date.now();
            if (now - lastFpsTime >= 1000) {
                if(fpsCounterEl) fpsCounterEl.textContent = framesProcessed;
                framesProcessed = 0; lastFpsTime = now;
            }
        };
        ws.onclose = () => { if(isStreaming) setTimeout(connectWebSocket, 1000); };
    }

    function sendFrame() {
        if (!isStreaming || !ws || ws.readyState !== WebSocket.OPEN) return;
        
        if (currentVideoTarget && currentVideoTarget.readyState >= 2) {
            const canvas = document.createElement('canvas');
            canvas.width = currentVideoTarget.videoWidth;
            canvas.height = currentVideoTarget.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(currentVideoTarget, 0, 0, canvas.width, canvas.height);
            
            const dataURL = canvas.toDataURL('image/jpeg', 0.6);
            let cv = 0.25; if(confSlider) cv = confSlider.value / 100;
            
            ws.send(JSON.stringify({ image: dataURL, conf: cv }));
            
            // Frame skip / lag mitigation: Wait 30ms before asking for next frame
            setTimeout(() => requestAnimationFrame(sendFrame), 30);
        } else {
            requestAnimationFrame(sendFrame);
        }
    }

    function updateStats(counts, total) {
        if(totalObjectsEl) totalObjectsEl.textContent = total;
        
        const densityEl = document.getElementById('density-level');
        if (densityEl) {
            if (total > 30) { densityEl.textContent = 'High'; densityEl.style.color = '#ef4444'; }
            else if (total > 10) { densityEl.textContent = 'Medium'; densityEl.style.color = '#f59e0b'; }
            else { densityEl.textContent = 'Low'; densityEl.style.color = '#10b981'; }
        }

        const dominantEl = document.getElementById('dominant-object');
        if (dominantEl) {
            if (Object.keys(counts).length > 0) {
                let maxClass = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                dominantEl.textContent = maxClass;
            } else {
                dominantEl.textContent = '--';
            }
        }
        
        if (Object.keys(counts).length === 0) {
            if(typesCountEl) typesCountEl.textContent = '0';
            if(objectListEl) objectListEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-check"></i><p>No objects detected</p></div>';
            return;
        }

        if(typesCountEl) typesCountEl.textContent = Object.keys(counts).length;
        if(objectListEl) {
            objectListEl.innerHTML = '';
            for (const [cls, count] of Object.entries(counts)) {
                const row = document.createElement('div');
                row.className = 'object-item';
                row.innerHTML = '<span class="obj-name">' + cls + '</span><span class="obj-count">' + count + '</span>';
                objectListEl.appendChild(row);
            }
        }
    }

    function resetStats() {
        updateStats({}, 0);
        if(fpsCounterEl) fpsCounterEl.textContent = '--';
    }
});
