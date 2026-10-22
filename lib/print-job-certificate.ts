import {withPrintExit} from './print-exit';
import { certificateLogoPng } from "./certificate-logo";
import {
  certificateQuestions,
  certificateQuestionsForType,
  completionLienWaiverHtml,
} from "./job-certificate";
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
const date = (v: string) =>
  new Date(v)
    .toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })
    .replaceAll("/", "-");
export function jobCertificatePrintHtml(c: any) {
  const questions = certificateQuestionsForType(c.type),
    service = c.type === "Service",
    complete = c.type === "Complete";
  const checks = questions
    .map(
      (q, i) =>
        `<tr><td class="checks"><span>${c.answers[i] ? "✓" : ""}</span> Yes <span>${!c.answers[i] ? "✓" : ""}</span> No</td><td>${esc(q)}</td></tr>`,
    )
    .join("");
  const payment = service
    ? '<section class="payment"><b>Paid In Full (PIF)</b><p>Balance: $0.00</p></section>'
    : `<section class="payment"><p><b>A 3% processing fee applies to credit card payments.</b></p><p class="notice">${complete ? "NOTICE: PLEASE PAY INSTALLER UPON COMPLETION" : "WE WOULD APPRECIATE PAYMENT ON THE PORTIONS OF WORK COMPLETED TODAY! THANK YOU!"}</p><div class="payment-grid"><p><b>Current balance:</b><br>${money(c.currentBalance)}</p><p><b>Amount paid today:</b><br>${money(c.paymentAmount)}</p><p><b>Remaining balance:</b><br>${money(c.remainingBalance)}</p></div><p><b>Type of payment:</b> ${esc(c.paymentMethod || "None recorded")} ${c.paymentReference ? " · Check number: " + esc(c.paymentReference) : ""} ${c.cardOnFile ? " · Credit card: On File" : c.cardLastFour ? " · Card ending: " + esc(c.cardLastFour) : ""}</p>${c.paymentDifferenceReason ? `<p><b>If amount paid differs from current balance due please state why:</b> ${esc(c.paymentDifferenceReason)}</p>` : ""}<p class="small">Payment will be processed by Window World Accounting. Full payment card numbers, expiration dates, and security codes are not stored in Production Desk.</p></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${service ? "Service Completion" : complete ? "Completion" : "Incompletion"} Certificate</title><style>@page{size:letter portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font:11pt Arial,sans-serif}.toolbar{padding:12px;background:#eee}.sheet{width:100%;max-width:8.5in;margin:0 auto;padding:.55in .62in;overflow:visible}.title{text-align:center;font-family:Georgia,serif;font-size:21pt;margin:0 0 5px}.subtitle{text-align:center;font-weight:bold;margin:0 0 10px}.top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:8px 0}.field{border-bottom:1px solid #111;min-height:18px}.questions{width:100%;border-collapse:collapse}.questions td{padding:3px;vertical-align:top}.checks{width:105px;white-space:nowrap}.checks span{display:inline-block;width:16px;height:16px;border:1.5px solid #111;text-align:center;line-height:14px;font-weight:bold}.line{border-bottom:1px solid #111;min-height:25px;padding:4px 0}.payment{border-top:2px solid #222;margin-top:10px;padding-top:6px}.payment-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.signatures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:12px;break-inside:avoid}.signature{border-top:1px solid #111;padding-top:4px}.signatures>div{min-width:0;break-inside:avoid}.signatures img{display:block;width:100%;max-width:100%;height:70px;object-fit:contain;object-position:left bottom;margin-bottom:6px}.field{overflow-wrap:anywhere;min-width:0}.questions tr{break-inside:avoid}.notice{text-align:center;font-weight:bold}.small{font-size:10pt;color:#444}.review{margin-top:10px;border-top:1px solid #555;padding-top:6px}button{padding:10px 18px}@media print{.toolbar{display:none!important}html,body{width:100%!important;margin:0!important;padding:0!important;overflow:visible!important}.sheet{padding:.55in .62in!important;width:100%!important;max-width:8.5in!important;margin:0 auto!important;transform:none!important}}p{margin:7px 0}.sheet{line-height:1.18}.signatures img{height:48px}.sheet section{margin-top:10px!important;padding-top:7px!important}.sheet section>img{height:42px!important}.top{gap:5px}.questions td{padding:2px} @media print{.sheet{width:8.5in!important;transform-origin:top left;zoom:var(--print-scale,1)}} </style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><p>Letter · Portrait · Fit to printable area. The form includes safe inset margins.</p></div><main class="sheet"><img alt="Window World" src="data:image/png;base64,${certificateLogoPng}" style="float:left;width:38px;height:38px;margin-right:10px"><h1 class="title">${service ? "Window World Service Completion Certificate" : complete ? "Window World Completion Certificate" : "Incompletion Certificate"}</h1>${complete ? '<p class="subtitle">CONGRATULATIONS ON YOUR NEW WINDOWS!</p>' : service ? '<p class="subtitle">SERVICE WORK ACKNOWLEDGMENT</p>' : '<p class="subtitle">We apologize that your installation could not be completed today.</p>'}<div class="top"><div class="field"><b>Customer:</b>${esc(c.customerName)}</div><div class="field"><b>${c.signedByStaff ? "Staff preparer" : "Installer"}:</b>${esc(c.installerName)}</div><div class="field"><b>Date:</b>${esc(date(c.signedAt))}</div><div class="field"><b>Customer ID:</b>${esc(c.customerId)}</div><div class="field"><b>Contractor ID:</b>${esc(c.contractorId)}</div><div class="field"><b>Email:</b>${esc(c.customerEmail)}</div></div>${c.type === "Incomplete" ? `<h2 class="title" style="font-size:15pt">COMPLETED WINDOWS</h2><div class="line">${esc(c.completedWindows)}</div>` : ""}<table class="questions"><tbody>${checks}</tbody></table><p><b>${complete ? "If you answered NO to any of the above questions, please explain:" : "Comments:"}</b></p><div class="line">${esc(c.explanation || "None")}</div>${complete ? `<p><b>May we use you as a reference?</b> ${c.referencePermission ? "Yes" : "No"}</p><p>I, ${esc(c.homeownerName)}, certify that all of my new windows are installed to my satisfaction, and that I am accepting the workmanship of this installation. I understand that Window World is now only responsible to repair items covered under my new window warranty.</p>` : service ? `<p>I, ${esc(c.homeownerName)}, certify that I inspected the service work recorded above and that the completed service work is satisfactory.</p>` : `<p>I, ${esc(c.homeownerName)}, certify that I have inspected all the completed windows and/or frames listed above and that they have been installed to my satisfaction.</p><p class="notice">WHAT HAPPENS NEXT?</p><p>Your reorder will be processed immediately. When we receive confirmation from manufacturing, we will call to schedule a completion date.</p>`}${payment}<div class="signatures"><div><img alt="Customer signature" src="${esc(c.customerSignatureDataUrl)}"><div class="signature">Customer signature · ${esc(c.homeownerName)}</div></div><div><img alt="Installer signature" src="${esc(c.installerSignatureDataUrl)}"><div class="signature">${c.signedByStaff ? "Staff preparer signature" : "Installer signature"} · ${esc(c.installerName)}</div></div></div>${c.reviewedBy ? `<p class="review"><b>Reviewed by:</b> ${esc(c.reviewedBy)} · ${esc(date(c.reviewedAt))}</p>` : '<p class="review"><b>Field Supervisor review:</b> Pending</p>'}${complete ? completionLienWaiverHtml(c) : ""}<p class="small">Production Desk · Signed electronic job certificate · Record ID ${esc(c.id)}</p></main><script>function fitCertificate(){const s=document.querySelector('.sheet');s.style.setProperty('--print-scale','1');const scale=Math.min(1,1000/s.scrollHeight);s.style.setProperty('--print-scale',String(scale));}window.addEventListener('beforeprint',fitCertificate);Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))).then(fitCertificate);</script></body></html>`;
}
export function printJobCertificate(c: any) {
  const w = window.open("", "_blank");
  if (!w) throw Error("Allow pop-ups to print the signed certificate.");
  w.document.open();
  w.document.write(withPrintExit(jobCertificatePrintHtml(c)));
  w.document.close();
}
