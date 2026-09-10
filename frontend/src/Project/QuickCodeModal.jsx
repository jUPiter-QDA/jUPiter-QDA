import { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { getRandomColor } from "../utils/colors";
import { buildDropdownTree } from "../utils/codeTree";

// The quick-code form owns all of its state. It is conditionally mounted, so
// every open starts from a clean form; onApply receives the form values.
export default function QuickCodeModal({ isOpen,
                                         selectionRect,
                                         selectionText,
                                         onApply,
                                         onCancel }) {
  const { projectCodes } = useWorkspace();
  const codes = projectCodes || [];

  const [quickCodeMode, setQuickCodeMode] = useState(codes.length > 0 ? "existing" : "new");
  const [selectedExistingCodeId, setSelectedExistingCodeId] = useState(
    codes.length > 0 ? codes[0].id.toString() : ""
  );
  const [autoUpcode, setAutoUpcode] = useState(false);
  const [quickCodeName, setQuickCodeName] = useState(
    selectionText.length > 30 ? `${selectionText.slice(0, 27)}...` : selectionText
  );
  const [quickCodeParentId, setQuickCodeParentId] = useState("");
  const [quickCodeColor, setQuickCodeColor] = useState(getRandomColor());

  if (!isOpen) return null;

  const getFullPath = (code, allCodes) => {
    if (!code.parent_id) return code.name;
    const parent = allCodes.find((c) => c.id === code.parent_id);
    if (parent) return `${getFullPath(parent, allCodes)} > ${code.name}`;
    return code.name;
  };

  const orderedDropdownCodes = buildDropdownTree(codes);

  const applyForm = () => onApply({
    mode: quickCodeMode,
    existingCodeId: selectedExistingCodeId,
    autoUpcode,
    name: quickCodeName,
    color: quickCodeColor,
    parentId: quickCodeParentId,
  });

  const suggestedCodes = (quickCodeMode === "new" && quickCodeName.trim().length > 0)
        ? codes.filter(c => c.name.toLowerCase().includes(quickCodeName.trim().toLowerCase()))
        : [];

    return (
        <div style={{ position: "fixed", top: selectionRect.top, left: selectionRect.left, zIndex: 1000, backgroundColor: "#23232a", border: "1px solid #444", borderRadius: "10px", padding: "12px", width: "280px", color: "white", boxShadow: "0 12px 30px rgba(0, 0, 0, 0.4)" }}>
          <div style={{ marginBottom: "6px", fontSize: "11px", color: "#b0b0c3", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold" }}>Selected Text</div>
          <div style={{ marginBottom: "12px", fontSize: "13px", lineHeight: "1.5", color: "#e5e7eb",fontStyle: "italic",backgroundColor: "#1a1a24",padding: "8px 10px",borderRadius: "6px",borderLeft: "3px solid #646cff",wordBreak: "break-word"}}>
            "{selectionText.length > 120
              ? selectionText.replace(/\s+/g, ' ').substring(0, 120).trim() + "..."
              : selectionText.replace(/\s+/g, ' ')}"
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "10px" }}>
            <select value={quickCodeMode === "new" ? "new" : selectedExistingCodeId} onChange={(e) => { if (e.target.value === "new") setQuickCodeMode("new"); else { setQuickCodeMode("existing"); setSelectedExistingCodeId(e.target.value); } }} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #555", backgroundColor: "#1f1f28", color: "white", cursor: "pointer" }}>
              <optgroup label="Hierarchical Codes">
                {orderedDropdownCodes.map((code) => (<option key={code.id} value={code.id}>{getFullPath(code, codes)}</option>))}
              </optgroup>
              <option value="new">✨ Create New Code...</option>
            </select>

            {/* Auto-upcode checkbox for existing codes */}
            {quickCodeMode === "existing" && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#b0b0c3", cursor: "pointer" }}>
                <input type="checkbox" checked={autoUpcode} onChange={(e) => setAutoUpcode(e.target.checked)} style={{ cursor: "pointer", accentColor: "#646cff" }} />
                Auto-apply to parent themes
              </label>
            )}

            {/* Inputs for NEW codes */}
            {quickCodeMode === "new" && (
              <>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={quickCodeName}
                    onChange={(e) => setQuickCodeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyForm(); } }}
                    placeholder="Code name"
                    style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #555", backgroundColor: "#1f1f28", color: "white", boxSizing: "border-box" }}
                  />
                  {suggestedCodes.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px", backgroundColor: "#2a2a35", border: "1px solid #555", borderRadius: "6px", maxHeight: "150px", overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                      {suggestedCodes.map(code => (
                        <div
                          key={code.id}
                          onClick={() => {
                            setQuickCodeMode("existing");
                            setSelectedExistingCodeId(code.id.toString());
                          }}
                          style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #333" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#3a3a44"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: code.color, flexShrink: 0 }}></div>
                          <span style={{ fontSize: "13px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getFullPath(code, codes)}</span>
                          <span style={{ fontSize: "11px", color: "#888", marginLeft: "auto", flexShrink: 0 }}>Reuse</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <select
                  value={quickCodeParentId}
                  onChange={(e) => setQuickCodeParentId(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #555", backgroundColor: "#1f1f28", color: "white", cursor: "pointer" }}
                >
                  <option value="">No Parent (Root Code)</option>
                  {orderedDropdownCodes.map((code) => (
                    <option key={code.id} value={code.id}>
                      Assign to: {getFullPath(code, codes)}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label htmlFor="quick-color" style={{ color: "#b0b0c3", fontSize: "13px", minWidth: "70px" }}>Color</label>
                  <input id="quick-color" type="color" value={quickCodeColor} onChange={(e) => setQuickCodeColor(e.target.value)} style={{ width: "40px", height: "40px", padding: 0, border: "none", background: "transparent", cursor: "pointer" }} />
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={applyForm}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#7a82ff"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#646cff"}
              style={{
                flex: 1, padding: "8px 10px", backgroundColor: "#646cff", border: "none",
                borderRadius: "6px", color: "white", cursor: "pointer", fontWeight: "bold",
                transition: "all 0.2s ease"
              }}
            >
              Apply
            </button>
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
                padding: "8px 10px", backgroundColor: "transparent", border: "1px solid #555",
                color: "#ccc", borderRadius: "6px", cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
    )

}