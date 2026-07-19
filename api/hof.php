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
 *   POST ?action=nominate  {categoryId, nomineeName, reason, nominatorName, nominatorEmail, nominatorPhone} (public, requires verified email)
 *   GET  ?action=list_nominations                                      (admin session)
 *   POST ?action=review_nomination {id, decision}                      (admin session)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, [
    'list', 'results', 'vote', 'upsert_category', 'upsert_nominee', 'delete_nominee',
    'nominate', 'list_nominations', 'review_nomination',
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

case 'nominate': {
    $nominationDeadline = new DateTime('2026-08-10 23:59:59');
    if (new DateTime() > $nominationDeadline) {
        json_error('The nomination window has closed. Voting is now open on the Hall of Fame page.', 403);
    }

    $categoryId = $body['categoryId'] ?? null;
    $nomineeName = trim($body['nomineeName'] ?? '');
    $reason = trim($body['reason'] ?? '');
    $nominatorName = trim($body['nominatorName'] ?? '');
    $nominatorEmail = trim($body['nominatorEmail'] ?? '');
    $nominatorPhone = $body['nominatorPhone'] ?? null;

    if (!$categoryId || !$nomineeName || !$reason || !$nominatorName || !$nominatorEmail) {
        json_error('Please fill in all required fields.');
    }
    if (!filter_var($nominatorEmail, FILTER_VALIDATE_EMAIL)) {
        json_error('Please enter a valid email address.');
    }
    if (empty($_SESSION['email_verified_hof']) || $_SESSION['email_verified_hof'] !== $nominatorEmail) {
        json_error('Please verify your email address before submitting.', 403, ['needsVerification' => true]);
    }
    if (mb_strlen($nomineeName) > 150) $nomineeName = mb_substr($nomineeName, 0, 150);
    if (mb_strlen($reason) > 800) $reason = mb_substr($reason, 0, 800);

    $stmt = db()->prepare(
        'INSERT INTO hof_nominations (category_id, nominee_name, reason, nominator_name, nominator_email, nominator_phone)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$categoryId, $nomineeName, $reason, $nominatorName, $nominatorEmail, $nominatorPhone ?: null]);

    db()->prepare('INSERT IGNORE INTO hof_notify_subscribers (email) VALUES (?)')->execute([$nominatorEmail]);

    json_ok(['id' => (int) db()->lastInsertId()]);
}

case 'list_nominations': {
    require_admin();
    $rows = db()->query(
        "SELECT n.*, c.name AS category_name FROM hof_nominations n
         JOIN hof_categories c ON c.id = n.category_id
         ORDER BY n.created_at DESC"
    )->fetchAll();
    json_ok(['nominations' => $rows]);
}

case 'review_nomination': {
    require_admin();
    $id = $body['id'] ?? null;
    $decision = $body['decision'] ?? '';
    if (!$id || !in_array($decision, ['approved', 'rejected'], true)) {
        json_error('Invalid request.');
    }
    db()->prepare('UPDATE hof_nominations SET status = ? WHERE id = ?')->execute([$decision, $id]);
    log_activity('admin', 'review_hof_nomination', $id . ' -> ' . $decision);
    json_ok();
}

}
