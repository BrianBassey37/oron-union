var OM = (function () {
  'use strict';
  var DB_NAME = 'OronMediaDB', DB_VER = 1, STORE = 'media_blobs', META_KEY = 'oron_media';
  var _db = null;

  function _open(cb) {
    if (_db) { cb(null, _db); return; }
    var req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = function (e) { e.target.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = function (e) { _db = e.target.result; cb(null, _db); };
    req.onerror = function () { cb(req.error, null); };
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '[]'); } catch (e) { return []; }
  }

  function _saveMeta(list) {
    try { localStorage.setItem(META_KEY, JSON.stringify(list)); } catch (e) { console.warn('OM: storage full'); }
  }

  function _saveBlob(id, blob, cb) {
    _open(function (err, d) {
      if (err) { cb(err); return; }
      var tx = d.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).put({ id: id, blob: blob });
      tx.oncomplete = function () { cb(null); };
      tx.onerror = function () { cb(tx.error); };
    });
  }

  function getBlob(id, cb) {
    _open(function (err, d) {
      if (err) { cb(err, null); return; }
      var tx = d.transaction([STORE], 'readonly');
      var req = tx.objectStore(STORE).get(id);
      req.onsuccess = function () { cb(null, req.result ? req.result.blob : null); };
      req.onerror = function () { cb(req.error, null); };
    });
  }

  function _delBlob(id, cb) {
    _open(function (err, d) {
      if (err) { if (cb) cb(err); return; }
      var tx = d.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = function () { if (cb) cb(null); };
    });
  }

  function addMedia(meta, file, cb) {
    var id = 'om_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    meta.id = id;
    meta.uploadDate = new Date().toISOString();
    if (file) {
      meta.storageType = 'blob';
      meta.fileSize = file.size;
      meta.mimeType = file.type || '';
      meta.fileName = file.name || '';
      _saveBlob(id, file, function (err) {
        if (err) { cb(err); return; }
        var list = getMeta(); list.push(meta); _saveMeta(list); cb(null, meta);
      });
    } else {
      meta.storageType = 'url';
      var list = getMeta(); list.push(meta); _saveMeta(list); cb(null, meta);
    }
  }

  function removeMedia(id, cb) {
    _saveMeta(getMeta().filter(function (m) { return m.id !== id; }));
    _delBlob(id, cb);
  }

  return { getMeta: getMeta, getBlob: getBlob, addMedia: addMedia, removeMedia: removeMedia, init: _open };
})();
