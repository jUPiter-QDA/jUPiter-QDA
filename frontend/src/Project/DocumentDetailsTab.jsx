import React, { useState } from "react";

import { normalizeMetadata, updateDocumentMetadata } from "../utils/backend-api";
import DocumentMetadataModal from "./DocumentMetadataModal";

export default function DocumentDetailsTab ({ projectId,
                                              activeDocument,
                                              documentMetadata,
                                              setDocumentMetadata,
                                              handleDeleteDetail
 }) {

    const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
    const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
    const [metadataDialog, setMetadataDialog] = useState({ documentId: null, documentName: "" });

    const openMetadataDialog = (documentId, documentName) => {
      setMetadataDialog({ documentId, documentName: documentName || "Document" });
      setIsMetadataDialogOpen(true);
    };

    const closeMetadataDialog = () => {
      setMetadataDialog({ documentId: null, documentName: "" });
      setIsMetadataDialogOpen(false);
    };

    const saveDocumentMetadata = async (finalFieldName, fieldValue) => {

      const currentMetadata = normalizeMetadata(activeDocument);
      const nextMetadata = { ...currentMetadata };
  
      if (fieldValue) {
        nextMetadata[finalFieldName] = fieldValue;
      } else {
        delete nextMetadata[finalFieldName];
      }
  
      try {
        const response = await updateDocumentMetadata(projectId, 
                metadataDialog.documentId,
                { metadata: nextMetadata });
  
        if (!response.ok) throw new Error('Failed to save details');
        // if (fetchDocuments) fetchDocuments();
        // loadFolders();
        
        closeMetadataDialog();
        let newMetadata = await response.json();
        setDocumentMetadata(newMetadata.metadata);
      } catch (err) {
        console.error(err);
        window.alert('We could not save those details. Please try again.');
      }
    };

    return (<div style={{ marginBottom: "18px", padding: "14px", border: "1px solid #ddd", borderRadius: "8px", backgroundColor: "#fafafa" }}>
          
          {/* Clickable Header for Toggling */}
          <div 
            onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", cursor: "pointer", userSelect: "none" }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#222", display: "flex", alignItems: "center", gap: "10px" }}>
                Document details {isMetadataExpanded ? "▼" : "▶"}
                
                {isMetadataExpanded && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      openMetadataDialog(activeDocument.id, activeDocument.filename);
                    }}
                    style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "transparent", color: "#646cff", border: "1px solid #646cff", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
                    onMouseOver={(e) => { e.target.style.backgroundColor = "#eef2ff"; }}
                    onMouseOut={(e) => { e.target.style.backgroundColor = "transparent"; }}
                  >
                    + Add Detail
                  </button>
                )}
              </div>
              {isMetadataExpanded && (
                <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                  These are simple labels like “Interview date” or “Location”.
                </div>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>
              {Object.keys(documentMetadata).length} tag(s)
            </div>
          </div>

          {/* Collapsible Tag Container */}
          {isMetadataExpanded && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px" }}>
              {Object.keys(documentMetadata).length === 0 ? (
                <div style={{ fontSize: "13px", color: "#777" }}>No details added yet.</div>
              ) : (
                Object.entries(documentMetadata)
                  .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
                  .map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        backgroundColor: "#eef2ff",
                        border: "1px solid #c7d2fe",
                        color: "#1e293b",
                        fontSize: "12px",
                      }}
                    >
                      <strong>{key}:</strong>
                      <span>{value}</span>
                      
                      <button
                        onClick={(e) => handleDeleteDetail(e, key)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#818cf8",
                          cursor: "pointer",
                          fontSize: "14px",
                          marginLeft: "2px",
                          padding: 0,
                          lineHeight: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        title="Remove detail"
                        onMouseOver={(e) => e.target.style.color = "#ef4444"}
                        onMouseOut={(e) => e.target.style.color = "#818cf8"}
                      >
                        ×
                      </button>
                    </div>
                  ))
              )}
            </div>
          )}

          {isMetadataDialogOpen && (
              <DocumentMetadataModal
                documentId={metadataDialog.documentId}
                documentName={metadataDialog.documentName}
                onClose={closeMetadataDialog}
                onSave={saveDocumentMetadata}
                />)}
        </div>);
}