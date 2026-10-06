// =====================================================================
//  試合一覧・試合の作成と編集（views/games.js）
// =====================================================================
import * as store from "../store.js";
import { state } from "../store.js";
import { esc, $, $$, liveGames, tournaments, activePlayers, today, thisSeason, numberOf, HAND, seasons, POSITIONS, guessPos, player } from "../ui.js";
import { filterGames, seasonOf } from "../stats.js";
import { gameCard } from "../app.js";

let listSeason = null;

export function viewGames() {
  const season = listSeason ?? thisSeason();
  const gs = filterGames(liveGames(), { season: season || null }).sort((a, b) => (b.no ?? 0) - (a.no ?? 0));
  const html = `
    <div class="row" style="justify-content:space-between"><h1>試合</h1>
      <a class="btn primary" href="#/game/new">＋ 新しい試合</a></div>
    <div class="row" style="margin-bottom:12px"><label class="f">年度
      <select id="gs">${seasons().map((s) => `<option value="${s}" ${season === s ? "selected" : ""}>${s}年度</option>`).join("")}</select></label>
      <span class="muted small grow" style="align-self:end">${gs.length}試合</span></div>
    <div class="gamelist">${gs.map(gameCard).join("") || `<div class="card empty">この年度の試合はまだありません。</div>`}</div>`;
  return { html, after: (root) => { $("#gs", root).onchange = (e) => { listSeason = Number(e.target.value); window.dispatchEvent(new Event("hashchange")); }; } };
}

// 次の試合番号（年度ごとの通し番号）
function nextNo(season) {
  const nos = filterGames(liveGames(), { season }).map((g) => Number(g.no) || 0);
  return (nos.length ? Math.max(...nos) : 0) + 1;
}

export function viewGameEdit(id) {
  const orig = id ? state.games.find((g) => g.id === id) : null;
  if (id && !orig) return { html: `<div class="empty">試合が見つかりません。</div>` };
  const date = orig?.date || today();
  // 新しい試合：前の試合のスタメンを引き継ぐ
  const prev = liveGames().filter((g) => g.lineup?.length).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.no ?? 0) - (a.no ?? 0))[0];
  const g = orig || {
    date, no: nextNo(seasonOf(date)), opponent: "", tournamentId: tournaments()[tournaments().length - 1]?.id || "",
    first: true, lineup: prev?.lineup?.slice() || [], positions: prev?.positions?.slice() || [], bench: prev?.bench?.slice() || null,
    pitcher: prev?.pitcher || "", oppPitcher: { name: "", hand: "R" }, oppHands: {},
  };
  const pls = activePlayers();
  const popt = (sel) => `<option value="">（選択）</option>` + pls.map((p) => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : ""}${esc(p.name)}</option>`).join("");
  const opps = [...new Set(liveGames().map((x) => x.opponent).filter(Boolean))];
  const html = `
    <h1>${orig ? "試合情報を直す" : "新しい試合"}</h1>
    ${pls.length === 0 ? `<div class="alert" style="margin-bottom:12px">先に「設定 → 選手」で選手を登録してください。</div>` : ""}
    <form id="gf" class="stack">
      <div class="card stack">
        <div class="grid2">
          <label class="f">日付<input type="date" name="date" value="${esc(g.date)}" required></label>
          <label class="f">試合番号（年度の通し番号）<input type="number" name="no" value="${esc(g.no)}" min="1" required></label>
          <label class="f">対戦相手<input type="text" name="opponent" value="${esc(g.opponent)}" list="opps" required placeholder="例：〇〇中"><datalist id="opps">${opps.map((o) => `<option value="${esc(o)}">`).join("")}</datalist></label>
          <label class="f">会場（任意）<input type="text" name="venue" value="${esc(g.venue || "")}" list="venues" placeholder="例：〇〇グラウンド"><datalist id="venues">${[...new Set(liveGames().map((x) => x.venue).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join("")}</datalist></label>
          <label class="f">大会区分<select name="tournamentId">${tournaments().map((t) => `<option value="${t.id}" ${g.tournamentId === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        </div>
        <div class="row"><span class="f" style="font-size:13px;color:var(--muted);font-weight:600">自チームは</span>
          <div class="seg" id="first"><button type="button" data-v="1" class="${g.first !== false ? "on" : ""}">先攻（表）</button><button type="button" data-v="0" class="${g.first === false ? "on" : ""}">後攻（裏）</button></div></div>
        <p class="muted small" id="dupwarn" hidden></p>
      </div>
      <div class="card stack">
        <strong>スタメン（打順と守備位置）</strong>
        <p class="muted small" style="margin:0">前の試合のスタメンが入っています。選手を選ぶと、登録した「主な守備位置」が自動で入ります。試合中の選手交代は入力画面でもできます。</p>
        <div class="stack lineup-rows">${Array.from({ length: 9 }, (_, i) => `<div class="row lrow"><span class="lno">${i + 1}番</span>
          <select class="grow" name="l${i}" aria-label="${i + 1}番の選手">${popt(g.lineup?.[i])}</select>
          <select class="lpos" name="p${i}" aria-label="${i + 1}番の守備位置"><option value="">守備</option>${POSITIONS.map(([k, n]) => `<option value="${k}" ${(g.positions?.[i] ?? guessPos(player(g.lineup?.[i]))) === k ? "selected" : ""}>${k === "DH" ? "DH 指名" : k + " " + n}</option>`).join("")}</select></div>`).join("")}</div>
        <p class="small" id="lwarn" hidden style="color:var(--out);margin:0"></p>
      </div>
      <div class="card stack">
        <strong>控え選手（ベンチ入り）</strong>
        <p class="muted small" style="margin:0">メンバー表に載せる控えの選手にチェックを入れてください。スタメンの選手は自動で外れます。</p>
        <div class="benchgrid" id="bench">${pls.map((p) => `<label class="row bitem"><input type="checkbox" value="${p.id}" ${g.bench ? (g.bench.includes(p.id) ? "checked" : "") : "checked"}> <span>${numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : ""}${esc(p.name)}</span></label>`).join("")}</div>
      </div>
      <div class="card stack">
        <div class="grid2">
          <label class="f">自チームの先発投手<select name="pitcher">${popt(g.pitcher)}</select></label>
          <label class="f">相手の先発投手（名前や背番号）<input type="text" name="oppName" value="${esc(g.oppPitcher?.name || "")}" placeholder="例：#1"></label>
        </div>
        <div class="row"><span class="f" style="font-size:13px;color:var(--muted);font-weight:600">相手投手は</span>
          <div class="seg" id="ohand"><button type="button" data-v="R" class="${g.oppPitcher?.hand !== "L" ? "on" : ""}">右投げ</button><button type="button" data-v="L" class="${g.oppPitcher?.hand === "L" ? "on" : ""}">左投げ</button></div></div>
      </div>
      <div class="row">
        <button class="btn primary big grow" type="submit">${orig ? "保存する" : "保存して入力を始める"}</button>
        <a class="btn big" href="${orig ? "#/game/" + orig.id : "#/games"}">やめる</a>
      </div>
    </form>`;
  const after = (root) => {
    const f = $("#gf", root);
    let first = g.first !== false, hand = g.oppPitcher?.hand === "L" ? "L" : "R";
    const segs = (sel, set) => $$(`${sel} button`, root).forEach((b) => b.onclick = () => { $$(`${sel} button`, root).forEach((x) => x.classList.toggle("on", x === b)); set(b.dataset.v); });
    segs("#first", (v) => (first = v === "1"));
    segs("#ohand", (v) => (hand = v));
    const checkDup = () => {
      const no = Number(f.no.value), season = seasonOf(f.date.value);
      const dup = filterGames(liveGames(), { season }).find((x) => Number(x.no) === no && x.id !== orig?.id);
      const w = $("#dupwarn", root); w.hidden = !dup;
      if (dup) w.textContent = `⚠ 第${no}試合は既にあります（vs ${dup.opponent}）。番号を確認してください。`;
    };
    f.no.oninput = checkDup; f.date.onchange = () => { if (!orig) f.no.value = nextNo(seasonOf(f.date.value)); checkDup(); };
    checkDup();
    // 選手を選んだら守備位置を自動で入れる／重なりを知らせる
    const checkLineup = () => {
      const ps = Array.from({ length: 9 }, (_, i) => f["l" + i].value).filter(Boolean);
      const pos = Array.from({ length: 9 }, (_, i) => f["p" + i].value).filter(Boolean);
      const dupP = ps.filter((x, i) => ps.indexOf(x) !== i);
      const dupPos = pos.filter((x, i) => pos.indexOf(x) !== i);
      const msg = [dupP.length ? "同じ選手が2回入っています" : "", dupPos.length ? `守備位置「${dupPos.join("・")}」が重なっています` : ""].filter(Boolean).join("／");
      const w = $("#lwarn", root); w.hidden = !msg; w.textContent = msg ? "⚠ " + msg : "";
      // スタメンの選手は控えから外す
      $$("#bench input", root).forEach((c) => { const inL = ps.includes(c.value); c.closest("label").style.opacity = inL ? .35 : 1; c.disabled = inL; });
    };
    for (let i = 0; i < 9; i++) {
      f["l" + i].addEventListener("change", () => { const gp = guessPos(player(f["l" + i].value)); if (gp && !f["p" + i].value) f["p" + i].value = gp; checkLineup(); });
      f["p" + i].addEventListener("change", checkLineup);
    }
    checkLineup();
    f.onsubmit = (e) => {
      e.preventDefault();
      const lineup = Array.from({ length: 9 }, (_, i) => f["l" + i].value || null);
      const positions = Array.from({ length: 9 }, (_, i) => f["p" + i].value || null);
      const bench = $$("#bench input", root).filter((c) => c.checked && !lineup.includes(c.value)).map((c) => c.value);
      // 先発投手が空なら、守備位置「1（投）」の選手にする
      let pitcher = f.pitcher.value || null;
      if (!pitcher) { const k = positions.indexOf("1"); if (k >= 0) pitcher = lineup[k]; }
      const data = {
        ...(orig || { log: [], status: "live", oppHands: {} }),
        date: f.date.value, no: Number(f.no.value), opponent: f.opponent.value.trim(), venue: f.venue.value.trim(), tournamentId: f.tournamentId.value,
        first, lineup, positions, bench, pitcher,
        oppPitcher: { name: f.oppName.value.trim(), hand },
      };
      const newId = store.saveGame(data);
      location.hash = orig ? `#/game/${orig.id}` : `#/game/${newId}/input`;
    };
  };
  return { html, after };
}
export { HAND };
