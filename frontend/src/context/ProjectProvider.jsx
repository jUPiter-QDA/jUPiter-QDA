import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ProjectContext } from "./ProjectContext";
import { fetchProjectDetails, updateProjectDetails, deleteProject } from "../utils/backend-api";

const DEFAULT_DETAILS = { name: "", description: "", localPath: "", llmSystemPrompt: "", llmUserPrompt: "" };

const ProjectProvider = ({ projectId, children }) => {
  const navigate = useNavigate();
  const [projectDetails, setProjectDetails] = useState(DEFAULT_DETAILS);

  useEffect(() => {
    fetchProjectDetails(projectId).then((data) => {
      if (data.name) {
        setProjectDetails({
          name: data.name,
          description: data.description || "",
          localPath: data.local_path || "",
          llmSystemPrompt: data.llm_system_prompt || "",
          llmUserPrompt: data.llm_user_prompt || "",
        });
      }
    })
    .catch((err) => console.error(err));
  }, [projectId]);

  const saveProjectDetails = useCallback(async (newName, newDescription, llmSystemPrompt, llmUserPrompt) => {
    try {
      const res = await updateProjectDetails(projectId, {
        name: newName,
        description: newDescription,
        llm_system_prompt: llmSystemPrompt,
        llm_user_prompt: llmUserPrompt,
      });

      if (res.ok) {
        setProjectDetails({
          name: newName,
          description: newDescription,
          llmSystemPrompt,
          llmUserPrompt,
        }); // Update the UI instantly
        return true;
      }
      alert("Failed to update project settings.");
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  }, [projectId]);

  const deleteProjectAndNavigate = useCallback(async () => {
    try {
      const response = await deleteProject(projectId);
      if (response.ok) {
        navigate('/');
      } else {
        alert("Failed to delete project.");
      }
    } catch (err) {
      console.error(err);
      alert("Server error during project deletion.");
    }
  }, [projectId, navigate]);

  const value = useMemo(
    () => ({ projectId, projectDetails, saveProjectDetails, deleteProjectAndNavigate }),
    [projectId, projectDetails, saveProjectDetails, deleteProjectAndNavigate],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export default ProjectProvider;