/**
 * Main page logic with AUTO-ANALYZE:
 *   - File or recording becomes ready → analysis starts AUTOMATICALLY
 *   - No "Analyze Pose" button to click
 *   - Loading overlay appears immediately when analysis kicks off
 *   - This prevents the "Load failed" error from clicking before the file is ready
 */
(function () {
    'use strict';

    let pending = null;
    let isProcessingFile = false;
    let analysisStarted = false;   // guards against double-firing

    // ----- Info banner toggle ---------------------------------------------
    const infoToggle = document.getElementById('info-toggle');
    const infoBanner = document.getElementById('info-banner');
    if (infoToggle && infoBanner) {
        infoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShown = infoBanner.classList.toggle('show');
            infoToggle.classList.toggle('active', isShown);
        });
    }

    // ----- Upload dropdown toggle -----------------------------------------
    const uploadToggle = document.getElementById('upload-toggle');
    const uploadOptions = document.getElementById('upload-options');
    if (uploadToggle && uploadOptions) {
        uploadToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadOptions.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.upload-dropdown')) {
                uploadOptions.classList.remove('show');
            }
        });
    }

    // ----- Tab switching --------------------------------------------------
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            if (!target) return;

            tabButtons.forEach((b) => b.classList.toggle('active', b === btn));

            if (uploadToggle) {
                if (target === 'upload-video') {
                    uploadToggle.innerHTML = '📹 Upload Video <span class="dropdown-caret">▾</span>';
                    uploadToggle.classList.add('active');
                } else if (target === 'upload-photo') {
                    uploadToggle.innerHTML = '🖼️ Upload Photo <span class="dropdown-caret">▾</span>';
                    uploadToggle.classList.add('active');
                } else {
                    uploadToggle.innerHTML = '📁 Upload <span class="dropdown-caret">▾</span>';
                    uploadToggle.classList.remove('active');
                }
            }

            if (uploadOptions) uploadOptions.classList.remove('show');

            tabPanels.forEach((p) => {
                p.classList.toggle('active', p.id === `tab-${target}`);
            });

            if (target !== 'record-video' && window.PoseRecorder) {
                window.PoseRecorder.reset();
            }
        });
    });

    // ----- Upload Video file selection ------------------------------------
    const videoInput = document.getElementById('video-file');
    const videoPreview = document.getElementById('video-preview');

    videoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            videoPreview.innerHTML = '';
            pending = null;
            return;
        }

        isProcessingFile = true;
        videoPreview.innerHTML = '<div class="upload-status">⏳ Preparing video... please wait</div>';

        const url = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = url;

        tempVideo.onloadedmetadata = () => {
            videoPreview.innerHTML = `<video src="${url}" controls></video>`;
            pending = { type: 'video', source: file, filename: file.name };
            isProcessingFile = false;
            startAnalysis();           // AUTO-TRIGGER
        };
        tempVideo.onerror = () => {
            videoPreview.innerHTML = '<div class="upload-status error">Could not read this video. Please try another file.</div>';
            pending = null;
            isProcessingFile = false;
        };
    });

    // ----- Upload Photo file selection ------------------------------------
    const photoInput = document.getElementById('photo-file');
    const photoPreview = document.getElementById('photo-preview');

    photoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            photoPreview.innerHTML = '';
            pending = null;
            return;
        }

        isProcessingFile = true;
        photoPreview.innerHTML = '<div class="upload-status">⏳ Preparing photo... please wait</div>';

        const url = URL.createObjectURL(file);
        const tempImg = new Image();
        tempImg.src = url;

        tempImg.onload = () => {
            photoPreview.innerHTML = `<img src="${url}" alt="Selected photo">`;
            pending = { type: 'photo', source: file, filename: file.name };
            isProcessingFile = false;
            startAnalysis();           // AUTO-TRIGGER
        };
        tempImg.onerror = () => {
            photoPreview.innerHTML = '<div class="upload-status error">Could not read this photo. Please try another file.</div>';
            pending = null;
            isProcessingFile = false;
        };
    });

    // ----- Record Video controls ------------------------------------------
    document.getElementById('btn-start-camera')
        .addEventListener('click', () => window.PoseRecorder.startCamera());
    document.getElementById('btn-start-record')
        .addEventListener('click', () => window.PoseRecorder.startRecording());
    document.getElementById('btn-stop-record')
        .addEventListener('click', () => window.PoseRecorder.stopRecording());
    document.getElementById('btn-discard')
        .addEventListener('click', () => window.PoseRecorder.reset());

    document.addEventListener('recording-stopping', () => {
        isProcessingFile = true;
    });
    document.addEventListener('recording-ready', (e) => {
        const blob = e.detail.blob;
        const mime = e.detail.mimeType;
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        pending = { type: 'video', source: blob, filename: `recording.${ext}` };
        isProcessingFile = false;
        startAnalysis();               // AUTO-TRIGGER
    });
    document.addEventListener('recording-cleared', () => {
        if (pending && pending.source instanceof Blob && !(pending.source instanceof File)) {
            pending = null;
        }
        isProcessingFile = false;
    });

    // ----- Analysis -------------------------------------------------------
    async function startAnalysis() {
        if (analysisStarted) return;
        if (!pending) return;
        if (isProcessingFile) return;

        analysisStarted = true;
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
            analysisStarted = false;   // allow retry
            console.error(err);
            alert('Analysis failed:\n\n' + err.message + '\n\nPlease try again.');
        }
    }

    function showLoading(show) {
        document.getElementById('loading-overlay')
            .classList.toggle('active', !!show);
    }
})();
