import { createContext, useContext } from "react";

export const UndoContext = createContext(null);

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    throw new Error("useUndo must be used within UndoProvider");
  }
  return ctx;
}