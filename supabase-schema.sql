-- ============================================================
--  ciccini — Supabase SQL setup
--  Esegui questo script dalla Supabase SQL Editor
--  https://supabase.com/dashboard/project/asqpmpjemiaiyqohoyfc/sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabella invitati (guests)
--    Se esiste già, aggiunge solo la colonna guest_type
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guests (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  surname       TEXT NOT NULL,
  guest_type    TEXT NOT NULL DEFAULT 'adulto',  -- adulto | bambino | neonato
  phone         TEXT,
  "table"       TEXT,
  diet          TEXT,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'in attesa', -- in attesa | confermato | declinato
  source        TEXT NOT NULL DEFAULT 'manuale',   -- manuale | rsvp | excel
  rsvp_date     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aggiunge guest_type se la tabella esisteva già senza di essa
ALTER TABLE guests ADD COLUMN IF NOT EXISTS guest_type TEXT NOT NULL DEFAULT 'adulto';

-- ------------------------------------------------------------
-- 2. Tabella contenuti del sito (site_content)
--    Una riga sola con id = 'main'; upsert dal frontend
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_content (
  id            TEXT PRIMARY KEY DEFAULT 'main',
  content       JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT NOT NULL DEFAULT 'admin'
);

-- Inserisce la riga vuota di default se non esiste
INSERT INTO site_content (id, content) VALUES ('main', '{}')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Storico modifiche ai contenuti (content_history)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content       JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT NOT NULL DEFAULT 'admin',
  note          TEXT
);

-- ------------------------------------------------------------
-- 4. Row Level Security
--    Abilita RLS e crea policy permissive (chiave anon del progetto)
--    Per produzione: restringi a ruoli specifici o usa la service_role
-- ------------------------------------------------------------

-- guests
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guests" ON guests;
CREATE POLICY "allow_all_guests" ON guests
  FOR ALL USING (true) WITH CHECK (true);

-- site_content
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_site_content" ON site_content;
CREATE POLICY "allow_all_site_content" ON site_content
  FOR ALL USING (true) WITH CHECK (true);

-- content_history (sola lettura per la chiave anon, write tramite service_role)
ALTER TABLE content_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_read_content_history" ON content_history;
CREATE POLICY "allow_read_content_history" ON content_history
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_insert_content_history" ON content_history;
CREATE POLICY "allow_insert_content_history" ON content_history
  FOR INSERT WITH CHECK (true);

-- ------------------------------------------------------------
-- 5. Indici utili
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_guests_status   ON guests (status);
CREATE INDEX IF NOT EXISTS idx_guests_source   ON guests (source);
CREATE INDEX IF NOT EXISTS idx_history_updated ON content_history (updated_at DESC);

-- ============================================================
--  Fine script
-- ============================================================
