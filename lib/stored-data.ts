// PostgreSQL text columns return JSON strings; JSONB columns return decoded values.
// Support both without modifying stored customer data or discarding invalid records.
export function storedObject(value:unknown):Record<string,any>{
 const decoded=typeof value==='string'?JSON.parse(value):value;
 if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw new TypeError('Expected a stored object');
 return decoded as Record<string,any>;
}

// Older sales rep saves could concatenate JSON strings into an array in PostgreSQL.
export function storedSalesRep(value: unknown): Record<string, any> {
 const entries = Array.isArray(value) ? value : [value];
 const contact: Record<string, any> = {};
 for (const entry of entries) {
  try { Object.assign(contact, storedObject(entry)); }
  catch (error) {
   if (!(error instanceof TypeError || error instanceof SyntaxError)) throw error;
  }
 }
 return contact;
}
