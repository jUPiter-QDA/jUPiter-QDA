import { useState, useCallback, useEffect, useMemo } from "react";
import { MemosContext } from "./MemosContext";
import { useProject } from "./ProjectContext";
import { useUndo } from "./UndoContext";
import { useWorkspace } from "./WorkspaceContext";
import {
  fetchMemos,
  fetchSegment,
  createMemo as createMemoApi,
  updateMemo as updateMemoApi,
  deleteMemo as deleteMemoApi,
} from "../utils/backend-api";

// Owns the memo list and its mutations. Every mutation refreshes the list
// itself — there is no 'memos-updated' window event anymore. Segment memo
// clicks open the memo's quote through WorkspaceContext, so the document
// keeps all of its segments (the old version clobbered them with just the
// memo'd one).
const MemosProvider = ({ children }) => {
  const { projectId } = useProject();
  const { pushAction } = useUndo();
  const { openDocumentAtQuote } = useWorkspace();

  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshMemos = useCallback((isInitialLoad = false) => {
    if (!projectId) return;
    if (isInitialLoad) setLoading(true);

    fetchMemos(projectId)
      .then((res) => setMemos(res))
      .catch(() => setError("Failed to load memos"))
      .finally(() => {
        if (isInitialLoad) setLoading(false);
      });
  }, [projectId]);

  useEffect(() => {
    refreshMemos(true);
  }, [refreshMemos]);

  const createMemo = useCallback(async (payload) => {
    await createMemoApi(payload);
    refreshMemos(false);
  }, [refreshMemos]);

  const updateMemo = useCallback(async (memoId, text) => {
    try {
      const res = await updateMemoApi(memoId, { text });
      if (!res.ok) throw new Error("Failed to update memo");
      const updatedMemo = await res.json();
      // target_name comes from the list fetch (backend joins it in), not
      // from the update response — preserve it.
      setMemos((prev) => prev.map((m) => (m.id === updatedMemo.id ? { ...updatedMemo, target_name: m.target_name } : m)));
      return true;
    } catch {
      setError("Failed to update memo");
      return false;
    }
  }, []);

  const deleteMemo = useCallback(async (id) => {
    const memoSnapshot = memos.find((m) => m.id === id);
    setMemos((prev) => prev.filter((m) => m.id !== id));

    try {
      await deleteMemoApi(id);
      if (memoSnapshot) {
        pushAction({ type: "delete-memo", memo: memoSnapshot });
      }
    } catch {
      setError("Failed to delete memo");
      refreshMemos(false);
    }
  }, [memos, pushAction, refreshMemos]);

  const openSegmentMemo = useCallback(async (segmentId) => {
    try {
      const segmentData = await fetchSegment(projectId, segmentId);
      await openDocumentAtQuote(segmentData.document_id, segmentId);
    } catch (error) {
      console.error("Failed to load memo document: ", error);
    }
  }, [projectId, openDocumentAtQuote]);

  const value = useMemo(
    () => ({ memos, loading, error, refreshMemos, createMemo, updateMemo, deleteMemo, openSegmentMemo }),
    [memos, loading, error, refreshMemos, createMemo, updateMemo, deleteMemo, openSegmentMemo],
  );

  return <MemosContext.Provider value={value}>{children}</MemosContext.Provider>;
};

export default MemosProvider;