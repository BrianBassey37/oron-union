<?php
/**
 * api/elections.php — public election data + member voting + admin content management.
 *
 * Actions:
 *   GET  ?action=list                                             (public)
 *   GET  ?action=results                                          (public)
 *   GET  ?action=my_votes                                         (approved member session)
 *   POST ?action=vote          {electionId, candidateId}          (approved member session)
 *   POST ?action=upsert_election  {id, slug, title, description, deadline, status}   (admin session)
 *   POST ?action=upsert_candidate {id, electionId, name, role, initials, color, sortOrder} (admin session)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, [
    'list', 'results', 'my_votes', 'vote', 'upsert_election', 'upsert_candidate',
]);

switch ($action) {

case 'list': {
    $elections = db()->query('SELECT * FROM elections ORDER BY deadline ASC')->fetchAll();
    $candidates = db()->query('SELECT * FROM election_candidates ORDER BY sort_order ASC')->fetchAll();
    json_ok(['elections' => $elections, 'candidates' => $candidates]);
}

case 'results': {
    $rows = db()->query(
        'SELECT election_id, candidate_id, COUNT(*) AS vote_count
         FROM election_votes GROUP BY election_id, candidate_id'
    )->fetchAll();
    json_ok(['results' => $rows, 'registeredCount' => registered_member_count()]);
}

case 'my_votes': {
    $m = require_approved_member();
    $stmt = db()->prepare('SELECT election_id, candidate_id FROM election_votes WHERE member_id = ?');
    $stmt->execute([$m['id']]);
    json_ok(['votes' => $stmt->fetchAll()]);
}

case 'vote': {
    $m = require_approved_member();
    $electionId = $body['electionId'] ?? null;
    $candidateId = $body['candidateId'] ?? null;
    if (!$electionId || !$candidateId) json_error('Invalid request.');

    $stmt = db()->prepare('SELECT status FROM elections WHERE id = ?');
    $stmt->execute([$electionId]);
    $election = $stmt->fetch();
    if (!$election || $election['status'] !== 'active') json_error('This election is not open for voting.');

    try {
        $stmt = db()->prepare(
            'INSERT INTO election_votes (election_id, candidate_id, member_id) VALUES (?, ?, ?)'
        );
        $stmt->execute([$electionId, $candidateId, $m['id']]);
    } catch (PDOException $e) {
        if (is_duplicate_key_error($e)) json_error('You have already voted in this election.', 409);
        throw $e;
    }

    json_ok();
}

case 'upsert_election': {
    require_admin();
    $id = $body['id'] ?? null;
    $slug = $body['slug'] ?? ''; $title = $body['title'] ?? '';
    $description = $body['description'] ?? null; $deadline = $body['deadline'] ?? null;
    $status = in_array($body['status'] ?? '', ['active', 'closed'], true) ? $body['status'] : 'active';
    if (!$slug || !$title) json_error('Slug and title are required.');

    if ($id) {
        $stmt = db()->prepare(
            'UPDATE elections SET slug=?, title=?, description=?, deadline=?, status=? WHERE id=?'
        );
        $stmt->execute([$slug, $title, $description, $deadline, $status, $id]);
    } else {
        $stmt = db()->prepare(
            'INSERT INTO elections (slug, title, description, deadline, status) VALUES (?,?,?,?,?)'
        );
        $stmt->execute([$slug, $title, $description, $deadline, $status]);
        $id = db()->lastInsertId();
    }
    log_activity('admin', 'upsert_election', $slug);
    json_ok(['id' => (int) $id]);
}

case 'upsert_candidate': {
    require_admin();
    $id = $body['id'] ?? null;
    $electionId = $body['electionId'] ?? null;
    $name = $body['name'] ?? ''; $role = $body['role'] ?? null;
    $initials = $body['initials'] ?? null; $color = $body['color'] ?? '#800020';
    $sortOrder = (int) ($body['sortOrder'] ?? 0);
    if (!$electionId || !$name) json_error('Election and name are required.');

    if ($id) {
        $stmt = db()->prepare(
            'UPDATE election_candidates SET name=?, role=?, initials=?, color=?, sort_order=? WHERE id=?'
        );
        $stmt->execute([$name, $role, $initials, $color, $sortOrder, $id]);
    } else {
        $stmt = db()->prepare(
            'INSERT INTO election_candidates (election_id, name, role, initials, color, sort_order) VALUES (?,?,?,?,?,?)'
        );
        $stmt->execute([$electionId, $name, $role, $initials, $color, $sortOrder]);
        $id = db()->lastInsertId();
    }
    log_activity('admin', 'upsert_candidate', $name);
    json_ok(['id' => (int) $id]);
}

}

function registered_member_count() {
    return (int) db()->query("SELECT COUNT(*) AS n FROM members WHERE status = 'approved'")->fetch()['n'];
}
