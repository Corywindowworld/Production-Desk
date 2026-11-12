// PostgreSQL text columns return JSON strings; JSONB columns return decoded values.
// Support both without modifying stored customer data or discarding invalid records.
export function storedObject(value:unknown):Record<string,any>{
 const decoded=typeof value==='string'?JSON.parse(value):value;
 if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw new TypeError('Expected a stored object');
 return decoded as Record<string,any>;
}
