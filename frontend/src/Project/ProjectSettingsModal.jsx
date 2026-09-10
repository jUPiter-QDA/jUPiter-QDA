import { useState } from 'react';
import ConfirmDeleteModal from "../Modal/ConfirmDeleteModal";

function ProjectSettingsModal({ isOpen, onClose, currentName, currentDescription, currentLocalPath, onSave, onDelete }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Whenever the modal opens, pre-fill the text boxes with the current data
  // (adjusting state during render on a prop transition — the React-recommended
  // alternative to an effect).
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setName(currentName || "");
      setDescription(currentDescription || "");
      setShowConfirmDelete(false);
    }
  }

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) {
      alert("Project name cannot be empty.");
      return;
    }
    onSave(name, description);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#242424', padding: '30px', borderRadius: '8px', border: '1px solid #444', width: '400px', color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
        
        <h3 style={{ marginTop: 0 }}> Project Settings</h3>
        
        <div style={{ marginTop: '20px', marginBottom: '15px' }}>
          <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '5px' }}>Project Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            autoFocus
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: 'white' }} 
          />
        </div>

        <div style={{ marginBottom: '25px' }}>
          <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '5px' }}>Description</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            rows="4" 
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: 'white', resize: 'vertical' }} 
          />
        </div>

        <div style={{ marginBottom: '25px', padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '4px', border: '1px dashed #444' }}>
          <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '5px' }}>Permanent Local Path</label>
          <div style={{ display:'flex',alignItems:'center',fontSize: '13px', color: '#aaa', wordBreak: 'break-all', gap: '6px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M0 1H5L8 3H13V5H3.7457L2.03141 11H4.11144L5.2543 7H16L14 14H0V1Z" fill="#ccc"/>
            </svg> 
            {currentLocalPath || "Stored in database only"}
          </div>
          <p style={{ fontSize: '11px', color: '#666', marginTop: '5px', marginBottom: 0 }}>
            Changing the project name above will not change the folder name on your hard drive to prevent data loss.
          </p>
        </div>

        {/* BOTTOM BUTTON ROW */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          <button 
            onClick={() => setShowConfirmDelete(true)}
            style={{ padding: '10px 15px', backgroundColor: 'transparent', border: '1px solid #ff6b6b', color: '#ff6b6b', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255, 107, 107, 0.1)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Delete Project
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={onClose} 
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.borderColor = "#aaa";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "#666";
                e.currentTarget.style.color = "#ccc";
              }}
              style={{ padding: '10px 15px', backgroundColor: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s ease' }}
            >
              Cancel
            </button>
            <button 
              onClick={handleSave} 
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#5cd661"; // Brighter green on hover
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#4CAF50"; // Standard green
              }}
              style={{ padding: '10px 15px', backgroundColor: '#4CAF50', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s ease' }}
            >
              Save Changes
            </button>
          </div>

        </div>
        <ConfirmDeleteModal 
            isOpen={showConfirmDelete}
            onClose={() => setShowConfirmDelete(false)}
            onConfirm={() => {
              setShowConfirmDelete(false);
              onDelete();
            }}
            title={currentName ? `Delete "${currentName}"?` : "Delete Project?"}
            warningText="Are you sure you want to delete this project? All associated documents, transcripts, and highlighted codes will be permanently destroyed."
          />
      </div>
    </div>
  );
}

export default ProjectSettingsModal;