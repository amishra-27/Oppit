# Supabase Realtime Setup

This document describes how to enable realtime subscriptions for the `readings` table so the dashboard can receive live updates.

## Prerequisites

- Supabase project with the `readings` table
- Row Level Security (RLS) enabled on `readings`

## Step 1: Enable Realtime Publication

By default, Supabase doesn't publish changes for all tables. You need to add the `readings` table to the `supabase_realtime` publication.

Run this SQL in the Supabase SQL Editor or add it as a migration:

```sql
-- Enable realtime for the readings table
ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;
```

To verify it's enabled:

```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

## Step 2: Add RLS SELECT Policy

Realtime subscriptions **respect RLS**. If the client can't SELECT the row, they won't receive the realtime event (this fails silently).

For the pilot, you can allow anonymous access to readings:

```sql
-- Allow anonymous users to read readings (for realtime subscriptions)
CREATE POLICY "Allow anon read readings"
  ON public.readings
  FOR SELECT
  TO anon
  USING (true);
```

Or for authenticated users only:

```sql
-- Allow authenticated users to read readings
CREATE POLICY "Allow authenticated read readings"
  ON public.readings
  FOR SELECT
  TO authenticated
  USING (true);
```

**Note**: For production, you'd likely scope this to specific machines/plants the user has access to.

## Step 3: Verify Setup

1. Open the dashboard to a machine detail page
2. Check browser console for `[LiveRefetchController] Realtime connected for machine: ...`
3. Ingest a new reading via the edge function
4. The chart and cards should update without waiting for the 5s polling interval

## Troubleshooting

### No realtime events received

1. **Check publication**: Ensure `readings` is in `supabase_realtime` publication
2. **Check RLS**: Ensure there's a SELECT policy for anon/authenticated
3. **Check browser console**: Look for subscription errors
4. **Check Supabase logs**: Dashboard > Logs > Realtime

### Subscription connects but no events

This usually means RLS is blocking. The subscription will show "connected" but events are filtered out server-side.

### CHANNEL_ERROR or TIMED_OUT

- Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly
- Check browser network tab for WebSocket connection issues

## Migration Template

Here's a complete migration you can use:

```sql
-- Enable realtime for readings
ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;

-- Allow anon to SELECT (required for realtime in browser)
CREATE POLICY "Allow anon read readings"
  ON public.readings
  FOR SELECT
  TO anon
  USING (true);
```

Save as `supabase/migrations/YYYYMMDDHHMMSS_enable_realtime_readings.sql` and run `supabase db push` or apply via the dashboard.
