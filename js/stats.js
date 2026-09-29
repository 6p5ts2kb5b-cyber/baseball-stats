// =====================================================================
//  集計エンジン（stats.js）
//  画面やFirebaseとは切り離した「計算だけ」のファイルです。
//  打率などの計算方法を変えたいときは、このファイルだけを見れば分かります。
// =====================================================================

// ---- 打撃結果の定義 --------------------------------------------------
// ab   : 打数に含めるか（初期値。設定画面の「集計ルール」で変更できます）
// hit  : 安打なら塁打数（1〜4）、安打でなければ 0
// outs : この結果で増える標準のアウト数（入力時に変更可）
// grp  : 画面でのグループ分け
export const RESULTS = [
  { c: "1B", label: "単打", short: "安", ab: true, hit: 1, outs: 0, grp: "hit" },
  { c: "2B", label: "二塁打", short: "二", ab: true, hit: 2, outs: 0, grp: "hit" },
  { c: "3B", label: "三塁打", short: "三", ab: true, hit: 3, outs: 0, grp: "hit" },
  { c: "HR", label: "本塁打", short: "本", ab: true, hit: 4, outs: 0, grp: "hit" },
  { c: "GO", label: "ゴロ", short: "ゴ", ab: true, hit: 0, outs: 1, grp: "out" },
  { c: "FO", label: "フライ", short: "飛", ab: true, hit: 0, outs: 1, grp: "out" },
  { c: "LO", label: "ライナー", short: "直", ab: true, hit: 0, outs: 1, grp: "out" },
  { c: "DP", label: "併殺打", short: "併", ab: true, hit: 0, outs: 2, grp: "out" },
  { c: "K", label: "三振", short: "振", ab: true, hit: 0, outs: 1, grp: "k" },
  { c: "E", label: "失策出塁", short: "失", ab: true, hit: 0, outs: 0, grp: "reach" },
  { c: "FC", label: "野選", short: "野", ab: true, hit: 0, outs: 0, grp: "reach" },
  { c: "BB", label: "四球", short: "四", ab: false, hit: 0, outs: 0, grp: "walk" },
  { c: "HBP", label: "死球", short: "死", ab: false, hit: 0, outs: 0, grp: "walk" },
  { c: "SAC", label: "犠打", short: "犠", ab: false, hit: 0, outs: 1, grp: "sac" },
  { c: "SF", label: "犠飛", short: "犠飛", ab: false, hit: 0, outs: 1, grp: "sac" },
  { c: "ADV", label: "進塁打", short: "進", ab: false, hit: 0, outs: 1, grp: "sac" },
];
export const R = Object.fromEntries(RESULTS.map((r) => [r.c, r]));

// ---- 投球の種類 ------------------------------------------------------
// strike: ストライクゾーン扱い（初球ストライク率・ストライク率に使う）
// swing : バットを振った（将来の初球スイング率などに使う）
export const PITCHES = {
  B: { label: "ボール", strike: false, swing: false },
  S: { label: "見逃し", strike: true, swing: false },
  K: { label: "空振り", strike: true, swing: true },
  F: { label: "ファウル", strike: true, swing: true },
  X: { label: "打った", strike: true, swing: true },
  D: { label: "死球", strike: false, swing: false },
};

// ---- 初期設定 --------------------------------------------------------
export const DEFAULT_SETTINGS = {
  teamName: "野球部",
  innings: 7, // 奪三振率の換算イニング（中学は7回制）
  qs: { minOuts: 15, maxER: 2 }, // QS：5回(15アウト)以上・自責点2以下
  qual: { paPerGame: 2, ipPerGame: 1 }, // ランキングの規定：打席＝試合数×2、投球回＝試合数×1
  // 打数に含めるか（チーム独自ルール：犠飛・進塁打は含めない）
  abRules: Object.fromEntries(RESULTS.map((r) => [r.c, r.ab])),
  tournaments: [
    "JJBF大会秋", "JJBF大会夏", "坂戸市内大会", "新人大会予選", "新人大会県大会",
    "学校総合予選", "学校総合県大会", "STORM杯", "練習試合",
  ].map((name, i) => ({ id: "t" + (i + 1), name, active: true, order: i })),
};

export function mergeSettings(s) {
  const d = DEFAULT_SETTINGS;
  s = s || {};
  return {
    ...d, ...s,
    qs: { ...d.qs, ...(s.qs || {}) },
    qual: { ...d.qual, ...(s.qual || {}) },
    abRules: { ...d.abRules, ...(s.abRules || {}) },
    tournaments: s.tournaments && s.tournaments.length ? s.tournaments : d.tournaments,
  };
}

// ---- 小さな道具 ------------------------------------------------------
const div = (a, b) => (b > 0 ? a / b : null);

// 年度（4月始まり）
export function seasonOf(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}
export function gradeOf(entryYear, season) {
  if (!entryYear || !season) return "";
  const g = season - entryYear + 1;
  return g >= 1 && g <= 3 ? g + "年" : g > 3 ? "卒業" : "";
}

// ---- カウントの計算 --------------------------------------------------
// 最後の1球を投げる直前のカウント、2ストライク到達、初球で終わったか
export function countInfo(p) {
  const seq = (p || "").toUpperCase();
  let b = 0, s = 0, two = false;
  for (let i = 0; i < seq.length - 1; i++) {
    const ch = seq[i];
    if (ch === "B") b = Math.min(3, b + 1);
    else if (ch === "S" || ch === "K") s = Math.min(2, s + 1);
    else if (ch === "F" && s < 2) s++;
    if (s === 2) two = true;
  }
  return { b, s, key: b + "-" + s, two: two || s === 2, n: seq.length, first: seq.length === 1 };
}

// 入力中のカウント（全部の球を反映）
export function liveCount(p) {
  const seq = (p || "").toUpperCase();
  let b = 0, s = 0;
  for (const ch of seq) {
    if (ch === "B") b++;
    else if (ch === "S" || ch === "K") s++;
    else if (ch === "F" && s < 2) s++;
  }
  return { b: Math.min(b, 4), s: Math.min(s, 3) };
}

// 投球列から、打席が自動で終わる結果（四球・三振・死球）を判定
export function autoResult(p) {
  const seq = (p || "").toUpperCase();
  let b = 0, s = 0;
  for (const ch of seq) {
    if (ch === "D") return "HBP";
    if (ch === "B") { if (++b >= 4) return "BB"; }
    else if (ch === "S" || ch === "K") { if (++s >= 3) return "K"; }
    else if (ch === "F" && s < 2) s++;
  }
  return null;
}

// ---- 走者の進み方の推定（入力を速くするための初期値。画面で直せます） ----
// runners = [1塁, 2塁, 3塁]（0 or 1）
export function advance(runners, res, outsBefore = 0) {
  const [r1, r2, r3] = (runners || [0, 0, 0]).map((x) => (x ? 1 : 0));
  let ra = [r1, r2, r3], runs = 0;
  const force = () => {
    // 押し出し型の進塁（四球・死球・失策・野選）
    let n3 = r3, n2 = r2, n1 = 1;
    if (r1) { if (r2) { if (r3) runs = 1; n3 = 1; } n2 = 1; }
    return [n1, n2, n3];
  };
  switch (res) {
    case "1B": runs = r3; ra = [1, r1, r2]; break;
    case "2B": runs = r3 + r2; ra = [0, 1, r1]; break;
    case "3B": runs = r1 + r2 + r3; ra = [0, 0, 1]; break;
    case "HR": runs = r1 + r2 + r3 + 1; ra = [0, 0, 0]; break;
    case "BB": case "HBP": case "E": case "FC": ra = force(); break;
    case "SAC": case "ADV": runs = r3; ra = [0, r1, r2]; break;
    case "SF": runs = r3; ra = [r1, r2, 0]; break;
    case "DP": ra = [0, r2, r3]; break;
    default: ra = [r1, r2, r3];
  }
  const r = R[res];
  const endsInning = r && outsBefore + r.outs >= 3;
  if (endsInning && ["GO", "FO", "LO", "K", "DP"].includes(res)) runs = 0;
  const rbi = ["E", "DP"].includes(res) ? 0 : runs;
  return { ra, runs, rbi };
}

// ---- 試合ログから「今の状況」を計算 ----------------------------------
// game.log は打席(k:"pa")と打席外の出来事(k:"ev")を順番に並べた配列です。
// 表(T)・裏(B)と、自チームが先攻(first=true)か後攻かで攻撃/守備が決まります。
export function sideOf(game, half) {
  const weBatTop = game.first !== false; // 先攻なら表が攻撃
  return (half === "T") === weBatTop ? "off" : "def";
}
export function itemOuts(it) {
  if (it.k === "pa") return it.outs != null ? Number(it.outs) || 0 : (R[it.res]?.outs || 0);
  if (it.k === "ev") return ["cs", "po", "out"].includes(it.type) ? 1 : 0;
  return 0;
}
export function itemRuns(it) {
  if (it.k === "pa") return Number(it.runs) || 0;
  if (it.k === "ev") return it.type === "run" ? 1 : 0;
  return 0;
}

export function gameState(game) {
  const log = game.log || [];
  let inn = 1, half = "T", outs = 0, runners = [0, 0, 0];
  const score = { us: 0, them: 0 };
  const line = { us: [], them: [] }; // 回ごとの得点
  const nextSlot = { off: 1, def: 1 };
  const hits = { us: 0, them: 0 };
  for (const it of log) {
    // 記録された回・表裏に合わせる（途中で修正された場合も安全に）
    if (it.inn !== inn || it.half !== half) { inn = it.inn; half = it.half; outs = 0; runners = [0, 0, 0]; }
    const side = sideOf(game, half);
    const who = side === "off" ? "us" : "them";
    const r = itemRuns(it);
    score[who] += r;
    line[who][inn - 1] = (line[who][inn - 1] || 0) + r;
    if (it.k === "pa") {
      nextSlot[side] = (Number(it.slot) || 0) % 9 + 1;
      if (R[it.res]?.hit) hits[who]++;
    }
    outs += itemOuts(it);
    runners = it.ra ? it.ra.slice() : runners;
    if (it.k === "ev" && it.type === "run" && !it.ra) runners = [runners[0], runners[1], 0];
    if (outs >= 3) {
      if (half === "T") half = "B"; else { half = "T"; inn++; }
      outs = 0; runners = [0, 0, 0];
    }
  }
  // 表示用に、記録のある半イニングは0を埋める
  const playedHalves = new Set(log.map((it) => it.inn + it.half));
  const maxInn = log.reduce((m, it) => Math.max(m, it.inn || 0), 0);
  for (let i = 1; i <= maxInn; i++) {
    for (const who of ["us", "them"]) {
      const h = (who === "us") === (game.first !== false) ? "T" : "B";
      const played = playedHalves.has(i + h) || i < maxInn;
      if (line[who][i - 1] == null && played) line[who][i - 1] = 0;
    }
  }
  if (game.cur && game.cur.inn === inn && game.cur.half === half && game.cur.runners) runners = game.cur.runners.slice();
  return { inn, half, outs, runners, score, line, nextSlot, hits, side: sideOf(game, half) };
}

// 1試合の失策・暴投・捕逸（us=自チームが犯した数、them=相手が犯した数）
export function gameMisc(game) {
  const m = { us: { e: 0, wp: 0, pb: 0 }, them: { e: 0, wp: 0, pb: 0 } };
  for (const it of game.log || []) {
    const who = it.side === "def" ? "us" : "them"; // 守備中のミスは自チーム、攻撃中は相手
    if ((it.k === "ev" && it.type === "e") || (it.k === "pa" && it.res === "E")) m[who].e++;
    if (it.k === "ev" && it.type === "wp") m[who].wp++;
    if (it.k === "ev" && it.type === "pb") m[who].pb++;
  }
  for (const x of Object.values(game.extras || {})) m.us.e += +x.e || 0;
  return m;
}

export function gameResult(game) {
  const st = gameState(game);
  const us = st.score.us, them = st.score.them;
  return { us, them, wl: us > them ? "勝" : us < them ? "負" : "分" };
}

// ---- 絞り込み --------------------------------------------------------
// f = { season, tournamentId, gameId, month:"2026-05", opponent, from, to }
export function filterGames(games, f = {}) {
  return games.filter((g) => {
    if (g.deleted) return false;
    if (f.season && seasonOf(g.date) !== Number(f.season)) return false;
    if (f.tournamentId && g.tournamentId !== f.tournamentId) return false;
    if (f.gameId && g.id !== f.gameId) return false;
    if (f.month && !(g.date || "").startsWith(f.month)) return false;
    if (f.opponent && g.opponent !== f.opponent) return false;
    if (f.from && (g.date || "") < f.from) return false;
    if (f.to && (g.date || "") > f.to) return false;
    return true;
  });
}

// ---- 打者成績 --------------------------------------------------------
function emptyBat() {
  return { g: 0, pa: 0, ab: 0, h: 0, s1: 0, s2: 0, s3: 0, hr: 0, tb: 0, k: 0, bb: 0, hbp: 0,
    sac: 0, sf: 0, adv: 0, rbi: 0, r: 0, sb: 0, cs: 0, e: 0, pb: 0, pitches: 0 };
}
function addBat(L, pa, rules) {
  const r = R[pa.res];
  if (!r) return;
  L.pa++;
  if (rules[r.c]) L.ab++;
  if (r.hit) {
    L.h++; L.tb += r.hit;
    if (r.hit === 1) L.s1++; else if (r.hit === 2) L.s2++; else if (r.hit === 3) L.s3++; else L.hr++;
  }
  if (r.c === "K") L.k++;
  if (r.c === "BB") L.bb++;
  if (r.c === "HBP") L.hbp++;
  if (r.c === "SAC") L.sac++;
  if (r.c === "SF") L.sf++;
  if (r.c === "ADV") L.adv++;
  L.rbi += Number(pa.rbi) || 0;
  L.pitches += (pa.p || "").length;
}
function finBat(L) {
  L.avg = div(L.h, L.ab);
  // 出塁率 =（安打＋四球＋死球）÷（打数＋四球＋死球＋犠飛）… 進塁打は分母に入れない
  L.obp = div(L.h + L.bb + L.hbp, L.ab + L.bb + L.hbp + L.sf);
  L.slg = div(L.tb, L.ab);
  L.ops = L.obp == null || L.slg == null ? null : L.obp + L.slg;
  L.kRate = div(L.k, L.pa);
  L.sbAtt = L.sb + L.cs;
  L.sbPct = div(L.sb, L.sb + L.cs);
  return L;
}
function bucket() { return { pa: 0, ab: 0, h: 0, k: 0 }; }
function addBucket(B, pa, rules) {
  const r = R[pa.res]; if (!r) return;
  B.pa++; if (rules[r.c]) B.ab++; if (r.hit) B.h++; if (r.c === "K") B.k++;
}
function finBucket(B) { B.avg = div(B.h, B.ab); B.kRate = div(B.k, B.pa); return B; }

export const COUNT_KEYS = ["0-0", "1-0", "2-0", "3-0", "0-1", "1-1", "2-1", "3-1", "0-2", "1-2", "2-2", "3-2"];

// 攻撃側の打席を1つずつ取り出す（pid を指定するとその選手だけ）
function offPAs(games, pid) {
  const out = [];
  for (const g of games) for (const it of g.log || []) {
    if (it.k === "pa" && it.side === "off" && R[it.res] && (!pid || it.batter === pid)) out.push({ g, pa: it });
  }
  return out;
}

export function batting(games, pid, settings) {
  const rules = mergeSettings(settings).abRules;
  const L = emptyBat();
  const risp = bucket(), first = bucket(), two = bucket(), vsR = emptyBat(), vsL = emptyBat();
  const byCount = Object.fromEntries(COUNT_KEYS.map((k) => [k, bucket()]));
  const played = new Set();
  for (const { g, pa } of offPAs(games, pid)) {
    played.add(g.id);
    addBat(L, pa, rules);
    const rs = pa.runners || [0, 0, 0];
    if (rs[1] || rs[2]) addBucket(risp, pa, rules);
    const ci = countInfo(pa.p);
    if (ci.n > 0) {
      if (ci.first) addBucket(first, pa, rules);
      if (ci.two) addBucket(two, pa, rules);
      if (byCount[ci.key]) addBucket(byCount[ci.key], pa, rules);
    }
    if (pa.ph === "R") addBat(vsR, pa, rules); else if (pa.ph === "L") addBat(vsL, pa, rules);
  }
  for (const g of games) {
    for (const it of g.log || []) {
      if (it.k !== "ev" || it.side !== "off" || (pid && it.runner !== pid)) continue;
      if (it.type === "sb") L.sb++;
      if (it.type === "cs" || it.type === "po") L.cs++;
      if (it.type === "run" && it.runner) L.r++;
    }
    // 守備：失策（試合中の記録・失策出塁の打席）と捕逸
    for (const it of g.log || []) {
      if (it.side !== "def") continue;
      const isErr = (it.k === "ev" && it.type === "e") || (it.k === "pa" && it.res === "E");
      if (isErr && (!pid || it.fielder === pid)) L.e++;
      if (it.k === "ev" && it.type === "pb" && (!pid || it.catcher === pid)) L.pb++;
    }
    const xs = pid ? [(g.extras || {})[pid]].filter(Boolean) : Object.values(g.extras || {});
    for (const x of xs) {
      L.sb += +x.sb || 0; L.cs += +x.cs || 0; L.e += +x.e || 0; L.r += +x.r || 0;
    }
    if (pid && (g.lineup || []).includes(pid)) played.add(g.id);
  }
  L.g = played.size;
  finBat(L);
  L.risp = finBucket(risp); L.first = finBucket(first); L.two = finBucket(two);
  COUNT_KEYS.forEach((k) => finBucket(byCount[k]));
  L.byCount = byCount;
  L.vsR = finBat(vsR); L.vsL = finBat(vsL);
  return L;
}

// ---- 投手成績 --------------------------------------------------------
function emptyPit() {
  return { g: 0, gs: 0, qs: 0, bf: 0, ab: 0, h: 0, hr: 0, k: 0, bb: 0, hbp: 0, outs: 0,
    runs: 0, er: 0, wp: 0, pitches: 0, strikes: 0, fpN: 0, fpS: 0 };
}
function addPit(P, pa, rules) {
  const r = R[pa.res]; if (!r) return;
  P.bf++;
  if (rules[r.c]) P.ab++;
  if (r.hit) P.h++;
  if (r.c === "HR") P.hr++;
  if (r.c === "K") P.k++;
  if (r.c === "BB") P.bb++;
  if (r.c === "HBP") P.hbp++;
  const seq = (pa.p || "").toUpperCase();
  P.pitches += seq.length;
  for (const ch of seq) if (PITCHES[ch]?.strike) P.strikes++;
  if (seq.length) { P.fpN++; if (PITCHES[seq[0]]?.strike) P.fpS++; }
}
function finPit(P, innings) {
  const whole = Math.floor(P.outs / 3), frac = P.outs % 3;
  P.ipText = frac ? (whole ? whole + "回" : "") + frac + "/3" : whole + "回";
  P.oppAvg = div(P.h, P.ab);
  P.fpsPct = div(P.fpS, P.fpN);
  P.strikePct = div(P.strikes, P.pitches);
  P.k7 = P.outs > 0 ? (P.k * innings * 3) / P.outs : null; // 奪三振率（7回換算）
  P.era7 = P.outs > 0 ? (P.er * innings * 3) / P.outs : null; // 防御率（7回換算・参考）
  P.kPct = div(P.k, P.bf);
  P.bbPct = div(P.bb + P.hbp, P.bf);
  P.qsPct = div(P.qs, P.gs);
  return P;
}

// 1試合の投手別成績（投球回・失点・自責点・QS）
export function pitcherLines(game, settings) {
  const S = mergeSettings(settings);
  const lines = {};
  let starter = null;
  const get = (pid) => (lines[pid] = lines[pid] || { pid, outs: 0, runs: 0, er: 0, bf: 0, pitches: 0, strikes: 0, fpN: 0, fpS: 0, k: 0, h: 0, bb: 0, hbp: 0, wp: 0 });
  for (const it of game.log || []) {
    if (it.side !== "def" || !it.pitcher) continue;
    const L = get(it.pitcher);
    if (it.k === "pa" && R[it.res]) {
      if (!starter) starter = it.pitcher;
      L.bf++; L.pitches += (it.p || "").length;
      const seq = (it.p || "").toUpperCase();
      for (const ch of seq) if (PITCHES[ch]?.strike) L.strikes++;
      if (seq.length) { L.fpN++; if (PITCHES[seq[0]]?.strike) L.fpS++; }
      if (R[it.res].hit) L.h++;
      if (it.res === "K") L.k++;
      if (it.res === "BB") L.bb++;
      if (it.res === "HBP") L.hbp++;
      L.runs += Number(it.runs) || 0;
      L.er += it.er != null ? Number(it.er) || 0 : Number(it.runs) || 0;
    }
    if (it.k === "ev" && it.type === "run") { L.runs += 1; if (it.er !== false) L.er += 1; }
    if (it.k === "ev" && it.type === "wp") L.wp += 1;
    L.outs += itemOuts(it);
  }
  // 試合後に手で直した失点・自責点があれば優先
  for (const [pid, adj] of Object.entries(game.pitcherAdj || {})) {
    const L = get(pid);
    if (adj.runs != null && adj.runs !== "") L.runs = Number(adj.runs);
    if (adj.er != null && adj.er !== "") L.er = Number(adj.er);
  }
  for (const L of Object.values(lines)) {
    L.starter = L.pid === starter;
    L.qs = L.starter && L.outs >= S.qs.minOuts && L.er <= S.qs.maxER;
    L.strikePct = div(L.strikes, L.pitches);
    L.fpsPct = div(L.fpS, L.fpN);
    const whole = Math.floor(L.outs / 3), frac = L.outs % 3;
    L.ipText = frac ? (whole ? whole + "回" : "") + frac + "/3" : whole + "回";
  }
  return { lines, starter };
}

export function pitching(games, pid, settings) {
  const S = mergeSettings(settings);
  const rules = S.abRules;
  const P = emptyPit(), vsR = emptyPit(), vsL = emptyPit();
  const byCount = Object.fromEntries(COUNT_KEYS.map((k) => [k, bucket()]));
  for (const g of games) {
    let did = false;
    for (const it of g.log || []) {
      if (it.k !== "pa" || it.side !== "def" || it.pitcher !== pid || !R[it.res]) continue;
      did = true;
      addPit(P, it, rules);
      if (it.bh === "R") addPit(vsR, it, rules); else if (it.bh === "L") addPit(vsL, it, rules);
      const ci = countInfo(it.p);
      if (ci.n > 0 && byCount[ci.key]) addBucket(byCount[ci.key], it, rules);
    }
    const { lines } = pitcherLines(g, S);
    const L = lines[pid];
    if (L) {
      did = true;
      P.outs += L.outs; P.runs += L.runs; P.er += L.er; P.wp += L.wp;
      if (L.starter) { P.gs++; if (L.qs) P.qs++; }
    }
    if (did) P.g++;
  }
  // 左右別の投球回は打席のアウト数から
  for (const [T, hand] of [[vsR, "R"], [vsL, "L"]]) {
    for (const g of games) for (const it of g.log || [])
      if (it.k === "pa" && it.side === "def" && it.pitcher === pid && it.bh === hand) T.outs += itemOuts(it);
  }
  finPit(P, S.innings); finPit(vsR, S.innings); finPit(vsL, S.innings);
  COUNT_KEYS.forEach((k) => finBucket(byCount[k]));
  P.vsR = vsR; P.vsL = vsL; P.byCount = byCount;
  return P;
}

// ---- 表示用の書式 ----------------------------------------------------
export function fmtAvg(v) {
  if (v == null) return "-";
  const s = v.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}
export const fmtPct = (v) => (v == null ? "-" : (v * 100).toFixed(1) + "%");
export const fmtNum = (v, d = 2) => (v == null ? "-" : v.toFixed(d));
