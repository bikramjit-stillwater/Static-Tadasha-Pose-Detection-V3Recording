"""
Feedback for Tadasana (Mountain Pose).

Output structure (no "Summary:" or "Motivation:" labels - just plain sentences):
  - Opening sentence
  - Areas Where You Did Well (2-3 lines)
  - Areas to Improve (max 5)
  - Closing sentence

Hidden steps (hide_from_ui=True) are excluded from the prompt entirely,
so the coach doesn't comment on body parts the system couldn't evaluate.
"""

import os
from dotenv import load_dotenv

load_dotenv()


def _visible_steps(steps):
    """Return only steps that should be shown to the user (not hidden)."""
    if not steps:
        return []
    return [s for s in steps if not s.get("hide_from_ui")]


def _build_step_summary(steps):
    """Build the step list shown to Gemini - only evaluable steps."""
    visible = _visible_steps(steps)
    if not visible:
        return "  (no step data available)"
    lines = []
    for s in visible:
        score = s.get("average_score", s.get("score", 0))
        status = "PASS" if s.get("passed_overall", s.get("passed", False)) else "FAIL"
        issue = s.get("issue") or "looks good"
        lines.append(f"  Step {s['step']} - {s['name']}: {score}/100 [{status}] - {issue}")
    return "\n".join(lines)


def get_rule_based_feedback(score, issues, steps=None):
    """Fallback when no Gemini key or API call fails. No Summary:/Motivation: labels."""
    visible = _visible_steps(steps)

    # Opening sentence (no "Summary:" label)
    if score is None or score == 0:
        opening = "Could not evaluate your Tadasana. Please re-record with full body in frame and good lighting."
    elif score >= 85:
        opening = "Excellent work! Your Tadasana looks stable and well-aligned overall."
    elif score >= 70:
        opening = "Good attempt. Your pose is mostly correct, with a few areas to refine."
    elif score >= 50:
        opening = "Decent start. Focus on the foundational alignment cues to make your Tadasana stronger."
    elif score >= 30:
        opening = "Your pose is off in several places. Re-watch the steps and try again slowly."
    else:
        opening = "This does not look like a correct Tadasana yet. Please review the 6 steps and start fresh."

    well_done = [s for s in visible if s.get("passed_overall", s.get("passed", False))]
    needs_work = [s for s in visible if not s.get("passed_overall", s.get("passed", False))]

    lines = []
    lines.append(opening)
    lines.append("")

    lines.append("Areas Where You Did Well:")
    if well_done:
        for s in well_done[:3]:
            lines.append(f"- {s['name']}: solid alignment here.")
    else:
        lines.append("- Keep practicing - every attempt builds awareness of the pose.")
    lines.append("")

    lines.append("Areas to Improve:")
    if needs_work:
        for s in needs_work[:5]:
            issue = s.get("issue") or s["cue"]
            lines.append(f"- {s['name']}: {issue}")
    else:
        lines.append("- No major issues detected - just keep refining.")
    lines.append("")

    # Closing sentence (no "Motivation:" label)
    lines.append("Breathe steadily, lengthen through the crown of your head, and stand like a mountain - rooted, balanced, aware.")

    return "\n".join(lines)


def get_gemini_feedback(score, issues, steps=None):
    """Generate coaching feedback via Gemini. Falls back to rule-based on failure."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return get_rule_based_feedback(score, issues, steps)

    try:
        from google import genai
        client = genai.Client(api_key=api_key)

        step_summary = _build_step_summary(steps)
        issues_text = ("\n".join(f"- {i}" for i in issues) if issues else "- None significant")

        prompt = f"""
You are an honest, kind, knowledgeable yoga teacher trained in traditional
Hatha and Vinyasa yoga.

A student just performed Tadasana (Mountain Pose) with arms raised overhead.
Below is the step-by-step report, including ONLY the steps we could clearly
evaluate. Be HONEST about the score - if it's low, do not pretend the pose
was good.

OVERALL SCORE: {score}/100

SCORING GUIDE:
  90-100  Excellent - small refinements only
  75-89   Good - a couple of clear corrections
  55-74   Mixed - several real issues, gentle but firm corrections needed
  30-54   Poor - the pose is not Tadasana yet, walk the student through basics
   0-29   Very poor - explicitly say it does not look like Tadasana yet

STEP-BY-STEP REPORT (only evaluable steps):
{step_summary}

KEY ISSUES OBSERVED:
{issues_text}

The 6 steps of Tadasana (Arms Overhead) are:
  1. Stance - feet together or hip-width
  2. Body Balance - weight evenly distributed across both feet
  3. Legs & Knees - straight but not locked
  4. Spine - tailbone tucks down, crown lifts up, vertical alignment
  5. Shoulders & Arms - arms reach straight up overhead, palms together, elbows straight
  6. Head & Neck - balanced, gaze soft and forward

Write feedback in EXACTLY this format. DO NOT include the words "Summary:"
or "Motivation:" or any label prefix. Output the sentences directly.

<one honest opening sentence matching the score - no label prefix>

Areas Where You Did Well:
- <observation 1 - reference a specific step that passed>
- <observation 2 - another positive>
- <optional third positive, only if there are at least 3 passing steps>

Areas to Improve:
- <improvement 1 - most important fix>
- <improvement 2>
- <improvement 3>
- <improvement 4 - only if needed>
- <improvement 5 - only if needed>

<one warm closing sentence - no label prefix>

CRITICAL RULES:
- DO NOT write "Summary:" before the opening sentence. Just write the sentence.
- DO NOT write "Motivation:" before the closing sentence. Just write the sentence.
- "Areas Where You Did Well" must have 2-3 lines max.
- "Areas to Improve" must have at most 5 lines (skip lines if fewer real issues).
- Only reference steps that appear in the report (skip ones not listed).
- Reference specific step names when possible.
- Match tone to the score band - NEVER call a sub-50 pose "good".
- If knees are LOCKED, warn against hyperextension; if BENT, encourage softly straightening.
- If arms are NOT raised, tell the student to stretch them up overhead.
- Keep each bullet short - one short sentence.
"""
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        text = response.text.strip()

        # Safety net: strip leading labels if Gemini still includes them
        lines = text.split("\n")
        cleaned = []
        for line in lines:
            stripped = line.strip()
            for label in ("Summary:", "Motivation:", "summary:", "motivation:"):
                if stripped.startswith(label):
                    line = line.replace(label, "", 1).lstrip()
                    break
            cleaned.append(line)
        return "\n".join(cleaned).strip()
    except Exception:
        return get_rule_based_feedback(score, issues, steps)
