import { useState } from "react";

// Selection-anchored popup (same shell as QuickCodeModal) listing LLM code
// suggestions for the selected excerpt. Owns only the "already applied" set;
// suggestions themselves come from props and are applied by the parent via
// onApplySuggestion, which returns a promise resolving to true on success.
export default function AISuggestModal({ isOpen,
                                          selectionRect,
                                          selectionText,
                                          suggestions,
                                          isLoading,
                                          onApplySuggestion,
                                          onCancel }) {
  const [appliedNames, setAppliedNames] = useState([]);
  const [applyingName, setApplyingName] = useState(null);

  if (!isOpen) return null;

  const handleApply = async (suggestion) => {
    if (appliedNames.includes(suggestion.name) || applyingName) return;
    setApplyingName(suggestion.name);
    const ok = await onApplySuggestion(suggestion);
    setApplyingName(null);
    if (ok) setAppliedNames((prev) => [...prev, suggestion.name]);
  };

  return (
    <div style={{ position: "fixed", top: selectionRect.top, left: selectionRect.left, zIndex: 1000, backgroundColor: "#23232a", border: "1px solid #444", borderRadius: "10px", padding: "12px", width: "320px", maxHeight: "420px", overflowY: "auto", color: "white", boxShadow: "0 12px 30px rgba(0, 0, 0, 0.4)" }}>
      <div style={{ marginBottom: "6px", fontSize: "11px", color: "#b9a5ff", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold" }}>✨ AI Code Suggestions</div>
      <div style={{ marginBottom: "12px", fontSize: "13px", lineHeight: "1.5", color: "#e5e7eb", fontStyle: "italic", backgroundColor: "#1a1a24", padding: "8px 10px", borderRadius: "6px", borderLeft: "3px solid #b9a5ff", wordBreak: "break-word" }}>
        "{selectionText.length > 120
          ? selectionText.replace(/\s+/g, " ").substring(0, 120).trim() + "..."
          : selectionText.replace(/\s+/g, " ")}"
      </div>

      {isLoading ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#888", fontStyle: "italic", fontSize: "13px" }}>
          Thinking...
        </div>
      ) : suggestions.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#888", fontSize: "13px" }}>
          No suggestions.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
          {suggestions.map((suggestion) => {
            const isApplied = appliedNames.includes(suggestion.name);
            const isExisting = Boolean(suggestion.existing_code_id);
            return (
              <div key={suggestion.name} style={{ padding: "10px", backgroundColor: "#1a1a24", borderRadius: "8px", border: "1px solid #333", opacity: isApplied ? 0.55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: suggestion.rationale ? "6px" : 0 }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: isExisting ? "#646cff" : "#4CAF50", flexShrink: 0 }}></div>
                  <span style={{ fontSize: "13px", color: "#fff", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{suggestion.name}</span>
                  <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "10px", backgroundColor: isExisting ? "#1a2650" : "#1f3a20", color: isExisting ? "#8ea0ff" : "#7ddb8a", flexShrink: 0 }}>
                    {isExisting ? "existing" : "new"}
                  </span>
                  <button
                    onClick={() => handleApply(suggestion)}
                    disabled={isApplied || Boolean(applyingName)}
                    style={{
                      marginLeft: "auto", padding: "4px 10px", flexShrink: 0,
                      backgroundColor: isApplied ? "#2a2a35" : "#646cff",
                      border: "none", borderRadius: "6px", color: isApplied ? "#4CAF50" : "white",
                      fontSize: "11px", fontWeight: "bold", cursor: isApplied || applyingName ? "default" : "pointer",
                    }}
                  >
                    {isApplied ? "✓ Applied" : "Apply"}
                  </button>
                </div>
                {suggestion.rationale && (
                  <div style={{ fontSize: "12px", color: "#888", lineHeight: "1.4" }}>
                    {suggestion.rationale}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onCancel}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
          e.currentTarget.style.borderColor = "#aaa";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.borderColor = "#555";
          e.currentTarget.style.color = "#ccc";
        }}
        style={{
          width: "100%", padding: "8px 10px", backgroundColor: "transparent",
          border: "1px solid #555", color: "#ccc", borderRadius: "6px",
          cursor: "pointer", transition: "all 0.2s ease",
        }}
      >
        Close
      </button>
    </div>
  );
}