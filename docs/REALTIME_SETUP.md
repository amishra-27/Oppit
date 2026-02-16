# Realtime Setup — `public.readings`

Supabase Realtime requires two things to deliver `INSERT` events to browser clients:

1. The table must be in the `supabase_realtime` publication.
2. RLS must allow the subscribing user to `SELECT` the inserted row.

If either is missing, the subscription connects silently but delivers **zero events**.

---

## 1. Publication check

Verify `readings` is published:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'readings';
```

**Expected:** one row. If empty, run:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;
```

> The migration `20260213_add_readings_to_realtime_publication` handles this idempotently.

---

## 2. RLS check for `readings_select`

Realtime events are filtered through the same RLS policies as a normal `SELECT`. The authenticated user must pass the `readings_select` policy to receive rows.

Check the policy exists:

```sql
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'readings'
  AND policyname = 'readings_select';
```

**Expected output:**

| policyname | cmd | roles | qual |
|---|---|---|---|
| readings_select | SELECT | {authenticated} | `exists (select 1 from machines m where m.id = readings.machine_id and is_company_member(m.company_id))` |

This means the subscribing user must be a `company_member` of the company that owns the machine. If the user is not a member, the row is silently filtered out.

Check that the user has a membership row:

```sql
-- Replace <user-uuid> and <company-uuid> with real values
SELECT * FROM public.company_members
WHERE user_id = '<user-uuid>'
  AND company_id = '<company-uuid>';
```

---

## 3. Local / dev verification steps

### 3a. Confirm subscription connects

In browser DevTools console (with your app running):

```
# Look for WebSocket frames to /realtime/v1/websocket
# The channel should show status "SUBSCRIBED" in the Network tab
```

Or check the `useReadingsRealtime` hook status in React DevTools — it should report `"connected"`.

### 3b. Insert a test reading and watch for delivery

In the Supabase SQL Editor:

```sql
-- Pick a machine_id the logged-in user has access to
INSERT INTO public.readings (machine_id, metric, value)
VALUES (
  'cf6b2a74-cfa7-47a4-b208-7c471eec9dde',  -- Machine 01
  'rpm',
  1234.5
);
```

**Expected:** the dashboard should update within ~1 second (realtime push triggers SWR mutate). Check the browser console for the `useReadingsRealtime` log.

### 3c. Verify SWR polling fallback

Even if Realtime is down, the dashboard polls every 5 seconds via SWR `refreshInterval`. To test:

1. Disconnect Realtime (e.g. block WebSocket in DevTools).
2. Insert another reading via SQL.
3. The card/chart should update within 5 seconds.

---

## 4. Troubleshooting: silent subscriptions

### Symptom: subscription status is "SUBSCRIBED" but no events arrive

| Cause | Fix |
|---|---|
| Table not in publication | Run `ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;` |
| RLS denies the row | User must be a `company_member` of the machine's company. Check `company_members` table. |
| Wrong filter on subscription | Ensure the channel filter matches the `machine_id` being inserted. Check `useReadingsRealtime` hook params. |
| Using service-role key on client | Service-role bypasses RLS but Realtime uses the **JWT role**. The browser client must use the anon key + user session. |

### Symptom: subscription status is "CHANNEL_ERROR" or "error"

| Cause | Fix |
|---|---|
| Realtime not enabled for project | Go to Supabase Dashboard → Database → Replication and enable Realtime. |
| Invalid anon key or project URL | Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. |
| RLS policy raises exception | Check Supabase logs (Dashboard → Logs → Realtime) for policy errors. |

### Symptom: events arrive for some machines but not others

The user's `company_members` row determines which machines are visible. If Machine X belongs to Company B but the user is only in Company A, the `readings_select` policy filters it out silently.

```sql
-- Check which companies the user belongs to
SELECT c.name, cm.role
FROM public.company_members cm
JOIN public.companies c ON c.id = cm.company_id
WHERE cm.user_id = auth.uid();

-- Check which company owns the machine
SELECT m.name, m.company_id
FROM public.machines m
WHERE m.id = '<machine-id>';
```

If the company IDs don't match, the user won't receive events for that machine.
