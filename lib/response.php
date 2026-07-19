<?php
/**
 * Small JSON response helpers shared by every api/*.php endpoint.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function json_ok($data = []) {
    echo json_encode(array_merge(['ok' => true], $data));
    exit;
}

function json_error($message, $httpStatus = 400, $extra = []) {
    http_response_code($httpStatus);
    echo json_encode(array_merge(['ok' => false, 'error' => $message], $extra));
    exit;
}

/**
 * Reads a JSON request body into an associative array. Returns [] if the
 * request wasn't JSON (e.g. a multipart/form-data upload, which should
 * read $_POST/$_FILES directly instead).
 */
function read_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_action($body, $allowed) {
    $action = isset($body['action']) ? $body['action'] : (isset($_GET['action']) ? $_GET['action'] : null);
    if (!in_array($action, $allowed, true)) {
        json_error('Unknown or missing action', 404);
    }
    return $action;
}
