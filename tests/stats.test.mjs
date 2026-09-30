// 集計エンジンのテスト：node tests/stats.test.mjs で実行
import * as S from "../js/stats.js";
import assert from "node:assert/strict";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("✓", name); };

const pa = (o) => ({ k: "pa", inn: 1, half: "T", side: "off", slot: 1, ...o });
const ev = (o) => ({ k: "ev", inn: 1, half: "T", side: "off", ...o });

t("打数ルール：四球・死球・犠打・犠飛・進塁打は打数に入らない", () => {
  const g = { id: "g1", first: true, log: [
    pa({ batter: "a", p: "X", res: "1B" }),
    pa({ batter: "a", p: "BBBB", res: "BB" }),
    pa({ batter: "a", p: "D", res: "HBP" }),
    pa({ batter: "a", p: "X", res: "SAC", outs: 1 }),
    pa({ batter: "a", p: "X", res: "SF", outs: 1, rbi: 1, runs: 1 }),
    pa({ batter: "a", p: "BX", res: "ADV", outs: 1 }),
    pa({ batter: "a", p: "X", res: "E" }),
    pa({ batter: "a", p: "X", res: "FC" }),
  ]};
  const b = S.batting([g], "a");
  assert.equal(b.pa, 8); assert.equal(b.ab, 3); assert.equal(b.h, 1);
  assert.equal(S.fmtAvg(b.avg), ".333");
  // 出塁率 = (1+1+1)/(3+1+1+1) = .500（進塁打は分母に入らない）
  assert.equal(S.fmtAvg(b.obp), ".500");
});

t("OPS・長打率", () => {
  const g = { id: "g", log: [pa({ batter: "a", p: "X", res: "HR" }), pa({ batter: "a", p: "X", res: "GO" })] };
  const b = S.batting([g], "a");
  assert.equal(b.slg, 2); assert.equal(b.obp, 0.5); assert.equal(b.ops, 2.5);
});

t("得点圏・初球・追い込まれ・カウント別", () => {
  const g = { id: "g", log: [
    pa({ batter: "a", p: "X", res: "1B", runners: [0, 1, 0] }),       // 初球・得点圏
    pa({ batter: "a", p: "SKFFX", res: "GO" }),                        // 追い込まれ 0-2
    pa({ batter: "a", p: "BSKK", res: "K", runners: [0, 0, 1] }),       // 追い込まれ三振 1-2 得点圏
    pa({ batter: "a", p: "BBBSX", res: "2B" }),                        // 3-1
  ]};
  const b = S.batting([g], "a");
  assert.deepEqual([b.risp.ab, b.risp.h], [2, 1]);
  assert.deepEqual([b.first.ab, b.first.h], [1, 1]);
  assert.deepEqual([b.two.pa, b.two.ab, b.two.h, b.two.k], [2, 2, 0, 1]);
  assert.equal(b.two.kRate, 0.5);
  assert.equal(b.byCount["0-2"].ab, 1);
  assert.equal(b.byCount["1-2"].k, 1);
  assert.equal(b.byCount["3-1"].h, 1);
});

t("対右・対左投手", () => {
  const g = { id: "g", log: [pa({ batter: "a", p: "X", res: "1B", ph: "L" }), pa({ batter: "a", p: "X", res: "GO", ph: "R" })] };
  const b = S.batting([g], "a");
  assert.equal(b.vsL.avg, 1); assert.equal(b.vsR.avg, 0);
});

t("盗塁成功率（試合中の記録＋試合後の手入力）", () => {
  const g = { id: "g", log: [ev({ type: "sb", runner: "a" }), ev({ type: "cs", runner: "a" })], extras: { a: { sb: 2 } } };
  const b = S.batting([g], "a");
  assert.equal(b.sb, 3); assert.equal(b.cs, 1); assert.equal(b.sbPct, 0.75);
});

t("設定で進塁打を打数に含めるよう変更できる", () => {
  const g = { id: "g", log: [pa({ batter: "a", p: "X", res: "ADV", outs: 1 }), pa({ batter: "a", p: "X", res: "1B" })] };
  const b = S.batting([g], "a", { abRules: { ADV: true } });
  assert.equal(b.ab, 2); assert.equal(b.avg, 0.5);
});

t("走者の自動進塁と得点の初期値", () => {
  assert.deepEqual(S.advance([1, 1, 1], "BB"), { ra: [1, 1, 1], runs: 1, rbi: 1 });
  assert.deepEqual(S.advance([0, 1, 0], "1B"), { ra: [1, 0, 1], runs: 0, rbi: 0 });
  assert.deepEqual(S.advance([1, 0, 1], "HR"), { ra: [0, 0, 0], runs: 3, rbi: 3 });
  assert.deepEqual(S.advance([0, 0, 1], "SF", 1), { ra: [0, 0, 0], runs: 1, rbi: 1 });
  assert.deepEqual(S.advance([0, 0, 1], "GO", 2).runs, 0); // 3アウト目のゴロは得点なし
  assert.deepEqual(S.advance([1, 0, 0], "E"), { ra: [1, 1, 0], runs: 0, rbi: 0 });
});

t("自動結果：四球・三振・死球、2ストライク後のファウル", () => {
  assert.equal(S.autoResult("BBBB"), "BB");
  assert.equal(S.autoResult("SFFFK"), "K");
  assert.equal(S.autoResult("FFFF"), null);
  assert.equal(S.autoResult("BD"), "HBP");
  assert.deepEqual(S.liveCount("BSFF"), { b: 1, s: 2 });
});

t("試合の状況：3アウトで攻守交代、スコア、回ごとの得点", () => {
  const g = { first: true, log: [
    pa({ slot: 1, p: "X", res: "HR", runs: 1, ra: [0, 0, 0] }),
    pa({ slot: 2, p: "SSS", res: "K" }),
    pa({ slot: 3, p: "X", res: "GO" }),
    ev({ type: "cs" }),
    { k: "pa", inn: 1, half: "B", side: "def", slot: 1, p: "X", res: "1B", ra: [1, 0, 0] },
  ]};
  const st = S.gameState(g);
  assert.equal(st.inn, 1); assert.equal(st.half, "B"); assert.equal(st.outs, 0);
  assert.deepEqual(st.runners, [1, 0, 0]);
  assert.deepEqual(st.score, { us: 1, them: 0 });
  assert.equal(st.nextSlot.off, 4); assert.equal(st.nextSlot.def, 2);
  assert.deepEqual(st.line.us, [1]);
});

t("投手：投球回・奪三振率(7回換算)・初球ストライク率・被打率・QS", () => {
  const log = [];
  // 5回15アウトを投げ、自責点2（うち非自責1）
  for (let i = 0; i < 15; i++) log.push({ k: "pa", side: "def", pitcher: "p", bh: i % 2 ? "L" : "R", p: i % 3 ? "SKK" : "BX", res: i % 3 ? "K" : "GO", inn: 1 + Math.floor(i / 3), half: "B" });
  log.push({ k: "pa", side: "def", pitcher: "p", bh: "R", p: "X", res: "HR", runs: 2, er: 2, inn: 6, half: "B" });
  log.push({ k: "ev", side: "def", pitcher: "p", type: "run", er: false, inn: 6, half: "B" });
  const g = { id: "g", first: true, log };
  const P = S.pitching([g], "p");
  assert.equal(P.ipText, "5回");
  assert.equal(P.k, 10);
  assert.equal(P.k7, 10 * 7 / 5);
  assert.equal(P.runs, 3); assert.equal(P.er, 2);
  assert.equal(P.gs, 1); assert.equal(P.qs, 1);
  assert.equal(S.fmtAvg(P.oppAvg), ".063"); // 1/16
  assert.equal(P.fpsPct, 11 / 16);
  const P2 = S.pitching([{ ...g, pitcherAdj: { p: { er: 3 } } }], "p");
  assert.equal(P2.qs, 0); // 手で直した自責3 → QSなし
});

t("QS：4回2/3ではQSにならない", () => {
  const log = [];
  for (let i = 0; i < 14; i++) log.push({ k: "pa", side: "def", pitcher: "p", p: "X", res: "GO", inn: 1, half: "B" });
  const P = S.pitching([{ id: "g", log }], "p");
  assert.equal(P.ipText, "4回2/3"); assert.equal(P.qs, 0);
});

t("絞り込み：年度・大会・月・試合", () => {
  const gs = [
    { id: "a", date: "2026-04-10", tournamentId: "t9" },
    { id: "b", date: "2026-05-02", tournamentId: "t3" },
    { id: "c", date: "2027-02-01", tournamentId: "t3" },
    { id: "d", date: "2027-04-01", tournamentId: "t3" },
    { id: "e", date: "2026-05-03", tournamentId: "t3", deleted: true },
  ];
  assert.deepEqual(S.filterGames(gs, { season: 2026 }).map((g) => g.id), ["a", "b", "c"]);
  assert.deepEqual(S.filterGames(gs, { season: 2026, tournamentId: "t3" }).map((g) => g.id), ["b", "c"]);
  assert.deepEqual(S.filterGames(gs, { month: "2026-05" }).map((g) => g.id), ["b"]);
  assert.equal(S.gradeOf(2025, 2026), "2年");
});

t("空データでも0除算エラーにならない", () => {
  const b = S.batting([], "x"); const p = S.pitching([], "x");
  assert.equal(S.fmtAvg(b.avg), "-"); assert.equal(S.fmtNum(p.k7), "-"); assert.equal(S.fmtPct(p.fpsPct), "-");
});
t("失策・暴投・捕逸の集計", () => {
  const g = { id: "g", first: true, extras: { f: { e: 1 } }, log: [
    { k: "pa", inn: 1, half: "B", side: "def", pitcher: "p", p: "X", res: "E", fielder: "f", outs: 0 },
    { k: "ev", inn: 1, half: "B", side: "def", type: "e", fielder: "f", pitcher: "p" },
    { k: "ev", inn: 1, half: "B", side: "def", type: "wp", pitcher: "p" },
    { k: "ev", inn: 1, half: "B", side: "def", type: "pb", catcher: "c", pitcher: "p" },
    { k: "ev", inn: 2, half: "T", side: "off", type: "e" },
    { k: "pa", inn: 2, half: "T", side: "off", batter: "a", p: "X", res: "E" },
  ]};
  assert.equal(S.batting([g], "f").e, 3);          // 失策出塁1＋試合中1＋試合後1
  assert.equal(S.batting([g], "c").pb, 1);
  assert.equal(S.pitching([g], "p").wp, 1);
  const m = S.gameMisc(g);
  assert.deepEqual([m.us.e, m.us.wp, m.us.pb, m.them.e, m.them.wp, m.them.pb], [3, 1, 1, 2, 0, 0]);
});

t("盗塁された数（投手ごと・チーム）", () => {
  const g = { id: "g", first: true, log: [
    { k: "ev", inn: 1, half: "B", side: "def", type: "sb", pitcher: "p" },
    { k: "ev", inn: 1, half: "B", side: "def", type: "sb", pitcher: "p" },
    { k: "ev", inn: 1, half: "B", side: "def", type: "cs", pitcher: "p" },
    { k: "ev", inn: 2, half: "T", side: "off", type: "sb", runner: "a" },
  ]};
  const m = S.gameMisc(g);
  assert.deepEqual([m.us.sbA, m.us.csA, m.us.sb, m.them.sb, m.them.sbA], [2, 1, 1, 2, 1]);
  assert.equal(S.pitcherLines(g).lines.p.sbA, 2);
});
t("相手チームの成績（打順別・投手別）", () => {
  const g = { id: "g", first: true, log: [
    { k: "pa", inn: 1, half: "T", side: "off", slot: 1, batter: "a", oppPitcher: "#1", ph: "R", p: "SSK", res: "K" },
    { k: "pa", inn: 1, half: "T", side: "off", slot: 2, batter: "b", oppPitcher: "#1", ph: "R", p: "X", res: "HR", runs: 1 },
    { k: "pa", inn: 1, half: "T", side: "off", slot: 3, batter: "c", oppPitcher: "#10", ph: "L", p: "BBBB", res: "BB" },
    { k: "pa", inn: 1, half: "B", side: "def", slot: 1, bh: "L", pitcher: "p", p: "X", res: "2B" },
    { k: "pa", inn: 1, half: "B", side: "def", slot: 1, bh: "L", pitcher: "p", p: "BX", res: "ADV", outs: 1 },
    { k: "pa", inn: 1, half: "B", side: "def", slot: 2, bh: "R", pitcher: "p", p: "SKK", res: "K" },
  ]};
  const o = S.oppLines(g);
  assert.equal(o.bat.length, 2);
  assert.deepEqual([o.bat[0].pa, o.bat[0].ab, o.bat[0].h, o.bat[0].adv, o.bat[0].hand], [2, 1, 1, 1, "L"]);
  assert.equal(o.team.ab, 2);
  assert.deepEqual(o.pit.map((p) => [p.name, p.bf, p.outs, p.runs, p.k, p.pitches]), [["#1", 2, 1, 1, 1, 4], ["#10", 1, 0, 0, 0, 4]]);
});
t("打球方向とカウント付きの書き方", () => {
  assert.equal(S.playText({ res: "FO", dir: "7", p: "BBSFBFX" }), "3-2から左飛");
  assert.equal(S.playText({ res: "2B", dir: "8", p: "X" }), "0-0から中二");
  assert.equal(S.playNote({ res: "K", p: "BSS" }), "見三振");
  assert.equal(S.playNote({ res: "K", p: "SKK" }), "空三振");
  assert.equal(S.playNote({ res: "GO", dir: "6" }), "遊ゴ");
  assert.equal(S.playNote({ res: "1B" }), "安打");
  assert.equal(S.playNote({ res: "HR", dir: "78" }), "左中本");
});
console.log(`\nすべて成功（${n}件）`);
