# Account invitation email

New active accounts automatically receive their sign-in link, email, and one-time temporary password when the email service is configured. Issuing a replacement temporary password also attempts to email the new credentials. Ordinary account edits do not send credentials.

Configure these production runtime values through Sites environment settings:

- `RESEND_API_KEY`: a secret Resend API key with permission to send email.
- `ACCOUNT_EMAIL_FROM`: a sending email address on a domain verified in that Resend account.

Never commit the key. Verify the sending domain with its owner before activation. See https://resend.com/docs/dashboard/domains/introduction and https://resend.com/docs/api-reference/emails/send-email.

The platform currently restricts this Site to its owner. Staff must also be permitted through the Site's access settings before they can reach the app login. Changing this audience requires the owner's authorization; application email/password authentication remains in force.

Passwords are held only while creating/resetting the account and making the email request; only password hashes are stored. Email is attempted after the account transaction commits. The administration screen distinguishes provider acceptance from missing configuration or failed submission. Provider acceptance does not guarantee inbox delivery. When submission fails, the account remains created and its password is shown once so the administrator can share it directly or issue a replacement later.

The test suite mocks delivery; no production recipient is contacted by automated tests.
