import {database} from '@/db/raw';

// Each reviewer has their own delivery for a labor submission. Admins see their
// own copy while retaining the cross-recipient view for other alert types.
export async function unreadJobAlerts(member: {id: string; role: string}, cutoff: string) {
 const recipientFilter = member.role === 'admin'
  ? "(n.recipient_id=? OR n.message NOT LIKE '%: installer labor ready for review.')"
  : 'n.recipient_id=?';
 const result = await database().prepare(
  `SELECT n.*,m.name AS recipient_name
   FROM notifications n LEFT JOIN members m ON m.id=n.recipient_id
   WHERE ${recipientFilter} AND n.read_at IS NULL AND n.created>?
   ORDER BY n.created DESC LIMIT 100`
 ).bind(member.id, cutoff).all();
 return result.results;
}
