// announce-popup.js : shows Important / Emergency announcements as a pop-up on the dashboard.
// Used by index.html (staff portal) and resident.html (resident portal).
//   announcePopup({ userKey: 'staff7', list: [announcement rows], accept: optional function(row) -> true/false })
// A pop-up shows once per person per announcement (remembered in this browser) and only for the last 3 days.
// Text is added with textContent, so staff-typed HTML can never run.
(function () {
  var isOpen = false;
  var KEEP_MS = 72 * 3600 * 1000;
  var storeKey = function (u) { return 'bb_seen_announcements_' + u; };
  function getSeen(u) { try { return JSON.parse(localStorage.getItem(storeKey(u)) || '[]'); } catch (e) { return []; } }
  function saveSeen(u, ids) { try { localStorage.setItem(storeKey(u), JSON.stringify(ids.slice(-200))); } catch (e) {} }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  window.announcePopup = function (opts) {
    if (isOpen || !opts || !opts.list) return;
    var user = String(opts.userKey || 'user'), seen = getSeen(user), cutoff = Date.now() - KEEP_MS;
    var items = opts.list.filter(function (x) {
      var pr = String(x.priority || '').trim().toLowerCase();
      return (pr === 'emergency' || pr === 'important') && new Date(x.datePosted).getTime() >= cutoff &&
             seen.indexOf(x.announcementId) === -1 && (!opts.accept || opts.accept(x));
    });
    if (!items.length) return;
    items.sort(function (a, b) { // Emergency first, then newest
      var ea = /^emergency$/i.test(a.priority) ? 0 : 1, eb = /^emergency$/i.test(b.priority) ? 0 : 1;
      return ea - eb || new Date(b.datePosted) - new Date(a.datePosted);
    });

    isOpen = true;
    var bg = el('div', 'pop-bg'); bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true');
    var box = el('div', 'pop');
    var hasEmergency = /^emergency$/i.test(items[0].priority);
    box.appendChild(el('div', 'pop-head ' + (hasEmergency ? 'pop-red' : 'pop-amber'), (hasEmergency ? '\u26A0 Emergency Announcement' : 'Important Announcement') + (items.length > 1 ? 's (' + items.length + ')' : '')));
    var body = el('div', 'pop-body');
    items.forEach(function (x) {
      var em = /^emergency$/i.test(x.priority);
      var item = el('div', 'pop-item ' + (em ? 'pop-item-red' : 'pop-item-amber'));
      item.appendChild(el('div', 'pop-tag', em ? 'EMERGENCY' : 'IMPORTANT'));
      item.appendChild(el('div', 'pop-title', x.title));
      item.appendChild(el('div', 'pop-msg', x.messageBody));
      item.appendChild(el('div', 'pop-date', String(x.datePosted || '').slice(0, 10)));
      body.appendChild(item);
    });
    box.appendChild(body);
    var ok = el('button', 'pop-ok', 'OK, nakita ko');
    function close() {
      var ids = getSeen(user); items.forEach(function (x) { if (ids.indexOf(x.announcementId) === -1) ids.push(x.announcementId); });
      saveSeen(user, ids);
      document.removeEventListener('keydown', onKey);
      if (bg.parentNode) bg.parentNode.removeChild(bg);
      isOpen = false;
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    ok.onclick = close;
    document.addEventListener('keydown', onKey);
    box.appendChild(ok);
    bg.appendChild(box);
    document.body.appendChild(bg);
    ok.focus();
  };
})();
