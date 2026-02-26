-- Artlink Crawling DB Schema
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS postings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  source_url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  field TEXT,
  category TEXT,
  description TEXT,
  requirements JSONB DEFAULT '{}',
  deadline TEXT,
  pay TEXT,
  location TEXT,
  contact TEXT,
  tags TEXT[] DEFAULT '{}',
  tab TEXT DEFAULT '프로젝트',
  status TEXT DEFAULT 'active',
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postings_field ON postings(field);
CREATE INDEX IF NOT EXISTS idx_postings_status ON postings(status);
CREATE INDEX IF NOT EXISTS idx_postings_source ON postings(source);
CREATE INDEX IF NOT EXISTS idx_postings_crawled ON postings(crawled_at);
CREATE INDEX IF NOT EXISTS idx_postings_tab ON postings(tab);

CREATE TABLE IF NOT EXISTS crawl_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_found INT DEFAULT 0,
  items_new INT DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_message TEXT
);
