// 앱 파일을 저장해 두는 서비스 워커
// - 화면(HTML)은 인터넷이 되면 항상 새 버전을 받아옴 → 고친 내용이 바로 반영됨
// - 인터넷이 안 되면 저장해 둔 버전으로 열림
var CACHE = "vault-v3";
var FILES = ["./", "index.html", "mqtt.min.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    var old = [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== CACHE) { old.push(caches.delete(keys[i])); }
    }
    return Promise.all(old);
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) { return; }

  if (req.mode === "navigate") {
    // 화면: 새 버전 먼저, 안 되면 저장본
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("index.html");
      })
    );
    return;
  }

  // 아이콘·라이브러리: 저장본 먼저
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then(function (list) {
    if (list.length > 0) { return list[0].focus(); }
    return clients.openWindow("./");
  }));
});
