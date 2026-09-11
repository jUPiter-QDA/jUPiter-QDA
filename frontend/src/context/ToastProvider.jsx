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

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The one place the toast status is rendered, so every page shows it. */}
      {status && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            backgroundColor: "#23232a",
            border: "1px solid #444",
            borderRadius: "10px",
            padding: "10px 18px",
            color: "#fff",
            fontSize: "14px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            maxWidth: "90vw",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {status}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;