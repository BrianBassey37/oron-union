<?php
/**
 * PDO singleton connection to MySQL. Every query elsewhere in the app
 * uses this via prepared statements — never build SQL by string concat.
 */

require_once __DIR__ . '/../config.php';

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

/**
 * MySQL duplicate-key error (used to turn a UNIQUE KEY violation into a
 * friendly "already voted" / "already exists" message instead of a 500).
 */
function is_duplicate_key_error(PDOException $e) {
    return isset($e->errorInfo[1]) && (int) $e->errorInfo[1] === 1062;
}
