import { useState, useEffect } from 'react';

function CreateProjectModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [folderError, setFolderError] = useState("");

  useEffect(() => {
    const fetchDefaultPath = async () => {
      try {
        // Check if the API and the specific function actually exist before calling it
        if (isOpen && window.electronAPI && typeof window.electronAPI.getDefaultPath === 'function' && !localPath) {
          const defaultLocation = await window.electronAPI.getDefaultPath();
          setLocalPath(defaultLocation);
        }
      } catch (err) {
        console.error("Could not fetch default path:", err);
      }
    };
    fetchDefaultPath();
  }, [isOpen]);

  const handleBrowseFolder = async () => {
    try {
      setFolderError("");
      if (window.electronAPI && window.electronAPI.selectFolder) {
        const selectedPath = await window.electronAPI.selectFolder();
        if (selectedPath) {
          setLocalPath(selectedPath);
        }
      } else {
        setFolderError("Electron bridge not found. Make sure you are running the Electron app, not a web browser.");
      }
    } catch (err) {
      console.error("Failed to open folder picker", err);
      setFolderError("Failed to open native folder dialog.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFolderError("");
    if (!name.trim()) return;

    if (!localPath) {
      setFolderError("Please select a local destination folder.");
      return;
    }
    
    try {

      await onCreate({ name, description, local_path: localPath });
      
      setName("");
      setDescription("");
      setLocalPath("");
      setFolderError("");
    } catch (err) {
      // If FastAPI rejected it, catch the error and display it!
      setFolderError(err.message);
    }
  };

  const handleCancel = () => {
    setFolderError("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#242424', padding: '30px', borderRadius: '8px', border: '1px solid #444', width: '450px', color: 'white' }}>
        
        <h2 style={{ marginTop: 0, color: "#fff" }}>Create New Workspace</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa' }}>Project Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: 'white' }} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows="3" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: 'white', resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa' }}>Local Destination Folder</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" readOnly value={localPath} placeholder="Choose a folder..." style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#111', color: '#888' }} />
              <button type="button" onClick={handleBrowseFolder} 
                onMouseOver={(e) => (e.currentTarget.style.borderColor = "#aaa")}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = "#555")} 
                style={{ display: 'flex',alignItems: 'center',justifyContent: 'center',gap: '6px', padding: '0px 16px', backgroundColor: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', cursor: 'pointer', boxSizing:'border-box', transition: 'all 0.2s ease'}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none" style={{ transform: "translateY(-1px)" }}>
                    <path d="M13.2686 14.2686L15 16M12.0627 6.06274L11.9373 5.93726C11.5914 5.59135 11.4184 5.4184 11.2166 5.29472C11.0376 5.18506 10.8425 5.10425 10.6385 5.05526C10.4083 5 10.1637 5 9.67452 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V15.8C3 16.9201 3 17.4802 3.21799 17.908C3.40973 18.2843 3.71569 18.5903 4.09202 18.782C4.51984 19 5.07989 19 6.2 19H17.8C18.9201 19 19.4802 19 19.908 18.782C20.2843 18.5903 20.5903 18.2843 20.782 17.908C21 17.4802 21 16.9201 21 15.8V10.2C21 9.0799 21 8.51984 20.782 8.09202C20.5903 7.71569 20.2843 7.40973 19.908 7.21799C19.4802 7 18.9201 7 17.8 7H14.3255C13.8363 7 13.5917 7 13.3615 6.94474C13.1575 6.89575 12.9624 6.81494 12.7834 6.70528C12.5816 6.5816 12.4086 6.40865 12.0627 6.06274ZM14 12.5C14 13.8807 12.8807 15 11.5 15C10.1193 15 9 13.8807 9 12.5C9 11.1193 10.1193 10 11.5 10C12.8807 10 14 11.1193 14 12.5Z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Browse...
              </button>
            </div>
            {folderError ? (
              <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#ff4444', fontWeight: 'bold' }}>
                ⚠️ {folderError}
              </p>
            ) : (
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
                A new folder named <strong>"{name || 'Your Project'}"</strong> will be created inside this location.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button"
              onClick={handleCancel}
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
              style={{ padding: '10px 15px', backgroundColor: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '4px', cursor: 'pointer',transition: 'all 0.2s ease' }}>
              Cancel
            </button>
            <button type="submit" 
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#7a82ff";
                e.currentTarget.style.borderColor = "#7a82ff";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#646cff";
                e.currentTarget.style.borderColor = "#646cff";
              }}
              style={{ padding: '10px 15px', backgroundColor: '#646cff', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                Create Project
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

export default CreateProjectModal;