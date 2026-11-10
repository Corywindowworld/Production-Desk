const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function salesResultEmail(job:any, certificate:any, appUrl:string, measurementSurvey?: {stars:number;notes?:string}) {
 const name=String(job.customer || 'Customer');
 const contractor=certificate.contractorId || 'number not recorded';
 const message=`Completion Results submitted by installer ${contractor}. Pending management review`;
 const address=[job.address,job.city,job.state,job.zip].filter(Boolean).join(', ');
 const phone=job.phone || job.homePhone || 'Not recorded';
 const subject=`${name} · Completion Results · Customer ID ${job.number}`;
 const logo=new URL('/window-world-tampa-bay.jpeg',appUrl).href;
 const stars = measurementSurvey?.stars;
 const rating = typeof stars === 'number' && Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 0;
 const ratingText = rating ? `${rating} out of 5 stars` : 'Not rated';
 const ratingStars = Array.from({length:5}, (_, index) => index < rating
   ? '<span style="color:#b57600">&#9733;</span>'
   : '<span style="color:#62788a">&#9734;</span>').join('');
 const comments = escape(measurementSurvey?.notes?.trim() || 'None').replace(/\r?\n/g, '<br>');
 const survey = `<tr><td><b>Sales Rep Measurement Rating</b><br><span aria-hidden="true" style="white-space:nowrap;font-family:'Segoe UI Symbol',Arial,sans-serif;font-size:25px;letter-spacing:2px">${ratingStars}</span><br>${ratingText}</td></tr><tr><td><b>Comments</b><br>${comments}</td></tr>`;
 const result = escape(certificate.type || 'Completion');
 const resultBadge = certificate.type === 'Complete'
   ? `<span style="display:inline-block;background:#e7f5ec;color:#176438;border:1px solid #b9dec7;border-radius:16px;padding:3px 10px;font-weight:bold"><span aria-hidden="true">&#10003;</span>&nbsp; ${result}</span>`
   : result;
 const html=`<!doctype html><html><body style="margin:0;background:#edf3f8;font-family:Arial,sans-serif;color:#18364e"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:white;border-radius:16px;overflow:hidden"><tr><td style="background:#064b88;padding:24px"><img src="${escape(logo)}" width="230" alt="Window World Tampa Bay" style="display:block;width:230px;max-width:100%;background:white;border-radius:10px;padding:10px"><h1 style="font-size:25px;color:white;margin:22px 0 6px">Completion Results</h1><p style="color:#dceeff;margin:0">Production Desk · Tampa Bay</p></td></tr><tr><td style="padding:28px"><h2 style="margin:0 0 8px;font-size:24px">${escape(name)}</h2><p style="color:#62788a;margin:0 0 22px">Customer ID #${escape(job.number)}</p><p style="padding:16px;background:#edf5fc;border-left:4px solid #064b88;line-height:1.6">${escape(message)}</p><table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="font-size:16px;line-height:1.5"><tr><td><b>Customer</b><br>${escape(name)}</td></tr><tr><td><b>Address</b><br>${escape(address || 'Not recorded')}</td></tr><tr><td><b>Phone</b><br>${escape(phone)}</td></tr><tr><td><b>Result submitted</b><br>${resultBadge}</td></tr><tr><td><b>Installer</b><br>${escape(certificate.installerName)} · ${escape(contractor)}</td></tr>${survey}</table><p style="font-size:14px;line-height:1.6;color:#62788a">The submitted result is awaiting management review. Contact the field supervisor for questions about the job.</p></td></tr><tr><td style="padding:18px 28px;background:#f4f8fc;color:#62788a;font-size:12px">Window World Tampa Bay · Production Desk</td></tr></table></td></tr></table></body></html>`;
 return {subject,html};
}
