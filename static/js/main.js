/**
 * Main page logic:
 *   - Info button toggles the "How to capture" banner
 *   - Capture selector: Record Video button + Upload dropdown (Video / Photo)
 *   - File selection previews with "Uploading..." feedback state
 *   - Analyze button POSTs to /upload and redirects to results
 *
 * Functionality unchanged - only layout adapted to the new UI.
 */
(function () {
    'use strict';

    let pending = null;
    let isProcessingFile = false;

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
        // Close dropdown when clicking anywhere outside it
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.upload-dropdown')) {
                uploadOptions.classList.remove('show');
            }
        });
    }

    // ----- Tab switching --------------------------------------------------
    // Works for both the top-level "Record Video" button AND the dropdown items
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            if (!target) return;

            // Mark THIS tab button as active, others inactive
            tabButtons.forEach((b) => b.classList.toggle('active', b === btn));

            // Update upload dropdown toggle's label + active state
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

            // Close dropdown after picking an item
            if (uploadOptions) uploadOptions.classList.remove('show');

            // Show the right tab panel
            tabPanels.forEach((p) => {
                p.classList.toggle('active', p.id === `tab-${target}`);
            });

            // Reset camera if leaving the record tab
            if (target !== 'record-video' && window.PoseRecorder) {
                window.PoseRecorder.reset();
            }
            updateAnalyzeButton();
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
            updateAnalyzeButton();
            return;
        }

        setUploadingState(true);
        videoPreview.innerHTML = '<div class="upload-status">⏳ Preparing video... please wait</div>';

        const url = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = url;

        tempVideo.onloadedmetadata = () => {
            videoPreview.innerHTML = `<video src="${url}" controls></video>`;
            pending = { type: 'video', source: file, filename: file.name };
            setUploadingState(false);
        };
        tempVideo.onerror = () => {
            videoPreview.innerHTML = '<div class="upload-status error">Could not read this video. Please try another file.</div>';
            pending = null;
            setUploadingState(false);
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
            updateAnalyzeButton();
            return;
        }

        setUploadingState(true);
        photoPreview.innerHTML = '<div class="upload-status">⏳ Preparing photo... please wait</div>';

        const url = URL.createObjectURL(file);
        const tempImg = new Image();
        tempImg.src = url;

        tempImg.onload = () => {
            photoPreview.innerHTML = `<img src="${url}" alt="Selected photo">`;
            pending = { type: 'photo', source: file, filename: file.name };
            setUploadingState(false);
        };
        tempImg.onerror = () => {
            photoPreview.innerHTML = '<div class="upload-status error">Could not read this photo. Please try another file.</div>';
            pending = null;
            setUploadingState(false);
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
        setUploadingState(true);
    });
    document.addEventListener('recording-ready', (e) => {
        const blob = e.detail.blob;
        const mime = e.detail.mimeType;
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        pending = { type: 'video', source: blob, filename: `recording.${ext}` };
        setUploadingState(false);
    });
    document.addEventListener('recording-cleared', () => {
        if (pending && pending.source instanceof Blob && !(pending.source instanceof File)) {
            pending = null;
        }
        setUploadingState(false);
        updateAnalyzeButton();
    });

    // ----- Analyze button -------------------------------------------------
    const analyzeBtn = document.getElementById('btn-analyze');
    const originalAnalyzeText = analyzeBtn.textContent;

    function setUploadingState(uploading) {
        isProcessingFile = uploading;
        if (uploading) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = '⏳ Uploading... please wait';
        } else {
            analyzeBtn.textContent = originalAnalyzeText;
            updateAnalyzeButton();
        }
    }

    function updateAnalyzeButton() {
        if (isProcessingFile) {
            analyzeBtn.disabled = true;
            return;
        }
        analyzeBtn.disabled = !pending;
    }

    analyzeBtn.addEventListener('click', async () => {
        if (!pending || isProcessingFile) return;
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
