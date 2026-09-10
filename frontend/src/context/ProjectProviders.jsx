import ProjectProvider from "./ProjectProvider";
import UndoProvider from "./UndoProvider";
import WorkspaceProvider from "./WorkspaceProvider";
import MemosProvider from "./MemosProvider";

// Composition root for all project-scoped providers. ProjectPage mounts this
// with key={projectId} so switching projects remounts the whole subtree and
// every context starts from a clean state.
const ProjectProviders = ({ projectId, children }) => (
  <ProjectProvider projectId={projectId}>
    <UndoProvider>
      <WorkspaceProvider>
        <MemosProvider>{children}</MemosProvider>
      </WorkspaceProvider>
    </UndoProvider>
  </ProjectProvider>
);

export default ProjectProviders;