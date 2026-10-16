export function certificatesForJob(j: any) {
  const reports = [
      j?.operations?.report,
      ...(j?.operations?.previousReports || []),
      ...(j?.operations?.remoteCertificates || []).map((certificate:any)=>({certificate})),
    ].filter(Boolean),
    seen = new Set<string>();
  return reports
    .map((report: any) => report?.certificate)
    .filter((certificate: any) => {
      if (!certificate) return false;
      const key = String(
        certificate.id ||
          [
            certificate.type,
            certificate.signedAt,
            certificate.customerEmail,
          ].join(":"),
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function uploadedDocumentsForJob(j: any) {
  return (j?.attachments || []).filter((a: any) =>
    /\.(pdf|docx?|xlsx?)$/i.test(String(a?.name || "")),
  );
}
