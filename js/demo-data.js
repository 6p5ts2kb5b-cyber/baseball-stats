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
  const lineup = players.slice(0, 9).map((p) => p.id);
  const games = [];
  const opps = ["見本中A", "見本中B", "見本中C", "見本中D"];
  const tours = ["t9", "t9", "t3", "t3"];
  for (let gi = 0; gi < 4; gi++) {
    const g = {
      id: "g" + (gi + 1), no: gi + 1, date: `2026-0${5 + gi}-1${gi}`, opponent: opps[gi],
      tournamentId: tours[gi], first: gi % 2 === 0, lineup, oppHands: {}, status: "final",
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
  return { players, games };
}
