import ProjectPageCodePanel from "./ProjectPageCodePanel";
import ProjectPageDocumentPanel from "./ProjectPageDocumentPanel";
import ProjectPageTopBar from "./ProjectPageTopBar";
import ProjectSettingsModal from "./ProjectSettingsModal";
import DocumentsSidebar from "./DocumentsSidebar";
import CodesSidebar from "./CodesSidebar";
import MemosSidebar from "./MemosSidebar";
import ExportFilterModal from "../Modal/ExportFilterModal";
// V4 Imports
import { Group, Panel, Separator } from "react-resizable-panels";
import { useState, useEffect, useRef } from "react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import useUndoController from "../hooks/useUndoController";
import { exportProjectToRefi, exportProjectSegmentsToCsv, buildUrlToExportExcel } from "../utils/backend-api";

// The whole workspace. All cross-component state comes from the project-scoped
// contexts mounted by ProjectPage; only view-local state lives here.
const ProjectPageView = () => {
  const {
    projectId: id,
    projectDetails,
    saveProjectDetails,
    deleteProjectAndNavigate,
  } = useProject();
  const { showToast, showToastSticky, setStatus } = useToast();
  const {
    documents,
    activeDocument,
    documentSegments,
    projectCodes,
    codePanelOpen,
    pendingQuoteJump,
    setPendingQuoteJump,
    setCurrentSearchResult,
    refreshDocuments,
    uploadFiles,
    selectDocument,
    deleteDocument,
    renameDocument,
    createTextDocument,
    openCodePanel,
  } = useWorkspace();
  useUndoController();

  const viewerRef = useRef(null);
  const [activeTab, setActiveTab] = useState("documents");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleSaveSettings = async (newName, newDescription, llmSystemPrompt, llmUserPrompt) => {
    const ok = await saveProjectDetails(newName, newDescription, llmSystemPrompt, llmUserPrompt);
    if (ok) setIsSettingsOpen(false); // Close the modal
  };

  const handleExportREFI = async () => {
    showToastSticky("Generating REFI-QDA export...");

    try {
      const response = await exportProjectToRefi(id);
      if (!response.ok) throw new Error("Failed to generate export");
      const blob = await response.blob();

      if (window.showSaveFilePicker) {
        try {
          //pauses JavaScript until the user picks a folder
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: `${projectDetails.name.replace(/ /g, "_")}.qdpx`,
            types: [
              {
                description: "REFI-QDA Project Package",
                accept: { "application/zip": [".qdpx"] },
              },
            ],
          });

          // Once they pick a folder, we write the file directly to their hard drive
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          showToast("Export saved successfully!", 4000);
        } catch (pickerError) {
          if (pickerError.name === "AbortError") {
            setStatus("");
            return;
          }
          throw pickerError;
        }
      } else {
        //for older browsers
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${projectDetails.name.replace(/ /g, "_")}.qdpx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        showToast(" Export ready for download!", 4000);
      }
    } catch (error) {
      console.error(error);
      showToast(" Export failed.", 4000);
    }
  };

  const handleExportQuotesCSV = async () => {
    showToastSticky("Generating Quotes CSV...");
    try {
      const response = await exportProjectSegmentsToCsv(id);
      if (!response.ok) throw new Error("Failed to export quotes");

      const blob = await response.blob();

      if (window.showSaveFilePicker) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: `${projectDetails.name.replace(/ /g, "_")}_Quotes.csv`,
            types: [{
              description: "CSV File (Excel Compatible)",
              accept: { "text/csv": [".csv"] },
            }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          showToast("Quotes exported successfully!", 4000);
        } catch (pickerError) {
          if (pickerError.name === "AbortError") {
            setStatus("");
            return;
          }
          throw pickerError;
        }
      } else {
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${projectDetails.name.replace(/ /g, "_")}_Quotes.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
        showToast("Quotes exported successfully!", 4000);
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to export Quotes.", 4000);
    }
  };

  const handleExportExcel = async (selectedDocIds, selectedCodeIds) => {

    let url = buildUrlToExportExcel(id, selectedDocIds, selectedCodeIds);

    const link = document.createElement("a");
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Close the modal
    setIsExportModalOpen(false);
  };

  const handleSearchResultClick = (result) => {
    // Set the active document to the one containing the search result
    const targetDoc = documents.find((doc) => doc.id === result.document_id);
    if (targetDoc) {
      selectDocument(result.document_id);
      // Store the search result for highlighting
      setCurrentSearchResult({
        document_id: result.document_id,
        start_char: result.start_char,
        end_char: result.end_char,
      });
    }
  };

  const scrollToQuote = (quoteId) => {
    if (!viewerRef.current) return;
    const element = viewerRef.current.querySelector(
      `[data-segment-ids~="${quoteId}"]`,
    );
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    if (
      !pendingQuoteJump ||
      !activeDocument ||
      pendingQuoteJump.document_id !== activeDocument.id
    )
      return;
    scrollToQuote(pendingQuoteJump.quoteId);
    setPendingQuoteJump(null);
  }, [activeDocument, documentSegments, pendingQuoteJump, setPendingQuoteJump]);

  const handleStyle = {
    width: "1px",
    backgroundColor: "#333",
    cursor: "col-resize",
  };

  return (
    <div
      style={{
        padding: 0,
        margin: 0,
        fontFamily: "sans-serif",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        boxSizing: "border-box",
      }}
    >
      <ProjectPageTopBar
        projectDetails={projectDetails}
        handleExportREFI={handleExportREFI}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsExportModalOpen={setIsExportModalOpen}
        projectId={id}
        onSearchResultClick={handleSearchResultClick}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* V4 syntax: Group and orientation */}
        <Group orientation="horizontal" autoSaveId="project-page-layout">

          <Panel defaultSize={28} minSize={20}>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
              }}
            >
              <div
                style={{
                  width: "60px",
                  backgroundColor: "#111",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  paddingTop: "20px",
                  borderRight: "1px solid #333",
                  borderTop: "1px solid #333",
                }}
              >
                <button
                  onClick={() => setActiveTab("documents")}
                  onMouseEnter={(e) => {
                    if (activeTab !== "documents") {
                      e.currentTarget.style.opacity = "0.8";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== "documents") {
                      e.currentTarget.style.opacity = "0.4";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    fontSize: "24px",
                    cursor: "pointer",
                    padding: "10px",
                    opacity: activeTab === "documents" ? 1 : 0.4,
                    transition: "all 0.2s ease",
                    borderLeft: activeTab === "documents" ? "3px solid #646cff" : "3px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Documents"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M3 8.2C3 7.07989 3 6.51984 3.21799 6.09202C3.40973 5.71569 3.71569 5.40973 4.09202 5.21799C4.51984 5 5.0799 5 6.2 5H9.67452C10.1637 5 10.4083 5 10.6385 5.05526C10.8425 5.10425 11.0376 5.18506 11.2166 5.29472C11.4184 5.4184 11.5914 5.59135 11.9373 5.93726L12.0627 6.06274C12.4086 6.40865 12.5816 6.5816 12.7834 6.70528C12.9624 6.81494 13.1576 6.89575 13.3615 6.94474C13.5917 7 13.8363 7 14.3255 7H17.8C18.9201 7 19.4802 7 19.908 7.21799C20.2843 7.40973 20.5903 7.71569 20.782 8.09202C21 8.51984 21 9.0799 21 10.2V15.8C21 16.9201 21 17.4802 20.782 17.908C20.5903 18.2843 20.2843 18.5903 19.908 18.782C19.4802 19 18.9201 19 17.8 19H6.2C5.07989 19 4.51984 19 4.09202 18.782C3.71569 18.5903 3.40973 18.2843 3.21799 17.908C3 17.4802 3 16.9201 3 15.8V8.2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => setActiveTab("codes")}
                  onMouseEnter={(e) => {
                    if (activeTab !== "codes") {
                      e.currentTarget.style.opacity = "0.8";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== "codes") {
                      e.currentTarget.style.opacity = "0.4";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px",
                    marginTop: "10px",
                    opacity: activeTab === "codes" ? 1 : 0.4,
                    transition: "all 0.2s ease",
                    borderLeft: activeTab === "codes" ? "3px solid #646cff" : "3px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Codes"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none">
                    <path d="M7.0498 7.0498H7.0598M10.5118 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V10.5118C3 11.2455 3 11.6124 3.08289 11.9577C3.15638 12.2638 3.27759 12.5564 3.44208 12.8249C3.6276 13.1276 3.88703 13.387 4.40589 13.9059L9.10589 18.6059C10.2939 19.7939 10.888 20.388 11.5729 20.6105C12.1755 20.8063 12.8245 20.8063 13.4271 20.6105C14.112 20.388 14.7061 19.7939 15.8941 18.6059L18.6059 15.8941C19.7939 14.7061 20.388 14.112 20.6105 13.4271C20.8063 12.8245 20.8063 12.1755 20.6105 11.5729C20.388 10.888 19.7939 10.2939 18.6059 9.10589L13.9059 4.40589C13.387 3.88703 13.1276 3.6276 12.8249 3.44208C12.5564 3.27759 12.2638 3.15638 11.9577 3.08289C11.6124 3 11.2455 3 10.5118 3ZM7.5498 7.0498C7.5498 7.32595 7.32595 7.5498 7.0498 7.5498C6.77366 7.5498 6.5498 7.32595 6.5498 7.0498C6.5498 6.77366 6.77366 6.5498 7.0498 6.5498C7.32595 6.5498 7.5498 6.77366 7.5498 7.0498Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => setActiveTab("memos")}
                  onMouseEnter={(e) => {
                    if (activeTab !== "memos") {
                      e.currentTarget.style.opacity = "0.8";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== "memos") {
                      e.currentTarget.style.opacity = "0.4";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px",
                    marginTop: "10px",
                    opacity: activeTab === "memos" ? 1 : 0.4,
                    borderLeft: activeTab === "memos" ? "3px solid #646cff" : "3px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Memos"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  padding: "20px",
                  backgroundColor: "#1a1a1a",
                  overflowY: "auto",
                }}
              >
                {activeTab === "documents" && (
                  <DocumentsSidebar
                    documents={documents}
                    activeDocumentId={activeDocument?.id}
                    onFileUpload={uploadFiles}
                    onDocumentClick={selectDocument}
                    onDeleteDocument={deleteDocument}
                    onRenameDocument={renameDocument}
                    projectId={id}
                    onWriteDocument={createTextDocument}
                    loadDocuments={refreshDocuments}
                  />
                )}
                {activeTab === "codes" && (
                  <CodesSidebar
                    projectId={id}
                    codes={projectCodes}
                    onOpenCodePanel={openCodePanel}
                    onExportQuotesCSV={handleExportQuotesCSV}
                  />
                )}
                {activeTab === "memos" && <MemosSidebar />}
              </div>
            </div>
          </Panel>

          {/* V4 syntax: Separator */}
          <Separator style={handleStyle} />

          {codePanelOpen && (
            <>
              <Panel defaultSize={30} minSize={20} style={{ minWidth: 0 }}>
                <ProjectPageCodePanel />
              </Panel>
              <Separator style={handleStyle} />
            </>
          )}

          <Panel defaultSize={codePanelOpen ? 42 : 72} minSize={30}>
            <ProjectPageDocumentPanel viewerRef={viewerRef} />
          </Panel>

        </Group>
      </div>

      <ExportFilterModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportExcel}
      />

      <ProjectSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentName={projectDetails.name}
        currentDescription={projectDetails.description}
        currentLocalPath={projectDetails.localPath}
        currentLLMSystemPrompt={projectDetails.llmSystemPrompt}
        currentLLMUserPrompt={projectDetails.llmUserPrompt}
        onSave={handleSaveSettings}
        onDelete={deleteProjectAndNavigate}
      />
    </div>
  );
};

export default ProjectPageView;