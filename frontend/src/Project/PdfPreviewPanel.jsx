import React from "react";
import { Panel } from "react-resizable-panels";

export default function PdfPreviewPanel({ pdfPreviewUrl, filename }){


    return (
        <Panel defaultSize={35} minSize={20} style={{ display: "flex", flexDirection: "column", backgroundColor: "#0f1115", border: "1px solid #2d2f36", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #2d2f36", color: "#e5e7eb", backgroundColor: "#151922" }}>
                <div style={{ fontSize: "13px", fontWeight: "bold" }}>Original PDF</div>
            </div>
            <embed
                title={`${filename} preview`}
                src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                type="application/pdf"
                style={{ width: "100%", flex: 1, border: "none", backgroundColor: "#fff" }}
            />
        </Panel>
    )

}