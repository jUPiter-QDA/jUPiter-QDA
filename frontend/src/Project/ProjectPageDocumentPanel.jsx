import { useEffect, useState, useRef } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import MarginSidebar from "./MarginSidebar";
import { createCode, createMemoForSegment, deleteSegment, fetchDocument, fetchSegmentsForDocument, createSegmentWithCode, updateSegment, createDocument, updateDocumentMetadata, updateDocumentContent, buildPdfPreviewUrl, suggestCodes } from "../utils/backend-api";
import { hexToRGBA, getRandomColor } from "../utils/colors";
import SegmentMemoModal from "./SegmentMemoModal";
import QuickCodeModal from "./QuickCodeModal";
import AISuggestModal from "./AISuggestModal";
import PdfPreviewPanel from "./PdfPreviewPanel";
import DocumentDetailsTab from "./DocumentDetailsTab";
import { useToast } from "../context/ToastContext";
import { useProject } from "../context/ProjectContext";
import { useUndo } from "../context/UndoContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useMemos } from "../context/MemosContext";

const ProjectPageDocumentPanel = ({ viewerRef }) => {
  const { projectId } = useProject();
  const { showToast, showToastSticky } = useToast();
  const { pushAction } = useUndo();
  const {
    activeDocument,
    projectCodes,
    documentSegments,
    setDocumentSegments,
    setActiveDocument,
    refreshCodes: loadCodes,
    refreshDocuments: loadDocuments,
    currentSearchResult,
    setCurrentSearchResult,
  } = useWorkspace();
  const { refreshMemos } = useMemos();
  const [showParentInMargin, setShowParentInMargin] = useState(false);
  const [marginBars, setMarginBars] = useState([]);
  const [segmentContextMenu, setSegmentContextMenu] = useState(null);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [activeSegmentForMemo, setActiveSegmentForMemo] = useState(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [selectionRect, setSelectionRect] = useState(null);
  const [selectionText, setSelectionText] = useState("");
  const [selectionOffsets, setSelectionOffsets] = useState(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [isPdfPreviewCollapsed, setIsPdfPreviewCollapsed] = useState(false);
  
  // Edit Mode & Real-Time Segment State
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [localSegments, setLocalSegments] = useState([]);
  const bgRef = useRef(null);

  const marginScrollRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);
  
  // Auto-save state
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState(""); 
  const autoSaveIntervalRef = useRef(null);
  const [documentMetadata, setDocumentMetadata] = useState({});

  useEffect(() => {
    if (currentSearchResult && viewerRef.current) {
      // Find the element containing the search result text and scroll to it
      const elements = viewerRef.current.querySelectorAll('[data-search-result]');
      if (elements.length > 0) {
        elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
        //setTimeout(() => setCurrentSearchResult(null), 2000); 
      }
    }
  }, [currentSearchResult, viewerRef, activeDocument?.id, activeDocument?.content]);

  useEffect(() => {
    if (!currentSearchResult) return;

    const handleGlobalClick = () => {
      setCurrentSearchResult(null);
    };

    const timer = setTimeout(() => {
      window.addEventListener("click", handleGlobalClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [currentSearchResult, setCurrentSearchResult]);

  
  useEffect(() => {
    const handleCloseMenu = () => {
      if (segmentContextMenu) {
        setSegmentContextMenu(null);
      }
    };

    // Listen for left-clicks or scrolling to dismiss the menu
    window.addEventListener("click", handleCloseMenu);
    window.addEventListener("scroll", handleCloseMenu, { passive: true });

    // Cleanup the listeners
    return () => {
      window.removeEventListener("click", handleCloseMenu);
      window.removeEventListener("scroll", handleCloseMenu);
    };
  }, [segmentContextMenu]);

  useEffect(() => {
    if (activeDocument && activeDocument.id === "NEW_DOC_PENDING") {
      setIsEditing(true);
      setEditContent(prev => prev ? prev : "");
      setLocalSegments([]);
    }else {
      setIsEditing(false);
    }
    setIsPdfPreviewCollapsed(false);
  }, [activeDocument?.id]);

  useEffect(() => {
    const nextMetadata = activeDocument && activeDocument.metadata && typeof activeDocument.metadata === "object"
      ? activeDocument.metadata
      : {};
    setDocumentMetadata(nextMetadata);
  }, [activeDocument?.id, activeDocument?.metadata]);

  const handleRightClickSegment = (e, segmentId) => {
    e.preventDefault();
    e.stopPropagation();
    setSegmentContextMenu({ x: e.clientX, y: e.clientY, segmentId });
  };

  const openMemoModal = (segmentId) => {
    setActiveSegmentForMemo(segmentId);
    setIsMemoModalOpen(true);
    setSegmentContextMenu(null);
  };

  const getSelectionOffsets = () => {
    try {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !viewerRef.current) return null;

      const range = selection.getRangeAt(0);
      const startRange = document.createRange();
      startRange.setStart(viewerRef.current, 0);
      startRange.setEnd(range.startContainer, range.startOffset);

      const start = startRange.toString().length;
      const end = start + range.toString().length;
      return { start, end };
    } catch { return null; }
  };

  const clearTextSelection = () => {
    setSelectionText("");
    setSelectionRect(null);
    setSelectionOffsets(null);
    setQuickMenuOpen(false);
    setAiModalOpen(false);
    setAiSuggestions([]);
  };

  const handleTextSelection = (e) => {
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return clearTextSelection();
    const selectedText = selection.toString();
    if (!selectedText.trim() || !viewerRef.current) return clearTextSelection();
    const range = selection.getRangeAt(0);

    if (!viewerRef.current.contains(range.commonAncestorContainer)) {
      return; 
    }    
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return clearTextSelection();
    
    const offsetValues = getSelectionOffsets();
    if (!offsetValues) return clearTextSelection();

    let startX = e?.clientX || rect.right;
    let startY = e?.clientY || rect.bottom;

    const MENU_WIDTH = 280; 
    const MENU_HEIGHT = 300;

    let safeLeft = startX + 10; 
    let safeTop = startY + 15;

    if (safeLeft + MENU_WIDTH > window.innerWidth) {
      safeLeft = window.innerWidth - MENU_WIDTH - 20;
    }

    if (safeTop + MENU_HEIGHT > window.innerHeight) {
      safeTop = startY - MENU_HEIGHT - 10;
    }

    safeTop = Math.max(16, Math.min(safeTop, window.innerHeight - MENU_HEIGHT - 16));

    setSelectionText(selectedText);
    setSelectionRect({ top: safeTop, left: safeLeft });
    setSelectionOffsets(offsetValues);

    setQuickMenuOpen(true);
  };

  const getParentIds = (codeId, allCodes) => {
    const ids = [];
    let currentCode = allCodes.find((code) => code.id === parseInt(codeId));
    while (currentCode && currentCode.parent_id) {
      ids.push(currentCode.parent_id);
      currentCode = allCodes.find((code) => code.id === currentCode.parent_id);
    }
    return ids;
  };

  // form is the payload from QuickCodeModal's onApply — the form state itself
  // lives inside the modal.
  const handleQuickCodeAction = async (form) => {
    if (!selectionText || !activeDocument || !selectionOffsets) return;
    showToastSticky("Creating quick code...");

    try {
      let finalCodeID;
      let createdCode = null;
      if (form.mode === "new") {
        const codeName = form.name.trim() || (selectionText.length > 30 ? `${selectionText.slice(0, 27)}...` : selectionText);
        const exactMatch = projectCodes.find(c => c.name.toLowerCase() === codeName.toLowerCase());

        if (exactMatch) {
          finalCodeID = exactMatch.id;
        } else {
          const codeResponse = await createCode(projectId, {
              name: codeName,
              color: form.color,
              description: "Created from selected text",
              parent_id: form.parentId ? parseInt(form.parentId) : null
            });
          const createdCodeData = await codeResponse.json();
          if (!codeResponse.ok) throw new Error(createdCodeData.detail || "Failed to create quick code");
          createdCode = createdCodeData;
          finalCodeID = createdCode.id;
          loadCodes();
        }
      } else {
        finalCodeID = parseInt(form.existingCodeId);
      }

      let codesToApply = [finalCodeID];
      if (form.autoUpcode && form.mode === "existing") {
        const parentIds = getParentIds(finalCodeID, projectCodes);
        codesToApply = [...codesToApply, ...parentIds];
      }

      const segmentPromises = codesToApply.map((codeId) =>
        createSegmentWithCode(projectId, { document_id: activeDocument.id, 
                            code_id: codeId, 
                            start_char: selectionOffsets.start, 
                            end_char: selectionOffsets.end, 
                            content: selectionText })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "Failed to save segment");
          return data;
        })
      );

      const createdSegments = await Promise.all(segmentPromises);
      pushAction({
        type: createdCode ? "create-quick-code" : "create-segment",
        code: createdCode,
        segments: createdSegments,
      });
      showToast(`Applied ${createdSegments.length} code(s)!`, 3000);
      clearTextSelection();
      window.getSelection()?.removeAllRanges();
      setDocumentSegments((prev) => [...prev, ...createdSegments]);
      loadCodes();
    } catch (error) {
      console.error(error);
      showToastSticky("Failed to apply code.");
    }
  };

  // Ask the configured LLM for code suggestions for the current selection.
  const handleAskAI = async () => {
    if (!selectionText || !activeDocument) return;
    setQuickMenuOpen(false);
    setAiSuggestions([]);
    setAiLoading(true);
    setAiModalOpen(true);
    showToastSticky("Asking AI for code suggestions...");
    try {
      const res = await suggestCodes(projectId, selectionText);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to get suggestions");
      setAiSuggestions(data);
      showToast(`${data.length} suggestion(s) ready.`, 3000);
    } catch (error) {
      showToastSticky(error.message || "Failed to get suggestions.");
      setAiModalOpen(false);
    } finally {
      setAiLoading(false);
    }
  };

  // Apply one AI suggestion: reuse the existing code when the LLM matched one,
  // otherwise create a new code flagged as AI-suggested — then code the
  // excerpt with it (same tail as handleQuickCodeAction, so undo works).
  const handleApplySuggestion = async (suggestion) => {
    if (!selectionText || !activeDocument || !selectionOffsets) return false;
    showToastSticky("Applying suggestion...");
    try {
      let finalCodeID;
      let createdCode = null;
      if (suggestion.existing_code_id) {
        finalCodeID = suggestion.existing_code_id;
      } else {
        const codeResponse = await createCode(projectId, {
          name: suggestion.name,
          color: getRandomColor(),
          ai_suggested: true,
        });
        const createdCodeData = await codeResponse.json();
        if (!codeResponse.ok) throw new Error(createdCodeData.detail || "Failed to create code");
        createdCode = createdCodeData;
        finalCodeID = createdCode.id;
        loadCodes();
      }

      const segRes = await createSegmentWithCode(projectId, {
        document_id: activeDocument.id,
        code_id: finalCodeID,
        start_char: selectionOffsets.start,
        end_char: selectionOffsets.end,
        content: selectionText,
      });
      const segment = await segRes.json();
      if (!segRes.ok) throw new Error(segment.detail || "Failed to save segment");

      pushAction({
        type: createdCode ? "create-quick-code" : "create-segment",
        code: createdCode,
        segments: [segment],
      });
      setDocumentSegments((prev) => [...prev, segment]);
      loadCodes();
      showToast(`Applied "${suggestion.name}".`, 3000);
      return true;
    } catch (error) {
      console.error(error);
      showToastSticky("Failed to apply suggestion.");
      return false;
    }
  };

  const handleSaveLocalSegmentMemo = async (memoText) => {
    if (!memoText.trim()) return;
    try {
      await createMemoForSegment(activeSegmentForMemo, memoText);
      // The memo sidebar used to never learn about segment memos saved here.
      refreshMemos(false);
      setIsMemoModalOpen(false);
    } catch {
      alert("Failed to save memo");
    }
  };

  const handleEditChange = (e) => {
    const newContent = e.target.value;
    const oldContent = editContent;
    
    let commonPrefixLen = 0;
    while (commonPrefixLen < oldContent.length && commonPrefixLen < newContent.length && oldContent[commonPrefixLen] === newContent[commonPrefixLen]) {
      commonPrefixLen++;
    }
    
    let commonSuffixLen = 0;
    while (commonSuffixLen < oldContent.length - commonPrefixLen && commonSuffixLen < newContent.length - commonPrefixLen && oldContent[oldContent.length - 1 - commonSuffixLen] === newContent[newContent.length - 1 - commonSuffixLen]) {
      commonSuffixLen++;
    }
    
    const oldReplacedLen = oldContent.length - commonPrefixLen - commonSuffixLen;
    const newInsertedLen = newContent.length - commonPrefixLen - commonSuffixLen;
    
    const editStart = commonPrefixLen;
    const editEndOld = editStart + oldReplacedLen;
    const deltaLen = newInsertedLen - oldReplacedLen;

    const nextSegments = localSegments.map(seg => {
      let newStart = seg.start_char;
      let newEnd = seg.end_char;
      
      if (editEndOld <= seg.start_char) {
        newStart += deltaLen; newEnd += deltaLen;
      } else if (editStart >= seg.end_char) {
        // Edit happens entirely after the segment — no adjustment needed.
      } else if (editStart >= seg.start_char && editEndOld <= seg.end_char) {
        newEnd += deltaLen;
      } else if (editStart < seg.start_char && editEndOld > seg.start_char && editEndOld <= seg.end_char) {
        newStart = editStart + newInsertedLen; newEnd += deltaLen;
      } else if (editStart >= seg.start_char && editStart < seg.end_char && editEndOld > seg.end_char) {
        newEnd = editStart;
      } else if (editStart <= seg.start_char && editEndOld >= seg.end_char) {
         newStart = editStart; newEnd = editStart; 
      }

      if (newStart < 0) newStart = 0;
      if (newEnd < newStart) newEnd = newStart;

      return { ...seg, start_char: newStart, end_char: newEnd, content: newContent.slice(newStart, newEnd) };
    }).filter(seg => seg.end_char > seg.start_char); 

    setLocalSegments(nextSegments);
    setEditContent(newContent);
  };

  // Auto-save function
  const performAutoSave = async (contentToSave, currentLocalSegments) => {
    if (!activeDocument || !activeDocument.id || contentToSave === lastSavedContent) {
      return; 
    }

    try {
      setAutoSaveStatus("saving");
      const res = await updateDocumentContent(projectId, 
                                          activeDocument.id,
                                          { content: contentToSave });

      if (res.ok) {
        const segmentPromises = currentLocalSegments.map(seg => 
          updateSegment(projectId, 
                        seg.id, 
                        { start_char: seg.start_char, 
                          end_char: seg.end_char, 
                          content: seg.content })
        );
        await Promise.all(segmentPromises);

        const deletedSegments = documentSegments.filter(oldSeg => !currentLocalSegments.find(ls => ls.id === oldSeg.id));
        const deletePromises = deletedSegments.map(seg => 
          deleteSegment(projectId, seg.id)
        );
        await Promise.all(deletePromises);

        setTimeout(() => {
          setLastSavedContent(contentToSave);
          setAutoSaveStatus("saved");
          
          setTimeout(() => setAutoSaveStatus(""), 1500);
        }, 1000); 
      } else {
        console.error("Auto-save failed:", res.statusText);
        setAutoSaveStatus("");
      }
    } catch (error) {
      console.error("Auto-save error:", error);
      setAutoSaveStatus("");
    }
  };

  // Set up auto-save interval when editing
  useEffect(() => {
    if (!isEditing || !activeDocument) return;

    // Set up interval to auto-save every 3 seconds
    autoSaveIntervalRef.current = setInterval(() => {
      performAutoSave(editContent,localSegments);
    }, 1000);

    // Cleanup interval on unmount or when editing stops
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [isEditing, editContent, activeDocument, lastSavedContent]);

  const handleScroll = (e) => {
    if (bgRef.current) {
      bgRef.current.scrollTop = e.target.scrollTop;
      bgRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (marginScrollRef.current) {
      marginScrollRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleToggleEdit = () => {
    if (!isEditing) {
      const initialContent = activeDocument.content || "";
      setEditContent(initialContent);
      setLastSavedContent(initialContent);
      setLocalSegments([...documentSegments]); 
      setIsEditing(true);
    } else {
      if (activeDocument.id === "NEW_DOC_PENDING") {
        setActiveDocument(null);
      } else {
      setIsEditing(false);
      setAutoSaveStatus("");
    }
  }
  };

  const handleDeleteDetail = async (e, keyToRemove) => {
    e.stopPropagation();

    const currentMetadata = { ...documentMetadata };
    const nextMetadata = { ...currentMetadata };
    delete nextMetadata[keyToRemove]; 

    setDocumentMetadata(nextMetadata);
    setActiveDocument(prev => ({ ...prev, metadata: nextMetadata }));

    try {
      const response = await updateDocumentMetadata(projectId,
                                                    activeDocument.id,
                                                    { metadata: nextMetadata });

      if (response.ok) {
        pushAction({
          type: "edit-metadata",
          documentId: activeDocument.id,
          previousMetadata: currentMetadata
        });
        if (loadDocuments) loadDocuments();
      } else {
        setDocumentMetadata(currentMetadata);
        setActiveDocument(prev => ({ ...prev, metadata: currentMetadata }));
        showToastSticky("Failed to delete detail.");
      }
    } catch (err) {
      console.error("Failed to delete detail:", err);
      setDocumentMetadata(currentMetadata);
      setActiveDocument(prev => ({ ...prev, metadata: currentMetadata }));
    }
  };

  const handleSaveEdit = async () => {
    showToastSticky("Saving document and shifting codes...");
    try {
      if (activeDocument.id === "NEW_DOC_PENDING") {
        const title = activeDocument.filename.trim() || "Untitled Document";
        const docRes = await createDocument(projectId, 
                                            { name: title, content: editContent });

        if (!docRes.ok) throw new Error("Failed to create document");

        const savedDoc = await docRes.json();

        setIsEditing(false);
        setActiveDocument({ ...savedDoc, content: editContent });
        if (loadDocuments) loadDocuments();

        showToast("Document created successfully!", 3000);
        return;
      }

      showToastSticky("Saving document and shifting codes...");
      const docRes = await updateDocumentContent(projectId, 
                                                activeDocument.id, 
                                                { content: editContent });

      if (!docRes.ok) throw new Error("Failed to save document");

      localSegments.map((seg) =>
        updateSegment(projectId, 
                            seg.id, 
                            { start_char: seg.start_char, 
                              end_char: seg.end_char, 
                              content: seg.content })
      );

      //await Promise.all(segmentPromises);

      const deletedSegments = documentSegments.filter(oldSeg => !localSegments.find(ls => ls.id === oldSeg.id));
      const deletePromises = deletedSegments.map(seg =>
        deleteSegment(projectId, seg.id)
      );
      await Promise.all(deletePromises);

      const updatedDoc = await fetchDocument(projectId, activeDocument.id);
      setActiveDocument(updatedDoc);

      const updatedSeg = await fetchSegmentsForDocument(projectId, activeDocument.id);
      setDocumentSegments(updatedSeg);

      setIsEditing(false);
      showToast("Edits saved successfully!", 3000);
    } catch (error) {
      console.error(error);
      showToastSticky("Failed to save edits.");
    }
    };

  useEffect(() => {
    const targetSegments = isEditing ? localSegments : documentSegments;
    const targetRef = isEditing ? bgRef : viewerRef;

    if (!activeDocument || !targetRef.current || targetSegments.length === 0) {
      setMarginBars([]);
      return;
    }

    const measureMargins = () => {
      if (!targetRef.current) return;

      const containerBounds = targetRef.current.getBoundingClientRect();
      const chunks = targetRef.current.querySelectorAll(".highlight-chunk");
      const segmentBounds = {};

      chunks.forEach((chunk) => {
        const ids = chunk.getAttribute("data-segment-ids");
        if (!ids) return;

        const chunkRect = chunk.getBoundingClientRect();
        const top = (chunkRect.top - containerBounds.top) + targetRef.current.scrollTop;
        const bottom = top + chunkRect.height;

        ids.split(" ").forEach((id) => {
          if (!segmentBounds[id]) {
            segmentBounds[id] = { top, bottom };
          } else {
            segmentBounds[id].top = Math.min(segmentBounds[id].top, top);
            segmentBounds[id].bottom = Math.max(segmentBounds[id].bottom, bottom);
          }
        });
      });

      const rawBars = targetSegments.map((seg) => {
        const bounds = segmentBounds[seg.id];
        if (!bounds) return null;
        const code = projectCodes.find((currentCode) => currentCode.id === seg.code_id);
        let displayColor = code ? code.color : "#ccc";
        let displayName = code ? code.name : "Unknown";

        if (showParentInMargin && code && code.parent_id) {
          let currentIter = code;
          const pathArray = [currentIter.name];
          while (currentIter.parent_id) {
            const parent = projectCodes.find((cc) => Number(cc.id) === Number(currentIter.parent_id));
            if (parent) {
              pathArray.unshift(parent.name);
              currentIter = parent;
            } else break; 
          }
          displayColor = currentIter.color;
          displayName = pathArray.join(" > ");
        }

        return {
          id: seg.id, code_id: seg.code_id, codeName: displayName,
          color: displayColor, top: bounds.top, height: bounds.bottom - bounds.top, track: 0,
        };
      }).filter(Boolean);

      rawBars.sort((a, b) => {
        if (Math.abs(b.height - a.height) > 10) return b.height - a.height;
        const idxA = projectCodes.findIndex((cc) => cc.id === a.code_id);
        const idxB = projectCodes.findIndex((cc) => cc.id === b.code_id);
        return (idxA !== -1 ? idxA : 9999) - (idxB !== -1 ? idxB : 9999);
      });

      rawBars.forEach((bar) => {
        let currentTrack = 0;
        let conflict = true;
        while (conflict) {
          const overlappingBar = rawBars.find(
            (other) => other !== bar && other.track === currentTrack && other.top < bar.top + bar.height && other.top + other.height > bar.top
          );
          if (overlappingBar) currentTrack++; else conflict = false;
        }
        bar.track = currentTrack;
      });
      
      setContentHeight(targetRef.current.scrollHeight);
      setMarginBars(rawBars);
    };

    const measureTimer = setTimeout(measureMargins, 50);

    //resize observer
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to prevent layout thrashing
      requestAnimationFrame(measureMargins);
    });

    resizeObserver.observe(targetRef.current);

    return () => {
      clearTimeout(measureTimer);
      resizeObserver.disconnect();
    };
  }, [activeDocument, documentSegments, localSegments, projectCodes, showParentInMargin, isEditing]);

  const renderHighlightedContent = (content, segments, codes, searchResult) => {
    if(!content) return "";
    
    if (!segments || segments.length === 0) {
      // If no segments but there's a search result, highlight it
      if (searchResult) {
        const { start_char, end_char } = searchResult;
        return [
          <span key="before">{content.slice(0, start_char)}</span>,
          <span
            key="search"
            data-search-result="true"
            style={{
              backgroundColor: "#FFD700",
              color: "#000",
              //borderRadius: "3px"
            }}
          >
            {content.slice(start_char, end_char)}
          </span>,
          <span key="after">{content.slice(end_char)}</span>,
        ];
      }
      return content;
    }
    
    let boundaries = new Set([0, content.length]);
    segments.forEach((seg) => {
      boundaries.add(seg.start_char);
      boundaries.add(seg.end_char);
    });
    
    // Add search result boundaries
    if (searchResult) {
      boundaries.add(searchResult.start_char);
      boundaries.add(searchResult.end_char);
    }
    
    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
    const parts = [];

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const start = sortedBoundaries[i];
      const end = sortedBoundaries[i + 1];
      if (start === end) continue;
      const chunkText = content.slice(start, end);
      const coveringSegments = segments.filter((seg) => seg.start_char <= start && seg.end_char >= end);

      // Check if this chunk is part of the search result
      const isSearchResult = searchResult && 
        searchResult.start_char <= start && 
        searchResult.end_char >= end;

      if (isSearchResult) {
        parts.push(
          <span
            key={`${start}-${end}-search`}
            data-search-result="true"
            style={{
              backgroundColor: "#FFD700",
              color: "#000",
              fontWeight: "bold",
              padding: "2px 4px",
              borderRadius: "3px",
              animation: "pulse 1s ease-in-out infinite",
            }}
          >
            {chunkText}
          </span>
        );
      } else if (coveringSegments.length > 0) {
        coveringSegments.sort((a, b) => {
          const idxA = codes.findIndex(c => c.id === a.code_id);
          const idxB = codes.findIndex(c => c.id === b.code_id);
          return (idxA !== -1 ? idxA : 9999) - (idxB !== -1 ? idxB : 9999);
        });
        const winningSegment = coveringSegments[0];
        const code = codes.find((c) => c.id === winningSegment.code_id);
        const solidColor = code ? code.color : "transparent";
        const transparentColor = code ? hexToRGBA(code.color, 0.3) : "transparent";
        const allSegmentIds = coveringSegments.map((s) => s.id).join(" ");

        parts.push(
          <span
            key={`${start}-${end}`}
            className="highlight-chunk"
            data-segment-ids={allSegmentIds}
            onContextMenu={!isEditing ? ((e) => handleRightClickSegment(e, winningSegment.id)) : undefined}
            style={{
              backgroundColor: transparentColor,
              borderBottom: `2px solid ${solidColor}`,
              padding: "2px 0px",
              borderRadius: "3px",
              cursor: isEditing ? "text" : "pointer",
            }}
          >
            {chunkText}
          </span>
        );
      } else {
        parts.push(<span key={`${start}-${end}`}>{chunkText}</span>);
      }
    }
    return parts;
  };

  const handleDeleteSegment = async (segmentId) => {
    const segmentSnapshot = documentSegments.find((seg) => seg.id === segmentId);
    try {
      const res = await deleteSegment(projectId, segmentId);
      
      if (res.ok) {
        // Remove from the UI instantly
        setDocumentSegments(prev => prev.filter(s => s.id !== segmentId));
        
        // Push it to your Ctrl+Z Undo Stack!
        if (segmentSnapshot) {
          pushAction({ type: "delete-segment", segment: segmentSnapshot });
        }
        
        setSegmentContextMenu(null);
        loadCodes(); // Refresh sidebar to update the frequency count
      } else {
        showToastSticky("Failed to remove code.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const documentShellStyle = {
    display: "flex",            
    flexDirection: "column",      
    boxSizing: "border-box",
    flex: 1, borderLeft: "1px solid #ccc", padding: "30px", paddingBottom: "10px",borderTop: "1px solid #333",
    backgroundColor: "#fff", color: "#333", overflow: "hidden", position: "relative",height: "100%",
  };

  if (!activeDocument) {
    return (
      <div style={documentShellStyle}>
        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#888" }}>
          <p>Select a document from the sidebar to start reading.</p>
        </div>
      </div>
    );
  }

  const isPDF = activeDocument?.filename?.toLowerCase().endsWith('.pdf') || activeDocument?.type === "pdf";
  const showPdfPreview = isPDF && !isPdfPreviewCollapsed;
  const pdfPreviewUrl = buildPdfPreviewUrl(projectId, activeDocument.id);

  return (
    <div style={documentShellStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #aaa", paddingBottom: "10px", marginBottom: "20px" }}>
        {activeDocument.id === "NEW_DOC_PENDING" ? (
          <input 
            type="text" 
            placeholder="Document Title..."
            value={activeDocument.filename === "Untitled Document" ? "" : activeDocument.filename}
            onChange={(e) => setActiveDocument({ ...activeDocument, filename: e.target.value })}
            style={{ margin: 0, fontSize: "24px", color: "#000", fontWeight: "500", border: "none", borderBottom: "2px dashed #646cff", outline: "none", background: "transparent", width: "40%" }}
            autoFocus
          />
        ) : (
          <h2 style={{ margin: 0, color: "#000", fontWeight: "500" }}>{activeDocument.filename}</h2>
        )}
        
        <div style={{ display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isEditing ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
             {autoSaveStatus && (
               <div
                 style={{
                   display: "inline-flex",
                   alignItems: "center",
                   justifyContent: "center",
                   padding: "0 12px",
                   borderRadius: "4px",
                   fontSize: "14px",
                   height: "36px",     
                   minWidth: "110px",
                   boxSizing: "border-box",
                   fontWeight: 600,
                   backgroundColor: autoSaveStatus === "saving" ? "#fff3cd" : "#d4edda",
                   color: autoSaveStatus === "saving" ? "#856404" : "#155724",
                   border: "1px solid transparent",
                 }}
               >
                 {autoSaveStatus === 'saving' ? 'Saving...' : 'Saved'}
               </div>
            )}
              <button 
                onClick={handleSaveEdit} 
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#4CAF50";
                  e.currentTarget.style.color = "white";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "white";
                  e.currentTarget.style.color = "#4CAF50";
                }}
                style={{ 
                  height: "36px",        // Match height
                  padding: '0 16px', 
                  backgroundColor: 'white', 
                  color: '#4CAF50', 
                  borderRadius: '4px', 
                  border: '1px solid #4CAF50',
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  display: 'flex',       // Center the text/icon
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M18.1716 1C18.702 1 19.2107 1.21071 19.5858 1.58579L22.4142 4.41421C22.7893 4.78929 23 5.29799 23 5.82843V20C23 21.6569 21.6569 23 20 23H4C2.34315 23 1 21.6569 1 20V4C1 2.34315 2.34315 1 4 1H18.1716ZM4 3C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21L5 21L5 15C5 13.3431 6.34315 12 8 12L16 12C17.6569 12 19 13.3431 19 15V21H20C20.5523 21 21 20.5523 21 20V6.82843C21 6.29799 20.7893 5.78929 20.4142 5.41421L18.5858 3.58579C18.2107 3.21071 17.702 3 17.1716 3H17V5C17 6.65685 15.6569 8 14 8H10C8.34315 8 7 6.65685 7 5V3H4ZM17 21V15C17 14.4477 16.5523 14 16 14L8 14C7.44772 14 7 14.4477 7 15L7 21L17 21ZM9 3H15V5C15 5.55228 14.5523 6 14 6H10C9.44772 6 9 5.55228 9 5V3Z" fill="currentColor"/>
                </svg>
                Save
              </button>
              
              <button 
                onClick={handleToggleEdit} 
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)";
                  e.currentTarget.style.borderColor = "#666";
                  e.currentTarget.style.color = "#333";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.borderColor = "#999";
                  e.currentTarget.style.color = "#555";
                }}
                style={{ 
                  height: "36px",        // Match height
                  padding: '0 16px', 
                  background: 'transparent', 
                  color: '#555', 
                  border: '1px solid #999', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  display: 'flex',       // Center the text
                  alignItems: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={handleToggleEdit} 

              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#e8e8e8";
                e.currentTarget.style.borderColor = "#999";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#f0f0f0";
                e.currentTarget.style.borderColor = "#ccc";
              }}
              style={{ display:'flex',alignItems:'center',padding: '6px 12px', background: '#f0f0f0', color: '#333', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', gap:'6px',transition: 'all 0.2s ease' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" style={{transform: 'translateY(-1px)'}}>
                  <path d="M20.1497 7.93997L8.27971 19.81C7.21971 20.88 4.04971 21.3699 3.27971 20.6599C2.50971 19.9499 3.06969 16.78 4.12969 15.71L15.9997 3.84C16.5478 3.31801 17.2783 3.03097 18.0351 3.04019C18.7919 3.04942 19.5151 3.35418 20.0503 3.88938C20.5855 4.42457 20.8903 5.14781 20.8995 5.90463C20.9088 6.66146 20.6217 7.39189 20.0997 7.93997H20.1497Z" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 21H12" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {isPDF ? "Edit PDF Text (Not Recommended)" : "Edit Text"}
            </button>
          )}

          {isPDF && (
            <button
              onClick={() => setIsPdfPreviewCollapsed((prev) => !prev)}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#2a2a35";
                e.currentTarget.style.borderColor = "#777";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#1f1f28";
                e.currentTarget.style.borderColor = "#555";
              }}
              style={{ padding: '6px 12px', background: '#1f1f28', color: '#fff', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s ease' }}
              title={isPdfPreviewCollapsed ? 'Show the PDF preview' : 'Hide the PDF preview'}
            >
              {isPdfPreviewCollapsed ? 'Show PDF Preview' : 'Hide PDF Preview'}
            </button>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", cursor: "pointer", borderLeft: '1px solid #ccc', paddingLeft: '15px' }}>
            <input type="checkbox" checked={showParentInMargin} onChange={(e) => setShowParentInMargin(e.target.checked)} style={{ cursor: "pointer", accentColor: "#646cff" }} />
            Group Margins by Parent
          </label>
        </div>
      </div>

      {activeDocument.id !== "NEW_DOC_PENDING" && (
        <DocumentDetailsTab 
          projectId={projectId}
          activeDocument={activeDocument}
          documentMetadata={documentMetadata}
          setDocumentMetadata={setDocumentMetadata}
          handleDeleteDetail={handleDeleteDetail} />
      )}

      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", height: "100%" }}>
        <Group direction="horizontal" autoSaveId="doc-internal-layout">
          
          {/* Main Text Editor / Viewer */}
          <Panel defaultSize={isPDF && showPdfPreview ? 45 : 75} minSize={30} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
            {isEditing ? (
              <div style={{ position: "relative", flex: 1,minHeight: 0, height: "100%", border: "2px solid #646cff", borderRadius: "6px", backgroundColor: "#fafafa", overflow: "hidden" }}>
                <div
                  ref={bgRef}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    color: "transparent", 
                    fontFamily: "system-ui, sans-serif", fontSize: "16px", lineHeight: "1.6",
                    padding: "15px", boxSizing: "border-box",
                    whiteSpace: "pre-wrap", overflowY: "auto", pointerEvents: "none", zIndex: 1
                  }}
                >
                  {renderHighlightedContent(editContent, localSegments, projectCodes, currentSearchResult)}
                </div>
                
                <textarea 
                  value={editContent}
                  onChange={handleEditChange}
                  onScroll={handleScroll}
                  spellCheck="false"
                  placeholder={activeDocument.id === "NEW_DOC_PENDING" ? "Start typing your document here..." : ""}
                  style={{ 
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    backgroundColor: "transparent", 
                    color: "#222", 
                    border: "none", 
                    padding: "15px", boxSizing: "border-box",
                    fontFamily: "system-ui, sans-serif", fontSize: "16px", lineHeight: "1.6",
                    resize: "none", outline: "none",
                    whiteSpace: "pre-wrap", overflowY: "auto", zIndex: 2
                  }}
                />
              </div>
            ) : (
              <div
                ref={viewerRef}
                tabIndex={0}
                onMouseUp={handleTextSelection}
                onKeyUp={handleTextSelection}
                onScroll={handleScroll}
                style={{ flex: 1,minHeight: 0, height: "100%", paddingRight: isPDF && showPdfPreview ? "0" : "30px", whiteSpace: "pre-wrap", fontSize: "16px", lineHeight: "1.6", fontFamily: "system-ui, sans-serif", outline: "none", overflowY: "auto" }}
              >
                {renderHighlightedContent(activeDocument.content, documentSegments, projectCodes, currentSearchResult)}
              </div>
            )}
          </Panel>

          <Separator style={{ width: "16px", cursor: "col-resize", backgroundColor: "transparent", display: "flex", justifyContent: "center" }}>
             <div style={{ width: "2px", height: "100%", backgroundColor: "#eee" }} />
          </Separator>

          {/* PDF Preview Panel */}
          {isPDF && showPdfPreview && (
            <>
              <PdfPreviewPanel pdfPreviewUrl={pdfPreviewUrl} filename={activeDocument.filename} />
              <Separator style={{ width: "16px", cursor: "col-resize", backgroundColor: "transparent", display: "flex", justifyContent: "center" }}>
                 <div style={{ width: "2px", height: "100%", backgroundColor: "#eee" }} />
              </Separator>
            </>
          )}


          {/* Margin Sidebar Panel */}
          <Panel defaultSize={20} minSize={10} style={{ position: "relative" }}>
            <MarginSidebar 
              marginBars={marginBars} 
              projectCodes={projectCodes} 
              onRightClickBar={handleRightClickSegment}
              scrollRef={marginScrollRef}        
              contentHeight={contentHeight}
            />
          </Panel>

        </Group>
      </div>

      {segmentContextMenu && (
        <div style={{ position: "fixed", top: segmentContextMenu.y, left: segmentContextMenu.x, zIndex: 2000, backgroundColor: "#23232a", border: "1px solid #444", borderRadius: "8px", padding: "6px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", color: "white" }}>
          <button onClick={() => openMemoModal(segmentContextMenu.segmentId)} style={{ display: "block", width: "100%", padding: "8px 16px", backgroundColor: "transparent", border: "none", color: "white", textAlign: "left", cursor: "pointer", borderRadius: "4px" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#3a3a44")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
            Add Quote Memo
          </button>
          <button onClick={() => handleDeleteSegment(segmentContextMenu.segmentId)} style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px 16px", backgroundColor: "transparent", border: "none", color: "#ff6b6b", textAlign: "left", cursor: "pointer", borderRadius: "4px" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#3a3a44")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
            Unlink / Remove Code
          </button>
        </div>
  
      )}

      {isMemoModalOpen && (
        <SegmentMemoModal 
            open={isMemoModalOpen}
            onSave={handleSaveLocalSegmentMemo}
            onClose={() => setIsMemoModalOpen(false)} />
      )}

      {quickMenuOpen && selectionRect && (
        <QuickCodeModal
          isOpen={quickMenuOpen}
          selectionRect={selectionRect}
          selectionText={selectionText}
          onApply={handleQuickCodeAction}
          onCancel={clearTextSelection}
          onAskAI={handleAskAI}
        />
      )}

      {aiModalOpen && selectionRect && (
        <AISuggestModal
          isOpen={aiModalOpen}
          selectionRect={selectionRect}
          selectionText={selectionText}
          suggestions={aiSuggestions}
          isLoading={aiLoading}
          onApplySuggestion={handleApplySuggestion}
          onCancel={clearTextSelection}
        />
      )}
    </div>
  );
};

// Add CSS for search result highlighting animation
const searchResultStyles = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = searchResultStyles;
  document.head.appendChild(styleSheet);
}

export default ProjectPageDocumentPanel;