# Admin setup
Public registration offers only Student and Teacher. Admin must not be a public registration option.

After creating the intended administrator account, assign the role in Supabase SQL Editor:
```sql
update public.profiles set role = 'Admin' where id = 'USER_UUID_HERE';
```
The Admin CMS stores managed content in `cms_content`. Privileged Auth operations such as deleting an Auth user or enforcing account deactivation should be implemented server-side with a Supabase Edge Function. Never expose the service-role key in browser code.

Password recovery uses Supabase Auth `resetPasswordForEmail`; Resend is not required.


## v4 Admin Access Code
The web-only Admin portal now requires three checks: Admin email/password, the stored `Admin` role, and the Admin Access Code `PUPADMIN2026`. The access code is validated by the `verify_admin_access_code` Supabase function and is not stored in browser JavaScript or included as a visible value in the Admin page. The Admin role and Row Level Security remain mandatory even when the code is correct.
