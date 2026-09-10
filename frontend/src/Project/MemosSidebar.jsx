import React, { useEffect, useState, useCallback } from "react";
import { deleteMemo, updateMemo, fetchMemos, fetchDocument, fetchSegment } from "../utils/backend-api";

export default function MemosSidebar({ projectId, codes = [], pushUndoAction, setActiveDocument, setDocumentSegments }) {
  const [memos, setMemos] = useState([]);
  const [editingMemo, setEditingMemo] = useState(null);
  const [newMemoText, setNewMemoText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- DATA FETCHING ---
  const loadMemos = useCallback((isInitialLoad = false) => {
    if (!projectId) return;
    if (isInitialLoad) setLoading(true);

    fetchMemos(projectId)
      .then((res) => setMemos(res))
      .catch((e) => setError("Failed to load memos"))
      .finally(() => {
        if (isInitialLoad) setLoading(false);
      });
  }, [projectId]);

  useEffect(() => {
    loadMemos(true);
    const handleBackgroundUpdate = () => loadMemos(false);
    window.addEventListener('memos-updated', handleBackgroundUpdate);
    return () => window.removeEventListener('memos-updated', handleBackgroundUpdate);
  }, [loadMemos]);

  // --- ACTIONS ---
  const handleEdit = (memo) => {
    setEditingMemo(memo);
    setNewMemoText(memo.text);
  };

  const handleSave = async () => {
    if (!editingMemo) return;
    try {
      const res = await updateMemo(editingMemo.id, { text: newMemoText });
      if (!res.ok) throw new Error("Failed to update memo");
      const updatedMemo = await res.json();
      setMemos((prev) => prev.map((m) => (m.id === updatedMemo.id ? { ...updatedMemo, target_name: m.target_name } : m)));
      setEditingMemo(null);
      setNewMemoText("");
    } catch {
      setError("Failed to update memo");
    }
  };

  const handleDelete = async (id) => {
    const memoSnapshot = memos.find((m) => m.id === id);
    setMemos((prev) => prev.filter((m) => m.id !== id));

    try {
      await deleteMemo(id);
      if (pushUndoAction && memoSnapshot) {
        pushUndoAction({ type: "delete-memo", memo: memoSnapshot });
      }
    } catch {
      setError("Failed to delete memo");
      loadMemos(false);
    }
  };

  const handleSegmentMemoClick = async (segmentId) => {

    try {
      const segmentData = await fetchSegment(projectId, segmentId);

      const docData = await fetchDocument(projectId, segmentData.document_id);
      setActiveDocument(docData);

      setDocumentSegments([segmentData]);
    } catch(error) {
      console.error("Failed to load memo document: ", error);
    }

  }

  // --- UI RENDERER ---
  const renderMemoItem = (memo) => {
    const isEditing = editingMemo && editingMemo.id === memo.id;
    let headerContent = null;
    let cardAccentBorder = "1px solid #333";

    if (memo.target_type === "code") {
      const codeObj = codes.find((c) => Number(c.id) === Number(memo.target_id));
      const codeColor = codeObj ? codeObj.color : "#646cff";
      cardAccentBorder = `1px solid ${codeColor}40`; // 40 is hex for 25% opacity
      
      headerContent = (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", paddingBottom: "10px", borderBottom: "1px solid #333" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: codeColor, boxShadow: `0 0 8px ${codeColor}80` }}></div>
          <span style={{ fontSize: "12px", color: "#b0b0c3", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold" }}>
            {memo.target_name || "Unnamed Code"}
          </span>
        </div>
      );
    } else if (memo.target_type === "segment") {
      headerContent = (
        <div onClick={() => handleSegmentMemoClick(memo.target_id) }
          style={{ marginBottom: "12px", paddingBottom: "10px", borderBottom: "1px solid #333", display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <span style={{ color: "#646cff", fontSize: "16px", lineHeight: "1" }}>❝</span>
          <span style={{ fontSize: "13px", color: "#888", fontStyle: "italic", lineHeight: "1.4", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {memo.target_name || "Unnamed Segment"}
          </span>
        </div>
      );
    }

    return (
      <li key={memo.id} style={{ backgroundColor: "#23232a", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: cardAccentBorder, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", transition: "transform 0.2s ease" }}>
        {headerContent}
        
        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <textarea
              value={newMemoText}
              onChange={(e) => setNewMemoText(e.target.value)}
              rows={4}
              autoFocus
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #555", backgroundColor: "#111", color: "white", boxSizing: "border-box", fontFamily: "inherit", fontSize: "14px", resize: "vertical", outline: "none" }}
              onFocus={(e) => e.target.style.borderColor = "#646cff"}
              onBlur={(e) => e.target.style.borderColor = "#555"}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button onClick={() => setEditingMemo(null)} style={{ padding: "6px 12px", backgroundColor: "transparent", border: "1px solid #555", borderRadius: "6px", color: "#ccc", cursor: "pointer", fontSize: "13px" }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: "6px 16px", backgroundColor: "#646cff", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>Save Changes</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "14px", color: "#e1e1e1", lineHeight: "1.6", whiteSpace: "pre-wrap", overflowWrap: "break-word", marginBottom: "16px" }}>
              {memo.text}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button 
                onClick={() => handleEdit(memo)} 
                style={{ padding: "6px 12px", backgroundColor: "#2a2a35", border: "none", borderRadius: "6px", color: "#ccc", cursor: "pointer", fontSize: "12px", transition: "background 0.2s" }}
                onMouseOver={(e) => e.target.style.backgroundColor = "#3a3a46"}
                onMouseOut={(e) => e.target.style.backgroundColor = "#2a2a35"}
              >
                Edit
              </button>
              <button 
                onClick={() => handleDelete(memo.id)} 
                style={{ padding: "6px 12px", backgroundColor: "transparent", border: "1px solid #441111", borderRadius: "6px", color: "#ff6b6b", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
                onMouseOver={(e) => { e.target.style.backgroundColor = "#ff6b6b"; e.target.style.color = "white"; }}
                onMouseOut={(e) => { e.target.style.backgroundColor = "transparent"; e.target.style.color = "#ff6b6b"; }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </li>
    );
  };

  if (!projectId) return <div style={{ padding: "24px", color: "#888", textAlign: "center", fontStyle: "italic" }}>Select a project to view memos.</div>;
  if (loading) return <div style={{ padding: "24px", color: "#646cff", textAlign: "center" }}>Loading memos...</div>;
  if (error) return <div style={{ padding: "24px", color: "#ff6b6b", textAlign: "center", backgroundColor: "#2a0808", borderRadius: "8px", margin: "16px" }}>{error}</div>;

  const codeMemos = memos.filter((m) => m.target_type === "code");
  const segmentMemos = memos.filter((m) => m.target_type === "segment");

  return (
    <div style={{ padding: "16px 8px" }}>
      <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid #333" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#fff" }}>Project Memos</h2>
        <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>Reflections and notes on your codes and quotes.</p>
      </div>

      {memos.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", backgroundColor: "#1a1a24", borderRadius: "12px", border: "1px dashed #444" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📝</div>
          <div style={{ color: "#ccc", fontSize: "14px", fontWeight: "bold" }}>No memos yet</div>
          <div style={{ color: "#666", fontSize: "13px", marginTop: "4px" }}>Right-click a code or highlighted quote to add your thoughts.</div>
        </div>
      )}

      {codeMemos.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", fontWeight: "bold", paddingLeft: "4px" }}>
            Code Notes ({codeMemos.length})
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {codeMemos.map(renderMemoItem)}
          </ul>
        </div>
      )}

      {segmentMemos.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", fontWeight: "bold", paddingLeft: "4px" }}>
            Quote Reflections ({segmentMemos.length})
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {segmentMemos.map(renderMemoItem)}
          </ul>
        </div>
      )}
    </div>
  );
}