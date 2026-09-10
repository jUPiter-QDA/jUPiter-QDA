import { useState, useEffect } from 'react';
import CodeMemoModal from './CodeMemoModal';
import ConfirmDeleteModal from '../Modal/ConfirmDeleteModal';
import { exportProjectToDocx } from '../utils/backend-api';
import { getRandomColor } from '../utils/colors';
import { useWorkspace } from '../context/WorkspaceContext';
import { useMemos } from '../context/MemosContext';

function CodesSidebar({ projectId, codes, onOpenCodePanel, onExportQuotesCSV }) {
  const { createCode, updateCode, reorderCodes, deleteCode, mergeCodes } = useWorkspace();
  const { createMemo } = useMemos();
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [memoTargetCode, setMemoTargetCode] = useState(null);
  const [memoError, setMemoError] = useState(null);
  const [newCodeName, setNewCodeName] = useState("");
  const [newCodeColor, setNewCodeColor] = useState(getRandomColor());

  const [editingCodeId, setEditingCodeId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const [contextMenu, setContextMenu] = useState(null);
  const [addingSubCodeTo, setAddingSubCodeTo] = useState(null);
  const [subCodeName, setSubCodeName] = useState("");
  const [subCodeColor, setSubCodeColor] = useState(getRandomColor());

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragPosition, setDragPosition] = useState(null); // "before", "after", "inside"
  const [pendingDropAction, setPendingDropAction] = useState(null);
  
  const [expandedCodes, setExpandedCodes] = useState(new Set());
  const [codeToDelete, setCodeToDelete] = useState(null);
  
  const [mergeModalConfig, setMergeModalConfig] = useState(null);

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setPendingDropAction(null); 
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);
  
  const handleCreateCode = async (e) => {
    e.preventDefault();
    if (!newCodeName.trim()) return;

    try {
      const ok = await createCode({
          name: newCodeName,
          color: newCodeColor,
          parent_id: null
        });

      if (ok) {
        setNewCodeName(""); // Clear the input
        setAddingSubCodeTo(null);
        setNewCodeColor(getRandomColor()); // Reset color to default
      }
    } catch (error) {
      console.error("Failed to create code:", error);
    }
  };

  const handleCreateSubCode = async (e, parentId) => {
    e.preventDefault();
    if (!subCodeName.trim()) return;

    try {
      const ok = await createCode({
          name: subCodeName,
          color: subCodeColor,
          parent_id: parentId
        });

      if (ok) {
        setSubCodeName("");
        setSubCodeColor(getRandomColor());
        setAddingSubCodeTo(null);
      }
    } catch (error) {
      console.error("Failed to create subcode:", error);
    }
  };

  const handleUpdateCode = async (e) => {
    e.preventDefault();
    if(!editingCodeId) return;

    const ok = await updateCode(editingCodeId,
                                {name: editName, color: editColor},
                                { recordUndo: true });

    if (ok) {
      setEditingCodeId(null);
    }
  };

  const startEditing = (code) => {
    setEditingCodeId(code.id);
    setEditName(code.name);
    setEditColor(code.color)
  };

  const handleSaveMemo = async (text) => {
    if (!memoTargetCode) return;
    setMemoError(null);
    try {
      await createMemo({
        text,
        target_type: 'code',
        target_id: memoTargetCode
      });
      setMemoModalOpen(false);
      setMemoTargetCode(null);
    } catch {
      setMemoError('Failed to save memo');
    }
  };


  const handleDragStart = (e, codeId) => {
    setDraggedId(codeId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(codeId)); 
  };

  const isDecendant = (childId, parentId) => {
    let current = codes.find(c => c.id === childId);
    while (current && current.parent_id) {
      if (current.parent_id === parentId) return true;
      current = codes.find(c => c.id === current.parent_id);
    }
    return false;
  };


  const handleDragOver = (e, targetCode) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedId === targetCode.id || isDecendant(targetCode.id, draggedId)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;

    let position = "inside";
    if (y < rect.height * 0.25) position = "before";
    else if (y > rect.height * 0.75) position = "after";

    setDragOverId(targetCode.id);
    setDragPosition(position);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
    setDragPosition(null);
  }

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
  };

  const executeReorder = async (sourceId, targetCode, position) => {
    const draggedCode = codes.find(c => c.id === sourceId);

    const getAllDescendants = (parentId) => {
      let desc = [];
      const kids = codes.filter(c => c.parent_id === parentId);
      for(let k of kids) {
        desc.push(k);
        desc = desc.concat(getAllDescendants(k.id));
      }
      return desc;
    };

    const draggedDescendants = getAllDescendants(sourceId);

    let newParentId = targetCode.parent_id;
    if (position === "inside") {
      newParentId = targetCode.id;
      setExpandedCodes(prev => new Set(prev).add(targetCode.id));
    }

    if (newParentId === sourceId) return;

    draggedCode.parent_id = newParentId;

    let remainingCodes = codes.filter(c => c.id !== sourceId && !draggedDescendants.some(d => d.id === c.id));
    
    const targetIndex = remainingCodes.findIndex(c => c.id === targetCode.id);
    let insertIndex = targetIndex;

    if (position === "after" || position === "inside") {
      const targetDescendants = getAllDescendants(targetCode.id);
      insertIndex = targetIndex + 1 + targetDescendants.length;
    }
    remainingCodes.splice(insertIndex, 0, draggedCode, ...draggedDescendants);

    const reorderPayload = remainingCodes.map((c, idx) => ({
      id: c.id,
      parent_id: c.parent_id,
      order_index: idx
    }));

    await reorderCodes(remainingCodes, reorderPayload);
  };

  const handleDrop = async (e, targetCode) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedId || draggedId === targetCode.id || isDecendant(targetCode.id, draggedId)) {
      setDragOverId(null);
      setDragPosition(null);
      return;
    }

    if (dragPosition === "inside") {
      setPendingDropAction({ 
        sourceId: draggedId, 
        targetCode: targetCode,
        x: e.clientX,
        y: e.clientY
      });
      setDraggedId(null);
      setDragOverId(null);
      setDragPosition(null);
      return; 
    }

    await executeReorder(draggedId, targetCode, dragPosition);
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
  };

  const handleContextMenu = (e, codeId) => {
    e.preventDefault();
    const menuHeight = 100; 
    const safeY = (e.clientY + menuHeight > window.innerHeight) 
      ? e.pageY - menuHeight 
      : e.pageY;
    setContextMenu({
      x: e.pageX, 
      y: safeY,
      codeId: codeId
    }); 
    setMemoTargetCode(codeId);
  }

  const getAggregatedFrequency = (codeId) => {
    const baseCode = codes.find(c => c.id === codeId);
    if (!baseCode) return 0;

    let total = baseCode.frequency || 0;
    const children = codes.filter(c => c.parent_id === codeId);
    children.forEach(child => {
      total += getAggregatedFrequency(child.id);
    });
    return total;
  };

  const toggleExpand = (e, codeId) => {
    e.stopPropagation();
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(codeId)) next.delete(codeId);
      else next.add(codeId);
      return next;
    });
  };

  const handleExportCodebook = async () => {
    try {
  
      const response = exportProjectToDocx(projectId);
      if (!response.ok) throw new Error("Failed to generate Codebook");
      
      const blob = await response.blob();
      
      // Native File System API 
      if (window.showSaveFilePicker) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: `Codebook.docx`,
            types: [{
              description: "Microsoft Word Document",
              accept: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
            }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (pickerError) {
          if (pickerError.name !== "AbortError") throw pickerError;
        }
      } else {
        // Fallback for older browsers
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `Codebook.docx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to export Codebook.");
    }
  };


  const renderCodes = [];
    if (codes) {
      const buildTree = (parentId, depth) => {
        const children = codes.filter(c => c.parent_id === parentId);
        children.forEach(child => {
          renderCodes.push({ ...child, depth });
          if (expandedCodes.has(child.id)) {
            buildTree(child.id, depth + 1);
          }
        });
      };

      buildTree(null, 0);

      codes.forEach(c => {
        const isActuallyRoot = c.parent_id === null || c.parent_id === undefined || c.parent_id === "";
        if (!renderCodes.find(rc => rc.id === c.id) && isActuallyRoot) {
          renderCodes.push({ ...c, depth: 0 });
        }
      });
    }

return (
    <> 
      <h3 style={{ marginTop: 0 }}>Code Hierarchy</h3>
      
      <form onSubmit={handleCreateCode} style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: newCodeColor, border: '2px solid #444', position: 'relative', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
          <input 
            type="color" 
            value={newCodeColor}
            onChange={(e) => setNewCodeColor(e.target.value)}
            style={{ position: 'absolute', top: '-10px', left: '-10px', width: '60px', height: '60px', cursor: 'pointer', opacity: 0 }}
            title="Choose code color"
          />
        </div>
        <input 
          type="text" 
          placeholder="New master code..." 
          value={newCodeName}
          onChange={(e) => setNewCodeName(e.target.value)}
          style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: 'white' }}
        />
        <button type="submit" 
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#45a049";
            e.currentTarget.style.borderColor = "#45a049";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#4CAF50";
            e.currentTarget.style.borderColor = "#4CAF50";
          }}
          style={{ padding: '8px 12px', backgroundColor: '#4CAF50', color: 'white', border: '1px solid #4CAF50', borderRadius: '4px', cursor: 'pointer',transition: 'all 0.2s ease' }}>
          Add
        </button>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Codes</h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={onExportQuotesCSV}
            style={{ padding: '6px 10px', backgroundColor: 'transparent', border: '1px solid #444', color: '#ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Export Quotes to CSV"
            onMouseOver={(e) => e.target.style.backgroundColor = '#222'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            CSV
          </button>
          
          <button 
            onClick={handleExportCodebook}
            style={{ padding: '6px 10px', backgroundColor: 'transparent', border: '1px solid #444', color: '#ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Export Codebook to Word"
            onMouseOver={(e) => e.target.style.backgroundColor = '#222'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Word
          </button>
        </div>
      </div>

      <ul style={{ listStyleType: 'none', padding: 0, overflowY: 'auto', flex: 1 }}>
        {renderCodes.length === 0 ? (
          <p style={{ color: '#888', fontSize: '14px' }}>No codes created yet.</p>
        ) : (
          renderCodes.map((code) => {
            const isSubCode = code.depth > 0;
            const isDraggingOver = dragOverId === code.id;
            const hasChildren = codes.some(c => c.parent_id === code.id);
            const isExpanded = expandedCodes.has(code.id);

            return (
              <li 
                key={code.id} 
                draggable
                onDragStart={(e) => handleDragStart(e, code.id)}
                onDragOver={(e) => handleDragOver(e, code)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, code)}
                onDragEnd={handleDragEnd}
                style={{ 
                  marginBottom: '5px',
                  opacity: draggedId === code.id ? 0.3 : 1,
                  transition: 'all 0.2s ease',
                  borderTop: isDraggingOver && dragPosition === 'before' ? '2px solid #646cff' : '2px solid transparent',
                  borderBottom: isDraggingOver && dragPosition === 'after' ? '2px solid #646cff' : '2px solid transparent',
                  backgroundColor: isDraggingOver && dragPosition === 'inside' ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
                  borderRadius: '4px'
                }}
              >
                {editingCodeId === code.id ? (
                  <div style={{ backgroundColor: '#23232a', padding: '10px', borderRadius: '6px', border: '1px solid #646cff' }}>
                    <div style={{ marginBottom: '8px', fontSize: '12px', color: '#b0b0c3', fontWeight: 'bold' }}>Editing Code...</div>
                    <form onSubmit={handleUpdateCode} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#1f1f28', color: 'white', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label style={{ color: '#b0b0c3', fontSize: '13px' }}>Color:</label>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: editColor, border: '2px solid #555', position: 'relative', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
                          <input
                            type="color"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            style={{ position: 'absolute', top: '-10px', left: '-10px', width: '50px', height: '50px', cursor: 'pointer', opacity: 0 }}
                          />
                        </div>
                      </div>
        
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        <button type="submit" 
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = "#7a82ff";
                            e.currentTarget.style.borderColor = "#7a82ff";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = "#646cff";
                            e.currentTarget.style.borderColor = "#646cff";
                          }}
                        style={{ flex: 1, padding: '6px', backgroundColor: '#646cff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s ease' }}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingCodeId(null)} 
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
                          style={{ flex: 1, padding: '6px', backgroundColor: 'transparent', color: '#ccc', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div
                    onDoubleClick={() => onOpenCodePanel?.(code)}
                    onContextMenu={(e) => handleContextMenu(e, code.id)}
                    title={isSubCode ? "Double-click to open quotes" : "Right-click to add Sub-Code. Double-click to open quotes."}
                    style={{ 
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 12px', 
                      paddingLeft: `${12 + (code.depth * 20)}px`,
                      backgroundColor: '#2a2a2a', 
                      color: 'white', 
                      borderRadius: '4px', 
                      display: 'flex', 
                      flexWrap: 'nowrap', // Force a single line, NO dropping
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      gap: '8px',
                      cursor: 'grab' 
                    }}
                  >
                    {/* LEFT SIDE: Flexible text with STRICT overflow hiding */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ color: '#666', fontSize: '14px', flexShrink: 0 }}>⋮⋮</div>
                      
                      <div style={{ width: '16px', textAlign: 'center', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                        {hasChildren ? (
                          <div 
                            onClick={(e) => toggleExpand(e, code.id)}
                            style={{ cursor: 'pointer', fontSize: '12px', color: '#aaa', padding: '4px' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </div>
                        ) : (
                          isSubCode && <span style={{ color: '#888', fontSize: '14px' }}>↳</span>
                        )}
                      </div>
                      
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: code.color, flexShrink: 0 }}></div>
                      
                      <span style={{ 
                        display: 'block',
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        fontSize: isSubCode ? '13px' : '15px', 
                        fontWeight: (!isSubCode) ? 'bold' : 'normal'
                      }}>
                        {code.name}
                      </span>
                    </div>

                    {/* RIGHT SIDE: Rigid buttons that refuse to shrink or disappear */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      
                      {getAggregatedFrequency(code.id) > 0 && (
                        <span style={{ 
                          backgroundColor: '#111', 
                          color: '#aaa', 
                          fontSize: '11px', 
                          padding: '2px 8px', 
                          borderRadius: '10px', 
                          fontWeight: 'bold',
                        }}>
                          {getAggregatedFrequency(code.id)}
                        </span>
                      )}
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); startEditing(code); }}
                        style={{ backgroundColor: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '14px', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                        title="Edit Code"
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none">
                          <path d="M20.1497 7.93997L8.27971 19.81C7.21971 20.88 4.04971 21.3699 3.27971 20.6599C2.50971 19.9499 3.06969 16.78 4.12969 15.71L15.9997 3.84C16.5478 3.31801 17.2783 3.03097 18.0351 3.04019C18.7919 3.04942 19.5151 3.35418 20.0503 3.88938C20.5855 4.42457 20.8903 5.14781 20.8995 5.90463C20.9088 6.66146 20.6217 7.39189 20.0997 7.93997H20.1497Z" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M21 21H12" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>  

                      <button 
                        onClick={(e) => { e.stopPropagation(); setCodeToDelete(code); }}
                        style={{ backgroundColor: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '14px', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                        title="Delete Code"
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,107,107,0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none">
                          <path d="M10 11V17" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 11V17" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M4 7H20" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M6 7H12H18V18C18 19.6569 16.6569 21 15 21H9C7.34315 21 6 19.6569 6 18V7Z" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>    
                    </div>
                  </div>
                )}

                {addingSubCodeTo === code.id && (
                  <form onSubmit={(e) => handleCreateSubCode(e, code.id)} style={{ display: 'flex', gap: '6px', marginTop: '6px', padding: '8px', backgroundColor: '#1a1a1a', borderLeft: `2px solid ${code.color}`, borderRadius: '4px' }}>
                   <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: subCodeColor, border: '2px solid #444', position: 'relative', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
                      <input 
                        type="color" 
                        value={subCodeColor}
                        onChange={(e) => setSubCodeColor(e.target.value)}
                        style={{ position: 'absolute', top: '-10px', left: '-10px', width: '50px', height: '50px', cursor: 'pointer', opacity: 0 }}
                      />
                    </div>
                    <input 
                      type="text" 
                      autoFocus 
                      placeholder={`Sub-code for ${code.name}...`} 
                      value={subCodeName}
                      onChange={(e) => setSubCodeName(e.target.value)}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: 'white', fontSize: '12px' }}
                    />
                    <button type="submit" style={{ padding: '4px 8px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      Save
                    </button>
                    <button type="button" onClick={() => setAddingSubCodeTo(null)} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#ccc', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      Cancel
                    </button>
                  </form>
                )}
              </li>
            );
          })
        )}
      </ul>

      <ConfirmDeleteModal 
        isOpen={!!codeToDelete}
        onClose={() => setCodeToDelete(null)}
        onConfirm={() => {
          deleteCode(codeToDelete.id);
          setCodeToDelete(null);
        }}
        title={codeToDelete ? `Delete "${codeToDelete.name}"?` : "Delete Code?"}
        warningText="Are you sure you want to delete this code? All highlights associated with it will be permanently removed from your documents."
      />
      {memoModalOpen && (
        <CodeMemoModal
          open={memoModalOpen}
          onClose={() => { setMemoModalOpen(false); setMemoTargetCode(null); setMemoError(null); }}
          onSave={handleSaveMemo}
          codeName={memoTargetCode?.name || ''}
        />
      )}
      {memoError && <div style={{ color: 'red', marginTop: 8 }}>{memoError}</div>}

      {contextMenu && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999, backgroundColor: '#23232a', border: '1px solid #444', borderRadius: '6px', boxShadow: '0 8px 16px rgba(0,0,0,0.5)', padding: '4px', minWidth: '150px' }}
        >
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setAddingSubCodeTo(contextMenu.codeId); 
              setContextMenu(null); 
            }}
            style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#646cff'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Create Sub-Code
          </button>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setMemoTargetCode(contextMenu.codeId); 
              setContextMenu(null); 
              setMemoModalOpen(true);
            }}
            style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#646cff'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Create Code Memo
          </button>
        </div>
      )}

      {pendingDropAction && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            position: 'fixed', 
            top: pendingDropAction.y, 
            left: pendingDropAction.x, 
            zIndex: 9999, 
            backgroundColor: '#23232a', 
            border: '1px solid #444', 
            borderRadius: '6px', 
            boxShadow: '0 8px 16px rgba(0,0,0,0.5)', 
            padding: '4px', 
            minWidth: '180px' 
          }}
        >
          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#888', borderBottom: '1px solid #444', marginBottom: '4px' }}>
            Action for <b>{codes.find(c => c.id === pendingDropAction.sourceId)?.name}</b>:
          </div>

          <button 
            onClick={async (e) => {
              e.stopPropagation();
              const { sourceId, targetCode } = pendingDropAction;
              setPendingDropAction(null);
              await executeReorder(sourceId, targetCode, "inside");
            }}
            style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#4CAF50'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            ↳ Turn into Sub-Code
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              const { sourceId, targetCode } = pendingDropAction;
              const sourceCode = codes.find(c => c.id === sourceId);
              
              setMergeModalConfig({
                source: sourceCode,
                target: targetCode,
                newName: targetCode.name,
                newColor: targetCode.color
              });
              setPendingDropAction(null);
            }}
            style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#646cff'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            🔗 Merge Codes Together
          </button>
        </div>
      )}

      {/* Merge Configuration Modal */}
      {mergeModalConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#242424', padding: '24px', borderRadius: '8px', width: '380px', border: '1px solid #444', color: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Configure Merge</h3>
            
            {/* Direction display and Swap Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a1a', padding: '12px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #333' }}>
              <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: '#aaa', textDecoration: 'line-through' }}>
                {mergeModalConfig.source.name}
              </div>
              
              <button 
                title="Swap Direction"
                onClick={() => {
                  setMergeModalConfig(prev => ({
                    ...prev,
                    source: prev.target,
                    target: prev.source,
                    newName: prev.source.name, 
                    newColor: prev.source.color
                  }));
                }}
                style={{ margin: '0 10px', padding: '6px', backgroundColor: '#333', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                🔄
              </button>

              <div style={{ flex: 1, textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: mergeModalConfig.target.color }}>
                {mergeModalConfig.target.name}
              </div>
            </div>

            {/* Custom Name & Color Inputs */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>Final Code Name:</label>
              <input 
                type="text" 
                value={mergeModalConfig.newName}
                onChange={(e) => setMergeModalConfig(prev => ({ ...prev, newName: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: 'white', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: '#aaa', fontWeight: '500' }}>Final Color:</label>
              
              {/* Circular Color Swatch Wrapper */}
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: mergeModalConfig.newColor, border: '2px solid #555', position: 'relative', overflow: 'hidden', cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }}>
                <input 
                  type="color" 
                  value={mergeModalConfig.newColor}
                  onChange={(e) => setMergeModalConfig(prev => ({ ...prev, newColor: e.target.value }))}
                  style={{ 
                    position: 'absolute', 
                    top: '-10px', 
                    left: '-10px', 
                    width: '52px', 
                    height: '52px', 
                    cursor: 'pointer', 
                    opacity: 0 
                  }}
                />
              </div>
            </div>


            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setMergeModalConfig(null)}
                style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ccc', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                disabled={!mergeModalConfig.newName.trim()}
                onClick={async () => {
                  try {
                    await mergeCodes({
                        source_code_id: mergeModalConfig.source.id,
                        target_code_id: mergeModalConfig.target.id,
                        new_name: mergeModalConfig.newName.trim(),
                        new_color: mergeModalConfig.newColor
                      });

                    setMergeModalConfig(null);
                  } catch(err) {
                    console.error(err);
                  }
                }}
                style={{ padding: '8px 16px', backgroundColor: mergeModalConfig.newName.trim() ? '#646cff' : '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: mergeModalConfig.newName.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
              >
                Confirm Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CodesSidebar;