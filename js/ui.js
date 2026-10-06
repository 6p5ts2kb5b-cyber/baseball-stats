// =====================================================================
//  画面の共通部品（ui.js）
// =====================================================================
import { state } from "./store.js";
import { seasonOf, gradeOf, filterGames } from "./stats.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const today = () => {
  const d = new Date(); const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const thisSeason = () => seasonOf(today());
export const HAND = { R: "右", L: "左", S: "両" };
// 守備位置（番号は野球の守備番号。DH＝指名打者）
export const POSITIONS = [["1", "投"], ["2", "捕"], ["3", "一"], ["4", "二"], ["5", "三"], ["6", "遊"], ["7", "左"], ["8", "中"], ["9", "右"], ["DH", "指"]];
export const POSNAME = Object.fromEntries(POSITIONS);
export const POSFULL = { 1: "投手", 2: "捕手", 3: "一塁手", 4: "二塁手", 5: "三塁手", 6: "遊撃手", 7: "左翼手", 8: "中堅手", 9: "右翼手", DH: "指名打者" };
// 選手に登録した「主な守備位置」から守備番号を推測（例："遊" → "6"）
export function guessPos(p) {
  const s = p?.pos || "";
  const hit = POSITIONS.find(([, n]) => s.startsWith(n));
  return hit ? hit[0] : "";
}
export function jpDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const w = "日月火水木金土"[new Date(y, m - 1, day).getDay()];
  return `${m}月${day}日(${w})`;
}

// ---- 選手 ----
export function player(id) { return state.players.find((p) => p.id === id); }
export function numberOf(p, season = thisSeason()) {
  if (!p) return "";
  const nums = p.numbers || {};
  return nums[season] ?? nums[Object.keys(nums).sort().pop()] ?? "";
}
export function pname(id, withNo = false) {
  const p = player(id);
  if (!p) return id ? "（削除済み）" : "-";
  const no = numberOf(p);
  return withNo && no !== "" ? `${esc(p.name)} <span class="muted small">#${esc(no)}</span>` : esc(p.name);
}
export function activePlayers() {
  return state.players.filter((p) => p.active !== false && !p.deleted)
    .sort((a, b) => (Number(numberOf(a)) || 999) - (Number(numberOf(b)) || 999) || a.name.localeCompare(b.name, "ja"));
}
export function gradeText(p, season = thisSeason()) { return gradeOf(p?.entryYear, season); }

// ---- 大会区分 ----
export function tournaments(all = false) {
  return [...state.settings.tournaments].filter((t) => all || t.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function tname(id) { return state.settings.tournaments.find((t) => t.id === id)?.name || "（大会なし）"; }

// ---- 試合 ----
export function liveGames() { return state.games.filter((g) => !g.deleted); }
export function gameLabel(g) { return `第${g.no ?? "?"}試合 ${g.date?.slice(5).replace("-", "/") ?? ""} vs ${esc(g.opponent || "")}`; }

// ---- お知らせ ----
let toastTimer;
export function toast(msg, actionLabel, action) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast"; el.setAttribute("role", "status");
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (actionLabel) {
    const b = document.createElement("button"); b.textContent = actionLabel;
    b.onclick = () => { el.remove(); action(); }; el.append(b);
  }
  document.body.append(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), actionLabel ? 6000 : 2500);
}

// ---- 下から出る画面 ----
export function sheet(html, onMount) {
  closeSheet();
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener("click", (e) => { if (e.target === back) closeSheet(); });
  document.body.append(back);
  onMount?.(back.firstElementChild);
  return back.firstElementChild;
}
export function closeSheet() { document.querySelector(".sheet-back")?.remove(); }

// ---- ファイルの保存（CSV・バックアップ） ----
export function download(filename, text, type = "text/plain") {
  const bom = type.includes("csv") ? "﻿" : ""; // Excelで文字化けしないように
  const blob = new Blob([bom + text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function toCSV(rows) {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}

// ---- 成績の絞り込み（通算・大会別・試合別・月別・相手別） ----
const FKEY = "bs-filter";
export function loadFilter() {
  let f = null;
  try { f = JSON.parse(localStorage.getItem(FKEY)); } catch {}
  return f || { season: thisSeason(), by: "all", value: "" };
}
export function saveFilter(f) { try { localStorage.setItem(FKEY, JSON.stringify(f)); } catch {} }
export function filterToQuery(f) {
  const q = { season: f.season || null };
  if (f.by === "tour") q.tournamentId = f.value;
  if (f.by === "game") q.gameId = f.value;
  if (f.by === "month") q.month = f.value;
  if (f.by === "opp") q.opponent = f.value;
  return q;
}
// 日付・試合番号の順に並べる
export function byDate(a, b) { return (a.date || "").localeCompare(b.date || "") || (a.no ?? 0) - (b.no ?? 0); }
export function filteredGames(f) {
  if (f.by === "last") {
    const n = Number(f.value) || 5;
    return filterGames(liveGames(), { season: f.season || null }).sort(byDate).slice(-n);
  }
  const q = filterToQuery(f);
  if (f.by !== "all" && !f.value) return filterGames(liveGames(), { season: q.season });
  return filterGames(liveGames(), q);
}
export function filterLabel(f) {
  const s = f.season ? `${f.season}年度` : "全年度";
  if (f.by === "tour" && f.value) return `${s}・${tname(f.value)}`;
  if (f.by === "game" && f.value) { const g = state.games.find((x) => x.id === f.value); return g ? `第${g.no}試合 vs ${g.opponent}` : s; }
  if (f.by === "month" && f.value) return `${s}・${Number(f.value.slice(5))}月`;
  if (f.by === "opp" && f.value) return `${s}・vs ${f.value}`;
  if (f.by === "last") return `${s}・直近${Number(f.value) || 5}試合`;
  return `${s}・通算`;
}
export function seasons() {
  const set = new Set(liveGames().map((g) => seasonOf(g.date)).filter(Boolean));
  set.add(thisSeason());
  return [...set].sort((a, b) => b - a);
}
export function filterBar(f, id = "flt") {
  const gs = filterGames(liveGames(), { season: f.season }).sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
  let opts = "";
  if (f.by === "tour") opts = tournaments(true).map((t) => `<option value="${t.id}" ${f.value === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  if (f.by === "game") opts = gs.map((g) => `<option value="${g.id}" ${f.value === g.id ? "selected" : ""}>${gameLabel(g)}</option>`).join("");
  if (f.by === "month") opts = [...new Set(gs.map((g) => g.date?.slice(0, 7)))].filter(Boolean).sort().map((m) => `<option value="${m}" ${f.value === m ? "selected" : ""}>${Number(m.slice(5))}月</option>`).join("");
  if (f.by === "last") opts = [3, 5, 10, 15, 20].map((n) => `<option value="${n}" ${Number(f.value || 5) === n ? "selected" : ""}>直近${n}試合</option>`).join("");
  if (f.by === "opp") opts = [...new Set(gs.map((g) => g.opponent))].filter(Boolean).sort().map((o) => `<option ${f.value === o ? "selected" : ""}>${esc(o)}</option>`).join("");
  return `<div class="card row noprint" id="${id}">
    <label class="f" style="min-width:110px">年度
      <select data-f="season">${seasons().map((s) => `<option value="${s}" ${Number(f.season) === s ? "selected" : ""}>${s}年度</option>`).join("")}<option value="" ${!f.season ? "selected" : ""}>全年度</option></select></label>
    <label class="f" style="min-width:120px">範囲
      <select data-f="by">
        ${[["all", "通算"], ["last", "直近の試合"], ["tour", "大会別"], ["game", "試合別"], ["month", "月別"], ["opp", "相手別"]].map(([v, l]) => `<option value="${v}" ${f.by === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></label>
    ${f.by !== "all" ? `<label class="f grow">選択<select data-f="value">${f.by === "last" ? "" : `<option value="">（選んでください）</option>`}${opts}</select></label>` : ""}
  </div>`;
}
// 絞り込み欄が変わったら f を更新して rerender を呼ぶ
export function bindFilter(root, f, rerender) {
  $$("[data-f]", root).forEach((el) => el.addEventListener("change", () => {
    const k = el.dataset.f;
    f[k] = k === "season" ? (el.value ? Number(el.value) : "") : el.value;
    if (k === "by" || k === "season") f.value = f.by === "last" ? "5" : "";
    saveFilter(f); rerender();
  }));
}

// ---- 並べ替えできる表 ----
// cols: [{k, label, fmt?, l?(左寄せ), stick?}] rows: オブジェクト配列
export function sortableTable(id, cols, rows, sort, onSort, totalRow) {
  const s = sort || {};
  const sorted = [...rows];
  if (s.k) sorted.sort((a, b) => {
    const x = a[s.k], y = b[s.k];
    const nx = x == null || x === "" ? -Infinity : x, ny = y == null || y === "" ? -Infinity : y;
    return (typeof nx === "string" ? String(nx).localeCompare(ny, "ja") : nx - ny) * (s.asc ? 1 : -1);
  });
  const cell = (c, r) => `<td class="${c.l ? "l" : ""} ${c.stick ? "stick" : ""} ${c.hl?.(r) ? "hl" : ""}">${c.fmt ? c.fmt(r[c.k], r) : esc(r[c.k] ?? "")}</td>`;
  const html = `<div class="tablewrap"><table id="${id}"><thead><tr>${cols.map((c) =>
    `<th data-sort="${c.k}" class="${c.l ? "l" : ""} ${c.stick ? "stick" : ""} ${s.k === c.k ? "sorted" : ""}" title="押すと並べ替え">${c.label}${s.k === c.k ? (s.asc ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
    <tbody>${sorted.map((r) => `<tr ${r._href ? `data-href="${r._href}" style="cursor:pointer"` : ""}>${cols.map((c) => cell(c, r)).join("")}</tr>`).join("") || `<tr><td class="l" colspan="${cols.length}">記録がありません</td></tr>`}
    ${totalRow ? `<tr class="total">${cols.map((c) => cell(c, totalRow)).join("")}</tr>` : ""}</tbody></table></div>`;
  setTimeout(() => {
    const t = document.getElementById(id); if (!t) return;
    $$("th[data-sort]", t).forEach((th) => th.onclick = () => {
      const k = th.dataset.sort;
      onSort(s.k === k ? { k, asc: !s.asc } : { k, asc: false });
    });
    $$("tr[data-href]", t).forEach((tr) => tr.onclick = () => (location.hash = tr.dataset.href));
  });
  return html;
}
