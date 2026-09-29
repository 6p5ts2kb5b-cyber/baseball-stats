// オフラインでもアプリを開けるようにする仕組み（サービスワーカー）
// アプリを更新したら VERSION の数字を1つ上げてください。
const VERSION = "v6";
const CACHE = "baseball-stats-" + VERSION;
const CORE = [
  "./", "./index.html", "./css/app.css", "./manifest.webmanifest",
  "./js/app.js", "./js/store.js", "./js/stats.js", "./js/ui.js", "./js/firebase-config.js",
  "./js/views/games.js", "./js/views/input.js", "./js/views/game.js", "./js/views/statsview.js", "./js/views/settings.js", "./js/views/print.js",
  "./icons/icon-192.png", "./js/demo-data.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("baseball-stats-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firebase の部品（バージョン付きで変わらない）→ 保存したものを優先
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
    })));
    return;
  }
  // アプリ本体 → まずネットから最新を取り、圏外なら保存したものを使う
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html"))));
  }
});
