import { useState, useCallback, useMemo, useRef } from "react";
import { ToastContext } from "./ToastContext";

const ToastProvider = ({ children }) => {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    isActive: false,
  });

  const timeoutRef = useRef(null);

  const showToast = useCallback((message, timeoutMs = 4000) => {
    setStatus(message);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (message && timeoutMs > 0) {
      timeoutRef.current = setTimeout(() => setStatus(""), timeoutMs);
    }
  }, []);

  // showToast with no auto-clear (message stays until replaced/cleared)
  const showToastSticky = useCallback((message) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus(message);
  }, []);

  const value = useMemo(
    () => ({ status, progress, setStatus, setProgress, showToast, showToastSticky }),
    [status, progress, setStatus, setProgress, showToast, showToastSticky],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export default ToastProvider;