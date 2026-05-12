/**
 * Main page logic:
 *   - tab switching between Upload Video / Upload Photo / Record Video
 *   - file selection previews
 *   - hooking up the Analyze button to POST /upload
 *   - loading overlay during analysis
 */
(function () {
    'use strict';

    let pending = null;

    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
            tabPanels.forEach((p) => {
                p.classList.toggle('active', p.id === `tab-${target}`);
            });

            if (target !== 'record-video' && window.PoseRecorder) {
                window.PoseRecorder.reset();
            }
            updateAnalyzeButton();
        });
    });

    // Upload Video tab
    const videoInput = document.getElementById('video-file');
    const videoPreview = document.getElementById('video-preview');

    videoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            videoPreview.innerHTML = '';
            pending = null;
            updateAnalyzeButton();
            return;
        }
        const url = URL.createObjectURL(file);
        videoPreview.innerHTML = `<video src="${url}" controls></video>`;
        pending = { type: 'video', source: file, filename: file.name };
        updateAnalyzeButton();
    });

    // Upload Photo tab
    const photoInput = document.getElementById('photo-file');
    const photoPreview = document.getElementById('photo-preview');

    photoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            photoPreview.innerHTML = '';
            pending = null;
            updateAnalyzeButton();
            return;
        }
        const url = URL.createObjectURL(file);
        photoPreview.innerHTML = `<img src="${url}" alt="Selected photo">`;
        pending = { type: 'photo', source: file, filename: file.name };
        updateAnalyzeButton();
    });

    // Record Video tab
    document.getElementById('btn-start-camera')
        .addEventListener('click', () => window.PoseRecorder.startCamera());
    document.getElementById('btn-start-record')
        .addEventListener('click', () => window.PoseRecorder.startRecording());
    document.getElementById('btn-stop-record')
        .addEventListener('click', () => window.PoseRecorder.stopRecording());
    document.getElementById('btn-discard')
        .addEventListener('click', () => window.PoseRecorder.reset());

    document.addEventListener('recording-ready', (e) => {
        const blob = e.detail.blob;
        const mime = e.detail.mimeType;
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        pending = { type: 'video', source: blob, filename: `recording.${ext}` };
        updateAnalyzeButton();
    });
    document.addEventListener('recording-cleared', () => {
        if (pending && pending.source instanceof Blob && !(pending.source instanceof File)) {
            pending = null;
        }
        updateAnalyzeButton();
    });

    // Analyze button
    const analyzeBtn = document.getElementById('btn-analyze');

    function updateAnalyzeButton() {
        analyzeBtn.disabled = !pending;
    }

    analyzeBtn.addEventListener('click', async () => {
        if (!pending) return;
        showLoading(true);
        try {
            const formData = new FormData();
            formData.append('media', pending.source, pending.filename);
            formData.append('type', pending.type);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let msg = 'Upload failed (HTTP ' + response.status + ')';
                try {
                    const data = await response.json();
                    if (data.error) msg += ': ' + data.error;
                } catch (_) { /* ignore */ }
                throw new Error(msg);
            }

            const data = await response.json();
            if (data.redirect) {
                window.location.href = data.redirect;
            } else {
                throw new Error('Server did not return a redirect URL');
            }
        } catch (err) {
            showLoading(false);
            console.error(err);
            alert('Analysis failed:\n\n' + err.message);
        }
    });

    function showLoading(show) {
        document.getElementById('loading-overlay')
            .classList.toggle('active', !!show);
    }

    updateAnalyzeButton();
})();
