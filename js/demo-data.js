// お試しモード（?demo）用の見本データ。実際の選手ではありません。
import { advance, autoResult, R, gameState } from "./stats.js";

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function demoData() {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const names = ["見本 一郎", "見本 二郎", "見本 三郎", "見本 四郎", "見本 五郎", "見本 六郎", "見本 七郎", "見本 八郎", "見本 九郎", "見本 十郎", "見本 健太"];
  const players = names.map((name, i) => ({
    id: "p" + (i + 1), name, entryYear: 2024 + (i % 3), numbers: { 2026: String(i + 1) },
    throws: i % 4 === 3 ? "L" : "R", bats: i % 3 === 2 ? "L" : "R",
    pos: ["投", "捕", "一", "二", "三", "遊", "左", "中", "右", "投", "外"][i], active: true,
  }));
  // 打順（遊・二・中・一・三・左・右・捕・投）
  const order = [6, 4, 8, 3, 5, 7, 9, 2, 1];
  const lineup = order.map((k) => "p" + k);
  const positions = order.map(String);
  const games = [];
  const opps = ["見本中A", "見本中B", "見本中C", "見本中D"];
  const tours = ["t9", "t9", "t3", "t3"];
  for (let gi = 0; gi < 4; gi++) {
    const g = {
      id: "g" + (gi + 1), no: gi + 1, date: `2026-0${5 + gi}-1${gi}`, opponent: opps[gi],
      tournamentId: tours[gi], first: gi % 2 === 0, lineup, positions, bench: ["p10", "p11"], venue: "見本グラウンド", oppHands: {}, status: "final",
      pitcher: gi % 2 ? "p10" : "p1", oppPitcher: { name: "相手投手", hand: gi % 2 ? "L" : "R" }, log: [],
    };
    for (let s = 1; s <= 9; s++) g.oppHands[s] = s % 3 === 0 ? "L" : "R";
    // 7回まで自動で試合を作る
    let guard = 0;
    while (guard++ < 400) {
      const st = gameState(g);
      if (st.inn > 7) break;
      const side = st.side;
      const slot = st.nextSlot[side];
      let p = "";
      let res = null;
      while (!res) {
        const x = rand();
        const ch = x < 0.36 ? "B" : x < 0.55 ? "S" : x < 0.66 ? "K" : x < 0.8 ? "F" : x < 0.99 ? "X" : "D";
        p += ch;
        res = autoResult(p);
        if (ch === "X") res = pick(["1B", "1B", "2B", "GO", "GO", "GO", "FO", "FO", "LO", "E", "SAC", "ADV", "3B", "HR", "DP", "SF", "1B"]);
      }
      if (res === "DP" && (!st.runners[0] || st.outs === 2)) res = "GO";
      if (res === "SF" && (!st.runners[2] || st.outs === 2)) res = "FO";
      if ((res === "SAC" || res === "ADV") && (!st.runners.some(Boolean) || st.outs === 2)) res = "GO";
      const adv = advance(st.runners, res, st.outs);
      const it = {
        k: "pa", id: "x" + guard, inn: st.inn, half: st.half, side, slot, p, res,
        runners: st.runners, ra: adv.ra, runs: adv.runs, rbi: adv.rbi, outs: R[res].outs,
      };
      // 打球方向（見本用）
      if (p.endsWith("X")) it.dir = ["GO", "DP", "SAC", "ADV", "FC", "E"].includes(res) ? pick(["1", "3", "4", "5", "6", "6", "4"]) : res === "HR" ? pick(["7", "78", "8", "9"]) : pick(["7", "8", "9", "7", "78", "89", "6", "4"]);
      if (side === "off") {
        const pl = players.find((q) => q.id === lineup[slot - 1]);
        Object.assign(it, { batter: pl.id, bh: pl.bats, ph: g.oppPitcher.hand });
      } else {
        const pit = st.inn >= 6 && gi % 2 === 0 ? "p10" : g.pitcher;
        Object.assign(it, { pitcher: pit, bh: g.oppHands[slot], ph: players.find((q) => q.id === pit).throws, er: adv.runs });
      }
      g.log.push(it);
      if (side === "off" && rand() < 0.06 && adv.ra[0]) g.log.push({ k: "ev", id: "e" + guard, inn: st.inn, half: st.half, side, type: rand() < 0.7 ? "sb" : "cs", runner: it.batter });
    }
    games.push(g);
  }
  // ---- 相手分析の見本：見本中Aと見本中Eの選手、相手どうしの試合 ----
  const fam = ["赤井", "青木", "黄瀬", "緑川", "白石", "黒田", "金子", "銀田", "桃井", "茶谷"];
  const mkTeam = (team, pre, off) => fam.slice(0, 10).map((n, i) => ({ id: pre + (i + 1), name: n + (off ? "（E）" : ""), opp: team, numbers: { 2026: String(i + 1) },
    throws: i === 0 && off ? "L" : "R", bats: (i + (off ? 1 : 0)) % 3 === 1 ? "L" : "R", pos: ["投", "捕", "一", "二", "三", "遊", "左", "中", "右", "投"][i], active: true }));
  const A = mkTeam("見本中A", "oa", false), E = mkTeam("見本中E", "oe", true);
  players.push(...A, ...E);
  const g1 = games[0];
  g1.oppLineup = A.slice(0, 9).map((p) => p.id); g1.oppPitcherId = "oa1";
  for (const it of g1.log) {
    if (it.k !== "pa") continue;
    if (it.side === "def") { const b = A[it.slot - 1]; it.oppBatter = b.id; it.bh = b.bats; }
    else { it.oppPitcherId = it.inn >= 6 ? "oa10" : "oa1"; it.ph = "R"; }
  }
  // 相手どうしの試合（見本中A 先攻 vs 見本中E 後攻）
  const sg = { id: "s1", scout: true, top: "見本中A", bottom: "見本中E", first: true, date: "2026-06-20", tournamentId: "t3", venue: "見本球場", no: 0,
    lineup: A.slice(0, 9).map((p) => p.id), pitcher: "oa10", oppLineup: E.slice(0, 9).map((p) => p.id), oppPitcherId: "oe1", positions: [], oppHands: {}, status: "final", opponent: "", log: [] };
  let gd = 0;
  while (gd++ < 400) {
    const st = gameState(sg);
    if (st.inn > 7) break;
    const side = st.side, slot = st.nextSlot[side];
    let p = "", res = null;
    while (!res) {
      const x = rand();
      const ch = x < 0.36 ? "B" : x < 0.55 ? "S" : x < 0.66 ? "K" : x < 0.8 ? "F" : x < 0.99 ? "X" : "D";
      p += ch; res = autoResult(p);
      if (ch === "X") res = pick(["1B", "1B", "2B", "GO", "GO", "GO", "FO", "FO", "LO", "E", "3B", "HR", "1B"]);
    }
    const adv = advance(st.runners, res, st.outs);
    const it = { k: "pa", id: "s" + gd, inn: st.inn, half: st.half, side, slot, p, res, runners: st.runners, ra: adv.ra, runs: adv.runs, rbi: adv.rbi, outs: R[res].outs };
    if (p.endsWith("X")) it.dir = ["GO", "E"].includes(res) ? pick(["3", "4", "5", "6"]) : pick(["7", "8", "9", "78", "89"]);
    if (side === "off") Object.assign(it, { batter: sg.lineup[slot - 1], bh: A[slot - 1].bats, oppPitcherId: "oe1", ph: "L" });
    else Object.assign(it, { oppBatter: sg.oppLineup[slot - 1], bh: E[slot - 1].bats, pitcher: "oa10", ph: "R", er: adv.runs });
    sg.log.push(it);
  }
  games.push(sg);
  return { players, games };
}
