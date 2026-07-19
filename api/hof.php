<?php
/**
 * api/hof.php — Hall of Fame: public categories/nominees/voting +
 * admin content management.
 *
 * Actions:
 *   GET  ?action=list                                                  (public)
 *   GET  ?action=results                                               (public)
 *   POST ?action=vote  {categoryId, nomineeId, voterName, voterEmail, voterPhone} (public)
 *   POST ?action=upsert_category {id, slug, name, description, sortOrder, active} (admin session)
 *   POST ?action=upsert_nominee  {id, categoryId, name, photoUrl, bio, sortOrder, active} (admin session)
 *   POST ?action=delete_nominee  {id}                                  (admin session)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, [
    'list', 'results', 'vote', 'upsert_category', 'upsert_nominee', 'delete_nominee',
]);

switch ($action) {

case 'list': {
    // Admin sessions see inactive rows too (so they can be managed);
    // the public page only ever sees active ones.
    $activeOnly = empty($_SESSION['is_admin']);
    $categories = db()->query(
        'SELECT * FROM hof_categories' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort_order ASC'
    )->fetchAll();
    $nominees = db()->query(
        'SELECT * FROM hof_nominees' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort_order ASC'
    )->fetchAll();
    json_ok(['categories' => $categories, 'nominees' => $nominees]);
}

case 'results': {
    $rows = db()->query(
        'SELECT category_id, nominee_id, COUNT(*) AS vote_count
         FROM hof_votes GROUP BY category_id, nominee_id'
    )->fetchAll();
    json_ok(['results' => $rows]);
}

case 'vote': {
    $categoryId = $body['categoryId'] ?? null;
    $nomineeId = $body['nomineeId'] ?? null;
    $name = trim($body['voterName'] ?? '');
    $email = trim($body['voterEmail'] ?? '');
    $phone = $body['voterPhone'] ?? null;

    if (!$categoryId || !$nomineeId || !$name || !$email) {
        json_error('Please enter your name and email.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Please enter a valid email address.');
    }
    if (empty($_SESSION['email_verified_hof']) || $_SESSION['email_verified_hof'] !== $email) {
        json_error('Please verify your email address before voting.', 403, ['needsVerification' => true]);
    }

    try {
        $stmt = db()->prepare(
            'INSERT INTO hof_votes (category_id, nominee_id, voter_name, voter_email, voter_phone) VALUES (?,?,?,?,?)'
        );
        $stmt->execute([$categoryId, $nomineeId, $name, $email, $phone ?: null]);
    } catch (PDOException $e) {
        if (is_duplicate_key_error($e)) json_error('This email has already voted in this category.', 409);
        throw $e;
    }

    json_ok();
}

case 'upsert_category': {
    require_admin();
    $id = $body['id'] ?? null;
    $slug = $body['slug'] ?? ''; $name = $body['name'] ?? '';
    $description = $body['description'] ?? null;
    $sortOrder = (int) ($body['sortOrder'] ?? 0);
    $active = !empty($body['active']) ? 1 : 0;
    if (!$slug || !$name) json_error('Slug and name are required.');

    if ($id) {
        $stmt = db()->prepare(
            'UPDATE hof_categories SET slug=?, name=?, description=?, sort_order=?, active=? WHERE id=?'
        );
        $stmt->execute([$slug, $name, $description, $sortOrder, $active, $id]);
    } else {
        $stmt = db()->prepare(
            'INSERT INTO hof_categories (slug, name, description, sort_order, active) VALUES (?,?,?,?,?)'
        );
        $stmt->execute([$slug, $name, $description, $sortOrder, $active]);
        $id = db()->lastInsertId();
    }
    log_activity('admin', 'upsert_hof_category', $name);
    json_ok(['id' => (int) $id]);
}

case 'upsert_nominee': {
    require_admin();
    $id = $body['id'] ?? null;
    $categoryId = $body['categoryId'] ?? null;
    $name = $body['name'] ?? '';
    $photoUrl = $body['photoUrl'] ?? null;
    $bio = $body['bio'] ?? null;
    $sortOrder = (int) ($body['sortOrder'] ?? 0);
    $active = !empty($body['active']) ? 1 : 0;
    if (!$categoryId || !$name) json_error('Enter a name first.');

    if ($id) {
        $stmt = db()->prepare(
            'UPDATE hof_nominees SET name=?, photo_url=?, bio=?, sort_order=?, active=? WHERE id=?'
        );
        $stmt->execute([$name, $photoUrl, $bio, $sortOrder, $active, $id]);
    } else {
        $stmt = db()->prepare(
            'INSERT INTO hof_nominees (category_id, name, photo_url, bio, sort_order, active) VALUES (?,?,?,?,?,?)'
        );
        $stmt->execute([$categoryId, $name, $photoUrl, $bio, $sortOrder, $active]);
        $id = db()->lastInsertId();
    }
    log_activity('admin', 'upsert_hof_nominee', $name);
    json_ok(['id' => (int) $id]);
}

case 'delete_nominee': {
    require_admin();
    $id = $body['id'] ?? null;
    if (!$id) json_error('Missing nominee id.');
    $stmt = db()->prepare('DELETE FROM hof_nominees WHERE id = ?');
    $stmt->execute([$id]);
    log_activity('admin', 'delete_hof_nominee', (string) $id);
    json_ok();
}

}
