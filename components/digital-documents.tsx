"use client";
import { useState } from "react";
import { SignedJobCertificate } from "./job-certificate";
import {
  certificatesForJob,
  uploadedDocumentsForJob,
} from "@/lib/digital-documents";
import { printLeadRenovation } from "@/lib/print-lead-renovation";
import { printReorder } from "@/lib/print-reorder";

export function DigitalDocuments({ j }: any) {
  const [error, setError] = useState(""),
    certificates = certificatesForJob(j),
    lead = j.operations?.leadRenovation,
    reorders = j.operations?.reorders || [],
    uploads = uploadedDocumentsForJob(j);
  const safe = (fn: () => void) => {
    setError("");
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const total =
    certificates.length + (lead ? 1 : 0) + reorders.length + uploads.length;
  return (
    <section className="digital-documents">
      <div className="digital-documents-header">
        <div>
          <p className="certificate-eyebrow">CUSTOMER FILE</p>
          <h3>Digital Documents</h3>
          <p>
            Signed certificates, required forms, reorders and uploaded documents
            are kept together here.
          </p>
        </div>
        <span>
          {total} document{total === 1 ? "" : "s"}
        </span>
      </div>
      {error && (
        <p role="alert" className="op-red">
          {error}
        </p>
      )}
      {!total && (
        <div className="digital-documents-empty">
          <strong>No digital documents yet</strong>
          <p>
            Signed forms will appear here automatically after they are saved.
          </p>
        </div>
      )}
      {!!certificates.length && (
        <div className="digital-document-group">
          <h4>Completion certificates</h4>
          {certificates.map((record: any) => (
            <SignedJobCertificate
              key={record.id || record.signedAt}
              record={record}
            />
          ))}
        </div>
      )}
      {lead && (
        <div className="digital-document-row">
          <div>
            <strong>Lead Renovation Procedures Record</strong>
            <small>
              Signed by {lead.signature} ·{" "}
              {lead.signedAt
                ? new Date(lead.signedAt).toLocaleDateString("en-US", {
                    timeZone: "America/New_York",
                  })
                : "Signed"}
            </small>
          </div>
          <button
            type="button"
            className="live-button"
            onClick={() => safe(() => printLeadRenovation(lead))}
          >
            Print / Save PDF
          </button>
        </div>
      )}
      {!!reorders.length && (
        <div className="digital-document-group">
          <h4>Reorder forms</h4>
          {reorders.map((record: any) => (
            <div className="digital-document-row" key={record.id}>
              <div>
                <strong>Contractor Reorder Form · {record.status}</strong>
                <small>
                  {record.submittedAt
                    ? new Date(record.submittedAt).toLocaleDateString("en-US", {
                        timeZone: "America/New_York",
                      })
                    : "Date not recorded"}{" "}
                  · {record.reason}
                </small>
              </div>
              <button
                type="button"
                className="live-button"
                onClick={() => safe(() => printReorder(j, record))}
              >
                Print / Save PDF
              </button>
            </div>
          ))}
        </div>
      )}
      {!!uploads.length && (
        <div className="digital-document-group">
          <h4>Uploaded documents</h4>
          {uploads.map((a: any) => (
            <div className="digital-document-row" key={a.key}>
              <div>
                <strong>{a.name}</strong>
                <small>{a.kind || "Job document"}</small>
              </div>
              <a
                className="live-button"
                href={"/api/attachments?key=" + encodeURIComponent(a.key)}
                target="_blank"
                rel="noreferrer"
              >
                Open document
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
