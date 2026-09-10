import { useState, useEffect, useRef } from "react";
import { deleteSegment, fetchDocument } from "../utils/backend-api"
import { useProject } from "../context/ProjectContext"
import { useUndo } from "../context/UndoContext"
import { useWorkspace } from "../context/WorkspaceContext"

const getContrastText = (hex) => {
  if (!hex) return '#FFFFFF';
  
  let cleanHex = hex.replace('#', '');
  
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  return yiq >= 128 ? '#000000' : '#FFFFFF';
};

const ProjectPageCodePanel = () => {
  const { projectId } = useProject();
  const { pushAction } = useUndo();
  const {
    projectCodes,
    documents,
    codePanelOpen,
    activeCode,
    codePanelRefreshTick: refreshToken,
    setCodePanelOpen,
    setActiveCode,
    setDocumentSegments,
    refreshCodes: loadCodes,
    selectAllProjectSegments,
    openDocumentAtQuote,
  } = useWorkspace();
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [includeSubCodes, setIncludeSubCodes] = useState(true);
  const [localSegments, setLocalSegments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [docCache, setDocCache] = useState({});
  const fetchingDocs = useRef(new Set());

  useEffect(() => {
    if (!activeCode || !codePanelOpen) return;

    const loadQuotes = async () => {
      setLoading(true);
      try {
        const allSegments = await selectAllProjectSegments();

        const getKids = (parentId) => {
          let kids = (projectCodes || []).filter(c => Number(c.parent_id) === Number(parentId)).map(c => Number(c.id));
          let allKids = [...kids];
          kids.forEach(k => { allKids = [...allKids, ...getKids(k)] });
          return allKids;
        };

        let validIds = [Number(activeCode.id)];
        if (includeSubCodes) {
          validIds = [...validIds, ...getKids(activeCode.id)];
        }

        setLocalSegments(allSegments.filter(s => validIds.includes(Number(s.code_id))));
      } catch (err) {
        console.error("Failed to load code segments:", err);
      }
      setLoading(false);
    };

    loadQuotes();
  }, [activeCode, includeSubCodes, codePanelOpen, documents, projectId, projectCodes, refreshToken, selectAllProjectSegments]);

  useEffect(() => {
    const missingDocIds = [...new Set(localSegments.map(s => s.document_id))]
      .filter(id => !docCache[id] && !fetchingDocs.current.has(id));
    
    if (missingDocIds.length === 0) return;

    missingDocIds.forEach(id => fetchingDocs.current.add(id));

    Promise.all(missingDocIds.map(async (docId) => {
      try {
        const data = await fetchDocument(projectId, docId);
        setDocCache(prev => ({ ...prev, [docId]: data }));
      } catch (err) {
        console.error("Failed to cache document for context:", err);
      }
    }));
  }, [localSegments, projectId, docCache]);

  const handleQuoteClick = (quote) => {
    setSelectedQuoteId(quote.id);
    openDocumentAtQuote(quote.document_id, quote.id);
  };

  const handleDeleteSegment = async (e, segmentId) => {
    e.stopPropagation();
    const confirmDelete = window.confirm("Are you sure you want to delete this highlighted quote?");
    if (!confirmDelete) return;

    const segmentSnapshot = localSegments.find((segment) => segment.id === segmentId);

    try {
      const response = await deleteSegment(projectId, segmentId);
      if (response.ok) {
        loadCodes(); // Update the sidebar badge
        setLocalSegments((prev) => prev.filter((segment) => segment.id !== segmentId)); // Update panel instantly
        if (setDocumentSegments) {
          setDocumentSegments((prev) => prev.filter((segment) => segment.id !== segmentId));
        }
        if (segmentSnapshot) {
          pushAction({
            type: "delete-segment",
            segment: segmentSnapshot,
          });
        }
        if (selectedQuoteId === segmentId) setSelectedQuoteId(null);
      } else {
        console.error("Failed to delete segment");
      }
    } catch (error) {
      console.error("Error deleting segment:", error);
    }
  };

  if (!codePanelOpen) return null;

  const hasChildren = activeCode && projectCodes.some((c) => Number(c.parent_id) === Number(activeCode.id));

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", border: "1px solid #ccc",borderRight: "1px solid #333" , padding: "20px", backgroundColor: "#111", color: "#fff",borderTop: "1px solid #ccc", overflow: "hidden", boxSizing: "border-box", }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "18px" }}>Compiled Quotes</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "6px" }}>
            <div style={{ color: "#aaa", fontSize: "13px", fontWeight: "bold" }}>{activeCode?.name || "Selected code"}</div>
            
            {hasChildren && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#b0b0c3", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeSubCodes}
                  onChange={(e) => setIncludeSubCodes(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#646cff" }}
                />
                Include Sub-Codes
              </label>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            setCodePanelOpen(false);
            setActiveCode(null);
            setSelectedQuoteId(null);
          }}
          style={{ backgroundColor: "transparent", border: "1px solid #444", color: "#ccc", borderRadius: "6px", padding: "8px 12px", cursor: "pointer" }}
        >
          Close
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {loading ? (
          <p style={{ color: "#888", margin: 0, fontStyle: "italic" }}>Fetching quotes...</p>
        ) : localSegments.length === 0 ? (
          <p style={{ color: "#888", margin: 0 }}>No quotes found for this code yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {(() => {
              const mergedQuotes = [];
              localSegments.forEach((quote) => {
                const existing = mergedQuotes.find(
                  (group) =>
                    group.document_id === quote.document_id &&
                    group.start_char === quote.start_char &&
                    group.end_char === quote.end_char,
                );

                const codeObj = projectCodes.find(c => Number(c.id) === Number(quote.code_id)) || activeCode;
                const badgeData = { segment_id: quote.id, name: codeObj?.name || "Code", color: codeObj?.color || "#646cff" };

                if (existing) {
                  existing.badges.push(badgeData);
                } else {
                  mergedQuotes.push({ ...quote, badges: [badgeData] });
                }
              });

              mergedQuotes.forEach((quote) => {
                quote.badges.sort((a, b) => {
                  const idxA = projectCodes.findIndex((code) => code.name === a.name);
                  const idxB = projectCodes.findIndex((code) => code.name === b.name);
                  return (idxA !== -1 ? idxA : 9999) - (idxB !== -1 ? idxB : 9999);
                });
              });

              const quotesByDocument = mergedQuotes.reduce((groups, quote) => {
                const docObj = documents?.find(d => Number(d.id) === Number(quote.document_id));
                const docName = docObj ? docObj.filename : `Document #${quote.document_id}`;

                if (!groups[quote.document_id]) {
                  groups[quote.document_id] = {
                    documentId: quote.document_id,
                    documentName: docName,
                    quotes: []
                  };
                }
                groups[quote.document_id].quotes.push(quote);
                return groups;
              }, {});

              return Object.values(quotesByDocument).map((docGroup) => (
                <div 
                  key={`doc-group-${docGroup.documentId}`} 
                  style={{
                    backgroundColor: "#17171d",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  {/* --- DOCUMENT HEADER --- */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    <span style={{ fontWeight: "600", fontSize: "14px", color: '#ccc' }}>📄 {docGroup.documentName}</span>
                  </div>

                  {/* --- NESTED QUOTES LIST --- */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {docGroup.quotes.map((quote, idx) => {
                      const isSelected = quote.badges.some((badge) => badge.segment_id === selectedQuoteId);
                      const primarySegmentId = quote.badges[0]?.segment_id ?? quote.id;

                      let before = "";
                      let highlight = quote.content || "Empty quote";
                      let after = "";

                      if (docCache[quote.document_id]?.content && quote.start_char !== undefined && quote.end_char !== undefined) {
                        const fullText = docCache[quote.document_id].content;
                        const start = quote.start_char;
                        const end = quote.end_char;
                        
                        const pad = 120; 
                        const cStart = Math.max(0, start - pad);
                        const cEnd = Math.min(fullText.length, end + pad);

                        before = fullText.substring(cStart, start);
                        if (cStart > 0) before = "..." + before;

                        highlight = fullText.substring(start, end) || quote.content;

                        after = fullText.substring(end, cEnd);
                        if (cEnd < fullText.length) after = after + "...";
                      }

                      const isLastQuote = idx === docGroup.quotes.length - 1;

                      return (
                        <div
                          key={`quote-${primarySegmentId}`}
                          onClick={() => handleQuoteClick({ id: primarySegmentId, document_id: quote.document_id })}
                          style={{
                            padding: isSelected ? "10px" : "10px 0",
                            backgroundColor: isSelected ? "#1f1f2a" : "transparent",
                            borderRadius: isSelected ? "6px" : "0",
                            borderBottom: (!isLastQuote && !isSelected) ? "1px dashed #444" : "none",
                            marginBottom: !isLastQuote ? "16px" : "0",
                            cursor: "pointer",
                            transition: "background-color 0.2s ease",
                          }}
                        >
                          {/* Badges Area */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                            {quote.badges.map((badge) => {
                              const textColor = getContrastText(badge.color);
                              
                              return (
                                <div key={badge.segment_id} style={{ display: "flex", alignItems: "center", backgroundColor: badge.color, borderRadius: "4px", overflow: "hidden" }}>
                                  
                                  <span style={{ color: textColor, fontSize: "10px", padding: "2px 6px", fontWeight: "bold" }}>
                                    {badge.name}
                                  </span>
                                  
                                  <span
                                    onClick={(e) => handleDeleteSegment(e, badge.segment_id)}
                                    style={{ 
                                      backgroundColor: "rgba(0,0,0,0.15)", 
                                      color: textColor,                   
                                      padding: "2px 6px", 
                                      fontSize: "10px", 
                                      cursor: "pointer" 
                                    }}
                                    title={`Remove ${badge.name}`}
                                    onMouseOver={(e) => (e.target.style.backgroundColor = "rgba(255,0,0,0.6)")}
                                    onMouseOut={(e) => (e.target.style.backgroundColor = "rgba(0,0,0,0.15)")}
                                  >
                                    ×
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Text Snippet Area */}
                          <div style={{ fontSize: "14px", lineHeight: "1.5", color: "#ddd" }}>
                            {before}
                            <span style={{ 
                              backgroundColor: quote.badges[0]?.color || "#646cff", 
                              color: getContrastText(quote.badges[0]?.color || "#646cff"), 
                              borderRadius: "4px", 
                              padding: "0 3px" 
                            }}>
                              {highlight}
                            </span>
                            {after}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectPageCodePanel;