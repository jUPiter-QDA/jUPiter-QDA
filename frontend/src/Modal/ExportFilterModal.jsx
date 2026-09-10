import { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { buildDropdownTree } from "../utils/codeTree";

const ExportFilterModal = ({ isOpen, onClose, onExport }) => {
  const { documents, projectCodes: codes } = useWorkspace();
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Pre-select everything each time the modal opens (adjusting state during
  // render on a prop transition — the React-recommended alternative to an effect).
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSelectedDocs(documents.map(d => d.id));
      setSelectedCodes(codes.map(c => c.id));
    }
  }

  if (!isOpen) return null;

  // 1. Build a visual hierarchy (Tree) so children are indented under parents
  const orderedCodes = buildDropdownTree(codes, true);

  // 2. Helper to find all descendants (children, grandchildren, etc) of a code
  const getAllDescendantIds = (codeId) => {
    let descendants = [];
    const children = codes.filter(c => c.parent_id === codeId);
    children.forEach(child => {
      descendants.push(child.id);
      descendants = descendants.concat(getAllDescendantIds(child.id));
    });
    return descendants;
  };

  const handleToggleDoc = (id) => {
    setSelectedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  // 3. Smart Toggle: Checking a parent checks its children. Unchecking unchecks them.
  const handleToggleCode = (id) => {
    setSelectedCodes(prev => {
      const isCurrentlySelected = prev.includes(id);
      const descendantIds = getAllDescendantIds(id);

      if (isCurrentlySelected) {
        // DESELECT: Remove the parent AND all of its children
        return prev.filter(cId => cId !== id && !descendantIds.includes(cId));
      } else {
        // SELECT: Add the parent AND all of its children
        const newSelections = new Set([...prev, id, ...descendantIds]);
        return Array.from(newSelections);
      }
    });
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#111", padding: "24px", borderRadius: "12px", width: "600px", color: "white", border: "1px solid #444", boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
        
        <h3 style={{ margin: "0 0 8px 0", fontSize: "20px" }}>Export Options</h3>
        <p style={{ margin: "0 0 20px 0", color: "#aaa", fontSize: "14px" }}>
          Select the specific documents and codes you want to include in the spreadsheet.
        </p>

        <div style={{ display: "flex", gap: "20px" }}>
          
          {/* DOCUMENTS COLUMN */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Documents</strong>
              <button 
                onClick={() => setSelectedDocs(selectedDocs.length === documents.length ? [] : documents.map(d => d.id))}
                style={{ background: "none", border: "none", color: "#646cff", cursor: "pointer", fontSize: "12px" }}
              >
                {selectedDocs.length === documents.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            
            <div style={{ backgroundColor: "#1f1f28", border: "1px solid #333", borderRadius: "8px", padding: "12px", height: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {documents.length === 0 ? <div style={{ color: "#666", fontSize: "13px" }}>No documents</div> : null}
              {documents.map(doc => (
                <label key={doc.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => handleToggleDoc(doc.id)} style={{ accentColor: "#646cff" }} />
                  {doc.filename}
                </label>
              ))}
            </div>
          </div>

          {/* CODES COLUMN (Now with Hierarchy!) */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Codes</strong>
              <button 
                onClick={() => setSelectedCodes(selectedCodes.length === codes.length ? [] : codes.map(c => c.id))}
                style={{ background: "none", border: "none", color: "#646cff", cursor: "pointer", fontSize: "12px" }}
              >
                {selectedCodes.length === codes.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            
            <div style={{ backgroundColor: "#1f1f28", border: "1px solid #333", borderRadius: "8px", padding: "12px", height: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {orderedCodes.length === 0 ? <div style={{ color: "#666", fontSize: "13px" }}>No codes</div> : null}
              
              {orderedCodes.map(code => (
                <label 
                  key={code.id} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    fontSize: "13px", 
                    cursor: "pointer",
                    marginLeft: `${code.depth * 16}px` // 🌟 Adds the visual indentation!
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedCodes.includes(code.id)} 
                    onChange={() => handleToggleCode(code.id)} 
                    style={{ accentColor: "#646cff" }} 
                  />
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", backgroundColor: code.color }}></span>
                  {code.name}
                </label>
              ))}
            </div>
          </div>

        </div>

        {/* FOOTER BUTTONS */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #333" }}>
          <button 
            onClick={onClose} 
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
            style={{ padding: "10px 16px", backgroundColor: "transparent", border: "1px solid #555", borderRadius: "6px", color: "#ccc", cursor: "pointer", transition: "all 0.2s ease" }}
          >
            Cancel
          </button>
          <button 
            onClick={() => onExport(selectedDocs, selectedCodes)} 
            disabled={selectedDocs.length === 0 || selectedCodes.length === 0}
            onMouseOver={(e) => {
              if (selectedDocs.length > 0 && selectedCodes.length > 0) {
                e.currentTarget.style.backgroundColor = "#5cd661";
              }
            }}
            onMouseOut={(e) => {
              if (selectedDocs.length > 0 && selectedCodes.length > 0) {
                e.currentTarget.style.backgroundColor = "#4CAF50";
              }
            }}
            style={{ 
              padding: "10px 16px", 
              backgroundColor: (selectedDocs.length === 0 || selectedCodes.length === 0) ? "#444" : "#4CAF50", 
              border: "none", 
              borderRadius: "6px", 
              color: "white", 
              cursor: (selectedDocs.length === 0 || selectedCodes.length === 0) ? "not-allowed" : "pointer", 
              fontWeight: "bold", 
              transition: "all 0.2s ease" 
            }}
          >
            Export Data
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExportFilterModal;