import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ProjectPageView from "./ProjectPageView";
import AudioLanguageModal from "../Modal/AudioLanguageModal"; 
import ExportFilterModal from '../Modal/ExportFilterModal';
import { fetchProjectDetails, fetchDocuments, fetchCodes, fetchDocument, fetchSegmentsForDocument, renameDocument, deleteCode, createSegmentWithCode, fetchMemos, deleteDocument, createDocument, uploadDocument, updateCode, createCode, createMemo, updateDocumentMetadata, updateCodesOrder, transcribeAudio, exportProjectToRefi, exportProjectSegmentsToCsv, buildUrlToExportExcel, updateProjectDetails, deleteProject } from "../utils/backend-api"

function ProjectPage() {
  const { id } = useParams();
  const viewerRef = useRef(null);
  const navigate = useNavigate();

  // STATE MANAGEMENT

  // Project & Document State
  const [projectDetails, setProjectDetails] = useState({
    name: "",
    description: "",
    localPath: "",
  });
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [documentSegments, setDocumentSegments] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [codePanelOpen, setCodePanelOpen] = useState(false);
  const [activeCode, setActiveCode] = useState(null);
  const [codeSegments, setCodeSegments] = useState([]);
  const [pendingQuoteJump, setPendingQuoteJump] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [codePanelRefreshTick, setCodePanelRefreshTick] = useState(0);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // UI & Navigation State
  const [activeTab, setActiveTab] = useState("documents");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
    isActive: false,
  });
  const [segmentContextMenu, setSegmentContextMenu] = useState(null);


  //  File Upload Conflict State
  const [conflictDialog, setConflictDialog] = useState({
    isOpen: false,
    filename: "",
    suggestedName: "",
    resolve: null,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [audioLanguageDialog, setAudioLanguageDialog] = useState({
    isOpen: false,
    filename: "",
    resolve: null,
  });

  // Search State
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchResult, setCurrentSearchResult] = useState(null);

  const loadDocuments = () => {
    fetchDocuments(id).then((data) => {
                      setDocuments(data);
                      
                      setActiveDocument((prevActive) => {
                        if (!prevActive || prevActive.id === "NEW_DOC_PENDING") return prevActive;
                        
                        const freshDoc = data.find((d) => d.id === prevActive.id);
                        return freshDoc ? { ...prevActive, metadata: freshDoc.metadata, folder_id: freshDoc.folder_id } : prevActive;
                      });
                    })
                    .catch((err) => console.error(err));
  };

  const loadCodes = () => {
    fetchCodes(id).then((data) => setProjectCodes(data))
                  .catch((err) => console.error(err)); 
  };

  const pushUndoAction = (action) => {
    const actionWithTime = { ...action, timestamp: Date.now() };
    setUndoStack((prev) => [action, ...prev].slice(0, 20));
  };

  const fetchAllDocumentSegments = async () => {
    const segmentResponses = await Promise.all(
      documents.map((doc) =>
        fetchSegmentsForDocument(id, doc.id),
      ),
    );

    return segmentResponses.flat().filter((segment) => segment && !segment.detail);
  };

  const buildCodeTreeSnapshot = (rootCodeId) => {
    const rootCode = projectCodes.find((code) => Number(code.id) === Number(rootCodeId));
    if (!rootCode) return [];

    const collected = [rootCode];

    const visitChildren = (parentId, depth) => {
      const children = projectCodes.filter((code) => Number(code.parent_id) === Number(parentId));
      children.forEach((child) => {
        collected.push({ ...child, _undoDepth: depth });
        visitChildren(child.id, depth + 1);
      });
    };

    visitChildren(rootCodeId, 1);
    return collected;
  };

  const refreshSegmentsForDocument = async (documentId) => {
    if (!activeDocument || Number(activeDocument.id) !== Number(documentId)) return;

    const data = await fetchSegmentsForDocument(id, documentId);
    setDocumentSegments(Array.isArray(data) ? data : []);
  };

  const handleUndoLastAction = async () => {
    if (undoStack.length === 0) {
      setUploadStatus("Nothing to undo.");
      setTimeout(() => setUploadStatus(""), 2000);
      return;
    }

    const [lastAction, ...remainingActions] = undoStack;

    if (Date.now() - lastAction.timestamp > 300000) {
      setUploadStatus("Action is too old to undo (over 5 minutes).");
      setUndoStack([]); 
      setTimeout(() => setUploadStatus(""), 4000);
      return;
    }

    setUndoStack(remainingActions);
    setUploadStatus("Undoing last action...");

    try {
      if (lastAction.type === "create-segment" || lastAction.type === "create-quick-code") {
        for (const segment of lastAction.segments || []) {
          await deleteSegment(id, segment.id);
        }
        if (lastAction.segments?.length > 0) await refreshSegmentsForDocument(lastAction.segments[0].document_id);
        if (lastAction.type === "create-quick-code" && lastAction.code?.id) {
          await deleteCode(id, lastAction.code.id);
        }
        loadCodes();
        setCodePanelRefreshTick((tick) => tick + 1);

      } else if (lastAction.type === "delete-segment") {
        const segment = lastAction.segment;
        await createSegmentWithCode(id, {
            document_id: segment.document_id, 
            code_id: segment.code_id,
            start_char: segment.start_char, 
            end_char: segment.end_char, 
            content: segment.content,
          });
        await refreshSegmentsForDocument(segment.document_id);
        loadCodes();
        setCodePanelRefreshTick((tick) => tick + 1);

      } else if (lastAction.type === "delete-code") {
        const restoredCodeIds = new Map();
        const orderedCodes = [...(lastAction.codes || [])].sort((a, b) => (a._undoDepth ?? 0) - (b._undoDepth ?? 0));

        for (const code of orderedCodes) {
          const restoredParentId = code.parent_id && restoredCodeIds.has(Number(code.parent_id)) ? restoredCodeIds.get(Number(code.parent_id)) : code.parent_id;
          const restoreResponse = await createCode(id, { name: code.name, 
                                                         color: code.color, 
                                                         parent_id: restoredParentId });
          const restoredCode = await restoreResponse.json();
          restoredCodeIds.set(Number(code.id), restoredCode.id);
        }

        if (lastAction.codes?.length > 0) {
          const reorderPayload = orderedCodes.map((code, index) => ({
            id: restoredCodeIds.get(Number(code.id)),
            parent_id: code.parent_id && restoredCodeIds.has(Number(code.parent_id)) ? restoredCodeIds.get(Number(code.parent_id)) : code.parent_id,
            order_index: code.order_index ?? index,
          })).filter((item) => item.id);
          updateCodesOrder(id, { codes: reorderPayload });
        }

        for (const segment of lastAction.segments || []) {
          const restoredCodeId = restoredCodeIds.get(Number(segment.code_id)) || segment.code_id;
          await createSegmentWithCode(id, {
              document_id: segment.document_id, 
              code_id: restoredCodeId,
              start_char: segment.start_char, 
              end_char: segment.end_char, 
              content: segment.content,
            });
          await refreshSegmentsForDocument(segment.document_id);
        }

        for (const memo of lastAction.memos || []) {
          const restoredCodeId = restoredCodeIds.get(Number(memo.target_id)) || memo.target_id;
          await createMemo({ text: memo.text, target_type: "code", target_id: restoredCodeId });
        }
        loadCodes();
        setCodePanelRefreshTick((tick) => tick + 1);

      } else if (lastAction.type === "edit-code") {
        updateCode(id, lastAction.codeId, lastAction.previousState);
        loadCodes();

      } else if (lastAction.type === "reorder-codes") {
        updateCodesOrder(id, { codes: lastAction.previousState });
        loadCodes();

      } else if (lastAction.type === "delete-document") {
        const doc = lastAction.document;
        const docRes = await createDocument(id, 
          { name: doc.filename, content: doc.content || "Restored content..." });
        const restoredDoc = await docRes.json();

        if (doc.metadata && Object.keys(doc.metadata).length > 0) {
           updateDocumentMetadata(id, restoredDoc.id, { metadata: doc.metadata })
        }

        for (const segment of lastAction.segments || []) {
          await createSegmentWithCode(id, {
              document_id: restoredDoc.id, 
              code_id: segment.code_id,
              start_char: segment.start_char, 
              end_char: segment.end_char, 
              content: segment.content
          });
        }
        loadDocuments();
      } else if (lastAction.type === "delete-memo") {
        const memo = lastAction.memo;
        await createMemo({
            text: memo.text,
            target_type: memo.target_type,
            target_id: memo.target_id
          });

        window.dispatchEvent(new CustomEvent('memos-updated'));
        
      } else if (lastAction.type === "edit-metadata") {
        updateDocumentMetadata(id, 
                               lastAction.documentId, 
                               { metadata: lastAction.previousMetadata });
        // This will instantly update the sidebar and active document!
        loadDocuments(); 
      }

      setUploadStatus("Undo complete.");
      setTimeout(() => setUploadStatus(""), 2500);
    } catch (error) {
      console.error(error);
      setUploadStatus("Undo failed.");
    }
  };

  const openCodePanel = async (code) => {
    setActiveCode(code);
    setCodePanelOpen(true);
    setPendingQuoteJump(null);

    try {
      // Fetch segments for every document we know exists
      const segmentPromises = documents.map((doc) =>
        fetchSegmentsForDocument(id, doc.id)
      );
      
      const segmentsArrays = await Promise.all(segmentPromises);
      
      // Flatten into one giant array and filter by the selected code using Number() casting
      const allSegments = segmentsArrays.flat().filter(s => s && !s.detail);
      setCodeSegments(allSegments.filter((s) => Number(s.code_id) === Number(code.id)));
    } catch (err) {
      console.error("Failed to load code segments:", err);
      setCodeSegments([]);
    }
  };
  const handleDocumentClick = (docId) => {
    if (currentSearchResult && currentSearchResult.document_id !== docId) {
      setCurrentSearchResult(null);
    }

    fetchDocument(id, docId)
      .then((data) => setActiveDocument(data))
      .catch((err) => console.error("Failed to fetch document content:", err));

    // Fetch segments for this document
    fetchSegmentsForDocument(id, docId)
      .then((data) => setDocumentSegments(data))
      .catch((err) => console.error("Failed to fetch segments:", err));
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
  }, [activeDocument, documentSegments, pendingQuoteJump]);

  useEffect(() => {
    loadDocuments();

    fetchProjectDetails(id).then((data) => {
                      if (data.name) {
                        setProjectDetails({
                          name: data.name,
                          description: data.description || "",
                          localPath: data.local_path || "",
                        });
                      }
                    })
                    .catch((err) => console.error(err));
    loadCodes();
  }, [id]);

  useEffect(() => {
    const handleCodesMerged = (event) => {
      const { sourceId, targetId } = event.detail;
      
      setDocumentSegments(prevSegments => prevSegments.map(seg => 
        seg.code_id === sourceId ? { ...seg, code_id: targetId } : seg
      ));

      loadCodes(); 
    };
    
    window.addEventListener('codes-merged', handleCodesMerged);
    return () => window.removeEventListener('codes-merged', handleCodesMerged);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      if (!isUndoShortcut) return;

      const target = event.target;
      const isEditableTarget = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );

      if (isEditableTarget) return;

      event.preventDefault();
      handleUndoLastAction();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, activeDocument, documents, projectCodes]);

  const handleDeleteCode = async (codeId) => {
    try {
      const codeSnapshot = buildCodeTreeSnapshot(codeId);
      const codeIdsToDelete = new Set(codeSnapshot.map((code) => Number(code.id)));
      const segmentsSnapshot = codeSnapshot.length > 0
        ? (await fetchAllDocumentSegments()).filter((segment) => codeIdsToDelete.has(Number(segment.code_id)))
        : [];

      const allMemos = await fetchMemos(id);
      const memosSnapshot = allMemos.filter(m => 
        m.target_type === 'code' && codeIdsToDelete.has(Number(m.target_id))
      );

      const response = await deleteCode(id, codeId);
      
      if (response.ok) {
        setProjectCodes((prev) => prev.filter((c) => c.id !== codeId));
        setDocumentSegments((prev) => prev.filter((s) => s.code_id !== codeId));
        if (codeSnapshot.length > 0) {
          pushUndoAction({
            type: "delete-code",
            codes: codeSnapshot,
            segments: segmentsSnapshot,
            memos: memosSnapshot, 
          });
        }
        setCodePanelRefreshTick((tick) => tick + 1);
      } else {
        console.error("Failed to delete code");
      }
    } catch (error){
      console.error("Error deleting code:", error);
    }
  };

  // FILE MANAGEMENT LOGIC

  const handleFileUpload = async (eventOrFiles) => {
    const files = Array.from(eventOrFiles?.target?.files || eventOrFiles || []);
    if (files.length === 0) return;

    setUploadStatus("Processing files...");
    setUploadProgress({ current: 0, total: files.length, isActive: true });

    let existingNames = documents.map((doc) => doc.filename);
    const audioExtensions = [".wav", ".mp3", ".m4a", ".webm", ".ogg", ".mpeg"];
    
    const successfulUploads = [];
    const failedUploads = [];

    for (let i = 0; i < files.length; i++) {
      let cur = files[i];
      let shouldUpload = true;
      let finalName = cur.name;
      let isNameValid = !existingNames.includes(finalName);
      
      const isAudio = audioExtensions.some(ext => finalName.toLowerCase().endsWith(ext));

      setUploadProgress(prev => ({ ...prev, current: i }));

      // --- 1. CONFLICT RESOLUTION ---
      while (!isNameValid && shouldUpload) {
        const DotIndex = finalName.lastIndexOf(".");
        const ext = DotIndex !== -1 ? finalName.substring(DotIndex) : "";
        const base = DotIndex !== -1 ? finalName.substring(0, DotIndex) : finalName;
        const suggestedN = `${base}_copy${ext}`;

        const userChoice = await new Promise((resolve) => {
          setConflictDialog({ isOpen: true, filename: finalName, suggestedName: suggestedN, resolve });
        });

        if (userChoice.action === "skip") {
          shouldUpload = false;
          break;
        } else if (userChoice.action === "replace") {
          const oldDoc = documents.find((d) => d.filename === finalName);
          if (oldDoc) {
            setUploadStatus(`Replacing ${finalName}...`);
            try {
              const delRes = await deleteDocument(id, oldDoc.id);
              if (delRes.ok) {
                isNameValid = true;
                if (activeDocument && activeDocument.id === oldDoc.id) setActiveDocument(null);
                existingNames = existingNames.filter((n) => n !== finalName);
              } else {
                window.alert("Server failed to delete target file. Skipping.");
                shouldUpload = false;
              }
            } catch (err) {
              window.alert("❌ Local server network error. Skipping.");
              shouldUpload = false;
            }
          }
        } else if (userChoice.action === "rename") {
          let trimmedInput = userChoice.value.trim();
          if (trimmedInput === "") continue;
          if (ext && !trimmedInput.toLowerCase().endsWith(ext.toLowerCase())) trimmedInput += ext;
          finalName = trimmedInput;
          if (!existingNames.includes(finalName)) isNameValid = true;
        }
      }
      setConflictDialog((prev) => ({ ...prev, isOpen: false }));

      // --- 2. UPLOAD DISPATCH ---
      if (shouldUpload) {
        if (finalName !== cur.name) {
          cur = new File([cur], finalName, { type: cur.type });
        }

        if (isAudio) {
          // 🌟 NEW: Pause and wait for user to select interview language
          const selectedLanguage = await new Promise((resolve) => {
            setAudioLanguageDialog({
              isOpen: true,
              filename: finalName,
              resolve,
            });
          });

          // Close modal instantly
          setAudioLanguageDialog((prev) => ({ ...prev, isOpen: false }));

          // If user clicked cancel/closed modal, skip this file
          if (!selectedLanguage) {
            failedUploads.push({ filename: finalName, reason: "Cancelled by user" });
            continue;
          }

          setUploadStatus(`🎙️ Transcribing offline audio (${i + 1}/${files.length}): ${finalName}...`);
          const audioFormData = new FormData();
          audioFormData.append("file", cur);

          try {
            // Send selected language down to Python backend via URL Query parameter!
            const res = transcribeAudio(id, selectedLanguage, audioFormData);

            if (!res.ok) {
              const errData = await res.json();
              failedUploads.push({ filename: finalName, reason: errData.detail || `HTTP ${res.status}` });
            } else {
              const docData = await res.json();
              successfulUploads.push(docData);
              existingNames.push(docData.filename);
            }
          } catch (err) {
            failedUploads.push({ filename: finalName, reason: "Local service connection timeout" });
            console.error(err);
          }

        } else {
          // Standard text file branch
          setUploadStatus(`📄 Importing text document (${i + 1}/${files.length}): ${finalName}...`);
          const textFormData = new FormData();
          textFormData.append("files", cur);
          try {
            const res = await uploadDocument(id, textFormData);
            if (!res.ok) {
              failedUploads.push({ filename: finalName, reason: `HTTP ${res.status}` });
            } else {
              const data = await res.json();
              if (data.failed && data.failed.length > 0) failedUploads.push(...data.failed);
              if (data.successful && data.successful.length > 0) {
                successfulUploads.push(...data.successful);
                existingNames.push(finalName);
              }
            }
          } catch (err) {
            failedUploads.push({ filename: finalName, reason: "Network communication error" });
          }
        }
      }
    }

    setUploadProgress({ current: files.length, total: files.length, isActive: false });
    if (failedUploads.length > 0) {
      const errorList = failedUploads.map((f) => `${f.filename} (${f.reason})`).join(", ");
      setUploadStatus(successfulUploads.length > 0 ? `Imported ${successfulUploads.length} item(s). Failed: ${errorList}` : `All items failed processing: ${errorList}`);
    } else {
      setUploadStatus(`Success! All ${successfulUploads.length} items parsed and cataloged offline.`);
      setTimeout(() => setUploadStatus(""), 4000);
    }
    loadDocuments();
    if (eventOrFiles?.target) eventOrFiles.target.value = null;
  };

  const handleCreateTextDocument = async (docdata) => {
    const newDoc = {
      id: "NEW_DOC_PENDING",
      filename: "Untitled Document",
      content: "",
      type: "text",
      folder_id: null
    };
    setDocumentSegments([]);
    setActiveDocument(newDoc);
  };

  const handleDeleteDocument = async (docId, docName) => {
    try {
      const docToSnapshot = documents.find(d => d.id === docId);
      
      const docContentData = await fetchDocument(id, docId);

      const segmentsData = await fetchSegmentsForDocument(id, docId);

      const response = deleteDocument(id, docId);

      if (response.ok) {
        setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== docId));
        if (activeDocument && activeDocument.id === docId) {
          setActiveDocument(null);
          setDocumentSegments([]);
        }

        loadCodes();

        pushUndoAction({
          type: "delete-document",
          document: docContentData,
          segments: segmentsData
        });

        setUploadStatus(`Deleted ${docName}`);
        setTimeout(() => setUploadStatus(""), 3000);
      } else {
        setUploadStatus("Failed to delete document.");
      }
    } catch (err) {
      console.error(err);
      setUploadStatus("Server error during deletion.");
    }
  };

  const handleRenameDocument = async (docId, newName) => {
    const filename = newName.trim();
    if (!filename) {
      throw new Error("Document name cannot be empty.");
    }

    const response = await renameDocument(id, docId, filename);

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Failed to rename document");
    }

    setDocuments((prevDocs) =>
      prevDocs.map((doc) => (doc.id === docId ? { ...doc, ...data } : doc)),
    );
    if (activeDocument && activeDocument.id === docId) {
      setActiveDocument((prevDoc) => (prevDoc ? { ...prevDoc, ...data } : prevDoc));
    }

    setUploadStatus(`Renamed to ${data.filename}`);
    setTimeout(() => setUploadStatus(""), 2500);

    return data;
  };

  useEffect(() => {
    const handleClickOutside = () => setSegmentContextMenu(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const handleSaveSettings = async (newName, newDescription) => {
    try {
      const res = updateProjectDetails(id, 
                                      { name: newName, 
                                        description: newDescription });

      if (res.ok) {
        setProjectDetails({ name: newName, description: newDescription }); // Update the UI instantly
        setIsSettingsOpen(false); // Close the modal
      } else {
        alert("Failed to update project settings.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async () => {
    try {
      const response = await deleteProject();
      if(response.ok) {
        navigate('/');
      } else {
        alert("Failed to delete project.");
      }
    } catch (err) {
      console.error(err);
      alert("Server error during project deletion.")
    }
  };

  const handleExportREFI = async () => {
    setUploadStatus("Generating REFI-QDA export...");

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
          setUploadStatus("Export saved successfully!");
          setTimeout(() => setUploadStatus(""), 4000);
        } catch (pickerError) {
          if (pickerError.name === "AbortError") {
            setUploadStatus("");
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

        setUploadStatus(" Export ready for download!");
        setTimeout(() => setUploadStatus(""), 4000);
      }
    } catch (error) {
      console.error(error);
      setUploadStatus(" Export failed.");
      setTimeout(() => setUploadStatus(""), 4000);
    }
  };
  const handleExportQuotesCSV = async () => {
    setUploadStatus("Generating Quotes CSV...");
    try {
      const response = exportProjectSegmentsToCsv(id);
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
          setUploadStatus("Quotes exported successfully!");
        } catch (pickerError) {
          if (pickerError.name === "AbortError") {
            setUploadStatus("");
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
        setUploadStatus("Quotes exported successfully!");
      }
    } catch (error) {
      console.error(error);
      setUploadStatus("Failed to export Quotes.");
    }
    setTimeout(() => setUploadStatus(""), 4000);
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
      handleDocumentClick(result.document_id);
      // Store the search result for highlighting
      setCurrentSearchResult({
        document_id: result.document_id,
        start_char: result.start_char,
        end_char: result.end_char,
      });
    }
  };

  const page = {
    id,
    viewerRef,
    projectDetails,
    documents,
    activeDocument,
    documentSegments,
    projectCodes,
    codePanelOpen,
    activeCode,
    codeSegments,
    pendingQuoteJump,
    codePanelRefreshTick,
    activeTab,
    uploadStatus,
    uploadProgress,
    segmentContextMenu,
    conflictDialog,
    isSettingsOpen,
    pushUndoAction,
    setActiveTab,
    setActiveDocument,
    setIsSettingsOpen,
    setProjectCodes,
    setCodePanelOpen,
    setActiveCode,
    setCodeSegments,
    setPendingQuoteJump,
    setUploadStatus,
    setDocumentSegments,
    handleFileUpload,
    handleDocumentClick,
    handleDeleteDocument,
    handleRenameDocument,
    handleDeleteCode,
    loadCodes,
    loadDocuments,
    openCodePanel,
    handleSaveSettings,
    handleDeleteProject,
    handleExportREFI,
    handleCreateTextDocument,
    handleExportQuotesCSV,
    handleExportExcel,
    setIsExportModalOpen,
    searchResults,
    currentSearchResult,
    setSearchResults,
    setCurrentSearchResult,
    handleSearchResultClick,
  };

  return (
  <>
    <ProjectPageView page={page} />

    <AudioLanguageModal 
      dialogState={audioLanguageDialog}
      onCancel={() => audioLanguageDialog.resolve(null)}
      onConfirm={(selectedLanguage) => audioLanguageDialog.resolve(selectedLanguage)}
    />

    <ExportFilterModal 
      isOpen={isExportModalOpen}
      onClose={() => setIsExportModalOpen(false)}
      onExport={handleExportExcel}
      documents={documents}
      codes={projectCodes}
    />
  </>
);
}

export default ProjectPage;