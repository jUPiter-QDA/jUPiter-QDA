import { useState, useCallback, useMemo } from "react";
import { UndoContext } from "./UndoContext";

// Dumb stack: it knows nothing about how actions are compensated.
// The executor (compensation logic) lives in hooks/useUndoController.js.
const UndoProvider = ({ children }) => {
  const [undoStack, setUndoStack] = useState([]);

  const pushAction = useCallback((action) => {
    setUndoStack((prev) => [{ ...action, timestamp: Date.now() }, ...prev].slice(0, 20));
  }, []);

  const popAction = useCallback(() => {
    setUndoStack((prev) => prev.slice(1));
  }, []);

  const clearStack = useCallback(() => {
    setUndoStack([]);
  }, []);

  const value = useMemo(
    () => ({ undoStack, pushAction, popAction, clearStack }),
    [undoStack, pushAction, popAction, clearStack],
  );

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

export default UndoProvider;