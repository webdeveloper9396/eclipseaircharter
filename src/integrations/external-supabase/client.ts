import { createClient } from '@supabase/supabase-js';
import type { ExternalDatabase } from './types';

const EXTERNAL_SUPABASE_URL = 'https://zhjkexhurxafsurnsetw.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoamtleGh1cnhhZnN1cm5zZXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MTA1OTUsImV4cCI6MjA4MzM4NjU5NX0.Qn8CbrwX1Vaw4-v3g4J-5Xffw55BTah278eUOW6yYRU';

// External Supabase client for operational data (read-only via RLS)
export const externalSupabase = createClient<ExternalDatabase>(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY
);
