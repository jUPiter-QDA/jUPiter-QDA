// The packaged app picks the backend port at runtime (Electron passes it via
// preload). Outside Electron (plain browser / vite dev server) it stays 8000.
const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
const rawPort = electronAPI && typeof electronAPI.getBackendPort === 'function'
  ? electronAPI.getBackendPort() : 8000;
const backendPort = Number.isInteger(rawPort) ? rawPort : 8000;
const API_BASE = `http://127.0.0.1:${backendPort}`;

export async function fetchProjects() {
    try {
      const res = await fetch(`${API_BASE}/projects`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
 
        const sortedData = data.sort((a, b) => {
          if (a.last_accessed && b.last_accessed) {
            return new Date(b.last_accessed) - new Date(a.last_accessed);
          }
          return b.id - a.id; // Fallback if no date exists
        });
        
        return sortedData;
      }
    } catch (err) {
      throw new Error("Failed to fetch projects:", err);
    }
};

export async function createProject(projectData) {
    return await fetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData),
    });
};

export async function updateProjectDetails(projectId, projectSettingsData) {
    return await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectSettingsData),
      });
}

export async function importProjectFromRefi(formData) {
  return await fetch(`${API_BASE}/projects/import/refi`, {
        method: 'POST',
        body: formData,
      });
}

export async function deleteProject(projectId) {
    return await fetch(`${API_BASE}/projects/${projectId}`, { method: "DELETE" });
};

export async function fetchProjectDetails (projectId) {
  return await fetch(`${API_BASE}/projects/${projectId}`)
    .then((res) => res.json());
};

export async function exportProjectToRefi(projectId) {
  return await fetch(`${API_BASE}/projects/${projectId}/export/refi`);
}

export async function exportProjectToDocx(projectId) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes/export/docx`);
}

export async function exportProjectSegmentsToCsv(projectId) {
  return await fetch(`${API_BASE}/projects/${projectId}/segments/export/csv`);
}

export async function buildUrlToExportExcel(projectId, selectedDocIds, selectedCodeIds) {
  let url = `${API_BASE}/projects/${projectId}/export/excel`;

  // Append the filters to the URL as query parameters
  const params = new URLSearchParams();
  if (selectedDocIds.length > 0) params.append("docs", selectedDocIds.join(","));
  if (selectedCodeIds.length > 0) params.append("codes", selectedCodeIds.join(","));

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  return url;
}

export async function fetchDocuments (projectId) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/`)
    .then((res) => res.json());
};

export async function fetchDocument(projectId, docId) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/${docId}`)
      .then((res) => res.json())
}

export async function updateDocumentsOrder(projectId, documentsOrderData) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentsOrderData),
      });
}

export async function createDocument(projectId, documentData) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/create`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(documentData),
        });
}

export async function uploadDocument(projectId, textFormData) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/`, { method: "POST", body: textFormData });
}

export async function renameDocument(projectId, docId, filename) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/${docId}/rename`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      },
    )
}

export async function updateDocumentMetadata(projectId, documentId, metadata) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/${documentId}/metadata`, {
             method: 'PUT', 
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(metadata),
           });
}

export async function updateDocumentContent(projectId, documentId, content) {
  return await fetch(`${API_BASE}/projects/${projectId}/documents/${documentId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
}

export async function moveDocument(projectId, documentId, folderId){
  const moveUrl = new URL(`${API_BASE}/projects/${projectId}/documents/${documentId}/move`);
      if (folderId !== null && folderId !== undefined) {
        moveUrl.searchParams.set('folder_id', String(folderId));
      }
  return await fetch(moveUrl.toString(), { method: 'PUT' });
}


export async function deleteDocument(projectId, documentId) {
  return await fetch(
        `${API_BASE}/projects/${projectId}/documents/${documentId}`,
        { method: "DELETE" },
      );
}

export function buildPdfPreviewUrl(projectId, documentId) {
  let url = `${API_BASE}/projects/${projectId}/documents/${documentId}/file`;
  return url;
}

export async function search(projectId, searchQuery) {
  return await fetch(`${API_BASE}/projects/${projectId}/search?query=${searchQuery}`);
}

export async function fetchFolders(projectId) {
  return fetch(`${API_BASE}/projects/${projectId}/folders`)
      .then(res => res.json());
}

export async function createFolder(projectId, folderData) {
  return await fetch(`${API_BASE}/projects/${projectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folderData)
      });
}

export async function renameFolder(projectId, folderId, renameFolderData) {
  return await fetch(`${API_BASE}/projects/${projectId}/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renameFolderData)
      });
}

export async function moveFolder(projectId, folderId, moveFolderData) {
  return await fetch(`${API_BASE}/projects/${projectId}/folders/${folderId}/move`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(moveFolderData)
          });
}

export async function reorderFolders(projectId, foldersReorderData) {
  return await fetch(`${API_BASE}/projects/${projectId}/folders/reorder`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(foldersReorderData)
          });
}

export async function deleteFolder(projectId, folderId) {
  return await fetch(`${API_BASE}/projects/${projectId}/folders/${folderId}`, { method: 'DELETE' });
}

export async function fetchCodes (projectId) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes`)
    .then((res) => res.json());
};

export async function createCode(projectId, codeData) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(codeData)
  });
}

export async function mergeCodes(projectId, codeMergeData) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes/merge`, {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify(codeMergeData)
                    });
}

export async function updateCode(projectId, codeId, codeData) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes/${codeId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(codeData),
        });
}

export async function updateCodesOrder(projectId, codesOrderData) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes/reorder`, {
            method: "PUT", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(codesOrderData),
          });
}

export async function deleteCode(projectId, codeId) {
  return await fetch(`${API_BASE}/projects/${projectId}/codes/${codeId}`, { method: "DELETE" });
}

export async function fetchSegment(projectId, segmentId) {
  return await fetch(`${API_BASE}/projects/${projectId}/segments/${segmentId}`)
              .then((res) => res.json());
}

export async function fetchSegmentsForDocument(projectId, documentId) {
  return await fetch(`${API_BASE}/projects/${projectId}/segments?document_id=${documentId}`)
              .then((res) => res.json());
}

export async function createSegmentWithCode(projectId, segmentWithCodeData) {
  return await fetch(`${API_BASE}/projects/${projectId}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(segmentWithCodeData),
  });
}

export async function updateSegment(projectId, segmentId, segmentData) {
  return await fetch(`${API_BASE}/projects/${projectId}/segments/${segmentId}`, {
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(segmentData)
          });
}

export async function deleteSegment(projectId, segmentId) {
  return await fetch(`${API_BASE}/projects/${projectId}/segments/${segmentId}`, { method: "DELETE" })
}

export async function fetchMemos(projectId) {
  const memosRes = await fetch(`${API_BASE}/projects/${projectId}/memos`);
  return await memosRes.ok ? await memosRes.json() : [];
}

export async function createMemoForSegment(segmentId, memoText) {
  return await fetch(`${API_BASE}/memos`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: memoText, target_type: "segment", target_id: segmentId }),
      });
}

export async function createMemo(memoData) {
  return await fetch(`${API_BASE}/memos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memoData),
    });
}

export async function updateMemo(memoId, updateMemoData) {
  return await fetch(`${API_BASE}/memos/${memoId}`, {
                     method: "PUT",
                     headers: { "Content-Type": "application/json" },
                     body: JSON.stringify(updateMemoData)});
}

export async function deleteMemo(memoId) {
  return await fetch(`${API_BASE}/memos/${memoId}`, { method: "DELETE" });
}

export async function transcribeAudio(projectId, selectedLanguage, audioFormData) {
  const url = `${API_BASE}/projects/${projectId}/audio/transcribe?language=${selectedLanguage}`;
  const res = await fetch(url, {
    method: "POST",
    body: audioFormData,
  });
  return res;
}

export function normalizeMetadata (doc) {
  if (!doc || !doc.metadata || typeof doc.metadata !== "object") {
    return {};
  }
  return doc.metadata;
};