import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import {
  fetchLLMSettings,
  updateLLMSettings,
  testLLMConnection,
} from "../utils/backend-api";
import { DEFAULT_TEMPERATURE } from "../utils/llmDefaults";

function SettingsPage() {
  const { showToast, showToastSticky } = useToast();
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState(null);
  const [temperature, setTemperature] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const loadSettings = () => {
    fetchLLMSettings()
      .then((data) => {
        setApiUrl(data.api_url || "");
        setModel(data.model || "");
        setApiKeySet(Boolean(data.api_key_set));
        setApiKeyMasked(data.api_key_masked || null);
        setTemperature(
          data.temperature === null || data.temperature === undefined
            ? String(DEFAULT_TEMPERATURE)
            : String(data.temperature)
        );
      })
      .catch(() => showToastSticky("Failed to load LLM settings."));
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returns the validated temperature, or null (and toasts) if invalid.
  const parseTemperature = () => {
    const parsed = Number.parseFloat(temperature);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 2) {
      showToastSticky("Temperature must be a number between 0 and 2.");
      return null;
    }
    return parsed;
  };

  const handleSave = async () => {
    if (!apiUrl.trim() || !model.trim()) {
      showToastSticky("API Base URL and Model are required.");
      return;
    }
    const parsedTemperature = parseTemperature();
    if (parsedTemperature === null) return;
    setIsSaving(true);
    showToastSticky("Saving settings...");
    try {
      const res = await updateLLMSettings({
        api_url: apiUrl.trim(),
        model: model.trim(),
        temperature: parsedTemperature,
        // omitted key means "keep the current one" on the backend
        ...(apiKeyInput.trim() !== "" ? { api_key: apiKeyInput.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save settings");
      setApiKeyInput("");
      showToast("Settings saved.", 3000);
      loadSettings();
    } catch (err) {
      showToastSticky(err.message || "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    const parsedTemperature = parseTemperature();
    if (parsedTemperature === null) return;
    setIsTesting(true);
    showToastSticky("Testing connection...");
    try {
      // Test what's currently typed in the form — including an API key that
      // has not been saved yet (blank fields fall back to the saved values).
      const res = await testLLMConnection({
        api_url: apiUrl.trim(),
        model: model.trim(),
        temperature: parsedTemperature,
        ...(apiKeyInput.trim() !== "" ? { api_key: apiKeyInput.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Connection test failed");
      showToast("Connection OK.", 3000);
    } catch (err) {
      showToastSticky(err.message || "Connection test failed.");
    } finally {
      setIsTesting(false);
    }
  };

  const pageStyle = {
    minHeight: "100vh",
    backgroundColor: "#111",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    padding: "30px 40px",
    display: "flex",
    justifyContent: "center",
    boxSizing: "border-box",
  };

  const cardStyle = {
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "24px 28px",
    maxWidth: "560px",
    width: "100%",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px",
    boxSizing: "border-box",
    borderRadius: "4px",
    border: "1px solid #555",
    backgroundColor: "#111",
    color: "white",
  };

  const labelStyle = {
    fontSize: "12px",
    color: "#aaa",
    display: "block",
    marginBottom: "5px",
  };

  const fieldGroupStyle = { marginBottom: "18px" };

  return (
    <div style={pageStyle}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* HEADER */}
        <div style={{ marginBottom: "30px" }}>
          <Link to="/" style={{ color: "#646cff", textDecoration: "none", fontSize: "14px" }}>
            ← Back to Dashboard
          </Link>
          <h1 style={{ margin: "10px 0 0 0", fontSize: "24px", fontWeight: "600" }}>LLM Settings</h1>
          <p style={{ margin: "5px 0 0 0", color: "#888", fontSize: "14px" }}>
            Configure the OpenAI-compatible API used to suggest codes for text excerpts.
          </p>
        </div>

        <div style={cardStyle}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>API Base URL</label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={inputStyle}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              style={inputStyle}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={
                apiKeySet
                  ? `Current: ${apiKeyMasked} (leave blank to keep)`
                  : "No key set (optional for local servers)"
              }
              style={inputStyle}
            />
            <p style={{ margin: "6px 0 0 0", color: "#666", fontSize: "12px" }}>
              Sent as a Bearer token to the API. Optional for local servers (Ollama, LM Studio, ...).
            </p>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder={String(DEFAULT_TEMPERATURE)}
              style={inputStyle}
            />
            <p style={{ margin: "6px 0 0 0", color: "#666", fontSize: "12px" }}>
              Controls the randomness of the AI suggestions. 0 = deterministic, 2 = very creative.
              Default {DEFAULT_TEMPERATURE}.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              onClick={handleTest}
              disabled={isTesting || isSaving}
              style={{
                padding: "10px 16px",
                backgroundColor: "transparent",
                color: "#ccc",
                border: "1px solid #555",
                borderRadius: "6px",
                cursor: isTesting || isSaving ? "default" : "pointer",
                opacity: isTesting || isSaving ? 0.6 : 1,
              }}
            >
              Test Connection
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isTesting}
              style={{
                padding: "10px 20px",
                backgroundColor: "#646cff",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontWeight: "bold",
                cursor: isSaving || isTesting ? "default" : "pointer",
                opacity: isSaving || isTesting ? 0.6 : 1,
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;