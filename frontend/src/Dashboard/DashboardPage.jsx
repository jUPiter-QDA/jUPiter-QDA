import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CreateProjectModal from "./CreateProjectModal";
import ImportProjectModal from "./ImportProjectModal";
import ConfirmDeleteModal from "../Modal/ConfirmDeleteModal";
import { fetchProjects, createProject, deleteProject } from "../utils/backend-api"

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState({ isOpen: false, project: null });
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects().then(data => setProjects(data));
  }, []);

  const handleCreateProject = async (projectData) => {
    
    return createProject(projectData).then(async (res) => {
      if (res.ok) {
        const newProject = await res.json();
        console.log(newProject);
        setIsCreateModalOpen(false);
        navigate(`/project/${newProject.id}`);
      }
      else {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to create project");
      }
    });    
  };

  const triggerDelete = (e, projectObj) => {
    e.stopPropagation(); 
    setDeleteTarget({ isOpen: true, project: projectObj });
  };

  const executeDelete = async () => {
    if (!deleteTarget.project) return;

    return deleteProject(deleteTarget.project.id)
            .then(async (res) => {
              if (res.ok) {
                fetchProjects().then(data => setProjects(data));
              }
              else {
                const errorData = await res.json();
                console.error("Failed to delete project:", errorData);
              }
            });
  };

  const pageStyle = {
    minHeight: "100vh",
    backgroundColor: "#111",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    padding: "30px 40px",
    display: "flex",
    justifyContent: "center",
    boxSizing: "border-box" 
  };

  const containerStyle = {
    width: "100%",
  };

  const horizontalCardStyle = {
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "20px 24px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    flexDirection: "row", 
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px"
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        
        {/* HEADER SECTION */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "20px", marginBottom: "30px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "600", color: "#fff" }}>jUPiter QDA</h1>
            <p style={{ margin: "5px 0 0 0", color: "#888", fontSize: "15px" }}>Qualitative Data Analysis Workspace</p>
          </div>
          
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => navigate("/settings")}
              style={{ padding: "10px 16px", backgroundColor: "transparent", color: "#ccc", border: "1px solid #444", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }}
              onMouseOver={(e) => e.target.style.backgroundColor = "#222"}
              onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            >
              Settings
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              style={{ padding: "10px 16px", backgroundColor: "transparent", color: "#ccc", border: "1px solid #444", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }}
              onMouseOver={(e) => e.target.style.backgroundColor = "#222"}
              onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            >
              Import Project
            </button>
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              style={{ padding: "10px 20px", backgroundColor: "transparent", color: "#ccc", border: "1px solid #444", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", transition: "background 0.2s" }}
              onMouseOver={(e) => e.target.style.backgroundColor = "#222"}
              onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            >
              Create Project
            </button>
          </div>
        </div>

        {/* PROJECTS LIST */}
        <div>
          <h2 style={{ fontSize: "20px", marginBottom: "20px", color: "#ccc" }}>Recent Projects</h2>
          
          {projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", backgroundColor: "#1a1a1a", borderRadius: "8px", border: "1px dashed #444", color: "#666" }}>
              <p>No projects found. Create or import one to get started!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {projects.map((project) => (
                <div 
                  key={project.id} 
                  onClick={() => navigate(`/project/${project.id}`)}
                  style={horizontalCardStyle}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = "#646cff"}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = "#333"}
                >
                  
                  <div style={{ flex: 1, minWidth: 0, paddingRight: "20px",textAlign: "left" }}>
                    <h3 style={{ margin: "0 0 6px 0", fontSize: "18px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {project.name}
                    </h3>
                    <p style={{ margin: 0, fontSize: "14px", color: "#aaa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {project.description || "No description provided."}
                    </p>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "30px", flexShrink: 0 }}>
                    <div style={{ display: "flex", gap: "20px" }}>
                      
                      <span style={{ fontSize: "14px", color: "#888", display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none">
                          <path d="M12 7V12H15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {project.last_accessed ? new Date(project.last_accessed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "New"}
                      </span>

                      <span style={{ fontSize: "14px", color: "#888", display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13px" height="13px" viewBox="0 0 16 16" fill="none">
                          <path d="M7 0H2V16H14V7H7V0Z" fill="#aaa"/>
                          <path d="M9 0V5H14L9 0Z" fill="#aaa"/>
                      </svg>
                        {project.document_count || 0} Docs
                      </span>
                      <span style={{ fontSize: "14px", color: "#888", display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none">
                            <path d="M7.0498 7.0498H7.0598M10.5118 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V10.5118C3 11.2455 3 11.6124 3.08289 11.9577C3.15638 12.2638 3.27759 12.5564 3.44208 12.8249C3.6276 13.1276 3.88703 13.387 4.40589 13.9059L9.10589 18.6059C10.2939 19.7939 10.888 20.388 11.5729 20.6105C12.1755 20.8063 12.8245 20.8063 13.4271 20.6105C14.112 20.388 14.7061 19.7939 15.8941 18.6059L18.6059 15.8941C19.7939 14.7061 20.388 14.112 20.6105 13.4271C20.8063 12.8245 20.8063 12.1755 20.6105 11.5729C20.388 10.888 19.7939 10.2939 18.6059 9.10589L13.9059 4.40589C13.387 3.88703 13.1276 3.6276 12.8249 3.44208C12.5564 3.27759 12.2638 3.15638 11.9577 3.08289C11.6124 3 11.2455 3 10.5118 3ZM7.5498 7.0498C7.5498 7.32595 7.32595 7.5498 7.0498 7.5498C6.77366 7.5498 6.5498 7.32595 6.5498 7.0498C6.5498 6.77366 6.77366 6.5498 7.0498 6.5498C7.32595 6.5498 7.5498 6.77366 7.5498 7.0498Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {project.code_count || 0} Codes
                      </span>
                    </div>

                    <button 
                      onClick={(e) => triggerDelete(e, project)}
                      style={{ 
                        backgroundColor: "transparent", border: "none", color: "#666", 
                        cursor: "pointer", padding: "8px", borderRadius: "4px", 
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s ease"
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.color = "#ff6b6b"; e.currentTarget.style.backgroundColor = "rgba(255,107,107,0.1)"; }}
                      onMouseOut={(e) => { e.currentTarget.style.color = "#666"; e.currentTarget.style.backgroundColor = "transparent"; }}
                      title="Delete Project"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <CreateProjectModal 
          isOpen={isCreateModalOpen} 
          onClose={() => setIsCreateModalOpen(false)} 
          onCreate={handleCreateProject} 
        />

        <ImportProjectModal 
          isOpen={isImportModalOpen} 
          onClose={() => setIsImportModalOpen(false)} 
          onImportSuccess={(newProjectId) => {
            setIsImportModalOpen(false);
            navigate(`/project/${newProjectId}`);
          }}
        />

        <ConfirmDeleteModal 
          isOpen={deleteTarget.isOpen}
          onClose={() => setDeleteTarget({ isOpen: false, project: null })}
          onConfirm={executeDelete}
          title={deleteTarget.project ? `Delete "${deleteTarget.project.name}"?` : "Delete Project?"}
          warningText="Are you sure you want to delete this project? All associated documents, transcripts, and highlighted codes will be permanently destroyed."
        />

      </div>
    </div>
  );
}

export default Dashboard;