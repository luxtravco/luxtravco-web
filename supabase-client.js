window.luxSupabaseReady = import(
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
).then(({ createClient }) => {
  const SUPABASE_URL = 'https://vmphayezatepxjauxhcd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_TwCvQ_u0VglyXCy6Sgciwg_3XulTaU1';
  window.luxSupabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  return window.luxSupabase;
});
