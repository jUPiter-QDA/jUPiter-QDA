import { useParams } from "react-router-dom";
import ProjectPageView from "./ProjectPageView";
import ProjectProviders from "../context/ProjectProviders";

// Route component: mounts the project-scoped providers keyed by project id so
// switching projects remounts everything (providers + workspace state) clean.
// ProjectPageView, mounted inside the providers, is the whole workspace.
function ProjectPage() {
  const { id } = useParams();
  return (
    <ProjectProviders key={id} projectId={id}>
      <ProjectPageView />
    </ProjectProviders>
  );
}

export default ProjectPage;