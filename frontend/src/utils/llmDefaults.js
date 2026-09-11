// Frontend copy of the default LLM prompt templates. The backend
// (backend/app/llm_defaults.py) is authoritative — it falls back to its own
// copy when a project has no custom template — so this file only powers the
// "Reset to default" buttons in the project settings modal. Keep both copies
// verbatim-identical.

export const DEFAULT_SYSTEM_PROMPT =
  "You are an assistant for qualitative data analysis (QDA). You are given a text " +
  "excerpt and the project's codebook. Suggest codes (short, descriptive labels) that " +
  "fit the excerpt. Prefer reusing an existing code from the codebook when one fits; " +
  "propose new codes only when nothing existing fits. Respond ONLY with JSON in the " +
  'shape {"suggestions": [{"name": "<code name>", "rationale": "<one short sentence>"}]} ' +
  "with at most 5 suggestions.";

export const DEFAULT_USER_PROMPT =
  "Existing codes in the codebook:\n{codes}\n\n" +
  'Text excerpt:\n"""\n{excerpt}\n"""\n\n' +
  "Suggest codes for this excerpt following the system instructions.";

// Default sampling temperature for chat completions. Mirrors
// DEFAULT_TEMPERATURE in backend/app/llm_defaults.py (authoritative).
export const DEFAULT_TEMPERATURE = 0.2;