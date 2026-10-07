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
  // e/wp/pb＝そのチームが守備で犯した数、sb/cs＝そのチームの走者の盗塁・盗塁死
  // sbA＝盗塁された数、csA＝盗塁を刺した数（守備側から見た数）
  const z = () => ({ e: 0, wp: 0, pb: 0, sb: 0, cs: 0, sbA: 0, csA: 0 });
  const m = { us: z(), them: z() };
  for (const it of game.log || []) {
    const def = it.side === "def" ? "us" : "them"; // 守っているチーム
    const off = it.side === "def" ? "them" : "us"; // 攻めているチーム
    if ((it.k === "ev" && it.type === "e") || (it.k === "pa" && it.res === "E")) m[def].e++;
    if (it.k === "ev" && it.type === "wp") m[def].wp++;
    if (it.k === "ev" && it.type === "pb") m[def].pb++;
    if (it.k === "ev" && it.type === "sb") { m[off].sb++; m[def].sbA++; }
    if (it.k === "ev" && it.type === "cs") { m[off].cs++; m[def].csA++; }
  }
  for (const x of Object.values(game.extras || {})) { m.us.e += +x.e || 0; m.us.sb += +x.sb || 0; m.us.cs += +x.cs || 0; m.them.sbA += +x.sb || 0; m.them.csA += +x.cs || 0; }
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
// 場面別・カウント別の小さな集計（打率・出塁率・長打率・三振率）
function bucket() { return { pa: 0, ab: 0, h: 0, k: 0, bb: 0, hbp: 0, sf: 0, tb: 0 }; }
function addBucket(B, pa, rules) {
  const r = R[pa.res]; if (!r) return;
  B.pa++; if (rules[r.c]) B.ab++; if (r.hit) { B.h++; B.tb += r.hit; } if (r.c === "K") B.k++;
  if (r.c === "BB") B.bb++; if (r.c === "HBP") B.hbp++; if (r.c === "SF") B.sf++;
}
function finBucket(B) {
  B.avg = div(B.h, B.ab); B.kRate = div(B.k, B.pa);
  B.obp = div(B.h + B.bb + B.hbp, B.ab + B.bb + B.hbp + B.sf);
  B.slg = div(B.tb, B.ab);
  B.ops = B.obp == null || B.slg == null ? null : B.obp + B.slg;
  B.on = B.h + B.bb + B.hbp; // 出塁した数
  return B;
}
// カウントのまとまり（打者有利・不利など）
export const COUNT_GROUPS = [
  { k: "first", label: "初球", keys: ["0-0"] },
  { k: "ahead", label: "打者有利", note: "1-0・2-0・3-0・2-1・3-1", keys: ["1-0", "2-0", "3-0", "2-1", "3-1"] },
  { k: "even", label: "並行カウント", note: "1-1・2-2", keys: ["1-1", "2-2"] },
  { k: "behind", label: "投手有利", note: "0-1・0-2・1-2", keys: ["0-1", "0-2", "1-2"] },
  { k: "full", label: "フルカウント", note: "3-2", keys: ["3-2"] },
];
export function countGroup(byCount, keys) {
  const B = bucket();
  for (const k of keys) { const x = byCount[k]; if (!x) continue; for (const f of ["pa", "ab", "h", "k", "bb", "hbp", "sf", "tb"]) B[f] += x[f]; }
  return finBucket(B);
}

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
  L.full = byCount["3-2"]; // 3-2（フルカウント）から
  L.groups = Object.fromEntries(COUNT_GROUPS.map((g) => [g.k, countGroup(byCount, g.keys)]));
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
  const get = (pid) => (lines[pid] = lines[pid] || { pid, outs: 0, runs: 0, er: 0, bf: 0, pitches: 0, strikes: 0, fpN: 0, fpS: 0, k: 0, h: 0, bb: 0, hbp: 0, wp: 0, pb: 0, sbA: 0 });
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
    if (it.k === "ev" && it.type === "pb") L.pb += 1;   // 投げていたときの捕逸
    if (it.k === "ev" && it.type === "sb") L.sbA += 1;  // 投げていたときに盗塁された数
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

// ---- 相手チームの成績（1試合） --------------------------------------
// 打者は名前を記録していないので「打順」ごとにまとめます。
// 投手は、こちらの攻撃の記録（相手投手の名前）ごとにまとめます。
export function oppLines(game, settings) {
  const S = mergeSettings(settings);
  const rules = S.abRules;
  const bat = {};
  for (const it of game.log || []) {
    if (it.k !== "pa" || it.side !== "def" || !R[it.res]) continue;
    const slot = Number(it.slot) || 0;
    const L = (bat[slot] = bat[slot] || { slot, hand: it.bh, res: [], ...emptyBat() });
    addBat(L, it, rules);
    L.hand = it.bh || L.hand;
    L.res.push(playNote(it));
  }
  const batRows = Object.values(bat).sort((a, b) => a.slot - b.slot).map(finBat);
  const team = emptyBat();
  for (const it of game.log || []) if (it.k === "pa" && it.side === "def" && R[it.res]) addBat(team, it, rules);
  finBat(team);

  const pit = {};
  const order = [];
  for (const it of game.log || []) {
    if (it.side !== "off") continue;
    const name = it.oppPitcher || (it.k === "pa" ? "相手投手" : null);
    const key = name || order[order.length - 1] || "相手投手";
    if (!pit[key]) { pit[key] = { name: key, hand: it.ph, outs: 0, bf: 0, pitches: 0, strikes: 0, h: 0, k: 0, bb: 0, hbp: 0, runs: 0, wp: 0 }; order.push(key); }
    const P = pit[key];
    if (it.k === "pa" && R[it.res]) {
      P.bf++; P.hand = it.ph || P.hand;
      const seq = (it.p || "").toUpperCase();
      P.pitches += seq.length;
      for (const ch of seq) if (PITCHES[ch]?.strike) P.strikes++;
      if (R[it.res].hit) P.h++;
      if (it.res === "K") P.k++;
      if (it.res === "BB") P.bb++;
      if (it.res === "HBP") P.hbp++;
    }
    if (it.k === "ev" && it.type === "wp") P.wp++;
    P.runs += itemRuns(it);
    P.outs += itemOuts(it);
  }
  const pitRows = order.map((k) => {
    const P = pit[k];
    const whole = Math.floor(P.outs / 3), frac = P.outs % 3;
    P.ipText = frac ? (whole ? whole + "回" : "") + frac + "/3" : whole + "回";
    P.strikePct = div(P.strikes, P.pitches);
    return P;
  });
  return { bat: batRows, team, pit: pitRows };
}

// ---- 打球方向と、新聞のような打席の書き方（例：左飛・中二・遊ゴ） ----
// 守備位置の番号：1投 2捕 3一 4二 5三 6遊 7左 8中 9右（左中・右中も選べます）
export const DIRS = [["1", "投"], ["2", "捕"], ["3", "一"], ["4", "二"], ["5", "三"], ["6", "遊"], ["7", "左"], ["8", "中"], ["9", "右"], ["78", "左中"], ["89", "右中"]];
export const DIRNAME = Object.fromEntries(DIRS);
const NOTE = { "1B": "安", "2B": "二", "3B": "三", HR: "本", GO: "ゴ", FO: "飛", LO: "直", DP: "併", E: "失", FC: "野選", SAC: "犠", SF: "犠飛", ADV: "ゴ(進)" };
export function playNote(it) {
  const r = R[it.res];
  if (!r) return "";
  if (it.res === "K") { const last = (it.p || "").slice(-1).toUpperCase(); return last === "S" ? "見三振" : last === "K" ? "空三振" : "三振"; }
  if (it.res === "BB") return "四球";
  if (it.res === "HBP") return "死球";
  const d = DIRNAME[it.dir];
  if (!d) return it.res === "ADV" ? "進塁打" : ({ "1B": "安打", "2B": "二塁打", "3B": "三塁打", HR: "本塁打" }[it.res] || r.label);
  return d + NOTE[it.res];
}
// 「3-2から左飛」のように、最後の1球の直前のカウント付き
export function playText(it) {
  const n = playNote(it);
  if (!(it.p || "").length) return n;
  return `${countInfo(it.p).key}から${n}`;
}


// ---- 打球方向（スプレー） ------------------------------------------
// 左方向・中央・右方向（引っ張り／流しは打者の左右で決まる）
const LEFT = ["5", "6", "7", "78"], CENTER = ["1", "2", "8"], RIGHT = ["3", "4", "9", "89"];
export const DIR_ZONES = DIRS.map(([k]) => k);
// side="off"：自チームの打者（pid=選手、空ならチーム全体）
// side="def"：相手の打者（pid=自チームの投手、空なら全体）
export function spray(games, pid, settings, side = "off") {
  const zones = Object.fromEntries(DIR_ZONES.map((k) => [k, { n: 0, h: 0, go: 0, fo: 0, lo: 0, tb: 0 }]));
  const T = { n: 0, h: 0, noDir: 0, left: 0, center: 0, right: 0, pull: 0, oppo: 0, mid: 0, go: 0, fo: 0, lo: 0 };
  for (const g of games) for (const it of g.log || []) {
    if (it.k !== "pa" || it.side !== side || !R[it.res]) continue;
    if (pid && (side === "off" ? it.batter : it.pitcher) !== pid) continue;
    if (!(it.p || "").toUpperCase().endsWith("X")) continue; // 打球のあった打席だけ
    if (it.res === "K") continue;
    T.n++;
    const r = R[it.res];
    if (r.hit) T.h++;
    const type = ["GO", "DP", "SAC", "ADV", "FC"].includes(it.res) ? "go" : ["FO", "SF"].includes(it.res) ? "fo" : it.res === "LO" ? "lo" : null;
    if (type) T[type]++;
    const z = zones[it.dir];
    if (!z) { T.noDir++; continue; }
    z.n++; if (r.hit) { z.h++; z.tb += r.hit; } if (type) z[type]++;
    const lr = LEFT.includes(it.dir) ? "left" : RIGHT.includes(it.dir) ? "right" : "center";
    T[lr]++;
    // 右打者は左方向が引っ張り、左打者は右方向が引っ張り
    const bh = it.bh === "L" ? "L" : "R";
    if (lr === "center") T.mid++;
    else if ((lr === "left") === (bh === "R")) T.pull++; else T.oppo++;
  }
  T.withDir = T.n - T.noDir;
  for (const z of Object.values(zones)) z.hRate = div(z.h, z.n);
  T.hRate = div(T.h, T.n);
  return { zones, T };
}

// ---- 守備 ------------------------------------------------------------
// その時点で、どの守備位置に誰がいたか（入力時に打席へ記録。古い記録は試合のスタメンから）
export function fieldMap(game, pitcher) {
  const m = {};
  (game.positions || []).forEach((pos, i) => { const pid = (game.lineup || [])[i]; if (pos && pos !== "DH" && pid) m[pos] = pid; });
  if (pitcher) m["1"] = pitcher;
  return m;
}
function whoAt(game, it, pos) {
  if (it.fp && it.fp[pos]) return it.fp[pos];
  if (pos === "1") return it.pitcher || game.pitcher || null;
  return fieldMap(game, it.pitcher || game.pitcher)[pos] || null;
}
function posOf(game, it, pid) {
  const m = it.fp || fieldMap(game, it.pitcher || game.pitcher);
  return Object.keys(m).find((k) => m[k] === pid) || null;
}
const OUT_BY_FIELDER = ["GO", "FO", "LO", "DP", "SAC", "SF", "ADV", "FC"];
// 守備率（簡易）＝ 処理したアウト ÷（処理したアウト＋失策）… 打球方向の記録から数えます
export function fielding(games) {
  const P = {}; // 選手ごと
  const POS = {}; // 守備位置ごと
  const team = { chances: 0, outs: 0, e: 0, eNoName: 0, sb: 0, cs: 0, pb: 0 };
  const getP = (pid) => (P[pid] = P[pid] || { pid, outs: 0, e: 0, games: {}, sbA: 0, csC: 0, pb: 0 });
  const getPos = (pos) => (POS[pos] = POS[pos] || { pos, outs: 0, e: 0, players: {} });
  for (const g of games) {
    // スタメンで守った位置（試合数）
    const m = fieldMap(g, g.pitcher);
    for (const [pos, pid] of Object.entries(m)) { getP(pid).games[pos] = (getP(pid).games[pos] || 0) + 1; getPos(pos).players[pid] = (getPos(pos).players[pid] || 0) + 1; }
    for (const it of g.log || []) {
      if (it.side !== "def") continue;
      if (it.k === "pa" && R[it.res]) {
        const single = /^[1-9]$/.test(it.dir || "") ? it.dir : null;
        if (OUT_BY_FIELDER.includes(it.res) && single) {
          const pid = whoAt(g, it, single);
          team.outs++; getPos(single).outs++;
          if (pid) getP(pid).outs++;
        }
        if (it.res === "E") {
          team.e++;
          const pid = it.fielder || (single ? whoAt(g, it, single) : null);
          const pos = it.fielder ? posOf(g, it, it.fielder) || single : single;
          if (pid) getP(pid).e++; else team.eNoName++;
          if (pos) getPos(pos).e++;
        }
      }
      if (it.k === "ev") {
        if (it.type === "e") {
          team.e++;
          if (it.fielder) { getP(it.fielder).e++; const pos = posOf(g, it, it.fielder); if (pos) getPos(pos).e++; } else team.eNoName++;
        }
        const c = it.catcher || whoAt(g, it, "2");
        if (it.type === "sb") { team.sb++; if (c) getP(c).sbA++; }
        if (it.type === "cs") { team.cs++; if (c) getP(c).csC++; }
        if (it.type === "pb") { team.pb++; if (c) getP(c).pb++; }
      }
    }
  }
  const fin = (x) => { x.fpct = div(x.outs, x.outs + x.e); return x; };
  Object.values(P).forEach((x) => { fin(x); x.csPct = div(x.csC, x.csC + x.sbA); x.g = Object.values(x.games).reduce((a, b) => a + b, 0); });
  Object.values(POS).forEach(fin);
  fin(team); team.csPct = div(team.cs, team.cs + team.sb);
  return { players: P, positions: POS, team };
}
