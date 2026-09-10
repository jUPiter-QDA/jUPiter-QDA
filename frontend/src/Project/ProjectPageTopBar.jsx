import { Link } from "react-router-dom";
import SearchBar from "./SearchBar";

const ProjectPageTopBar = ({ projectDetails, handleExportREFI, setIsSettingsOpen, setIsExportModalOpen, projectId, onSearchResultClick }) => {

  const baseButtonStyle = {
    padding: "8px 14px",
    backgroundColor: "#1a1a24",
    color: "#d1d1d1",
    border: "1px solid #333",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "500",
    fontSize: "13px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s ease"
  };

  return (
      <div
        style={{
          padding: "24px 16px",
          backgroundColor: "#111",
          borderBottom: "1px solid #333",
          marginBottom: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "12px", 
        }}
      >
       <div style={{ alignSelf: "flex-start" }}>
        <Link 
          to="/" 
          style={{ 
            padding: "4px 7px", 
            backgroundColor: "transparent", 
            color: "#ccc", 
            border: "1px solid #444", 
            borderRadius: "6px", 
            cursor: "pointer", 
            transition: "all 0.2s",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            fontSize: "13px",
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#222"}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          ← Back to Dashboard
        </Link>
      </div>
      

     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%"}}>

        <h2 style={{ margin: 0, fontSize: "22px", color: "#fff" }}>
          Project: {projectDetails.name}
        </h2>
        
        <SearchBar
          projectId={projectId}
          onResultClick={onSearchResultClick}
        />
        
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button 
              onClick={() => setIsExportModalOpen(true)}
              style={{ ...baseButtonStyle, border: "1px solid #2d4a22", color: "#81c784" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1b2e1b")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1a1a24")}
          >
             <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16px" 
              height="16px" 
              viewBox="0 0 24 24" 
              className="icon line"
              style={{ flexShrink: 0 }}
            >
              <polyline points="17 3 21 3 21 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <path d="M19,13.89V20a1,1,0,0,1-1,1H4a1,1,0,0,1-1-1V6A1,1,0,0,1,4,5h6.11" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <line x1="11" y1="13" x2="21" y2="3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            Export Statistics
          </button>
          <button
            onClick={handleExportREFI}
            style={{ ...baseButtonStyle, border: "1px solid #2b2b40", color: "#8ea0ff" }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#242438")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1a1a24")}
            title="Export as REFI-QDA XML"
          >
           <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16px" 
              height="16px" 
              viewBox="0 0 24 24" 
              className="icon line"
              style={{ flexShrink: 0 }}
            >
              <polyline points="17 3 21 3 21 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <path d="M19,13.89V20a1,1,0,0,1-1,1H4a1,1,0,0,1-1-1V6A1,1,0,0,1,4,5h6.11" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <line x1="11" y1="13" x2="21" y2="3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            Export REFI XML
          </button>
          <div style={{ width: "1px", height: "24px", backgroundColor: "#444", margin: "0 4px" }}></div>

          {/* Settings (Grey Tint) */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              style={baseButtonStyle}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#2a2a35")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1a1a24")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Settings
            </button>
            </div>
        </div>
    </div>
  );
};

export default ProjectPageTopBar;