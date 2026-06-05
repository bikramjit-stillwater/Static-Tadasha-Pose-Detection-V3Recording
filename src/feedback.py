"""
Coach's feedback generator for Tadasana via OpenRouter (Claude Sonnet 4.5).

Env vars:
  OPENROUTER_API_KEY  - required
  OPENROUTER_MODEL    - optional, defaults to 'anthropic/claude-sonnet-4.5'

Exposes:
  generate_feedback(result)   - new name
  get_gemini_feedback(result) - alias for backwards compat with existing app.py
"""

import os
import json
import urllib.request
import urllib.error

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5").strip()
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _visible_steps(steps):
    return [s for s in steps if not s.get("hide_from_ui")]


def _build_prompt(result):
    visible = _visible_steps(result.get("steps", []))
    final_score = result.get("final_score", 0)

    lines = []
    for s in visible:
        score = s.get("average_score", s.get("score", 0))
        status = "Passed" if score >= 50 else "Needs improvement"
        issue = s.get("issue") or "no issues"
        lines.append(
            f"Step {s['step']}: {s['name']} - Score: {score}/100 - "
            f"{status} - Issue: {issue} - Cue: {s.get('cue', '')}"
        )
    steps_text = "\n".join(lines) if lines else "(No steps evaluated)"

    return f"""You are an experienced yoga instructor providing personalized feedback to a student who just performed Tadasana (Mountain Pose with arms overhead).

Their alignment was scored on 5 key steps. Here is the per-step report:

{steps_text}

Overall final score: {final_score}/100

Write personalized coaching feedback in this EXACT format:

1. A single opening sentence acknowledging their performance (do NOT use "Summary:" as a prefix)
2. A blank line
3. The label "Areas Where You Did Well:" followed by 2-3 specific bullet points starting with "- "
4. A blank line
5. The label "Areas to Improve:" followed by up to 5 specific actionable bullet points starting with "- "
6. A blank line
7. A single closing motivational sentence (do NOT use "Motivation:" as a prefix)

Important rules:
- Address the student directly using "you" and "your"
- Be specific to their actual scores and issues
- Do NOT use the words "Summary:" or "Motivation:" anywhere
- Each bullet point should be one line
- Be warm and encouraging but honest about what needs work
- If a step's score is >= 80, treat it as a strength (Did Well)
- If a step's score is < 50, treat it as needing improvement
- Mention each evaluated step at most once across both lists
- Output ONLY the feedback itself - no preamble, no closing remarks like "Hope this helps"
"""


def _clean_feedback(text):
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        low = stripped.lower()
        if low.startswith("summary:"):
            stripped = stripped.split(":", 1)[1].strip()
        elif low.startswith("motivation:"):
            stripped = stripped.split(":", 1)[1].strip()
        cleaned.append(stripped if stripped != line.strip() else line)
    return "\n".join(cleaned).strip()


def _call_openrouter(prompt):
    body = json.dumps({
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 800,
        "temperature": 0.7,
    }).encode("utf-8")

    req = urllib.request.Request(
        OPENROUTER_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://stillwater.app",
            "X-Title": "Stillwater Pose Analysis",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))

    return data["choices"][0]["message"]["content"].strip()


def _rule_based_feedback(result):
    visible = _visible_steps(result.get("steps", []))
    final_score = result.get("final_score", 0)

    well = [s for s in visible
            if s.get("average_score", s.get("score", 0)) >= 80]
    needs = [s for s in visible
             if s.get("average_score", s.get("score", 0)) < 50]

    if final_score >= 85:
        opening = "Excellent work on your Tadasana - this is a strong, well-aligned pose."
        closing = "Keep up the consistent practice - this is the foundation for everything that follows."
    elif final_score >= 70:
        opening = "A solid attempt at Tadasana with a strong foundation to build on."
        closing = "Keep practicing - the refinements will come naturally."
    elif final_score >= 50:
        opening = "A reasonable attempt at Tadasana with several areas to refine."
        closing = "Stay patient - alignment improves with mindful practice."
    else:
        opening = "Tadasana is the foundation of standing poses - let's work through the basics together."
        closing = "Take it one step at a time, and you will see steady progress."

    parts = [opening, "", "Areas Where You Did Well:"]
    if well:
        for s in well[:3]:
            parts.append(f"- Your {s['name']} alignment looked good in this pose.")
    else:
        parts.append("- You showed up and gave it a try - that is the first step.")

    parts.extend(["", "Areas to Improve:"])
    if needs:
        for s in needs[:5]:
            issue = s.get("issue") or s.get("cue") or "review the alignment for this step"
            parts.append(f"- {s['name']}: {issue}")
    else:
        parts.append("- Nothing major - keep refining the details.")

    parts.extend(["", closing])
    return "\n".join(parts)


def generate_feedback(result):
    """Main entry. Returns a feedback string for the result page."""
    if not OPENROUTER_API_KEY:
        print("[feedback] OPENROUTER_API_KEY not set - using rule-based fallback")
        return _rule_based_feedback(result)

    try:
        prompt = _build_prompt(result)
        raw = _call_openrouter(prompt)
        return _clean_feedback(raw)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"[feedback] OpenRouter HTTPError {e.code}: {body[:300]}")
        return _rule_based_feedback(result)
    except Exception as e:
        print(f"[feedback] OpenRouter error: {e!r}")
        return _rule_based_feedback(result)


# Backwards-compatible alias - app.py imports this name from the old Gemini setup
get_gemini_feedback = generate_feedback
