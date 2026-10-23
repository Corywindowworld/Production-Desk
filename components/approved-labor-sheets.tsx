"use client";

export function ApprovedLaborSheets({ j }: { j: any }) {
  const sheets = [...(j.operations?.laborSheets || [])]
    .filter((sheet: any) => sheet.status === "Approved")
    .sort((a: any, b: any) => String(b.approvedAt || "").localeCompare(String(a.approvedAt || "")));
  if (!sheets.length) return null;
  return (
    <section aria-label="Approved labor sheets" className="digital-document-group">
      <h3>Approved Labor Sheets ({sheets.length})</h3>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {sheets.map((sheet: any) => (
          <div className="digital-document-row" key={sheet.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <strong>{sheet.visitType || "Installation"} · {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(sheet.approvedTotal || 0)}</strong>
              <small style={{ display: "block" }}>
                {sheet.approvedAt ? new Date(sheet.approvedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "Approved"} · Approved by {sheet.approvedBy || "management"}
              </small>
            </div>
            <a className="labor-action-button" target="_blank" rel="noopener noreferrer"
              href={"/api/labor?jobId=" + encodeURIComponent(j.id) + "&sheetId=" + encodeURIComponent(sheet.id)}>
              View / Print Labor Sheet
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
