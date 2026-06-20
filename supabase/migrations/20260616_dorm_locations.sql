-- dorm_locations — single source of truth for all dorm metadata.
-- Replaces hardcoded arrays in dorm-shapes.ts, onboarding/data.ts,
-- dorm-name-fuzzy-match.ts, mark-delivered, cid.ts, and chatbot knowledge.

CREATE TABLE IF NOT EXISTS dorm_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  cid_code CHAR(3) NOT NULL,
  shape TEXT NOT NULL DEFAULT 'plus',
  sort_order INT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  is_delivery_target BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO dorm_locations (canonical_name, display_name, cid_code, shape, sort_order, aliases, is_delivery_target)
VALUES
  ('The Myriad',     'MYRIAD',      'MYR', 'circle',   1, ARRAY['the myriad','myriad'], true),
  ('KSK Homes',      'KSK HOMES',   'KSK', 'square',   2, ARRAY['ksk homes','ksk'], true),
  ('Yugo',            'YUGO',        'YUG', 'triangle', 3, ARRAY['yugo'], true),
  ('DSOA Residence',  'DSOA',        'DSO', 'hexagon',  4, ARRAY['dsoa residence','dsoa'], true),
  ('Study World',     'STUDY WORLD', 'STU', 'star',     5, ARRAY['study world'], true),
  ('Other',           'OTHER',       'OTH', 'plus',     6, ARRAY[]::TEXT[], false)
ON CONFLICT (canonical_name) DO NOTHING;

-- Service-role-only table. All reads go through createAdminSupabaseClient()
-- (getDormLocations / getAllDormLocations), never the user-JWT client. The
-- 2026-06-19 security lockdown (group_a_security_lockdown) enables RLS on this
-- table with NO policy and revokes anon/authenticated grants, so an authenticated
-- SELECT would silently return [] regardless of any GRANT here. Do NOT add a
-- `GRANT SELECT ... TO authenticated` back expecting client reads to work — add
-- an explicit RLS SELECT policy instead if a client read is ever needed.
GRANT ALL ON dorm_locations TO service_role;
