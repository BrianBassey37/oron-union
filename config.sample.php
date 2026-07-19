<?php
/**
 * Oron Union — site configuration template.
 *
 * Copy this file to "config.php" (same folder) and fill in your real
 * values. "config.php" is git-ignored and should never be committed —
 * it holds your database password and admin/endorser access codes.
 */

// ── Database (create this database + user in your host's cPanel first) ──
define('DB_HOST', 'localhost');
define('DB_NAME', 'oron_union');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');

// ── Access codes ──
// These gate the Admin Dashboard (admin.html) and Endorser Portal
// (endorser.html). Change them from the site's original demo value
// before going live.
define('ADMIN_CODE', 'oron1925');
define('ENDORSER_CODE', 'oron1925');

// ── Session cookie hardening ──
// Set to false only while testing locally over plain http:// — must be
// true on the live site once it's served over https://.
define('SESSION_COOKIE_SECURE', true);

// ── Outgoing email (verification codes) ──
// Sent via PHP's built-in mail() through the host's mail service — no
// separate SMTP account needed on cPanel. Use an address at your own
// domain so it doesn't get flagged as spoofed.
define('MAIL_FROM_ADDRESS', 'noreply@yourdomain.org');
define('MAIL_FROM_NAME', 'Oron Union');
