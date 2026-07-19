// =====================================================================
// EXCO DISPLAY — fetches live member data from the PHP API and populates
// leader-card grids on leadership, youth, women and students pages.
//
// Usage: call loadExcoSection('Group Name', 'grid-element-id')
// after including this file.
// =====================================================================

(function () {
  var PERSON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="12" cy="7" r="4"/></svg>';

  function buildCard(m) {
    var photo = m.photo_path
      ? '<img class="leader-avatar" src="' + m.photo_path + '" alt="' + m.full_name + '" loading="lazy" />'
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
    var el = document.getElementById(containerId);
    if (!el) return;

    fetch('api/exco.php?action=list&grp=' + encodeURIComponent(groupName), { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        var members = result.ok ? (result.members || []) : [];
        el.innerHTML = members.length
          ? members.map(buildCard).join('')
          : '<p style="grid-column:1/-1;text-align:center;color:var(--gray,#888);padding:24px 0;">Executive members for this office will appear here once submitted.</p>';
      });
  };
})();
