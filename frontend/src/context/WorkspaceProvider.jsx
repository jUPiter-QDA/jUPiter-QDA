import { useState, useCallback, useEffect, useMemo } from "react";
import { WorkspaceContext } from "./WorkspaceContext";
import { useProject } from "./ProjectContext";
import { useUndo } from "./UndoContext";
import { useToast } from "./ToastContext";
import AudioLanguageModal from "../Modal/AudioLanguageModal";
import CollisionModal from "../Project/CollisionModal";
import {
  fetchCodes,
  fetchDocuments,
  fetchDocument,
  fetchSegmentsForDocument,
  fetchMemos,
  uploadDocument,
  transcribeAudio,
  createCode as createCodeApi,
  updateCode as updateCodeApi,
  updateCodesOrder,
  deleteCode as deleteCodeApi,
  mergeCodes as mergeCodesApi,
  deleteDocument as deleteDocumentApi,
  renameDocument as renameDocumentApi,
} from "../utils/backend-api";

// Owns all project workspace state: the codebook, the document list, the
// open document and its segments, and the code-panel selection. Every
// mutation records its own undo entry. The upload conflict/audio-language
// dialogs are private to this provider (they are implementation details of
// uploadFiles, rendered at the bottom).
const WorkspaceProvider = ({ children }) => {
  const { projectId } = useProject();
  const { pushAction } = useUndo();
  const { setProgress, showToast, showToastSticky } = useToast();

  // Codebook state
  const [projectCodes, setProjectCodes] = useState([]);

  // Document state
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [documentSegments, setDocumentSegments] = useState([]);

  // Code panel state
  const [codePanelOpen, setCodePanelOpen] = useState(false);
  const [activeCode, setActiveCode] = useState(null);
  const [codePanelRefreshTick, setCodePanelRefreshTick] = useState(0);

  // Navigation state
  const [pendingQuoteJump, setPendingQuoteJump] = useState(null);
  const [currentSearchResult, setCurrentSearchResult] = useState(null);

  // PRIVATE: promise dialogs used by uploadFiles
  const [conflictDialog, setConflictDialog] = useState({
    isOpen: false,
    filename: "",
    suggestedName: "",
    resolve: null,
  });
  const [audioLanguageDialog, setAudioLanguageDialog] = useState({
    isOpen: false,
    filename: "",
    resolve: null,
  });

  useEffect(() => {
    refreshDocuments();
    refreshCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const refreshCodes = useCallback(() => {
    fetchCodes(projectId)
      .then((data) => setProjectCodes(data))
      .catch((err) => console.error(err));
  }, [projectId]);

  const refreshDocuments = useCallback(() => {
    fetchDocuments(projectId).then((data) => {
      setDocuments(data);

      setActiveDocument((prevActive) => {
        if (!prevActive || prevActive.id === "NEW_DOC_PENDING") return prevActive;

        const freshDoc = data.find((d) => d.id === prevActive.id);
        return freshDoc ? { ...prevActive, metadata: freshDoc.metadata, folder_id: freshDoc.folder_id } : prevActive;
      });
    })
    .catch((err) => console.error(err));
  }, [projectId]);

  // Every segment in the project, flattened. The single source for "all
  // segments" (was copy-pasted in three places).
  const selectAllProjectSegments = useCallback(async () => {
    const docs = await fetchDocuments(projectId);
    const segmentResponses = await Promise.all(
      docs.map((doc) => fetchSegmentsForDocument(projectId, doc.id)),
    );
    return segmentResponses.flat().filter((segment) => segment && !segment.detail);
  }, [projectId]);

  const refreshSegmentsForDocument = useCallback(async (documentId) => {
    if (!activeDocument || Number(activeDocument.id) !== Number(documentId)) return;

    const data = await fetchSegmentsForDocument(projectId, documentId);
    setDocumentSegments(Array.isArray(data) ? data : []);
  }, [activeDocument, projectId]);

  const buildCodeTreeSnapshot = useCallback((rootCodeId) => {
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
  }, [projectCodes]);

  // ---------- Codebook mutations ----------

  const createCode = useCallback(async (payload) => {
    try {
      const response = await createCodeApi(projectId, payload);
      if (response.ok) refreshCodes();
      return response.ok;
    } catch (error) {
      console.error("Failed to create code:", error);
      return false;
    }
  }, [projectId, refreshCodes]);

  // recordUndo: only the sidebar's edit form pushes an edit-code entry
  // (parent moves have no undo, same as before the refactor).
  const updateCode = useCallback(async (codeId, payload, { recordUndo = false } = {}) => {
    if (recordUndo) {
      const originalCode = projectCodes.find((c) => Number(c.id) === Number(codeId));
      if (originalCode) {
        pushAction({
          type: "edit-code",
          codeId,
          previousState: { name: originalCode.name, color: originalCode.color },
        });
      }
    }

    try {
      const response = await updateCodeApi(projectId, codeId, payload);
      if (response.ok) refreshCodes();
      return response.ok;
    } catch (error) {
      console.error("Failed to update color:", error);
      return false;
    }
  }, [projectId, projectCodes, pushAction, refreshCodes]);

  const reorderCodes = useCallback(async (remainingCodes, reorderPayload) => {
    pushAction({
      type: "reorder-codes",
      previousState: projectCodes.map((c, idx) => ({
        id: c.id,
        parent_id: c.parent_id || null,
        order_index: c.order_index ?? idx,
      })),
    });

    setProjectCodes(remainingCodes);

    try {
      await updateCodesOrder(projectId, { codes: reorderPayload });
      refreshCodes();
    } catch (error) {
      console.error("Failed to reorder codes:", error);
    }
  }, [projectId, projectCodes, pushAction, refreshCodes]);

  const deleteCode = useCallback(async (codeId) => {
    try {
      const codeSnapshot = buildCodeTreeSnapshot(codeId);
      const codeIdsToDelete = new Set(codeSnapshot.map((code) => Number(code.id)));
      const segmentsSnapshot = codeSnapshot.length > 0
        ? (await selectAllProjectSegments()).filter((segment) => codeIdsToDelete.has(Number(segment.code_id)))
        : [];

      const allMemos = await fetchMemos(projectId);
      const memosSnapshot = allMemos.filter((m) =>
        m.target_type === 'code' && codeIdsToDelete.has(Number(m.target_id))
      );

      const response = await deleteCodeApi(projectId, codeId);

      if (response.ok) {
        setProjectCodes((prev) => prev.filter((c) => c.id !== codeId));
        setDocumentSegments((prev) => prev.filter((s) => !codeIdsToDelete.has(Number(s.code_id))));
        if (codeSnapshot.length > 0) {
          pushAction({
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
    } catch (error) {
      console.error("Error deleting code:", error);
    }
  }, [projectId, pushAction, buildCodeTreeSnapshot, selectAllProjectSegments]);

  const mergeCodes = useCallback(async ({ source_code_id, target_code_id, new_name, new_color }) => {
    try {
      await mergeCodesApi(projectId, {
        source_code_id,
        target_code_id,
        new_name,
        new_color,
      });

      refreshCodes();

      // Re-point open segments to the surviving code so the document view
      // recolors immediately. Used to travel via the 'codes-merged' window event.
      setDocumentSegments((prev) => prev.map((seg) =>
        seg.code_id === source_code_id ? { ...seg, code_id: target_code_id } : seg
      ));
    } catch (err) {
      console.error(err);
    }
  }, [projectId, refreshCodes]);

  // The code panel fetches its own quotes on mount (its localSegments), so
  // opening is just state — no segment prefetch needed here.
  const openCodePanel = useCallback((code) => {
    setActiveCode(code);
    setCodePanelOpen(true);
    setPendingQuoteJump(null);
  }, []);

  // ---------- Document selection ----------

  const selectDocument = useCallback((docId) => {
    if (currentSearchResult && currentSearchResult.document_id !== docId) {
      setCurrentSearchResult(null);
    }

    fetchDocument(projectId, docId)
      .then((data) => setActiveDocument(data))
      .catch((err) => console.error("Failed to fetch document content:", err));

    // Fetch segments for this document
    fetchSegmentsForDocument(projectId, docId)
      .then((data) => setDocumentSegments(data))
      .catch((err) => console.error("Failed to fetch segments:", err));
  }, [projectId, currentSearchResult]);

  // Opens a document and schedules a scroll to a specific quote in it.
  // Replaces the per-component "setActiveDocument + fetch segments + jump"
  // copy-paste (code panel quote click, memo click, search result click).
  const openDocumentAtQuote = useCallback(async (docId, quoteId) => {
    try {
      const docData = await fetchDocument(projectId, docId);
      setActiveDocument(docData);

      const segData = await fetchSegmentsForDocument(projectId, docId);
      setDocumentSegments(Array.isArray(segData) ? segData : []);

      setPendingQuoteJump({
        quoteId,
        document_id: docId,
      });
    } catch (error) {
      console.error("Failed to load quote document:", error);
    }
  }, [projectId]);

  // ---------- Document mutations ----------

  // FILE MANAGEMENT LOGIC

  const uploadFiles = useCallback(async (eventOrFiles) => {
    const files = Array.from(eventOrFiles?.target?.files || eventOrFiles || []);
    if (files.length === 0) return;

    showToastSticky("Processing files...");
    setProgress({ current: 0, total: files.length, isActive: true });

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

      setProgress(prev => ({ ...prev, current: i }));

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
            showToastSticky(`Replacing ${finalName}...`);
            try {
              const delRes = await deleteDocumentApi(projectId, oldDoc.id);
              if (delRes.ok) {
                isNameValid = true;
                if (activeDocument && activeDocument.id === oldDoc.id) setActiveDocument(null);
                existingNames = existingNames.filter((n) => n !== finalName);
              } else {
                window.alert("Server failed to delete target file. Skipping.");
                shouldUpload = false;
              }
            } catch {
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

          showToastSticky(`🎙️ Transcribing offline audio (${i + 1}/${files.length}): ${finalName}...`);
          const audioFormData = new FormData();
          audioFormData.append("file", cur);

          try {
            // Send selected language down to Python backend via URL Query parameter!
            const res = transcribeAudio(projectId, selectedLanguage, audioFormData);

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
          showToastSticky(`📄 Importing text document (${i + 1}/${files.length}): ${finalName}...`);
          const textFormData = new FormData();
          textFormData.append("files", cur);
          try {
            const res = await uploadDocument(projectId, textFormData);
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
          } catch {
            failedUploads.push({ filename: finalName, reason: "Network communication error" });
          }
        }
      }
    }

    setProgress({ current: files.length, total: files.length, isActive: false });
    if (failedUploads.length > 0) {
      const errorList = failedUploads.map((f) => `${f.filename} (${f.reason})`).join(", ");
      showToastSticky(successfulUploads.length > 0 ? `Imported ${successfulUploads.length} item(s). Failed: ${errorList}` : `All items failed processing: ${errorList}`);
    } else {
      showToast(`Success! All ${successfulUploads.length} items parsed and cataloged offline.`, 4000);
    }
    refreshDocuments();
    if (eventOrFiles?.target) eventOrFiles.target.value = null;
  }, [documents, activeDocument, projectId, showToast, showToastSticky, setProgress, refreshDocuments]);

  const createTextDocument = useCallback(() => {
    const newDoc = {
      id: "NEW_DOC_PENDING",
      filename: "Untitled Document",
      content: "",
      type: "text",
      folder_id: null
    };
    setDocumentSegments([]);
    setActiveDocument(newDoc);
  }, []);

  const deleteDocument = useCallback(async (docId, docName) => {
    try {
      const docContentData = await fetchDocument(projectId, docId);

      const segmentsData = await fetchSegmentsForDocument(projectId, docId);

      const response = await deleteDocumentApi(projectId, docId);

      if (response.ok) {
        setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== docId));
        if (activeDocument && activeDocument.id === docId) {
          setActiveDocument(null);
          setDocumentSegments([]);
        }

        refreshCodes();

        pushAction({
          type: "delete-document",
          document: docContentData,
          segments: segmentsData
        });

        showToast(`Deleted ${docName}`, 3000);
      } else {
        showToastSticky("Failed to delete document.");
      }
    } catch (err) {
      console.error(err);
      showToastSticky("Server error during deletion.");
    }
  }, [projectId, activeDocument, refreshCodes, pushAction, showToast, showToastSticky]);

  const renameDocument = useCallback(async (docId, newName) => {
    const filename = newName.trim();
    if (!filename) {
      throw new Error("Document name cannot be empty.");
    }

    const response = await renameDocumentApi(projectId, docId, filename);

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

    showToast(`Renamed to ${data.filename}`, 2500);

    return data;
  }, [projectId, activeDocument, showToast]);

  const value = useMemo(
    () => ({
      // Codebook
      projectCodes,
      refreshCodes,
      selectAllProjectSegments,
      createCode,
      updateCode,
      reorderCodes,
      deleteCode,
      mergeCodes,
      // Documents
      documents,
      activeDocument,
      setActiveDocument,
      documentSegments,
      setDocumentSegments,
      refreshDocuments,
      refreshSegmentsForDocument,
      selectDocument,
      openDocumentAtQuote,
      uploadFiles,
      createTextDocument,
      deleteDocument,
      renameDocument,
      // Code panel
      codePanelOpen,
      setCodePanelOpen,
      activeCode,
      setActiveCode,
      codePanelRefreshTick,
      setCodePanelRefreshTick,
      openCodePanel,
      // Navigation
      pendingQuoteJump,
      setPendingQuoteJump,
      currentSearchResult,
      setCurrentSearchResult,
    }),
    [
      projectCodes, refreshCodes, selectAllProjectSegments, createCode, updateCode, reorderCodes, deleteCode, mergeCodes,
      documents, activeDocument, documentSegments, refreshDocuments, refreshSegmentsForDocument,
      selectDocument, openDocumentAtQuote, uploadFiles, createTextDocument, deleteDocument, renameDocument,
      codePanelOpen, activeCode, codePanelRefreshTick, openCodePanel,
      pendingQuoteJump, currentSearchResult,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}

      <CollisionModal
        dialog={conflictDialog}
        resolve={conflictDialog.resolve}
      />
      <AudioLanguageModal
        dialogState={audioLanguageDialog}
        onCancel={() => audioLanguageDialog.resolve(null)}
        onConfirm={(selectedLanguage) => audioLanguageDialog.resolve(selectedLanguage)}
      />
    </WorkspaceContext.Provider>
  );
};

export default WorkspaceProvider;