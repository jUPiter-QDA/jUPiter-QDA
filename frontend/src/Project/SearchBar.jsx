import { useState, useRef } from "react";
import { search } from "../utils/backend-api";

const SearchBar = ({ projectId, onResultClick }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchInputRef = useRef(null);
  
  // Track the absolute latest query to prevent race conditions
  const latestQuery = useRef(""); 

  const highlightText = (text, highlight, matchOffset, queryLength) => {
    if (!highlight.trim()) {
      return text;
    }
    
    if (matchOffset !== undefined && queryLength !== undefined) {
      const before = text.slice(0, matchOffset);
      const matched = text.slice(matchOffset, matchOffset + queryLength);
      const after = text.slice(matchOffset + queryLength);
      
      return (
        <>
          {before}
          <mark
            style={{
              backgroundColor: "#ffd54f",
              borderRadius: "3px",
              fontWeight: "normal",
            }}
          >
            {matched}
          </mark>
          {after}
        </>
      );
    }
    
    const lowerText = text.toLowerCase();
    const lowerHighlight = highlight.toLowerCase();
    const index = lowerText.indexOf(lowerHighlight);
    
    if (index === -1) {
      return text;
    }
    
    const before = text.slice(0, index);
    const matched = text.slice(index, index + highlight.length);
    const after = text.slice(index + highlight.length);
    
    return (
      <>
        {before}
        <mark
          style={{
            backgroundColor: "#ffd54f",
            fontWeight: "normal",
          }}
        >
          {matched}
        </mark>
        {after}
      </>
    );
  };

  const handleSearch = async (e) => {
    const searchQuery = e.target.value;
    setQuery(searchQuery);
    
    // Update our tracker with the exact keystroke
    latestQuery.current = searchQuery; 

    // If the box is empty, clear everything and instantly stop loading
    if (searchQuery.trim().length === 0) {
      setResults([]);
      setShowResults(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await search(projectId, encodeURIComponent(searchQuery));
      if (response.ok) {
        const rawData = await response.json();
        
        // This removes results that have the exact same document_id AND start_char
        const uniqueData = rawData.filter((item, index, self) =>
          index === self.findIndex((t) => (
            t.document_id === item.document_id && 
            t.start_char === item.start_char
          ))
        );
        
        // ONLY update the UI if the user hasn't typed something else in the meantime!
        if (latestQuery.current === searchQuery) {
          setResults(uniqueData);
          setShowResults(true);
        }
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      // Only stop the loading spinner if this is still the active query
      if (latestQuery.current === searchQuery) {
        setIsLoading(false);
      }
    }
  };

  const handleResultClick = (result) => {
    if (onResultClick) {
      onResultClick(result);
    }
    setShowResults(false);
    setQuery("");
    setResults([]);
    latestQuery.current = ""; // Reset tracker
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    latestQuery.current = ""; // Reset tracker

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  return (
    <div style={{ position: "relative", width: "300px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search documents..."
            value={query}
            onChange={handleSearch}
            onFocus={() => query && setShowResults(true)}
            style={{
              width: "100%",
              padding: "8px 12px",
              backgroundColor: "#1a1a24",
              color: "#d1d1d1",
              border: "1px solid #333",
              borderRadius: "6px",
              fontSize: "13px",
              boxSizing: "border-box",
            }}
          />
          {query && (
            <button
              onClick={handleClear}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                fontSize: "16px",
                padding: "0 4px",
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {isLoading && (
          <div
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid #333",
              borderTop: "2px solid #666",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
            }}
          />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            width: "600px",
            backgroundColor: "#1a1a24",
            border: "1px solid #333",
            borderRadius: "6px",
            maxHeight: "450px",
            overflowY: "auto",
            zIndex: 1000,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
          }}
        >
          {results.map((result, idx) => (
            <div
              key={idx}
              onClick={() => handleResultClick(result)}
              style={{
                padding: "14px 16px",
                borderBottom: idx < results.length - 1 ? "1px solid #282836" : "none",
                cursor: "pointer",
                transition: "background-color 0.15s dynamic",
                backgroundColor: "#1a1a24",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#222230")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1a1a24")}
            >
              <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px", fontWeight: "500" }}>
                📄 {result.document_filename}
              </div>
              
              <div
                style={{
                  fontSize: "14px",
                  color: "#e1e1e1",
                  lineHeight: "1.6",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                }}
              >
                {highlightText(result.context, query, result.match_offset, result.query_length)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showResults && query && results.length === 0 && !isLoading && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            backgroundColor: "#1a1a24",
            border: "1px solid #333",
            borderTop: "none",
            borderRadius: "0 0 6px 6px",
            padding: "12px",
            fontSize: "13px",
            color: "#888",
            textAlign: "center",
          }}
        >
          No results found
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SearchBar;