// =====================================================================
//  図とグラフ（views/charts.js）
//  カウント別の表（色の濃さ＝数字の大きさ）、打球方向の図、比較の棒
//  色は css/app.css の --heat-1〜6（緑の濃淡）と --ser-a / --ser-b（比較の2色）
// =====================================================================
import { esc } from "../ui.js";
import { COUNT_GROUPS, DIRS, fmtAvg, fmtPct } from "../stats.js";

// ---------------------------------------------------------------------
//  カウント別（4×3のマス）＋ まとまり（初球・有利・不利・フルカウント）
// ---------------------------------------------------------------------
const CMODES = [["avg", "打率"], ["obp", "出塁率"], ["ops", "OPS"], ["pa", "打席数"]];
const cmode = {}; // 画面ごとに選んだ表示（id → mode）
export function countPanel(byCount, groups, { id = "cnt", pitcher = false } = {}) {
  const mode = cmode[id] || "avg";
  const lab = Object.fromEntries(CMODES)[mode];
  const L = pitcher ? { avg: "被打率", obp: "被出塁率", ops: "被OPS", pa: "打者数" }[mode] : lab;
  const val = (x) => (mode === "pa" ? x.pa : x[mode]);
  const show = (x) => (mode === "pa" ? String(x.pa) : fmtAvg(x[mode]));
  const sub = (x) => (mode === "obp" ? `${x.on}/${x.ab + x.bb + x.hbp + x.sf}` : mode === "pa" ? `${x.h}安` : `${x.h}/${x.ab}`);
  // 色の濃さ：打席が少ないマス（2打席以下）は色をつけない
  const vals = Object.values(byCount).filter((x) => x.pa >= 3).map(val).filter((v) => v != null);
  const max = Math.max(...vals, mode === "pa" ? 1 : 0.001);
  const step = (x) => {
    const v = val(x);
    if (v == null || x.pa === 0) return 0;
    if (mode !== "pa" && x.pa < 3) return 0;
    return Math.min(6, 1 + Math.floor((v / max) * 5.999));
  };
  const cell = (b, s) => {
    const k = `${b}-${s}`, x = byCount[k];
    const st = step(x);
    const tip = `${k}（${b}ボール${s}ストライク）から：${x.pa}打席　打率 ${fmtAvg(x.avg)}　出塁率 ${fmtAvg(x.obp)}　三振 ${x.k}`;
    return `<div class="hc h${st} ${x.pa > 0 && x.pa < 3 ? "few" : ""} ${k === "3-2" ? "full" : ""}" title="${esc(tip)}">
      <b>${x.pa ? show(x) : "–"}</b><span>${x.pa ? sub(x) : "0打席"}</span></div>`;
  };
  const F = byCount["3-2"];
  const gRow = (g) => { const x = groups[g.k]; return `<tr class="${g.k === "full" ? "hl" : ""}"><td class="l"><b>${g.label}</b>${g.note ? `<span class="muted small">　${g.note}</span>` : ""}</td><td>${x.pa}</td><td>${fmtAvg(x.avg)}</td><td><b>${fmtAvg(x.obp)}</b></td><td>${fmtAvg(x.ops)}</td><td>${fmtPct(x.kRate)}</td></tr>`; };
  return `<div class="cpanel" data-cpanel="${id}">
    <div class="row noprint" style="gap:6px;margin-bottom:8px"><span class="muted small">表示：</span>
      <div class="seg sm">${CMODES.map(([k, l]) => `<button type="button" data-cmode="${k}" class="${mode === k ? "on" : ""}">${pitcher && k !== "pa" ? { avg: "被打率", obp: "被出塁率", ops: "被OPS" }[k] : l}</button>`).join("")}</div></div>
    <div class="cwrap">
      <div class="heat" role="table" aria-label="カウント別${L}">
        <div></div>${[0, 1, 2, 3].map((b) => `<div class="hh">${b}ボール</div>`).join("")}
        ${[0, 1, 2].map((s) => `<div class="hh v">${s}ストライク</div>${[0, 1, 2, 3].map((b) => cell(b, s)).join("")}`).join("")}
      </div>
      <div class="fullcard">
        <div class="k">3-2（フルカウント）から</div>
        <div class="big">${fmtAvg(F.obp)}</div>
        <div class="muted small">${pitcher ? "被出塁率" : "出塁率"}　${F.pa}打席</div>
        <div class="kv3"><span>安打</span><b>${F.h}</b><span>四死球</span><b>${F.bb + F.hbp}</b><span>三振</span><b>${F.k}</b><span>${pitcher ? "被打率" : "打率"}</span><b>${fmtAvg(F.avg)}</b></div>
      </div>
    </div>
    <p class="muted small" style="margin:6px 0 10px">マスの上＝${L}、下＝${mode === "obp" ? "出塁/打席（犠打・進塁打をのぞく）" : mode === "pa" ? "安打数" : "安打/打数"}。<b>最後の1球を投げる直前のカウント</b>で分けています。色が濃いほど数字が大きいマス。2打席以下のマスは色をつけていません。</p>
    <div class="tablewrap"><table><thead><tr><th class="l">カウント</th><th>打席</th><th>${pitcher ? "被打率" : "打率"}</th><th>${pitcher ? "被出塁率" : "出塁率"}</th><th>${pitcher ? "被OPS" : "OPS"}</th><th>三振率</th></tr></thead>
      <tbody>${COUNT_GROUPS.map(gRow).join("")}</tbody></table></div>
  </div>`;
}
export function bindCountPanels(root, rerender) {
  root.querySelectorAll("[data-cpanel]").forEach((p) => p.querySelectorAll("[data-cmode]").forEach((b) => b.onclick = () => { cmode[p.dataset.cpanel] = b.dataset.cmode; rerender(); }));
}

// ---------------------------------------------------------------------
//  打球方向の図（グラウンドを方向ごとに分けて、打球の多さで色の濃さ）
// ---------------------------------------------------------------------
const HX = 150, HY = 236; // ホームベースの位置
const rad = (d) => (d * Math.PI) / 180;
const pt = (r, a) => [HX + r * Math.cos(rad(a)), HY - r * Math.sin(rad(a))];
function sector(r1, r2, a1, a2) {
  const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1, a2), [x4, y4] = pt(r1, a1);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r2} ${r2} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} A${r1} ${r1} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)}Z`;
}
// 方向ごとの区画：外野は5つ（左・左中・中・右中・右）、内野は4つ（三・遊・二・一）、投手・捕手は丸
const OF = [132, 214], IF = [62, 130];
const ZONES = {
  "7": { s: [...OF, 135, 117] }, "78": { s: [...OF, 117, 99] }, "8": { s: [...OF, 99, 81] }, "89": { s: [...OF, 81, 63] }, "9": { s: [...OF, 63, 45] },
  "5": { s: [...IF, 135, 112.5] }, "6": { s: [...IF, 112.5, 90] }, "4": { s: [...IF, 90, 67.5] }, "3": { s: [...IF, 67.5, 45] },
  "1": { c: [HX, HY - 38, 12] }, "2": { c: [HX, HY - 6, 10] },
};
const ZNAME = Object.fromEntries(DIRS);
const f1 = (v) => v.toFixed(1);
export function sprayChart(sp, { mini = false, title = "" } = {}) {
  const { zones } = sp;
  const max = Math.max(1, ...Object.values(zones).map((z) => z.n));
  const step = (n) => (n === 0 ? 0 : Math.min(6, 1 + Math.floor((n / max) * 5.999)));
  const mid = (Z) => (Z.s[2] + Z.s[3]) / 2;
  const shapes = Object.entries(ZONES).map(([k, Z]) => {
    const z = zones[k], st = step(z.n);
    const tip = `${ZNAME[k]}：打球${z.n}　安打${z.h}（ゴロ${z.go}・フライ${z.fo}・ライナー${z.lo}）`;
    const shape = Z.s ? `<path d="${sector(...Z.s)}"/>` : `<circle cx="${Z.c[0]}" cy="${Z.c[1]}" r="${Z.c[2]}"/>`;
    return `<g class="z h${st}"><title>${esc(tip)}</title>${shape}</g>`;
  }).join("");
  const T = (x, y, cls, txt) => `<text x="${f1(x)}" y="${f1(y)}" class="zl ${cls}" text-anchor="middle">${txt}</text>`;
  const labels = Object.entries(ZONES).map(([k, Z]) => {
    const z = zones[k], on = step(z.n) >= 4 ? " on" : "";
    if (Z.c) {
      const [x, y] = Z.c;
      return (z.n ? T(x, y + 4, "n sm" + on, z.n) : "") + (mini ? "" : `<text x="${x + Z.c[2] + 4}" y="${y + 4}" class="zl p">${ZNAME[k]}</text>`);
    }
    const a = mid(Z);
    if (mini) { const [x, y] = pt((Z.s[0] + Z.s[1]) / 2, a); return z.n ? T(x, y + 4, "n" + on, z.n) : ""; }
    if (Z.s[0] === OF[0]) { // 外野：数・安打は区画の中、名前は外側
      const [x, y] = pt(176, a), [nx, ny] = pt(226, a);
      return (z.n ? T(x, y, "n" + on, z.n) + T(x, y + 13, "s" + on, z.h + "安") : "") + T(nx, ny + 4, "p", ZNAME[k]);
    }
    const [x, y] = pt(108, a), [nx, ny] = pt(78, a); // 内野：数は外寄り、名前は内寄り
    return (z.n ? T(x, y + 5, "n" + on, z.n) : "") + T(nx, ny + 4, "p" + on, ZNAME[k]);
  }).join("");
  return `<svg class="spray${mini ? " mini" : ""}" viewBox="0 0 300 254" role="img" aria-label="${esc(title || "打球方向")}">
    <path class="grass" d="${sector(0, 216, 135, 45)}"/>
    <path class="dirt" d="${sector(0, IF[1], 135, 45)}"/>
    ${shapes}
    <path class="line" d="M${HX} ${HY} L${pt(216, 135).join(" ")} M${HX} ${HY} L${pt(216, 45).join(" ")}"/>
    ${labels}
  </svg>`;
}

// 左方向・中央・右方向の割合（引っ張り・流し）
export function pullBar(T) {
  const n = T.left + T.center + T.right;
  if (!n) return `<p class="muted small">打球方向の記録がまだありません。</p>`;
  const seg = (k, l) => { const v = T[k]; const w = (v / n) * 100; return v ? `<div class="pb ${k}" style="width:${w}%"><span>${l} ${Math.round(w)}%</span></div>` : ""; };
  return `<div class="pullbar" role="img" aria-label="左方向${T.left}・中央${T.center}・右方向${T.right}">${seg("left", "左")}${seg("center", "中")}${seg("right", "右")}</div>
    <p class="small" style="margin:4px 0 0">引っ張り <b>${pct(T.pull, n)}</b>　センター返し <b>${pct(T.mid, n)}</b>　流し <b>${pct(T.oppo, n)}</b><span class="muted">　（方向を記録した打球 ${n}）</span></p>`;
}
const pct = (a, n) => (n ? Math.round((a / n) * 100) + "%" : "-");

export function sprayTable(sp) {
  const { zones, T } = sp;
  const rows = DIRS.map(([k, l]) => ({ k, l, ...zones[k] })).filter((z) => z.n);
  return `<div class="tablewrap"><table><thead><tr><th class="l">方向</th><th>打球</th><th>安打</th><th>安打の割合</th><th>ゴロ</th><th>フライ</th><th>ライナー</th></tr></thead><tbody>
    ${rows.map((z) => `<tr><td class="l">${z.l}</td><td>${z.n}</td><td>${z.h}</td><td>${fmtPct(z.hRate)}</td><td>${z.go}</td><td>${z.fo}</td><td>${z.lo}</td></tr>`).join("") || `<tr><td class="l" colspan="7">方向を記録した打球がまだありません</td></tr>`}
    <tr class="total"><td class="l">合計</td><td>${T.n}</td><td>${T.h}</td><td>${fmtPct(T.hRate)}</td><td>${T.go}</td><td>${T.fo}</td><td>${T.lo}</td></tr>
  </tbody></table></div>${T.noDir ? `<p class="muted small">合計には、方向を記録していない打球 ${T.noDir} も入っています。</p>` : ""}`;
}

// ---------------------------------------------------------------------
//  比較の棒（A・Bの2本。長いほど数字が大きい）
// ---------------------------------------------------------------------
// rows: [{label, a, b, fmt, lowGood?, note?}]
export function compareTable(rows, la, lb) {
  const tr = (r) => {
    if (r.head) return `<tr class="sub"><td colspan="4">${r.head}</td></tr>`;
    const a = r.a, b = r.b;
    const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), r.min || 0) || 1;
    const better = a == null || b == null || a === b ? 0 : (a > b) !== !!r.lowGood ? -1 : 1;
    const bar = (v, cls) => `<div class="cb ${cls}"><i style="width:${v == null ? 0 : Math.max(2, (Math.abs(v) / max) * 100)}%"></i></div>`;
    return `<tr><td class="l"><b>${r.label}</b>${r.note ? `<span class="muted small"> ${r.note}</span>` : ""}</td>
      <td class="cv ${better === -1 ? "win" : ""}">${r.fmt(a)}</td>
      <td class="cbars">${bar(a, "a")}${bar(b, "b")}</td>
      <td class="cv ${better === 1 ? "win" : ""}">${r.fmt(b)}</td></tr>`;
  };
  return `<div class="tablewrap"><table class="cmp"><thead><tr><th class="l">項目</th><th><span class="sw a"></span>${esc(la)}</th><th class="l">くらべる</th><th><span class="sw b"></span>${esc(lb)}</th></tr></thead>
    <tbody>${rows.map(tr).join("")}</tbody></table></div>`;
}
