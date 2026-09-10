import { useEffect } from "react";
import { useProject } from "../context/ProjectContext";
import { useUndo } from "../context/UndoContext";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useMemos } from "../context/MemosContext";
import {
  deleteSegment,
  createSegmentWithCode,
  deleteCode,
  createCode,
  updateCode,
  updateCodesOrder,
  createDocument,
  updateDocumentMetadata,
} from "../utils/backend-api";

const UNDO_MAX_AGE_MS = 300000; // 5 minutes

// Compensates a single popped action against the raw backend API. Stack
// bookkeeping (empty check, expiry check, pop) is in the keydown listener
// below.
const useCompensationExecutor = () => {
  const { projectId } = useProject();
  const { showToast, showToastSticky } = useToast();
  const {
    refreshCodes,
    refreshDocuments,
    refreshSegmentsForDocument,
    setCodePanelRefreshTick,
  } = useWorkspace();
  const { createMemo } = useMemos();

  return async (lastAction) => {
    showToastSticky("Undoing last action...");

    try {
      if (lastAction.type === "create-segment" || lastAction.type === "create-quick-code") {
        for (const segment of lastAction.segments || []) {
          await deleteSegment(projectId, segment.id);
        }
        if (lastAction.segments?.length > 0) await refreshSegmentsForDocument(lastAction.segments[0].document_id);
        if (lastAction.type === "create-quick-code" && lastAction.code?.id) {
          await deleteCode(projectId, lastAction.code.id);
        }
        refreshCodes();
        setCodePanelRefreshTick((tick) => tick + 1);

      } else if (lastAction.type === "delete-segment") {
        const segment = lastAction.segment;
        await createSegmentWithCode(projectId, {
            document_id: segment.document_id,
            code_id: segment.code_id,
            start_char: segment.start_char,
            end_char: segment.end_char,
            content: segment.content,
          });
        await refreshSegmentsForDocument(segment.document_id);
        refreshCodes();
        setCodePanelRefreshTick((tick) => tick + 1);

      } else if (lastAction.type === "delete-code") {
        const restoredCodeIds = new Map();
        const orderedCodes = [...(lastAction.codes || [])].sort((a, b) => (a._undoDepth ?? 0) - (b._undoDepth ?? 0));

        for (const code of orderedCodes) {
          const restoredParentId = code.parent_id && restoredCodeIds.has(Number(code.parent_id)) ? restoredCodeIds.get(Number(code.parent_id)) : code.parent_id;
          const restoreResponse = await createCode(projectId, { name: code.name,
                                                         color: code.color,
                                                         parent_id: restoredParentId });
          const restoredCode = await restoreResponse.json();
          restoredCodeIds.set(Number(code.id), restoredCode.id);
        }

        if (lastAction.codes?.length > 0) {
          const reorderPayload = orderedCodes.map((code, index) => ({
            id: restoredCodeIds.get(Number(code.id)),
            parent_id: code.parent_id && restoredCodeIds.has(Number(code.parent_id)) ? restoredCodeIds.get(Number(code.parent_id)) : code.parent_id,
            order_index: code.order_index ?? index,
          })).filter((item) => item.id);
          updateCodesOrder(projectId, { codes: reorderPayload });
        }

        for (const segment of lastAction.segments || []) {
          const restoredCodeId = restoredCodeIds.get(Number(segment.code_id)) || segment.code_id;
          await createSegmentWithCode(projectId, {
              document_id: segment.document_id,
              code_id: restoredCodeId,
              start_char: segment.start_char,
              end_char: segment.end_char,
              content: segment.content,
            });
          await refreshSegmentsForDocument(segment.document_id);
        }

        for (const memo of lastAction.memos || []) {
          const restoredCodeId = restoredCodeIds.get(Number(memo.target_id)) || memo.target_id;
          await createMemo({ text: memo.text, target_type: "code", target_id: restoredCodeId });
        }
        refreshCodes();
        setCodePanelRefreshTick((tick) => tick + 1);

      } else if (lastAction.type === "edit-code") {
        updateCode(projectId, lastAction.codeId, lastAction.previousState);
        refreshCodes();

      } else if (lastAction.type === "reorder-codes") {
        updateCodesOrder(projectId, { codes: lastAction.previousState });
        refreshCodes();

      } else if (lastAction.type === "delete-document") {
        const doc = lastAction.document;
        const docRes = await createDocument(projectId,
          { name: doc.filename, content: doc.content || "Restored content..." });
        const restoredDoc = await docRes.json();

        if (doc.metadata && Object.keys(doc.metadata).length > 0) {
           updateDocumentMetadata(projectId, restoredDoc.id, { metadata: doc.metadata })
        }

        for (const segment of lastAction.segments || []) {
          await createSegmentWithCode(projectId, {
              document_id: restoredDoc.id,
              code_id: segment.code_id,
              start_char: segment.start_char,
              end_char: segment.end_char,
              content: segment.content
          });
        }
        refreshDocuments();
      } else if (lastAction.type === "delete-memo") {
        const memo = lastAction.memo;
        await createMemo({
            text: memo.text,
            target_type: memo.target_type,
            target_id: memo.target_id
          });

      } else if (lastAction.type === "edit-metadata") {
        updateDocumentMetadata(projectId,
                               lastAction.documentId,
                               { metadata: lastAction.previousMetadata });
        // This will instantly update the sidebar and active document!
        refreshDocuments();
      }

      showToast("Undo complete.", 2500);
    } catch (error) {
      console.error(error);
      showToastSticky("Undo failed.");
    }
  };
};

// Wires Ctrl/Cmd+Z to the undo stack.
const useUndoController = () => {
  const { undoStack, popAction, clearStack } = useUndo();
  const { showToast } = useToast();
  const executor = useCompensationExecutor();

  useEffect(() => {
    const handleKeyDown = async (e) => {
      const isUndoShortcut = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndoShortcut) return;

      const target = e.target;
      const isEditableTarget = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );

      if (isEditableTarget) return;

      e.preventDefault();

      if (undoStack.length === 0) {
        showToast("Nothing to undo.", 2000);
        return;
      }

      const [lastAction] = undoStack;
      if (Date.now() - lastAction.timestamp > UNDO_MAX_AGE_MS) {
        showToast("Action is too old to undo (over 5 minutes).", 4000);
        clearStack();
        return;
      }

      popAction();
      await executor(lastAction);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, popAction, clearStack, executor, showToast]);
};

export default useUndoController;