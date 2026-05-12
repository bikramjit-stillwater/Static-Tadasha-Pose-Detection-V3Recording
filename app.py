"""
Tadasana (Mountain Pose) Analysis - Flask web app.

Three input methods:
  1. Upload existing video
  2. Upload existing photo
  3. Record video in browser (uses MediaRecorder API - no third-party API key)

Endpoints:
  GET  /                       -> main upload/record page
  POST /upload                 -> accepts video or photo, runs analysis
  GET  /result/<session_id>    -> displays analysis results
  GET  /media/<session>/<file> -> serves images from the session folder
"""

import os
import uuid
import tempfile
from flask import (Flask, render_template, request, jsonify,
                   send_from_directory, redirect, url_for)

from src.pose_analyzer import analyze_video, analyze_image
from src.feedback import get_gemini_feedback

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB upload limit

# In-memory result store (sessions cleared on restart - fine for demos)
RESULTS = {}


def get_output_root():
    """Use ./output if writable, else a temp dir (for Render)."""
    local = os.path.join(os.getcwd(), "output")
    try:
        os.makedirs(local, exist_ok=True)
        test = os.path.join(local, ".write_test")
        with open(test, "w") as f:
            f.write("ok")
        os.remove(test)
        return local
    except OSError:
        return os.path.join(tempfile.gettempdir(), "tadasana")


OUTPUT_ROOT = get_output_root()
SESSIONS_DIR = os.path.join(OUTPUT_ROOT, "sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)


def session_dir(session_id):
    d = os.path.join(SESSIONS_DIR, session_id)
    os.makedirs(d, exist_ok=True)
    return d


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    """Accepts a video or photo via multipart form. Returns JSON with redirect."""
    f = request.files.get('media')
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    media_type = request.form.get('type', 'video')  # 'video' or 'photo'

    session_id = str(uuid.uuid4())[:8]
    sdir = session_dir(session_id)

    # Decide extension based on media type and original filename
    orig_name = f.filename or ""
    if media_type == 'photo':
        ext = "jpg"
    else:
        # For recorded video, MediaRecorder produces webm by default
        if orig_name.lower().endswith(('.mp4', '.mov', '.avi', '.mkv')):
            ext = orig_name.rsplit('.', 1)[1].lower()
        else:
            ext = "webm"

    filepath = os.path.join(sdir, f"input.{ext}")
    f.save(filepath)

    # Run analysis
    frames_dir = os.path.join(sdir, "frames")
    try:
        if media_type == 'photo':
            result = analyze_image(filepath, frames_dir)
        else:
            result = analyze_video(filepath, frames_dir)

        feedback = get_gemini_feedback(
            result["final_score"], result["issues"],
            steps=result.get("steps"),
        )
        result['feedback'] = feedback
    except Exception as e:
        result = {
            "final_score": 0,
            "issues": [f"Analysis failed: {str(e)}"],
            "steps": [],
            "best_frame_path": None,
            "annotated_path": None,
            "step_image_paths": {},
            "low_quality_warning": True,
            "low_quality_message": f"Analysis failed: {str(e)}",
            "feedback": f"Could not generate feedback. Reason: {str(e)}",
        }

    result['session_id'] = session_id
    result['mode'] = media_type
    RESULTS[session_id] = result

    return jsonify({
        "session_id": session_id,
        "redirect": url_for('result', session_id=session_id),
    })


@app.route('/result/<session_id>')
def result(session_id):
    res = RESULTS.get(session_id)
    if not res:
        return redirect(url_for('index'))

    # Convert local file paths to URL paths for the template
    def to_url(local_path):
        if not local_path or not os.path.exists(local_path):
            return None
        rel = os.path.relpath(local_path, SESSIONS_DIR)
        return url_for('media', filepath=rel)

    res_view = dict(res)
    res_view['annotated_url'] = to_url(res.get('annotated_path'))
    res_view['best_frame_url'] = to_url(res.get('best_frame_path'))

    step_urls = {}
    for k, p in (res.get('step_image_paths') or {}).items():
        step_urls[k] = to_url(p)
    res_view['step_image_urls'] = step_urls

    return render_template('result.html', result=res_view)


@app.route('/media/<path:filepath>')
def media(filepath):
    """Serve images/videos from sessions folder."""
    return send_from_directory(SESSIONS_DIR, filepath)


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Max 100 MB."}), 413


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
