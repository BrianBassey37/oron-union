<?php
/**
 * api/media.php — Media Library (photo / video / audio), shared across
 * the admin dashboard and the public Entertainment page.
 *
 * Actions:
 *   GET  ?action=list                                            (public)
 *   POST ?action=upload  multipart (title, type, artist, description,
 *                          file) OR JSON (..., url) instead of file  (admin session)
 *   POST ?action=delete  {id}                                     (admin session)
 */

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/uploads.php';
start_secure_session();

$isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;
$body = $isMultipart ? $_POST : read_json_body();
$action = require_action($body, ['list', 'upload', 'delete']);

switch ($action) {

case 'list': {
    $rows = db()->query(
        'SELECT id, title, type, artist, description, storage_type, file_path, url, file_size, mime_type, created_at
         FROM media_items ORDER BY created_at DESC'
    )->fetchAll();
    json_ok(['items' => $rows]);
}

case 'upload': {
    require_admin();
    $title = trim($body['title'] ?? '');
    $type = $body['type'] ?? '';
    $artist = trim($body['artist'] ?? '');
    $description = trim($body['description'] ?? '');
    $url = trim($body['url'] ?? '');

    if (!$title) json_error('Enter a title.');
    if (!in_array($type, ['photo', 'video', 'audio'], true)) json_error('Invalid media type.');

    $hasFile = !empty($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK;
    if (!$hasFile && !$url) json_error('Upload a file or provide a URL.');

    if ($hasFile) {
        if ($type === 'photo') {
            $path = handle_photo_upload('file', 'media');
            $storageType = 'file'; $filePath = $path; $fileSize = null; $mime = null;
        } else {
            $res = handle_media_file_upload('file', 'media');
            $storageType = 'file'; $filePath = $res['path']; $fileSize = $res['size']; $mime = $res['mime'];
        }
        $stmt = db()->prepare(
            'INSERT INTO media_items (title, type, artist, description, storage_type, file_path, file_size, mime_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$title, $type, $artist ?: null, $description ?: null, $storageType, $filePath, $fileSize, $mime]);
    } else {
        $stmt = db()->prepare(
            'INSERT INTO media_items (title, type, artist, description, storage_type, url)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$title, $type, $artist ?: null, $description ?: null, 'url', $url]);
    }

    log_activity('admin', 'upload_media', $title);
    json_ok(['id' => (int) db()->lastInsertId()]);
}

case 'delete': {
    require_admin();
    $id = $body['id'] ?? null;
    if (!$id) json_error('Missing media id.');

    $stmt = db()->prepare('SELECT storage_type, file_path FROM media_items WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row && $row['storage_type'] === 'file' && $row['file_path']) {
        $full = __DIR__ . '/../' . $row['file_path'];
        if (is_file($full)) @unlink($full);
    }

    db()->prepare('DELETE FROM media_items WHERE id = ?')->execute([$id]);
    log_activity('admin', 'delete_media', (string) $id);
    json_ok();
}

}
