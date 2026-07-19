<?php
/**
 * Session + role helpers shared by every api/*.php endpoint.
 *
 * CSRF note: session cookies are set httponly + secure + SameSite=Strict
 * below, which is the practical mitigation for this same-origin app (no
 * legitimate cross-site POST use case exists). Full per-form CSRF tokens
 * are a possible future hardening step but are not implemented here.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';

function start_secure_session() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'secure'   => defined('SESSION_COOKIE_SECURE') ? SESSION_COOKIE_SECURE : true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function current_member() {
    if (empty($_SESSION['member_id'])) return null;
    $stmt = db()->prepare('SELECT * FROM members WHERE id = ?');
    $stmt->execute([$_SESSION['member_id']]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_member() {
    $m = current_member();
    if (!$m) json_error('Not signed in', 401);
    return $m;
}

function require_approved_member() {
    $m = require_member();
    if ($m['status'] !== 'approved') json_error('Membership not approved', 403);
    return $m;
}

function require_admin() {
    if (empty($_SESSION['is_admin'])) json_error('Admin session required', 403);
}

function require_endorser() {
    if (empty($_SESSION['is_endorser'])) json_error('Endorser session required', 403);
}

/* ── Friendly ID generators ── */

function generate_ref() {
    return 'APP-' . str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
}

function generate_member_id($lga) {
    $codes = [
        'Oron' => 'ORN', 'Urueoffong/Oruko' => 'URO', 'Okobo' => 'OKB',
        'Mbo' => 'MBO', 'Udunguko' => 'UDG',
    ];
    $code = isset($codes[$lga]) ? $codes[$lga] : 'GEN';
    $stmt = db()->prepare('SELECT 1 FROM members WHERE member_id = ?');
    for ($i = 0; $i < 6; $i++) {
        $id = 'OU-' . date('Y') . '-' . $code . '-' . str_pad((string) random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
        $stmt->execute([$id]);
        if (!$stmt->fetch()) return $id;
    }
    return $id; // extremely unlikely to fall through; last attempt is accepted
}

/* ── Login throttling ── */

function is_login_locked_out($identifier) {
    $stmt = db()->prepare(
        'SELECT COUNT(*) AS n FROM login_attempts
         WHERE identifier = ? AND success = 0 AND attempted_at > (NOW() - INTERVAL 15 MINUTE)'
    );
    $stmt->execute([$identifier]);
    return (int) $stmt->fetch()['n'] >= 8;
}

function record_login_attempt($identifier, $success) {
    $stmt = db()->prepare(
        'INSERT INTO login_attempts (identifier, ip_address, success, attempted_at) VALUES (?, ?, ?, NOW())'
    );
    $stmt->execute([$identifier, $_SERVER['REMOTE_ADDR'] ?? '', $success ? 1 : 0]);
}

/* ── Activity log (approve/reject/HoF & election content edits) ── */

function log_activity($actor, $action, $details = '') {
    $stmt = db()->prepare(
        'INSERT INTO activity_log (actor, action, details, created_at) VALUES (?, ?, ?, NOW())'
    );
    $stmt->execute([$actor, $action, $details]);
}
