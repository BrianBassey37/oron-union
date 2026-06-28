// =====================================================================
// EXCO DISPLAY — fetches live member data from Supabase and populates
// leader-card grids on leadership, youth, women and students pages.
//
// Usage: call loadExcoSection('Group Name', 'grid-element-id')
// after including the Supabase CDN and this file.
// =====================================================================

(function () {
  var SUPABASE_URL  = 'https://tmidqbxwgkeqtkuppauh.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtaWRxYnh3Z2tlcXRrdXBwYXVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1OTUwNzAsImV4cCI6MjA5ODE3MTA3MH0.1Hstj_lypWmbB5LpxpLkBJ4d2_ybSUsKY_KYeTVnnXQ';

  var _client = null;

  function getClient() {
    if (!_client && window.supabase) {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }
    return _client;
  }

  var PERSON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="12" cy="7" r="4"/></svg>';

  function buildCard(m) {
    var photo = m.photo_url
      ? '<img class="leader-avatar" src="' + m.photo_url + '" alt="' + m.full_name + '" loading="lazy" />'
      : '<div class="leader-avatar-placeholder">' + PERSON_SVG + '</div>';
    var sub = m.affiliation
      ? '<div class="leader-lga">' + m.affiliation + '</div>'
      : '';
    return (
      '<div class="leader-card reveal visible">' +
        photo +
        '<div class="leader-name">' + m.full_name + '</div>' +
        '<div class="leader-role">' + m.role + '</div>' +
        sub +
      '</div>'
    );
  }

  window.loadExcoSection = function (groupName, containerId) {
    var c = getClient();
    var el = document.getElementById(containerId);
    if (!c || !el) return;

    c.from('exco_members')
      .select('*')
      .eq('grp', groupName)
      .order('created_at', { ascending: true })
      .then(function (result) {
        if (result.error || !result.data || result.data.length === 0) return;
        el.innerHTML = result.data.map(buildCard).join('');
      });
  };
})();
