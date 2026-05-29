-- Add is_admin column to profiles
ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Drop existing update policy for profiles (if any) so we can replace it
-- The old policy allowed owners to update any field on their profile.
-- We need to prevent users from self-promoting to admin.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- New update policy: owners can update their profile, but cannot set is_admin = true
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (is_admin = false);
