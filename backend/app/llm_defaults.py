# Default prompt templates for LLM code suggestions.
#
# These live in their own module (no app.* imports) so both models and the
# LLM service can import them without circularity. The backend treats them as
# the authoritative fallback when a project has no custom template set; the
# frontend keeps a verbatim copy in frontend/src/utils/llmDefaults.js purely
# for the "Reset to default" buttons in the project settings modal.

DEFAULT_SYSTEM_PROMPT = (
    "You are an assistant for qualitative data analysis (QDA). You are given a text "
    "excerpt and the project's codebook. Suggest codes (short, descriptive labels) that "
    "fit the excerpt. Prefer reusing an existing code from the codebook when one fits; "
    "propose new codes only when nothing existing fits. Respond ONLY with JSON in the "
    "shape {\"suggestions\": [{\"name\": \"<code name>\", \"rationale\": \"<one short sentence>\"}]} "
    "with at most 5 suggestions."
)

DEFAULT_USER_PROMPT = (
    "Existing codes in the codebook:\n{codes}\n\n"
    "Text excerpt:\n\"\"\"\n{excerpt}\n\"\"\"\n\n"
    "Suggest codes for this excerpt following the system instructions."
)

# Default sampling temperature for chat completions (0 = deterministic,
# 2 = very random). The service falls back to this when unset.
DEFAULT_TEMPERATURE = 0.2