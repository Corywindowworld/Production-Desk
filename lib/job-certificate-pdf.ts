import { certificateLogoPng } from "./certificate-logo";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { certificateQuestionsForType } from "./job-certificate";

const money = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v)
    : "Not recorded";
const day = (v: string) =>
  new Date(v).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "\'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export async function jobCertificatePdf(c: any) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const W = 612,
    H = 2400,
    left = 42,
    right = 42,
    bottom = 42,
    width = W - left - right;
  let page = pdf.addPage([W, H]),
    y = H - 42;
  const addPage = () => {
    page = pdf.addPage([W, H]);
    y = H - 42;
  };
  const ensure = (height: number) => {
    if (y - height < bottom) addPage();
  };
  const lines = (value: unknown, size = 11, maxWidth = width) => {
    const words = clean(value).split(" ").filter(Boolean),
      out: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (regular.widthOfTextAtSize(next, size) <= maxWidth) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };
  const text = (
    value: unknown,
    size = 11,
    opts: { bold?: boolean; indent?: number; gap?: number } = {},
  ) => {
    const font = opts.bold ? bold : regular,
      max = width - (opts.indent || 0),
      rows = lines(value, size, max);
    ensure(rows.length * (size + 2) + (opts.gap || 0));
    for (const row of rows) {
      page.drawText(row, {
        x: left + (opts.indent || 0),
        y: y - size,
        size,
        font,
        color: rgb(0.05, 0.08, 0.1),
      });
      y -= size + 2;
    }
    y -= opts.gap || 0;
  };
  const center = (value: string, size: number, font = bold) => {
    ensure(size + 5);
    page.drawText(value, {
      x: (W - font.widthOfTextAtSize(value, size)) / 2,
      y: y - size,
      size,
      font,
    });
    y -= size + 5;
  };
  const rule = () => {
    ensure(8);
    page.drawLine({
      start: { x: left, y },
      end: { x: W - right, y },
      thickness: 1,
      color: rgb(0.25, 0.3, 0.35),
    });
    y -= 8;
  };
  const field = (label: string, value: unknown) =>
    text(label + " " + clean(value), 12, { gap: 1 });
  const service = c.type === "Service",
    complete = c.type === "Complete",
    questions = certificateQuestionsForType(c.type);
  center(
    service
      ? "WINDOW WORLD SERVICE COMPLETION CERTIFICATE"
      : complete
        ? "WINDOW WORLD COMPLETION CERTIFICATE"
        : "INCOMPLETION CERTIFICATE",
    complete ? 17 : 18,
    serif,
  );
  const logo = await pdf.embedPng(certificateLogoPng);
  page.drawImage(logo, { x: left, y: H - 38, width: 28, height: 28 });
  if (complete) center("CONGRATULATIONS ON YOUR NEW WINDOWS!", 11, bold);
  field("Customer:", c.customerName);
  field("Customer ID #:", c.customerId);
  field("Installer:", c.installerName);
  field("Contractor ID #:", c.contractorId || "Not recorded");
  field("Date:", day(c.signedAt));
  field(
    "Property:",
    [c.address, c.city, c.state, c.zip].filter(Boolean).join(", "),
  );
  rule();
  if (c.type === "Incomplete") {
    center("COMPLETED WINDOWS", 13, bold);
    text(c.completedWindows, 9, { gap: 5 });
  }
  questions.forEach((q, i) => {
    ensure(30);
    page.drawRectangle({
      x: left,
      y: y - 12,
      width: 12,
      height: 12,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    if (c.answers[i])
      page.drawText("X", { x: left + 2.5, y: y - 10, size: 9, font: bold });
    page.drawText("Yes", { x: left + 17, y: y - 10, size: 8, font: regular });
    page.drawRectangle({
      x: left + 44,
      y: y - 12,
      width: 12,
      height: 12,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    if (!c.answers[i])
      page.drawText("X", { x: left + 46.5, y: y - 10, size: 9, font: bold });
    page.drawText("No", { x: left + 61, y: y - 10, size: 8, font: regular });
    const rows = lines(q, 12, width - 92);
    rows.forEach((row, n) =>
      page.drawText(row, {
        x: left + 88,
        y: y - 9 - n * 15,
        size: 12,
        font: regular,
      }),
    );
    y -= Math.max(18, rows.length * 15 + 3);
  });
  text(
    (complete
      ? "If you answered NO to any question, please explain: "
      : "Comments: ") + (c.explanation || "None"),
    9,
    { gap: 5 },
  );
  if (complete) {
    field(
      "May we use you as a reference?",
      c.referencePermission ? "Yes" : "No",
    );
    text(
      `I, ${c.homeownerName}, certify that all of my new windows are installed to my satisfaction, and that I am accepting the workmanship of this installation. I understand that Window World is now only responsible to repair items covered under my new window warranty.`,
      12,
      { gap: 4 },
    );
  } else if (service)
    text(
      `I, ${c.homeownerName}, certify that I inspected the service work recorded above and that the completed service work is satisfactory.`,
      12,
      { gap: 4 },
    );
  else {
    text(
      `I, ${c.homeownerName}, certify that I have inspected all the completed windows and/or frames listed above and that they have been installed to my satisfaction.`,
      12,
      { gap: 3 },
    );
    center("WHAT HAPPENS NEXT?", 11, bold);
    text(
      "Your reorder will be processed immediately. When we receive confirmation from manufacturing, we will call to schedule a completion date.",
      12,
      { gap: 4 },
    );
  }
  if (!service) {
    text("A 3% processing fee applies to credit card payments.", 11, {bold:true,gap:4});
    rule();
    center(
      complete
        ? "NOTICE: PLEASE PAY INSTALLER UPON COMPLETION"
        : "WE WOULD APPRECIATE PAYMENT ON THE PORTIONS OF WORK COMPLETED TODAY! THANK YOU!",
      9.5,
      bold,
    );
    field("Current Balance:", money(c.currentBalance));
    field("Amount Paid Today:", money(c.paymentAmount));
    field("Remaining Balance:", money(c.remainingBalance));
    field("Type of payment:", c.paymentMethod || "None recorded");
    if (c.paymentReference) field("Payment / reference:", c.paymentReference);
    if (c.cardLastFour) field("Credit card ending:", c.cardLastFour);
    if (c.paymentDifferenceReason)
      field(
        "If amount paid differs from current balance due please state why:",
        c.paymentDifferenceReason,
      );
    text(
      "Payment will be processed by Window World Accounting. No full card number, expiration date, or security code is stored in Production Desk.",
      10,
      { gap: 4 },
    );
  }
  ensure(100);
  const customer = await pdf.embedPng(c.customerSignatureDataUrl),
    installer = await pdf.embedPng(c.installerSignatureDataUrl),
    sigW = 210,
    sigH = 48;
  const customerSize = customer.scaleToFit(sigW, sigH),
    installerSize = installer.scaleToFit(sigW, sigH);
  page.drawImage(customer, { x: left, y: y - sigH, ...customerSize });
  page.drawImage(installer, { x: left + 274, y: y - sigH, ...installerSize });
  y -= sigH + 3;
  page.drawLine({
    start: { x: left, y },
    end: { x: left + sigW, y },
    thickness: 1,
  });
  page.drawLine({
    start: { x: left + 274, y },
    end: { x: left + 274 + sigW, y },
    thickness: 1,
  });
  y -= 11;
  page.drawText("Customer Signature - " + clean(c.homeownerName), {
    x: left,
    y,
    size: 8,
    font: regular,
  });
  page.drawText("Installer Signature - " + clean(c.installerName), {
    x: left + 274,
    y,
    size: 8,
    font: regular,
  });
  y -= 18;
  if (c.reviewedBy)
    field("Reviewed by:", `${c.reviewedBy} - ${day(c.reviewedAt)}`);
  else field("Field Supervisor review:", "Pending");
  if (complete) {
    ensure(190);
    rule();
    center("Waiver and Release of Lien", 14, serif);
    center("UPON FINAL PAYMENT", 10, bold);
    text(
      `The undersigned lienor, in consideration of the final payment in the amount of $ ${typeof c.paymentAmount === "number" ? c.paymentAmount.toFixed(2) : "Not recorded"}, hereby waives and releases its lien and right to claim a lien for labor, services, or materials furnished to ${c.customerName} on the job of ${c.customerId} to the following described property: ${[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}.`,
      12,
      { gap: 4 },
    );
    const signed = new Date(c.signedAt),
      year = signed.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
      });
    text(
      `Dated on ${day(c.signedAt)} (year) ${year} (Lienor) Window World By: ${clean(c.installerName)}`,
      12,
      { gap: 5 },
    );
    ensure(65);
    const waiverSignature = installer.scaleToFit(210, 48);
    page.drawImage(installer, {
      x: left,
      y: y - 48,
      width: waiverSignature.width,
      height: waiverSignature.height,
    });
    y -= 58;
    center(
      "You are now covered completely by the Window World warranty.",
      10,
      bold,
    );
    center("It is sincerely our pleasure to continue serving you.", 10, bold);
    center(
      `Total Amount Paid In Full: ${money(c.contractAmount ?? c.paymentAmount)}    Date: ${day(c.signedAt)}`,
      12,
      bold,
    );
  }
  ensure(20);
  page.drawText(
    `Production Desk - Signed electronic certificate - Record ID ${clean(c.id)}`,
    {
      x: left,
      y: y - 12,
      size: 7,
      font: regular,
      color: rgb(0.3, 0.35, 0.4),
    },
  );
  // Crop to actual content, then fit the complete signed record on one Letter page.
  const contentBottom = Math.max(0, y - 24);
  // Serialize first so pdf-lib flushes the font and image resources before
  // another document copies the page. Copying the live page loses resources.
  const sourceBytes = await pdf.save();
  const source = await PDFDocument.load(sourceBytes);
  const output = await PDFDocument.create();
  const embedded = await output.embedPage(source.getPage(0), {
    left: 0,
    bottom: contentBottom,
    right: W,
    top: H,
  });
  const target = output.addPage([612, 792]);
  const scale = Math.min(1, 720 / embedded.height, 552 / embedded.width);
  target.drawPage(embedded, {
    x: (612 - embedded.width * scale) / 2,
    y: 792 - 36 - embedded.height * scale,
    xScale: scale,
    yScale: scale,
  });
  return output.save();
}
export async function jobCertificatePdfBase64(c: any) {
  return Buffer.from(await jobCertificatePdf(c)).toString("base64");
}
