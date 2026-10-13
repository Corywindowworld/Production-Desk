import { drawnSignature, readProfileDetails } from "./account-profile";
import { z } from "zod";

export const certificateQuestions = [
  "Did you and your installer inspect and operate each of your new windows?",
  "Are all of your windows functioning to your satisfaction?",
  "Are all of your screens installed free of defect?",
  "Are all of your windows caulked and sealed to your satisfaction (inside and out)?",
  "Is all trash and debris cleaned up to your satisfaction?",
  "Were drop cloths used during your installation?",
  "Was our installer courteous, cooperative, and satisfactory in their workmanship?",
] as const;
export const serviceCertificateQuestions = [
  "Did you and your installer review the service work completed today?",
  "Is the serviced product functioning to your satisfaction?",
  "Was the work area left clean and free of debris?",
  "Was our installer courteous, cooperative, and satisfactory in their workmanship?",
] as const;
export const certificateQuestionsForType = (type: string) =>
  type === "Service" ? serviceCertificateQuestions : certificateQuestions;

export const certificateInputSchema = z
  .object({
    type: z.enum(["Complete", "Incomplete", "Service"]),
    customerEmail: z.string().trim().email(),
    homeownerName: z.string().trim().min(2).max(160),
    completedWindows: z.string().trim().max(2000).default(""),
    answers: z
      .array(z.boolean())
      .min(serviceCertificateQuestions.length)
      .max(certificateQuestions.length),
    explanation: z.string().trim().max(4000).default(""),
    referencePermission: z.boolean().default(false),
    paymentAmount: z
      .number()
      .finite()
      .min(0)
      .max(999999999.99)
      .multipleOf(0.01)
      .default(0),
    paymentMethod: z
      .enum(["", "Paid In Full", "Check", "Credit Card", "Finance", "Other"])
      .default(""),
    paymentReference: z.string().trim().max(150).default(""),
    cardLastFour: z
      .string()
      .regex(/^$|^[0-9]{4}$/)
      .default(""),
    paymentDifferenceReason: z.string().trim().max(2000).default(""),
    customerSignatureDataUrl: drawnSignature,
    installerSignatureDataUrl: drawnSignature,
    confirmed: z.literal(true),
  })
  .superRefine((v, ctx) => {
    const expected = certificateQuestionsForType(v.type).length;
    if (v.answers.length !== expected)
      ctx.addIssue({
        code: "custom",
        path: ["answers"],
        message: `Answer all ${expected} certificate questions.`,
      });
    if (v.answers.includes(false) && !v.explanation)
      ctx.addIssue({
        code: "custom",
        path: ["explanation"],
        message: "Explain every No answer.",
      });
    if (v.type === "Incomplete" && !v.completedWindows)
      ctx.addIssue({
        code: "custom",
        path: ["completedWindows"],
        message: "List the windows and frames completed today.",
      });
    if (
      v.type === "Service" &&
      (v.paymentAmount ||
        v.paymentMethod ||
        v.paymentReference ||
        v.cardLastFour ||
        v.paymentDifferenceReason)
    )
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Service certificates do not include payment information.",
      });
    if (v.paymentAmount > 0 && !v.paymentMethod)
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Choose the payment method.",
      });
    if (v.paymentMethod === "Credit Card" && !v.cardLastFour)
      ctx.addIssue({
        code: "custom",
        path: ["cardLastFour"],
        message: "Enter only the card’s last four digits.",
      });
  });

export function certificateSnapshot(
  j: any,
  m: any,
  input: unknown,
  member: any,
  at: string,
) {
  const v = certificateInputSchema.parse(input),
    profile = readProfileDetails(member?.profile_details);
  const balance =
    typeof j.amount === "number" && Number.isFinite(j.amount) ? j.amount : null;
  if (balance !== null && v.paymentAmount > balance)
    throw new Error("Payment acknowledged cannot exceed the current balance.");
  return {
    ...v,
    id: crypto.randomUUID(),
    customerId: String(j.number),
    customerName: String(j.customer),
    address: String(j.address || ""),
    city: String(j.city || ""),
    state: String(j.state || ""),
    zip: String(j.zip || ""),
    installerId: m.role === "installer" ? m.id : j.installerId || m.id,
    installerName: m.role === "installer" ? m.name : j.crew || m.name,
    contractorId: profile.contractorNumber || member?.installer_code || "",
    contractAmount:
      typeof j.contractAmount === "number" ? j.contractAmount : null,
    currentBalance: v.type === "Service" ? null : balance,
    remainingBalance:
      v.type === "Service"
        ? null
        : balance === null
          ? null
          : Math.round((balance - v.paymentAmount) * 100) / 100,
    signedAt: at,
    emailStatus: "queued",
  };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v)
    : "Not recorded";
function legacyCertificateEmailHtml(c: any) {
  const answerRows = certificateQuestionsForType(c.type)
    .map(
      (q, i) =>
        `<tr><td style="padding:7px;border:1px solid #ccd6df">${esc(q)}</td><td style="padding:7px;border:1px solid #ccd6df;font-weight:bold">${c.answers[i] ? "Yes" : "No"}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#eef3f7;font-family:Arial,sans-serif;color:#172b3a"><div style="max-width:720px;margin:auto;padding:24px"><div style="background:#063dbb;color:white;padding:22px;border-radius:18px 18px 0 0"><img src="https://productiondesk.app/icon-w-circled.png" alt="Window World" width="64" height="64" style="display:block;margin-bottom:14px"><h1 style="margin:0;font-size:25px">Window World ${c.type === "Complete" ? "Completion" : "Incompletion"} Certificate</h1><p style="margin:8px 0 0">Customer ID #${esc(c.customerId)}</p></div><div style="background:white;padding:24px;border-radius:0 0 18px 18px"><p><b>Customer:</b> ${esc(c.customerName)}<br><b>Property:</b> ${esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(", "))}<br><b>Installer:</b> ${esc(c.installerName)}${c.contractorId ? " · " + esc(c.contractorId) : ""}<br><b>Signed:</b> ${esc(new Date(c.signedAt).toLocaleString("en-US", { timeZone: "America/New_York" }))}</p>${c.type === "Incomplete" ? `<p><b>Completed windows/frames:</b><br>${esc(c.completedWindows)}</p>` : ""}<table style="width:100%;border-collapse:collapse">${answerRows}</table>${c.explanation ? `<p><b>${c.type === "Complete" ? "Explanation" : "Comments"}:</b> ${esc(c.explanation)}</p>` : ""}${c.type === "Complete" ? `<p><b>May Window World use you as a reference?</b> ${c.referencePermission ? "Yes" : "No"}</p>` : ""}<h2 style="font-size:18px">Payment acknowledgment</h2><p><b>A 3% processing fee applies to credit card payments.</b></p><p>Current balance: ${money(c.currentBalance)}<br>Amount acknowledged today: ${money(c.paymentAmount)}<br>Remaining balance: ${money(c.remainingBalance)}<br>Method: ${esc(c.paymentMethod || "None recorded")}${c.paymentReference ? "<br>Reference: " + esc(c.paymentReference) : ""}${c.cardLastFour ? "<br>Card ending: " + esc(c.cardLastFour) : ""}</p><p style="font-size:12px;color:#52677b">No full card number, expiration date, or security code is stored in Production Desk. This certificate records an acknowledgment only; the approved payment system remains the payment record.</p><p><b>Electronically signed by:</b> ${esc(c.homeownerName)} and ${esc(c.installerName)}</p><table style="width:100%;border-collapse:collapse"><tr><td style="width:50%;padding:8px"><img alt="Customer signature" src="${esc(c.customerSignatureDataUrl)}" style="display:block;max-width:240px;width:100%;height:70px;object-fit:contain;object-position:left bottom"><b>Customer signature</b></td><td style="width:50%;padding:8px"><img alt="Installer signature" src="${esc(c.installerSignatureDataUrl)}" style="display:block;max-width:240px;width:100%;height:70px;object-fit:contain;object-position:left bottom"><b>Installer signature</b></td></tr></table><p style="font-size:12px;color:#52677b">This is your customer copy. Window World Tampa Bay retains the signed electronic record with the job.</p></div></div></body></html>`;
}

export function completionLienWaiverHtml(c: any) {
  const signed = new Date(c.signedAt),
    year = signed.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }),
    day = signed.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
    });
  return `<section style="margin-top:24px;border-top:2px solid #172b3a;padding-top:15px"><h2 style="text-align:center;margin:0">Waiver and Release of Lien</h2><h3 style="text-align:center;margin:5px 0 12px">UPON FINAL PAYMENT</h3><p>The undersigned lienor, in consideration of the final payment in the amount of $ <u>${esc(typeof c.paymentAmount === "number" ? c.paymentAmount.toFixed(2) : "Not recorded")}</u>, hereby waives and releases its lien and right to claim a lien for labor, services, or materials furnished to <u>${esc(c.customerName)}</u> on the job of <u>${esc(c.customerId)}</u> to the following described property: <u>${esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(", "))}</u>.</p><p>Dated on <u>${esc(day)}</u> (year) <u>${esc(year)}</u> (Lienor) Window World By: <span>${esc(c.installerName)}</span></p><img alt="Installer signature for lien waiver" src="${esc(c.installerSignatureDataUrl)}" style="display:block;width:240px;max-width:100%;height:60px;object-fit:contain;object-position:left bottom"/><p style="text-align:center;font-weight:bold">You are now covered completely by the Window World warranty.<br>It is sincerely our pleasure to continue serving you.</p><p style="text-align:center;font-size:18px;font-weight:bold">Total Amount Paid In Full: <u>${money(c.contractAmount ?? c.paymentAmount)}</u> &nbsp; Date: <u>${esc(day + "-" + year)}</u></p></section>`;
}

export function certificateEmailHtml(c: any) {
  const questions = certificateQuestionsForType(c.type),
    answerRows = questions
      .map(
        (q, i) =>
          `<tr><td style="padding:7px;border:1px solid #ccd6df">${esc(q)}</td><td style="padding:7px;border:1px solid #ccd6df;font-weight:bold">${c.answers[i] ? "Yes" : "No"}</td></tr>`,
      )
      .join(""),
    service = c.type === "Service";
  const payment = service
    ? ""
    : `<h2 style="font-size:18px">Payment acknowledgment</h2><p><b>A 3% processing fee applies to credit card payments.</b></p><p>Current balance: ${money(c.currentBalance)}<br>Amount acknowledged today: ${money(c.paymentAmount)}<br>Remaining balance: ${money(c.remainingBalance)}<br>Method: ${esc(c.paymentMethod || "None recorded")}${c.paymentReference ? "<br>Reference: " + esc(c.paymentReference) : ""}${c.cardLastFour ? "<br>Card ending: " + esc(c.cardLastFour) : ""}</p><p style="font-size:12px;color:#52677b">No full card number, expiration date, or security code is stored in Production Desk. This certificate records an acknowledgment only; Accounting remains responsible for processing the payment.</p>`;
  return `<!doctype html><html><body style="margin:0;background:#eef3f7;font-family:Arial,sans-serif;color:#172b3a"><div style="max-width:720px;margin:auto;padding:24px"><div style="background:#063dbb;color:white;padding:22px;border-radius:18px 18px 0 0"><img src="https://productiondesk.app/icon-w-circled.png" alt="Window World" width="64" height="64" style="display:block;margin-bottom:14px"><h1 style="margin:0;font-size:25px">Window World ${service ? "Service Completion" : c.type === "Complete" ? "Completion" : "Incompletion"} Certificate</h1><p style="margin:8px 0 0">Customer ID #${esc(c.customerId)}</p></div><div style="background:white;padding:24px;border-radius:0 0 18px 18px"><p><b>Customer:</b> ${esc(c.customerName)}<br><b>Property:</b> ${esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(", "))}<br><b>Installer:</b> ${esc(c.installerName)}${c.contractorId ? " · " + esc(c.contractorId) : ""}<br><b>Signed:</b> ${esc(new Date(c.signedAt).toLocaleString("en-US", { timeZone: "America/New_York" }))}</p>${c.type === "Incomplete" ? `<p><b>Completed windows/frames:</b><br>${esc(c.completedWindows)}</p>` : ""}<table style="width:100%;border-collapse:collapse">${answerRows}</table>${c.explanation ? `<p><b>${c.type === "Complete" ? "Explanation" : "Comments"}:</b> ${esc(c.explanation)}</p>` : ""}${c.type === "Complete" ? `<p><b>May Window World use you as a reference?</b> ${c.referencePermission ? "Yes" : "No"}</p>` : ""}${payment}<p><b>Electronically signed by:</b> ${esc(c.homeownerName)} and ${esc(c.installerName)}</p><table style="width:100%;border-collapse:collapse"><tr><td style="width:50%;padding:8px"><img alt="Customer signature" src="${esc(c.customerSignatureDataUrl)}" style="display:block;max-width:240px;width:100%;height:70px;object-fit:contain;object-position:left bottom"><b>Customer signature</b></td><td style="width:50%;padding:8px"><img alt="Installer signature" src="${esc(c.installerSignatureDataUrl)}" style="display:block;max-width:240px;width:100%;height:70px;object-fit:contain;object-position:left bottom"><b>Installer signature</b></td></tr></table>${c.type === "Complete" ? completionLienWaiverHtml(c) : ""}<p style="font-size:12px;color:#52677b">The signed certificate PDF is attached. Window World Tampa Bay retains the electronic record with the job.</p></div></div></body></html>`;
}
