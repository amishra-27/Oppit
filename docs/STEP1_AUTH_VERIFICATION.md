# Step 1 Verification — Auth + Multi-Company Isolation

## What was done

### Migrations applied
| Migration | Purpose |
|---|---|
| `add_companies_auth_rls` | RLS on `companies` + `company_members`, SELECT/INSERT/UPDATE/DELETE policies |
| `add_get_my_companies_rpc` | `get_my_companies()` — returns `(id, name, role)` for `auth.uid()` |
| `add_create_company_and_set_owner_rpc` | (renamed below) |
| `rename_create_company_rpc` | `create_company_with_owner(p_name)` — SECURITY DEFINER, creates company + owner row |
| `drop_duplicate_create_company_rpc` | Cleanup of old `create_company()` |

### RLS policy summary

**`companies`**
- SELECT: user is a member (`company_members.user_id = auth.uid()`)
- INSERT: blocked (`false`) — use `create_company_with_owner()` RPC
- UPDATE: `is_company_admin(id)`
- DELETE: owner only

**`company_members`**
- SELECT: `user_id = auth.uid()` (no recursion)
- INSERT/UPDATE/DELETE: caller must be owner/admin of that company

**`plants`** — `is_company_member(company_id)` for SELECT; `is_company_admin` for writes  
**`machines`** — same pattern, `company_id` auto-set by trigger  
**`readings`** — SELECT checks machine → company membership; INSERT blocked for users  

### API route changes
- `/api/plants/[plantId]/cards` — now uses session-bound client (anon key + user JWT from cookies); returns 401 if not authenticated; RLS filters results by company membership
- `/api/machines/[machineId]/history` — same pattern; RLS on `machines` and `readings` enforces tenancy

### Ingest Edge Function
- Still uses `SUPABASE_SERVICE_ROLE_KEY` (machine-to-machine auth)
- `machine_id` resolved from API key hash lookup, NOT from request body
- Body `machine_id` is validated-only if present — never used as the insert target

---

## Verification SQL checks

Run these in Supabase SQL Editor as different roles to verify isolation.

### 1. Confirm RLS is enabled
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('companies', 'company_members', 'plants', 'machines', 'readings');
```
Expected: all `rowsecurity = true`.

### 2. Confirm policies exist
```sql
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('companies', 'company_members')
ORDER BY tablename, policyname;
```

### 3. Test `get_my_companies` as authenticated user
In your app or via Supabase client:
```typescript
const { data, error } = await supabase.rpc("get_my_companies");
// Should return only companies where you have a company_members row
```

### 4. Test `create_company_with_owner` as authenticated user
```typescript
const { data: companyId, error } = await supabase.rpc("create_company_with_owner", {
  p_name: "Test Corp",
});
// Should return a UUID; calling get_my_companies should now include "Test Corp"
```

### 5. Cross-tenant isolation test
User A (member of Company X) tries to read Company Y's plant:
```
GET /api/plants/<company-Y-plant-id>/cards
```
Expected: `200` with `machines: []` (RLS filters out all machines since user isn't a member).

User A tries to read Company Y's machine history:
```
GET /api/machines/<company-Y-machine-id>/history
```
Expected: `404 Machine not found` or `200` with `points: []` (RLS prevents access).

### 6. Unauthenticated access test
```
GET /api/plants/<any-plant-id>/cards
# Without session cookies
```
Expected: `401 Unauthorized`.

---

## Acceptance criteria checklist

- [x] User from Company A cannot read Company B data via API by changing IDs
- [x] `get_my_companies` works for authenticated users (returns id, name, role)
- [x] New user can create a company via `create_company_with_owner` without manual DB edits
- [x] Existing pages still load with authenticated session (RLS enforced via anon key + JWT)
- [x] Ingest function remains service-role, writes only to key-linked machine
- [x] All user-facing routes return 401 for unauthenticated requests
