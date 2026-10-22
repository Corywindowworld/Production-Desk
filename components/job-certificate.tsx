"use client";
import { useEffect, useState } from "react";
import { SignaturePad } from "./signature-pad";
import { certificateQuestionsForType } from "@/lib/job-certificate";
import { printJobCertificate } from "@/lib/print-job-certificate";

const money = (v: any) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v)
    : "Not recorded";
const title = (type: string) =>
  type === "Service"
    ? "Service Completion"
    : type === "Complete"
      ? "Completion"
      : "Incompletion";

export function SignedJobCertificate({ record, defaultOpen = false }: any) {
  const [error, setError] = useState("");
  if (!record) return null;
  const questions = certificateQuestionsForType(record.type),
    service = record.type === "Service";
  return (
    <details
      className="op-disclosure op-signed-certificate"
      open={defaultOpen || undefined}
    >
      <summary>
        ✓ Digital {title(record.type)} Certificate ·{" "}
        {record.signedAt
          ? new Date(record.signedAt).toLocaleDateString("en-US", {
              timeZone: "America/New_York",
            })
          : "Signed"}
      </summary>
      <div className="op-section-head">
        <p>
          {record.homeownerName} and {record.installerName} · Customer copy:{" "}
          {record.customerEmail}
        </p>
        <button
          type="button"
          className="live-button"
          onClick={() => {
            try {
              printJobCertificate(record);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Print / Save PDF
        </button>
      </div>
      <p>
        <strong>Customer:</strong> {record.customerName} · <strong>ID:</strong>{" "}
        {record.customerId}
        <br />
        <strong>Property:</strong>{" "}
        {[record.address, record.city, record.state, record.zip]
          .filter(Boolean)
          .join(", ")}
      </p>
      {record.type === "Incomplete" && (
        <p>
          <strong>Completed windows and frames:</strong>{" "}
          {record.completedWindows}
        </p>
      )}
      <ul>
        {questions.map((q, i) => (
          <li key={q}>
            {record.answers?.[i] ? "Yes" : "No"} — {q}
          </li>
        ))}
      </ul>
      {record.explanation && (
        <p>
          <strong>
            {record.type === "Complete" ? "Explanation" : "Comments"}:
          </strong>{" "}
          {record.explanation}
        </p>
      )}
      {service && <p><strong>Paid In Full (PIF)</strong> · Balance: $0.00</p>}
      {!service && (
        <p>
          <strong>Payment acknowledgment:</strong> {money(record.paymentAmount)}{" "}
          · {record.paymentMethod || "None recorded"} · Remaining balance{" "}
          {money(record.remainingBalance)}
          {record.paymentMethod === "Check" && record.paymentReference && <span> · Check number: {record.paymentReference}</span>}
          {record.paymentMethod === "Credit Card" && <span> · {record.cardOnFile ? "On File" : record.cardLastFour ? "Card ending: " + record.cardLastFour : ""}</span>}
        </p>
      )}
      <div className="certificate-signature-preview">
        <div>
          <img alt="Customer signature" src={record.customerSignatureDataUrl} />
          <strong>Customer signature</strong>
        </div>
        <div>
          <img
            alt="Installer signature"
            src={record.installerSignatureDataUrl}
          />
          <strong>{record.signedByStaff ? "Staff preparer signature" : "Installer signature"}</strong>
        </div>
      </div>
      {record.reviewedBy ? (
        <p>Reviewed by {record.reviewedBy}</p>
      ) : (
        <p>Field Supervisor review pending.</p>
      )}
      {error && <p className="op-red">{error}</p>}
    </details>
  );
}

export function JobCertificateForm({ j, type, profile, initialValue, onChange, onAccepted }: any) {
  const questions = certificateQuestionsForType(type),
    service = type === "Service",
    initial = initialValue?.type === type ? initialValue : null,
    balance =
      typeof j.balanceDue === "number"
        ? j.balanceDue
        : typeof j.amount === "number"
          ? j.amount
          : null;
  const [open, setOpen] = useState(false),
    [complete, setComplete] = useState(false),
    [confirmed, setConfirmed] = useState(!!initial?.confirmed),
    [savingDraft, setSavingDraft] = useState(false),
    [error, setError] = useState("");
  const [answers, setAnswers] = useState<(boolean|null)[]>(
    initial?.answers?.length === questions.length
      ? initial.answers
      : Array(questions.length).fill(null),
  );
  const [customerSignature, setCustomerSignature] = useState(initial?.customerSignatureDataUrl || ""),
    [installerSignature, setInstallerSignature] = useState(
      initial?.installerSignatureDataUrl || profile?.savedDrawnSignature || "",
    );
  const [paymentInput, setPaymentAmount] = useState(initial?.paymentAmount ? String(initial.paymentAmount) : ""),
    [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod || ""),
    [email, setEmail] = useState(initial?.customerEmail || j.customerEmail || ""),
    [homeownerName, setHomeownerName] = useState(initial?.homeownerName || j.customer || "");
  const [completedWindows, setCompletedWindows] = useState(initial?.completedWindows || ""),
    [explanation, setExplanation] = useState(initial?.explanation || ""),
    [referencePermission, setReferencePermission] = useState(!!initial?.referencePermission),
    [paymentReference, setPaymentReference] = useState(initial?.paymentReference || ""),
    [cardLastFour, setCardLastFour] = useState(initial?.cardLastFour || ""),
    [cardOnFile, setCardOnFile] = useState(!!initial?.cardOnFile),
    [paymentDifferenceReason, setPaymentDifferenceReason] = useState(initial?.paymentDifferenceReason || "");
  const paymentAmount = Number(paymentInput) || 0;
  const remaining =
    balance === null
      ? null
      : Math.max(0, Math.round((balance - paymentAmount) * 100) / 100);
  const snapshot = (accepted = confirmed) => ({
    type,
    customerEmail: email.trim(),
    homeownerName: homeownerName.trim(),
    completedWindows: completedWindows.trim(),
    answers,
    explanation: explanation.trim(),
    referencePermission,
    paymentAmount: service ? 0 : paymentAmount,
    paymentMethod: service ? "" : paymentMethod,
    paymentReference: !service && paymentMethod === "Check" ? paymentReference.trim() : "",
    cardLastFour: service || cardOnFile || paymentMethod !== "Credit Card" ? "" : cardLastFour.trim(),
    cardOnFile: !service && paymentMethod === "Credit Card" && cardOnFile,
    paymentDifferenceReason: service ? "" : paymentDifferenceReason.trim(),
    customerSignatureDataUrl: customerSignature,
    installerSignatureDataUrl: installerSignature,
    confirmed: accepted,
  });
  useEffect(() => {
    const saved = initialValue?.type === type ? initialValue : null;
    setAnswers(saved?.answers?.length === questions.length ? saved.answers : Array(questions.length).fill(null));
    setPaymentAmount(saved?.paymentAmount ? String(saved.paymentAmount) : "");
    setPaymentMethod(saved?.paymentMethod || "");
    setCompletedWindows(saved?.completedWindows || "");
    setExplanation(saved?.explanation || "");
    setCustomerSignature(saved?.customerSignatureDataUrl || "");
    setInstallerSignature(saved?.installerSignatureDataUrl || profile?.savedDrawnSignature || "");
    setEmail(saved?.customerEmail || j.customerEmail || "");
    setHomeownerName(saved?.homeownerName || j.customer || "");
    setReferencePermission(!!saved?.referencePermission);
    setPaymentReference(saved?.paymentReference || "");
    setCardLastFour(saved?.cardLastFour || "");
    setCardOnFile(!!saved?.cardOnFile);
    setPaymentDifferenceReason(saved?.paymentDifferenceReason || "");
    setConfirmed(!!saved?.confirmed);
    setComplete(false);
    setOpen(false);
    onChange?.(null);
  }, [type]);
  useEffect(() => {
    onChange?.(snapshot());
  }, [
    answers,
    customerSignature,
    installerSignature,
    paymentAmount,
    paymentMethod,
    email,
    homeownerName,
    completedWindows,
    explanation,
    referencePermission,
    paymentReference,
    cardLastFour,
    cardOnFile,
    paymentDifferenceReason,
    confirmed,
  ]);
  const choosePayment = (value: string) => {
    setPaymentMethod(value);
    if(value !== "Credit Card")setCardOnFile(false);
    if(value !== "Check")setPaymentReference("");
    if (value === "Paid In Full") setPaymentAmount(String(balance ?? 0));
  };
  const accept = async () => {
    setError("");
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()))
      return setError(
        "Enter the email address where the customer should receive the certificate.",
      );
    if (homeownerName.trim().length < 2)
      return setError("Enter the homeowner’s printed name.");
    if (type === "Incomplete" && !completedWindows.trim())
      return setError("List the windows or frames completed today.");
    if (answers.some(answer=>answer===null))
      return setError("Please answer every question before accepting the certificate.");
    if (answers.includes(false) && !explanation.trim())
      return setError("Please explain each No answer.");
    if (paymentAmount > 0 && !paymentMethod)
      return setError("Choose a payment method.");
    if (paymentMethod === "Credit Card" && !cardOnFile && !/^\d{4}$/.test(cardLastFour))
      return setError("Enter only the last four digits of the card.");
    if (!customerSignature)
      return setError("The customer must draw their signature.");
    if (!installerSignature)
      return setError("The installer must draw their signature.");
    const accepted = snapshot(true);
    setSavingDraft(true);
    try {
      await onAccepted?.(accepted);
      setConfirmed(true);
      onChange?.(accepted);
      setComplete(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message || "The signed certificate could not be saved. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };
  return (
    <details className="op-disclosure certificate-launcher">
      <summary>
        Customer Certificate {confirmed ? "✓ Signed draft saved" : "— Required"}
      </summary>
      <div className="certificate-launcher-body">
        <div>
          <strong>{title(type)} Certificate</strong>
          <p>
            Open a clean, full-screen sign-off for the customer. Their signed
            PDF will be saved with this job and emailed after submission.
          </p>
        </div>
        <button
          type="button"
          className="op-primary"
          onClick={() => {
            setComplete(false);
            setOpen(true);
          }}
        >
          {confirmed ? "Review customer sign-off" : "Start customer sign-off"}
        </button>
      </div>
      {open && (
        <div
          className="certificate-handoff"
          role="dialog"
          aria-modal="true"
          aria-label={title(type) + " Certificate"}
        >
          {complete ? (
            <main className="certificate-thank-you">
              <img
                className="certificate-brand-logo"
                src="/window-world-tampa-bay.jpeg"
                alt="Window World Tampa Bay"
              />
              <div className="certificate-success-mark">✓</div>
              <p className="certificate-eyebrow">SIGN-OFF COMPLETE</p>
              <h2>You’re all complete!</h2>
              <h3>Thank you for choosing Window World.</h3>
              <p>
                A signed PDF copy of your {title(type).toLowerCase()}{" "}
                certificate will be emailed to <strong>{email}</strong> after
                the job result is submitted.
              </p>
              <p className="certificate-handback">
                Please hand the iPad back to your installer.
              </p>
              <button
                type="button"
                className="certificate-primary"
                onClick={() => setOpen(false)}
              >
                Return to job
              </button>
            </main>
          ) : (
            <main
              className="certificate-customer-card"
              onChangeCapture={() => {
                if (confirmed) setConfirmed(false);
              }}
            >
              <header className="certificate-customer-header">
                <img
                  className="certificate-brand-logo"
                  src="/window-world-tampa-bay.jpeg"
                  alt="Window World Tampa Bay"
                />
                <div>
                  <p className="certificate-eyebrow">
                    WINDOW WORLD · TAMPA BAY
                  </p>
                  <h2>{title(type)} Certificate</h2>
                  <p>
                    Let’s review today’s work together. Your answers and
                    signatures will become part of your job record.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close customer sign-off"
                  className="certificate-close"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </header>
              <section className="certificate-customer-section certificate-welcome">
                <h3>Hello, {j.customer}</h3>
                <p>
                  We appreciate your business. Please review each item below and
                  let us know if anything needs attention before signing.
                </p>
                <div className="certificate-two-column">
                  <label>
                    Email for your signed copy
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="customer@example.com"
                    />
                  </label>
                  <label>
                    Homeowner name
                    <input
                      value={homeownerName}
                      onChange={(e) => setHomeownerName(e.target.value)}
                    />
                  </label>
                </div>
              </section>
              {type === "Incomplete" && (
                <section className="certificate-customer-section">
                  <h3>Work completed today</h3>
                  <label>
                    Completed windows and frames
                    <textarea
                      value={completedWindows}
                      onChange={(e) => setCompletedWindows(e.target.value)}
                      placeholder="List window numbers or locations completed today"
                    />
                  </label>
                </section>
              )}
              <section className="certificate-customer-section">
                <div className="certificate-section-heading">
                  <span>1</span>
                  <div>
                    <h3>Review today’s work</h3>
                    <p>Select Yes or No for each item.</p>
                  </div>
                </div>
                {questions.map((q, i) => (
                  <article key={q} className="certificate-question">
                    <p>{q}</p>
                    <div>
                      {[true, false].map((v) => (
                        <button
                          type="button"
                          key={String(v)}
                          className={answers[i] === v ? "selected" : ""}
                          aria-pressed={answers[i] === v}
                          onClick={() => {
                            setConfirmed(false);
                            setAnswers((a) =>
                              a.map((x, n) => (n === i ? v : x)),
                            );
                          }}
                        >
                          {v ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                <label>
                  {type === "Complete"
                    ? "If you selected No, please tell us what needs attention"
                    : "Comments"}
                  <textarea
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder={
                      answers.includes(false)
                        ? "Please describe what needs attention"
                        : "Optional comments"
                    }
                  />
                </label>
                {type === "Complete" && (
                  <label className="certificate-check">
                    <input
                      type="checkbox"
                      checked={referencePermission}
                      onChange={(e) => setReferencePermission(e.target.checked)}
                    />
                    Yes, Window World may use me as a reference.
                  </label>
                )}
              </section>
              {service && <p className="op-callout"><strong>Paid In Full (PIF)</strong> · Balance: $0.00</p>}
              {!service && (
                <section className="certificate-customer-section">
                  <div className="certificate-section-heading">
                    <span>2</span>
                    <div>
                      <h3>Payment acknowledgment</h3>
                      <p>
                        This records what was provided today. Window World
                        Accounting will process the payment.
                      </p>
                    </div>
                  </div>
                  {type === "Incomplete" && (
                    <p className="certificate-retainage-note">
                      For incomplete installations, you may retain up to 10%
                      until the remaining work is completed. The balance for
                      completed work remains due; a pending inspection alone
                      does not defer payment. Please discuss any questions with
                      your Window World representative.
                    </p>
                  )}
                  <p className="certificate-retainage-note">A 3% processing fee applies to credit card payments.</p>
                  <div className="certificate-balance">
                    <div>
                      <small>Current balance</small>
                      <strong>{money(balance)}</strong>
                    </div>
                    <div>
                      <small>Amount Paid Today</small>
                      <strong>{money(paymentAmount)}</strong>
                    </div>
                    <div>
                      <small>Remaining balance</small>
                      <strong>{money(remaining)}</strong>
                    </div>
                  </div>
                  <div className="certificate-two-column">
                    <label>
                      Amount Paid Today
                      <span className="certificate-currency-input">
                        <span aria-hidden="true">$</span>
                        <input
                          placeholder="0.00"
                          type="number"
                          min="0"
                          max={balance ?? undefined}
                          step=".01"
                          value={paymentInput}
                          readOnly={paymentMethod === "Paid In Full"}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                      </span>
                    </label>
                    <label>
                      Payment method
                      <select
                        value={paymentMethod}
                        onChange={(e) => choosePayment(e.target.value)}
                      >
                        <option value="">None recorded</option>
                        {[
                          "Paid In Full",
                          "Check",
                          "Credit Card",
                          "Finance",
                          "Other",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {paymentMethod === "Check" && <label>Check number<input value={paymentReference} maxLength={150} onChange={e=>setPaymentReference(e.target.value)} /></label>}
                  {paymentMethod === "Credit Card" && (
                    <div>
                    <label className="certificate-check"><input type="checkbox" checked={cardOnFile} onChange={e=>{setCardOnFile(e.target.checked);setConfirmed(false);if(e.target.checked)setCardLastFour("");}}/> On File</label>
                    {!cardOnFile &&
                    <label>
                      Card last four digits only
                      <input
                        value={cardLastFour}
                        onChange={(e) =>
                          setCardLastFour(
                            e.target.value.replace(/\D/g, "").slice(0, 4),
                          )
                        }
                        inputMode="numeric"
                        placeholder="1234"
                      />
                    </label>
                    }
                    </div>
                  )}
                  <label>
                    Reason payment differs from current balance
                    <textarea
                      value={paymentDifferenceReason}
                      onChange={(e) =>
                        setPaymentDifferenceReason(e.target.value)
                      }
                    />
                  </label>
                  <p className="certificate-privacy">
                    For your security, never enter a full card number,
                    expiration date, or security code here.
                  </p>
                </section>
              )}
              <section className="certificate-customer-section">
                <div className="certificate-section-heading">
                  <span>{service ? "2" : "3"}</span>
                  <div>
                    <h3>Sign and accept</h3>
                    <p>
                      By signing, the customer and installer confirm that they
                      reviewed this certificate together and that the
                      information is accurate.
                    </p>
                  </div>
                </div>
                <div className="certificate-signatures">
                  <SignaturePad
                    label="customer signature"
                    value={customerSignature}
                    onChange={(value) => {
                      setConfirmed(false);
                      setCustomerSignature(value);
                    }}
                  />
                  <SignaturePad
                    label="installer signature"
                    value={installerSignature}
                    onChange={(value) => {
                      setConfirmed(false);
                      setInstallerSignature(value);
                    }}
                  />
                </div>
                {error && (
                  <p role="alert" className="certificate-error">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  className="certificate-primary"
                  onClick={accept}
                  disabled={savingDraft}
                >
                  {savingDraft ? "Saving signed certificate…" : "Accept and complete sign-off"}
                </button>
              </section>
            </main>
          )}
        </div>
      )}
    </details>
  );
}
