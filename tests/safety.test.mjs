// 「記録が消えない」ことのテスト：node tests/safety.test.mjs
// 本物のFirestoreと同じ決まり（arrayUnion・arrayRemove・merge・トランザクション）で動く
// 小さな偽のサーバーを作り、2台の端末（A・B）から同じ試合に書き込んでみます。
import assert from "node:assert/strict";

// ---- 偽のFirestore（サーバー） ----
const server = new Map();
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const U = Symbol("union"), RM = Symbol("remove");
function applySet(path, data, merge) {
  const cur = merge ? structuredClone(server.get(path) || {}) : {};
  const mergeInto = (dst, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && v[U]) { const arr = Array.isArray(dst[k]) ? dst[k] : []; for (const it of v.items) if (!arr.some((o) => canon(o) === canon(it))) arr.push(structuredClone(it)); dst[k] = arr; }
      else if (v && v[RM]) { dst[k] = (Array.isArray(dst[k]) ? dst[k] : []).filter((o) => !v.items.some((it) => canon(o) === canon(it))); }
      else if (merge && v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) mergeInto(dst[k], v);
      else dst[k] = structuredClone(v);
    }
  };
  mergeInto(cur, data);
  server.set(path, cur);
}
const fake = {
  db: {},
  doc: (db, col, id) => ({ path: `${col}/${id}` }),
  setDoc: async (ref, data, opt) => applySet(ref.path, data, opt?.merge),
  arrayUnion: (...items) => ({ [U]: true, items }),
  arrayRemove: (...items) => ({ [RM]: true, items }),
  runTransaction: async (db, fn) => fn({
    get: async (ref) => ({ exists: () => server.has(ref.path), data: () => structuredClone(server.get(ref.path)) }),
    set: (ref, data, opt) => applySet(ref.path, data, opt?.merge),
  }),
};

// ---- 2台の端末（同じプログラムを別々に読み込む） ----
const A = await import("../js/store.js?deviceA");
const B = await import("../js/store.js?deviceB");
for (const d of [A, B]) { d.__setFirebaseForTest(fake); d.state.user = { email: "t@example.com" }; }
const flush = () => new Promise((r) => setTimeout(r, 0));
// 端末が今持っている（古いかもしれない）試合の内容をセット
const see = (d, g) => { d.state.games = [structuredClone(g)]; };
const ids = (path) => (server.get(path).log || []).map((x) => x.id);

let n = 0; const t = async (name, fn) => { server.clear(); await fn(); n++; console.log("✓", name); };
const it = (id, extra = {}) => ({ k: "pa", id, inn: 1, half: "T", side: "off", slot: 1, p: "X", res: "1B", ts: "2026-10-06T00:00:0" + n, ...extra });

await t("2台が同じ試合に同時に打席を足しても、両方残る", async () => {
  const g = { id: "g1", log: [it("a")] };
  applySet("games/g1", { log: g.log });
  see(A, g); see(B, g);            // 両方とも [a] しか知らない
  A.appendLog("g1", [it("x")]);    // Aが x を追加
  B.appendLog("g1", [it("y")]);    // Bは x を知らないまま y を追加
  await flush();
  assert.deepEqual(ids("games/g1"), ["a", "x", "y"]);
});

await t("圏外だった端末があとから送っても、ほかの端末の記録を消さない", async () => {
  const g = { id: "g1", log: [it("a"), it("b")] };
  applySet("games/g1", { log: g.log });
  see(A, g); see(B, g);
  B.appendLog("g1", [it("c")]); await flush();     // 電波のあるBが c を入れる
  A.appendLog("g1", [it("d"), it("e")]); await flush(); // 圏外だったAが d,e をまとめて送る
  assert.deepEqual(ids("games/g1"), ["a", "b", "c", "d", "e"]);
});

await t("「1球戻す」で前の打席を戻しても、ほかの端末が足した記録は消えない", async () => {
  const g = { id: "g1", log: [it("a"), it("b")] };
  applySet("games/g1", { log: g.log });
  see(A, g); see(B, g);
  A.appendLog("g1", [it("x")]); await flush();     // Aが x を追加
  B.removeLogItem("g1", B.state.games[0].log[1]);   // Bは x を知らずに、自分の最後(b)を戻す
  await flush();
  assert.deepEqual(ids("games/g1"), ["a", "x"]);
});

await t("記録を直すときは、最新の内容を読んで、その1つだけを順番そのままで直す", async () => {
  const g = { id: "g1", log: [it("a"), it("b")] };
  applySet("games/g1", { log: g.log });
  see(A, g); see(B, g);
  B.appendLog("g1", [it("z")]); await flush();     // Bが z を追加
  await A.replaceLogItem("g1", "a", { res: "2B", dir: "7" }); // Aは z を知らずに a を直す
  const log = server.get("games/g1").log;
  assert.deepEqual(log.map((x) => x.id), ["a", "b", "z"]);
  assert.equal(log[0].res, "2B"); assert.equal(log[0].dir, "7");
});

await t("圏外では「直す」を止めて、記録をそのまま残す", async () => {
  const g = { id: "g1", log: [it("a")] };
  applySet("games/g1", { log: g.log });
  see(A, g); A.state.online = false;
  await assert.rejects(() => A.replaceLogItem("g1", "a", { res: "HR" }), (e) => e.code === "offline");
  A.state.online = true;
  assert.equal(server.get("games/g1").log[0].res, "1B");
});

await t("ほかの端末で直された記録は、古い内容のまま消そうとしても消えない", async () => {
  const g = { id: "g1", log: [it("a"), it("b")] };
  applySet("games/g1", { log: g.log });
  see(A, g); see(B, g);
  await A.replaceLogItem("g1", "b", { res: "HR" });
  B.removeLogItem("g1", B.state.games[0].log[1]); await flush(); // Bは古い b を消そうとする
  assert.deepEqual(ids("games/g1"), ["a", "b"]);
  assert.equal(server.get("games/g1").log[1].res, "HR");
});

await t("「試合情報・スタメンを直す」で保存しても、入力済みの打席は消えない", async () => {
  const g = { id: "g1", opponent: "旧", log: [it("a")] };
  applySet("games/g1", g);
  see(A, g); see(B, g);
  B.appendLog("g1", [it("b"), it("c")]); await flush();
  A.saveGameInfo("g1", { ...A.state.games[0], opponent: "新", lineup: ["p1"] }); await flush(); // Aの画面は古い [a] のまま
  const sv = server.get("games/g1");
  assert.deepEqual(ids("games/g1"), ["a", "b", "c"]);
  assert.equal(sv.opponent, "新"); assert.deepEqual(sv.lineup, ["p1"]);
});

await t("試合後の盗塁・失策や自責点を2台で別々の選手に入れても、両方残る", async () => {
  applySet("games/g1", { log: [], extras: {} });
  see(A, { id: "g1", log: [], extras: {} }); see(B, { id: "g1", log: [], extras: {} });
  A.patchGame("g1", { extras: { p1: { sb: 2 } } });
  B.patchGame("g1", { extras: { p2: { e: 1 } } });
  await flush();
  assert.deepEqual(server.get("games/g1").extras, { p1: { sb: 2 }, p2: { e: 1 } });
});

await t("古いバックアップから復元しても、今ある記録は上書きしない（消えた試合だけ戻す）", async () => {
  A.state.games = [
    { id: "g1", updatedAt: "2026-10-05", log: [it("a"), it("b"), it("c")] }, // 今の方が記録が多い
    { id: "g2", updatedAt: "2026-10-05", log: [it("a")] },
  ];
  A.state.players = [{ id: "p1", name: "今の名前", updatedAt: "2026-10-05" }];
  A.state.settings = { ...A.state.settings, updatedAt: "2026-10-01" };
  const backup = {
    app: "baseball-stats",
    games: [
      { id: "g1", updatedAt: "2026-09-30", log: [it("a")] },   // 古い → 上書きしない
      { id: "g3", updatedAt: "2026-09-30", log: [it("a")] },   // なくなっていた → 戻す
    ],
    players: [{ id: "p1", name: "古い名前", updatedAt: "2026-09-30" }, { id: "p9", name: "消えた選手", updatedAt: "2026-09-30" }],
    settings: { teamName: "古い" },
  };
  const plan = A.importPlan(backup);
  assert.deepEqual(plan.games.map((g) => g.id), ["g3"]);
  assert.deepEqual(plan.players.map((p) => p.id), ["p9"]);
  assert.equal(plan.keepGames, 1); assert.equal(plan.settings, false);
  await A.importAll(backup); await flush();
  assert.equal(server.has("games/g1"), false); // g1 には書き込んでいない
  assert.equal(server.has("games/g3"), true);
});

console.log(`\nすべて成功（${n}件）`);
