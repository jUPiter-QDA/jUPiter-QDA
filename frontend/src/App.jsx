import { HashRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './Dashboard/DashboardPage';
import ProjectPage from './Project/ProjectPage';
import ToastProvider from './context/ToastProvider';

function App() {
  return (
    <ToastProvider>
    <HashRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </HashRouter>
    </ToastProvider>
  );
}

export default App;