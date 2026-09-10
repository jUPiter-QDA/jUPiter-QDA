import { useState, useEffect, useRef } from 'react';
import ConfirmDeleteModal from '../Modal/ConfirmDeleteModal';
import { createFolder, deleteFolder, fetchFolders, moveDocument, moveFolder, renameFolder, reorderFolders, updateDocumentsOrder, normalizeMetadata } from '../utils/backend-api';
import { useToast } from '../context/ToastContext';

function DocumentsSidebar({
  documents,
  activeDocumentId,
  onFileUpload,
  onWriteDocument,
  onDocumentClick,
  onDeleteDocument,
  onRenameDocument,
  projectId,
  loadDocuments,
}) {
  const { status: uploadStatus, progress: uploadProgress } = useToast();
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [addingSubFolderTo, setAddingSubFolderTo] = useState(null); 
  const [newSubFolderName, setNewSubFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const dragCounter = useRef(0);
  const [isImportDropActive, setIsImportDropActive] = useState(false);
  const [sortMode, setSortMode] = useState("custom");
  const [metadataFilterKey, setMetadataFilterKey] = useState("");
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);

  // Unified Drag State
  const [draggedItem, setDraggedItem] = useState(null); 
  const [dragOverId, setDragOverId] = useState(null); 
  const [dragPosition, setDragPosition] = useState(null); 
  const [renamingDocument, setRenamingDocument] = useState(null);

  // Right-Click Context Menu State
  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    if (projectId) loadFolders();

    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [projectId]);

  const formatImportedDate = (createdAt) => {
    if (!createdAt) return "Unknown date";
    const parsedDate = new Date(createdAt);
    if (Number.isNaN(parsedDate.getTime())) return "Unknown date";
    return parsedDate.toLocaleDateString();
  };

  const getMetadataSummary = (doc) => {
    const entries = Object.entries(normalizeMetadata(doc));
    if (entries.length === 0) return "";
    return entries.slice(0, 2).map(([key, value]) => `${key}: ${value}`).join(" · ");
  };

  const matchesMetadataFilter = (doc) => {
    const metadata = normalizeMetadata(doc);
    const normalizedKey = metadataFilterKey.trim().toLowerCase();

    if (!normalizedKey) return true;
    return Object.keys(metadata).some((key) => key.toLowerCase().includes(normalizedKey));
  };

  const compareDocuments = (left, right) => {
    if (sortMode === "custom") {
      return (left.order_index ?? 0) - (right.order_index ?? 0) || left.filename.localeCompare(right.filename, undefined, { sensitivity: "base" });
    }
    if (sortMode === "date") {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return rightTime - leftTime || left.filename.localeCompare(right.filename, undefined, { sensitivity: "base" });
    }
    return left.filename.localeCompare(right.filename, undefined, { sensitivity: "base" });
  };

  const compareFolders = (left, right) => {
    if (sortMode === "custom") {
      return (left.order_index ?? 0) - (right.order_index ?? 0) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    }
    if (sortMode === "date") {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : Number(left.id ?? 0);
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : Number(right.id ?? 0);
      return rightTime - leftTime || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  };

  const sortAndFilterDocuments = (documentList) => {
    return [...documentList].filter(matchesMetadataFilter).sort(compareDocuments);
  };

  const hasMetadataField = (doc) => {
    const normalizedKey = metadataFilterKey.trim().toLowerCase();
    if (!normalizedKey) return true;
    const metadata = normalizeMetadata(doc);
    return Object.keys(metadata).some((key) => key.toLowerCase().includes(normalizedKey));
  };

  const getDocumentBuckets = (documentList) => {
    const normalizedKey = metadataFilterKey.trim();
    const sortedDocuments = [...documentList].sort(compareDocuments);

    if (!normalizedKey) {
      return { matching: sortedDocuments, missingField: [] };
    }

    const matching = [];
    const missingField = [];

    sortedDocuments.forEach((doc) => {
      if (!hasMetadataField(doc)) {
        missingField.push(doc);
        return;
      }
      matching.push(doc);
    });

    return { matching, missingField };
  };

  const sortedFolders = [...folders].sort(compareFolders);

  const isSameContainer = (leftDoc, rightDoc) => (leftDoc?.folder_id ?? null) === (rightDoc?.folder_id ?? null);

  const reorderDocumentsInContainer = async (draggedDocId, targetDocId, targetFolderId, dropPosition) => {
    const containerDocuments = sortAndFilterDocuments(
      documents.filter((doc) => (doc.folder_id ?? null) === (targetFolderId ?? null))
    );

    const draggedDoc = containerDocuments.find((doc) => doc.id === draggedDocId);
    const targetDoc = containerDocuments.find((doc) => doc.id === targetDocId);
    if (!draggedDoc || !targetDoc) return;

    const nextDocuments = containerDocuments.filter((doc) => doc.id !== draggedDocId);
    const targetIndex = nextDocuments.findIndex((doc) => doc.id === targetDocId);
    const insertIndex = dropPosition === "after" ? targetIndex + 1 : targetIndex;
    nextDocuments.splice(insertIndex, 0, draggedDoc);

    const reorderPayload = nextDocuments.map((doc, index) => ({ id: doc.id, order_index: index }));

    try {
      const response = await updateDocumentsOrder(projectId, { documents: reorderPayload });

      if (!response.ok) throw new Error('Failed to reorder documents');
      if (loadDocuments) loadDocuments();
    } catch (err) {
      console.error(err);
      if (loadDocuments) loadDocuments();
    }
  };

  const moveDocumentToFolder = async (documentId, folderId) => {
    try {
      const response = moveDocument(projectId, documentId, folderId);
      if (!response.ok) throw new Error('Failed to move document');
      if (loadDocuments) loadDocuments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubFolder = async (e, parentId) => {
    if (e) e.preventDefault();
    if (!newSubFolderName.trim()) {
      setAddingSubFolderTo(null);
      return;
    }
    try {
      const res = createFolder(projectId, { name: newSubFolderName, parent_id: parentId });
      if (res.ok) {
        setNewSubFolderName("");
        setAddingSubFolderTo(null);
        loadFolders();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getAggregatedDocumentCount = (folderId) => {
    // recursively find all child folder IDs
    const getDescendants = (pId) => {
      let ids = [pId];
      folders.filter(f => f.parent_id === pId).forEach(child => {
        ids = ids.concat(getDescendants(child.id));
      });
      return ids;
    };
    
    // count documents that belong to ANY of those folders
    const descIds = getDescendants(folderId);
    const aggregatedDocs = documents.filter(d => descIds.includes(d.folder_id));
    const aggregatedGroups = getDocumentBuckets(aggregatedDocs);
    
    return {
      total: aggregatedGroups.matching.length + aggregatedGroups.missingField.length,
      matching: aggregatedGroups.matching.length
    };
  };

  const loadFolders = () => {
    fetchFolders(projectId)
      .then(data => setFolders(data || []))
      .catch(err => console.error(err));
  };

  const handleCreateFolder = async (e) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    try {
      const res = createFolder(projectId, { name: newFolderName });
      if (res.ok) {
        setNewFolderName("");
        setIsCreatingFolder(false);
        loadFolders();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      const res = deleteFolder(projectId, folderId);
      if (res.ok) {
        loadFolders();
        if (loadDocuments) loadDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFolder = (e, folderId) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleContextMenu = (e, targetType, targetId = null, filename = null) => {
    e.preventDefault();
    e.stopPropagation();
    const menuHeight = 140; 
    const safeY = (e.clientY + menuHeight > window.innerHeight) 
      ? e.pageY - menuHeight 
      : e.pageY;
    setContextMenu({
      x: e.clientX,
      y: safeY,
      type: targetType,
      id: targetId,
      name: filename
    });
  };

  const startRenameDocument = (doc) => {
    setRenamingDocument({ id: doc.id, value: doc.filename });
    setContextMenu(null);
  };

  const finishRenameDocument = async () => {
    if (!renamingDocument) return;

    const nextName = renamingDocument.value.trim();
    const currentDocument = documents.find((doc) => doc.id === renamingDocument.id);

    if (!currentDocument) {
      setRenamingDocument(null);
      return;
    }

    if (!nextName || nextName === currentDocument.filename) {
      setRenamingDocument(null);
      return;
    }

    try {
      await onRenameDocument(renamingDocument.id, nextName);
      setRenamingDocument(null);
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to rename document");
    }
  };

  const startRenameFolder = (folder) => {
    setRenamingFolder({ id: folder.id, value: folder.name });
    setContextMenu(null);
  };

  const finishRenameFolder = async () => {
    if (!renamingFolder) return;
    const nextName = renamingFolder.value.trim();
    const currentFolder = folders.find(f => f.id === renamingFolder.id);

    if (!currentFolder || !nextName || nextName === currentFolder.name) {
      setRenamingFolder(null);
      return;
    }

    try {
      const res = renameFolder(projectId, renamingFolder.id, { name: nextName });
      if (res.ok) {
        loadFolders(); // Refresh folders to show the new name
      }
    } catch (err) {
      console.error(err);
    }
    setRenamingFolder(null);
  };

    // --- DRAG AND DROP ---
  const handleDragStart = (e, type, id) => {
    e.stopPropagation(); // Stops document drag events from triggering parent folder drag parameters!
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("type", type);
    e.dataTransfer.setData("id", id.toString());
    setDraggedItem({ type, id });
  };

  const handleDragOver = (e, targetType, targetId) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedItem?.id === targetId && draggedItem?.type === targetType) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;

    let position = "inside";
    if (targetType === 'folder') {
      if (draggedItem?.type === 'folder') {
        if (y < rect.height * 0.25) position = "before";
         else if (y > rect.height * 0.75) position = "after";
         else position = "inside";
      } else if (draggedItem?.type === 'doc') {
         position = "inside";
      }
    } else if (targetType === 'doc' && draggedItem?.type === 'doc' && sortMode === 'custom') {
      position = y < rect.height / 2 ? "before" : "after";
    } else if (targetType === 'root') {
      position = "inside";
    }

    setDragOverId(`${targetType}-${targetId}`);
    setDragPosition(position);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
    setDragPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverId(null);
    setDragPosition(null);
  };

  const handleImportDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsImportDropActive(true);
  };

  const handleImportDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsImportDropActive(true);
  };

  const handleImportDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setIsImportDropActive(false);
    }
  };

  const handleImportDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsImportDropActive(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      onFileUpload(files);
    }
  };

  const handleDrop = async (e, targetType, targetId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem) return;

    const { id, type } = draggedItem;

   if (type === 'folder') {
      if (targetType === 'folder' && dragPosition === 'inside') {
        // Move folder INSIDE another folder
        try {
          moveFolder(projectId, id, { parent_id: targetId });
          loadFolders();
          setExpandedFolders(prev => new Set(prev).add(targetId)); // Auto expand
        } catch (err) { console.error(err); }
      } else if (targetType === 'root') {
        // Move folder OUT to the root (un-nest it)
        try {
          moveFolder(projectId, id, { parent_id: null }); // null means root level!
          loadFolders();
        } catch (err) { console.error(err); }
      } else if (targetType === 'folder') {
        // Standard vertical reordering
        const draggedFolder = folders.find(f => f.id === id);
        let remaining = folders.filter(f => f.id !== id);
        const targetIndex = remaining.findIndex(f => f.id === targetId);

        let insertIndex = dragPosition === 'after' ? targetIndex + 1 : targetIndex;
        remaining.splice(insertIndex, 0, draggedFolder);
        setFolders([...remaining]); 

        const reorderPayload = remaining.map((f, idx) => ({ id: f.id, order_index: idx }));
        try {
          reorderFolders(projectId, { folders: reorderPayload });
        } catch (err) { console.error(err); }
      }
    }else if (type === 'doc') {
      const draggedDoc = documents.find((doc) => doc.id === id);

      if (targetType === 'root') {
        await moveDocumentToFolder(id, null);
      } else if (targetType === 'doc') {
        const targetDoc = documents.find((doc) => doc.id === targetId);
        if (!draggedDoc || !targetDoc) return;

        if (isSameContainer(draggedDoc, targetDoc)) {
          await reorderDocumentsInContainer(id, targetId, targetDoc.folder_id ?? null, dragPosition);
        } else {
          // If dropped on a file at the root level, move out of the folder cleanly
          await moveDocumentToFolder(id, targetDoc.folder_id ?? null);
        }
      } else if (targetType === 'folder') {
        await moveDocumentToFolder(id, targetId);
      }
    }

    setDraggedItem(null);
    setDragOverId(null);
    setDragPosition(null);
  };

  const renderDoc = (doc, isNested = false) => {
    const isDragging = draggedItem?.type === 'doc' && draggedItem.id === doc.id;
    const isRenaming = renamingDocument?.id === doc.id;
    const metadataSummary = getMetadataSummary(doc);
    const isActive = activeDocumentId === doc.id;
    const isDragOverMe = dragOverId === `doc-${doc.id}`;

    const borderTopStyle = isDragOverMe && dragPosition === 'before' 
      ? '2px solid #646cff' 
      : (isActive ? '1px solid #646cff' : '1px solid transparent');

    const borderBottomStyle = isDragOverMe && dragPosition === 'after' 
      ? '2px solid #646cff' 
      : (isActive ? '1px solid #646cff' : '1px solid transparent');

    const borderLeftRightStyle = isActive ? '1px solid #646cff' : '1px solid transparent';

    return (
      <li 
        key={doc.id} 
        draggable
        onDragStart={(e) => handleDragStart(e, 'doc', doc.id)}
        onClick={() => onDocumentClick(doc.id)} 
        onContextMenu={(e) => handleContextMenu(e, 'doc', doc.id, doc.filename)}
        onDragOver={(e) => handleDragOver(e, 'doc', doc.id)}
        onDragLeave={handleDragLeave}
        onDragEnd={handleDragEnd}
        onDrop={(e) => handleDrop(e, 'doc', doc.id)}
        style={{ 
          marginBottom: '5px',
          marginLeft: isNested ? '20px' : '0',
          opacity: isDragging ? 0.3 : 1,
          borderTop: borderTopStyle,
          borderBottom: borderBottomStyle,
          borderLeft: borderLeftRightStyle,
          borderRight: borderLeftRightStyle,
          padding: '8px 12px', 
          backgroundColor: isActive ? 'rgba(100, 108, 255, 0.2)' : '#2a2a2a', 
          color: 'white', 
          borderRadius: '4px',
          display: 'flex',                 
          justifyContent: 'space-between', 
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      > 
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{ color: '#666', fontSize: '14px', cursor: 'grab' }}>⋮⋮</div>
          {isRenaming ? (
            <input
              autoFocus
              value={renamingDocument.value}
              onChange={(e) => setRenamingDocument((prev) => prev ? { ...prev, value: e.target.value } : prev)}
              onBlur={finishRenameDocument}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  finishRenameDocument();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenamingDocument(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                minWidth: 0,
                background: '#111',
                border: '1px solid #646cff',
                color: '#fff',
                outline: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                padding: '6px 8px'
              }}
            />
          ) : (
            <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="11px" height="11px" viewBox="0 0 16 16" fill="none">
                  <path d="M7 0H2V16H14V7H7V0Z" fill="#ccc"/>
                  <path d="M9 0V5H14L9 0Z" fill="#ccc"/>
                </svg>  {doc.filename}
              </div>
            <div style={{ marginTop: '2px', fontSize: '11px', color: '#a9a9a9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {formatImportedDate(doc.created_at)}{metadataSummary ? ` · ${metadataSummary}` : ''}
            </div>
          </div>
          )}
        </div>
      </li>
    );
  };

  const renderMetadataSections = (groups, isNested) => {
    const filterLabel = metadataFilterKey.trim();
    const isFiltering = Boolean(filterLabel);

    if (!isFiltering) {
      return groups.matching.map((doc) => renderDoc(doc, isNested));
    }

    return (
      <>
        <li style={{ margin: isNested ? '0 0 6px 20px' : '0 0 6px 0', fontSize: '10px', color: '#8ea0ff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Has "{filterLabel}" detail ({groups.matching.length})
        </li>
        {groups.matching.length === 0 ? (
          <li style={{ margin: isNested ? '0 0 8px 20px' : '0 0 8px 0', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            No matching files
          </li>
        ) : (
          groups.matching.map((doc) => renderDoc(doc, isNested))
        )}

        <li style={{ margin: isNested ? '8px 0 6px 20px' : '8px 0 6px 0', fontSize: '10px', color: '#f0b56a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Missing "{filterLabel}" detail ({groups.missingField.length})
        </li>
        {groups.missingField.length === 0 ? (
          <li style={{ margin: isNested ? '0 0 8px 20px' : '0 0 8px 0', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            None
          </li>
        ) : (
          groups.missingField.map((doc) => renderDoc(doc, isNested))
        )}
      </>
    );
  };

  return (
    <>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Documents</h3>
        <button 
          onClick={() => setIsCreatingFolder(true)} 
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
            e.currentTarget.style.borderColor = "#aaa";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.borderColor = "#444";
            e.currentTarget.style.color = "#ccc";
          }}
          style={{ 
            padding: '6px 10px', 
            backgroundColor: 'transparent', 
            border: '1px solid #444', 
            color: '#ccc', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
          title="Create New Folder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
            <line x1="9" y1="14" x2="15" y2="14"></line>
          </svg>
          New Folder
        </button>
      </div>

      {/* IMPORT / WRITE ZONE */}
      <div
        style={{
          marginBottom: '20px',
          padding: '14px',
          borderRadius: '12px',
          border: isImportDropActive ? '1px solid #646cff' : '1px dashed #3a3a3a',
          backgroundColor: isImportDropActive ? 'rgba(100, 108, 255, 0.14)' : '#202020',
          transition: 'all 0.2s ease',
        }}
        onDragEnter={handleImportDragEnter}
        onDragOver={handleImportDragOver}
        onDragLeave={handleImportDragLeave}
        onDrop={handleImportDrop}
      >
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: '#cfcfcf', fontWeight: 'bold', marginBottom: '4px' }}>
            Drop files here to import
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            Multiple text files are supported. Audio files can also be uploaded and transcribed.
          </div>
        </div>
        <input 
          type="file" 
          multiple 
          id="file-upload" 
          accept=".txt,.md,.rtf,.pdf,.docx,.odt,audio/wav,audio/mp3,audio/mpeg,audio/m4a,audio/webm,audio/ogg"          style={{ display: 'none' }} 
          onChange={onFileUpload}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <label 
            htmlFor="file-upload" 
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#45a049";
              e.currentTarget.style.borderColor = "#45a049";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#4CAF50";
              e.currentTarget.style.borderColor = "#4CAF50";
            }}
            style={{ 
              flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', borderRadius: '4px', cursor: 'pointer', 
              textAlign: 'center', fontSize: '14px', fontWeight: 'bold', display: 'flex',alignItems: 'center',justifyContent: 'center',gap: '8px', transition: 'all 0.2s ease'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" className="icon line">
              <polyline points="13 7 13 13 7 13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <line x1="13" y1="13" x2="3" y2="3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <path d="M13,3h7a1,1,0,0,1,1,1V20a1,1,0,0,1-1,1H4a1,1,0,0,1-1-1V13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            Import
          </label>
          
          <button 
            onClick={onWriteDocument}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#7a82ff";
              e.currentTarget.style.borderColor = "#7a82ff";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#646cff";
              e.currentTarget.style.borderColor = "#646cff";
            }}
            style={{ 
              flex: 1, padding: '10px', backgroundColor: '#646cff', color: 'white', border: 'none', borderRadius: '4px', 
              cursor: 'pointer', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', display: 'flex',alignItems: 'center',justifyContent: 'center',gap: '8px'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 64 64" strokeWidth="2" stroke="currentColor" fill="none">
              <path d="M55.5,23.9V53.5a2,2,0,0,1-2,2h-43a2,2,0,0,1-2-2v-43a2,2,0,0,1,2-2H41.64"/>
              <path d="M19.48,38.77l-.64,5.59a.84.84,0,0,0,.92.93l5.56-.64a.87.87,0,0,0,.5-.24L54.9,15.22a1.66,1.66,0,0,0,0-2.35L51.15,9.1a1.67,1.67,0,0,0-2.36,0L19.71,38.28A.83.83,0,0,0,19.48,38.77Z"/><line x1="44.87" y1="13.04" x2="50.9" y2="19.24"/>
            </svg> Write
          </button>
        </div>
        {uploadProgress?.isActive && uploadProgress.total > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ color: '#9bb0ff', fontSize: '13px', textAlign: 'center', marginBottom: '6px' }}>
              Importing {uploadProgress.current} of {uploadProgress.total} files
            </div>
            <div style={{ height: '8px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #4CAF50 0%, #7ad67e 100%)',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>
        )}
        <div style={{ marginTop: '10px', color: '#646cff', fontSize: '14px', textAlign: 'center' }}>{uploadStatus}</div>
      </div>

      {/* SORTING CONTROLS */}
      <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '12px', border: '1px solid #333', backgroundColor: '#202020' }}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Filters and sorting
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#111', color: 'white', fontSize: '12px' }}
          >
            <option value="custom">Custom order</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="date">Date imported</option>
          </select>
          <input
            value={metadataFilterKey}
            onChange={(e) => setMetadataFilterKey(e.target.value)}
            placeholder="Detail field"
            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#111', color: 'white', fontSize: '12px' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.4 }}>
            {metadataFilterKey ? 'Filtering by details.' : sortMode === 'custom' ? 'Drag documents up or down.' : 'Sorted list.'}
          </div>
          <button
            type="button"
            onClick={() => setMetadataFilterKey("")}
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
            style={{ padding: '6px 10px', backgroundColor: 'transparent', border: '1px solid #444', color: '#ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',transition: 'all 0.2s ease' }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* CONTAINER LIST VIEW */}
      <div 
        style={{ padding: 0, overflowY: 'auto', flex: 1, minHeight: '300px' }}
        onContextMenu={(e) => { if (e.target === e.currentTarget) handleContextMenu(e, 'root'); }}
        onDragOver={(e) => handleDragOver(e, 'root', 'root')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 'root', 'root')}
      >
        {isCreatingFolder && (
          <div style={{ marginBottom: '5px', padding: '8px 12px', backgroundColor: '#2a2a2a', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #646cff' }}>
            <span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 16 16" fill="none">
                <path d="M0 1H5L8 3H13V5H3.7457L2.03141 11H4.11144L5.2543 7H16L14 14H0V1Z" fill="#ccc"/>
              </svg>
            </span>
            <input 
              autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setIsCreatingFolder(false); }}
              onBlur={() => { if (newFolderName.trim()) handleCreateFolder(); else setIsCreatingFolder(false); }}
              placeholder="Folder name..."
              style={{ flex: 1, background: '#111', border: 'none', color: '#fff', outline: 'none', fontSize: '14px' }}
            />
          </div>
        )}

        {/* FOLDERS LIST */}
        {(() => {
          const renderFolder = (folder, depth = 0) => {
            const folderGroups = getDocumentBuckets(documents.filter(d => d.folder_id === folder.id));
            const childFolders = sortedFolders.filter(f => f.parent_id === folder.id);
            const isExpanded = expandedFolders.has(folder.id);
            const isDraggingOver = dragOverId === `folder-${folder.id}`;
            const isBeingDragged = draggedItem?.type === 'folder' && draggedItem.id === folder.id;
            const counts = getAggregatedDocumentCount(folder.id);

            return (
              <div 
                key={`folder-${folder.id}`} 
                draggable
                onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
                onDragOver={(e) => handleDragOver(e, 'folder', folder.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'folder', folder.id)}
                onDragEnd={handleDragEnd}
                style={{ 
                  marginBottom: '5px', 
                  marginLeft: depth > 0 ? '16px' : '0px', // Indents nested folders!
                  opacity: isBeingDragged ? 0.3 : 1, 
                  transition: 'opacity 0.2s ease, background-color 0.2s ease',
                  borderTop: isDraggingOver && dragPosition === 'before' ? '2px solid #646cff' : '2px solid transparent',
                  borderBottom: isDraggingOver && dragPosition === 'after' ? '2px solid #646cff' : '2px solid transparent',
                  backgroundColor: isDraggingOver && dragPosition === 'inside' ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
                  borderRadius: '4px'
                }}
              >
                <div 
                  onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
                  style={{ padding: '8px 12px', backgroundColor: '#2a2a2a', color: 'white', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', cursor: 'grab' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#666', fontSize: '14px', cursor: 'grab' }}>⋮⋮</div>
                    <div onClick={(e) => toggleFolder(e, folder.id)} style={{ cursor: 'pointer', fontSize: '12px', color: '#aaa', padding: '4px' }}>
                      {isExpanded ? '▼' : '▶'}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M0 1H5L8 3H13V5H3.7457L2.03141 11H4.11144L5.2543 7H16L14 14H0V1Z" fill="#ccc"/>
                      </svg> 
                      {renamingFolder?.id === folder.id ? (
                        <input
                          autoFocus
                          value={renamingFolder.value}
                          onChange={(e) => setRenamingFolder(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={finishRenameFolder}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); finishRenameFolder(); }
                            if (e.key === 'Escape') { e.preventDefault(); setRenamingFolder(null); }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            flex: 1, minWidth: 0, background: '#111', border: '1px solid #646cff',
                            color: '#fff', outline: 'none', borderRadius: '4px', fontSize: '13px', padding: '4px 6px'
                          }}
                        />
                      ) : (
                        <span style={{fontSize: '15px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {folder.name}
                        </span>
                      )}
                  </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ backgroundColor: '#111', color: '#aaa', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                      {metadataFilterKey.trim() ? `${counts.matching}/${counts.total}` : counts.total}
                    </span>
                  </div>
                </div>
                
                {isExpanded && (
                  <ul style={{ listStyleType: 'none', padding: 0, marginTop: '4px' }}>
                    
                    {/* 1. Render Nested Folders FIRST */}
                    {childFolders.map(child => renderFolder(child, depth + 1))}

                    {/* 2. Render Sub-Folder Creation Input */}
                    {addingSubFolderTo === folder.id && (
                      <li style={{ marginBottom: '5px', marginLeft: '16px' }}>
                        <div style={{ padding: '8px 12px', backgroundColor: '#2a2a2a', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #646cff' }}>
                          <span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 16 16" fill="none">
                              <path d="M0 1H5L8 3H13V5H3.7457L2.03141 11H4.11144L5.2543 7H16L14 14H0V1Z" fill="#ccc"/>
                            </svg>
                          </span>
                          <input 
                            autoFocus 
                            value={newSubFolderName} 
                            onChange={(e) => setNewSubFolderName(e.target.value)}
                            onKeyDown={(e) => { 
                              if (e.key === 'Enter') handleCreateSubFolder(e, folder.id); 
                              if (e.key === 'Escape') setAddingSubFolderTo(null); 
                            }}
                            onBlur={() => { 
                              if (newSubFolderName.trim()) handleCreateSubFolder(null, folder.id); 
                              else setAddingSubFolderTo(null); 
                            }}
                            placeholder="Sub-folder name..."
                            style={{ flex: 1, background: '#111', border: 'none', color: '#fff', outline: 'none', fontSize: '14px' }}
                          />
                        </div>
                      </li>
                    )}

                    {/* 3. Then Render Documents (or Empty State) */}
                    {folderGroups.matching.length === 0 && folderGroups.missingField.length === 0 && childFolders.length === 0 && addingSubFolderTo !== folder.id ? (
                      <li>
                        <div style={{ marginLeft: '40px', fontSize: '12px', color: '#555', fontStyle: 'italic', padding: '4px' }}>Empty folder</div>
                      </li>
                    ) : (
                      renderMetadataSections(folderGroups, true)
                    )}
                  </ul>
                )}
              </div>
            );
          };

          // Kick off the recursion by only mapping folders that have NO parent
          return sortedFolders.filter(f => !f.parent_id).map(folder => renderFolder(folder, 0));
        })()}
        {/* ROOT LEVEL DOCUMENTS AREA */}
        <div
          style={{
            marginTop: '10px', minHeight: '60px', borderTop: folders.length > 0 ? '1px solid #333' : 'none', paddingTop: '10px',
            borderRadius: '4px'
          }}
          onDragOver={(e) => handleDragOver(e, 'root', 'root')}
          onDrop={(e) => handleDrop(e, 'root', 'root')}
        >
          <div style={{ marginBottom: '8px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Files without folder
          </div>
          <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
            {(() => {
              const rootGroups = getDocumentBuckets(documents.filter((doc) => !doc.folder_id));
              return (
                <>
                  {renderMetadataSections(rootGroups, false)}
                </>
              );
            })()}
          </ul>
        </div>
      </div>

      {/* --- CONTEXT MENUS & DIALOGS --- */}
      {contextMenu && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999, backgroundColor: '#23232a', border: '1px solid #444', borderRadius: '6px', boxShadow: '0 8px 16px rgba(0,0,0,0.5)', padding: '4px', minWidth: '150px' }}>
          {contextMenu.type === 'root' && (
            <button onClick={(e) => { e.stopPropagation(); setIsCreatingFolder(true); setContextMenu(null); }} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}>Create Folder</button>
          )}
          {contextMenu.type === 'folder' && (
           <>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setAddingSubFolderTo(contextMenu.id); 
                  setExpandedFolders(prev => new Set(prev).add(contextMenu.id)); // Auto-expand to show input
                  setContextMenu(null); 
                }} 
                style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#646cff'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Create Sub-Folder
              </button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  const folder = folders.find(f => f.id === contextMenu.id);
                  if (folder) startRenameFolder(folder);
                }} 
                style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#3a3a46'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Rename Folder
              </button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation();
                  setFolderToDelete(folders.find(f => f.id === contextMenu.id)); 
                  setContextMenu(null);
                }} 
                style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: '#ff6b6b', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#441111'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Delete Folder
              </button>
            </>
          )}
          {contextMenu.type === 'doc' && (
            <>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  const doc = documents.find((item) => item.id === contextMenu.id);
                  if (doc) startRenameDocument(doc);
                  setContextMenu(null); 
                }}
                style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#3a3a46'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Rename Document
              </button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onDeleteDocument(contextMenu.id, contextMenu.name);
                  setContextMenu(null); 
                }}
                style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: '#ff6b6b', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#441111'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Delete Document
              </button>
            </>
          )}
        </div>
      )}

      <ConfirmDeleteModal 
        isOpen={!!folderToDelete}
        onClose={() => setFolderToDelete(null)}
        onConfirm={() => {
          handleDeleteFolder(folderToDelete.id);
          setFolderToDelete(null);
        }}
        title={folderToDelete ? `Delete "${folderToDelete.name}"?` : "Delete Folder?"}
        title={folderToDelete ? `Delete "${folderToDelete.name}"?` : "Delete Folder?"}
        warningText={
          folderToDelete?.parent_id
            ? `Are you sure you want to delete this folder? All items inside will be moved up to "${folders.find(f => f.id === folderToDelete.parent_id)?.name || 'the parent folder'}".`
            : "Are you sure you want to delete this folder? All items inside will be moved to the root area."
        }
      />
    </>
  );
}

export default DocumentsSidebar;