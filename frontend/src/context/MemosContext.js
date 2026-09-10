import { createContext, useContext } from "react";

export const MemosContext = createContext(null);

export const useMemos = () => {
  const ctx = useContext(MemosContext);
  if (!ctx) throw new Error("useMemos must be used within a MemosProvider");
  return ctx;
};