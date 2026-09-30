// =====================================================================
//  共有（share.js）… 印刷画面をそのまま「画像」「PDF」にして共有する
//  外部の部品を使わず、印刷画面の表（.page の中身）を読み取って描きます。
//  そのため、印刷・画像・PDFは必ず同じ内容になります。
// =====================================================================

const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Meiryo",sans-serif';
const C = {
  ink: "#16241c", muted: "#5b6a61", line: "#c9d3cc", head: "#eef2ee", total: "#e4ece6",
  accent: "#1d6b47", board: "#183326", boardInk: "#f4f1e4", gold: "#ffd966", bg: "#ffffff",
};

// ---- 印刷画面（.page）→ 画像（canvas） ----
// width: 横幅（画面上のピクセル）。LINE用は1080、PDF用は1400。
export function renderPage(pageEl, width = 1080, scale = 2) {
  const pad = 36;
  const measure = document.createElement("canvas").getContext("2d");
  const blocks = collect(pageEl);
  // 1回目：高さを計算、2回目：描く
  const h = layout(measure, blocks, width, pad, true);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, h);
  layout(ctx, blocks, width, pad, false);
  return canvas;
}

// 印刷画面の中身を、上から順に「見出し・表・文章」に分ける
function collect(pageEl, out = []) {
  for (const el of pageEl.children) {
    if (el.classList.contains("noprint")) continue;
    if (el.classList.contains("phead")) {
      const left = el.children[0], right = el.children[1];
      out.push({ t: "head", sub: left.querySelector(".muted")?.innerText || "", title: left.querySelector(".pname")?.innerText || "",
        right: (right?.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean) });
    } else if (el.classList.contains("board")) out.push({ t: "table", el: el.querySelector("table"), board: true });
    else if (el.tagName === "TABLE") out.push({ t: "table", el });
    else if (/^H[1-4]$/.test(el.tagName)) out.push({ t: "h", text: el.innerText });
    else if (el.tagName === "P") out.push({ t: "p", text: el.innerText, small: true });
    else if (el.classList.contains("tablewrap")) out.push({ t: "table", el: el.querySelector("table") });
    else if (el.tagName === "DIV" || el.tagName === "SECTION") collect(el, out);
  }
  return out;
}

function layout(ctx, blocks, W, pad, dry) {
  let y = pad;
  const maxW = W - pad * 2;
  for (const b of blocks) {
    if (b.t === "head") y = drawHead(ctx, b, pad, y, maxW, dry);
    else if (b.t === "h") {
      y += 14;
      if (!dry) { ctx.fillStyle = C.accent; ctx.fillRect(pad, y, 6, 28); ctx.fillStyle = C.ink; ctx.font = `700 22px ${FONT}`; ctx.textBaseline = "middle"; ctx.fillText(b.text, pad + 14, y + 15); }
      y += 38;
    } else if (b.t === "p") y = drawPara(ctx, b.text, pad, y, maxW, 15, C.muted, dry) + 4;
    else if (b.t === "table") y = drawTable(ctx, b.el, pad, y, maxW, b.board, dry) + 6;
  }
  return y + pad;
}

function drawHead(ctx, b, x, y, w, dry) {
  ctx.textBaseline = "alphabetic";
  const rightW = 330;
  if (!dry) {
    ctx.fillStyle = C.muted; ctx.font = `600 17px ${FONT}`; ctx.fillText(b.sub, x, y + 18);
    ctx.fillStyle = C.ink; ctx.font = `800 38px ${FONT}`;
    fitText(ctx, b.title, x, y + 64, w - rightW - 10, 38, 800);
    ctx.font = `600 17px ${FONT}`; ctx.fillStyle = C.ink; ctx.textAlign = "right";
    b.right.forEach((line, i) => ctx.fillText(line, x + w, y + 20 + i * 24));
    ctx.textAlign = "left";
  }
  const h = Math.max(78, 24 + b.right.length * 24);
  if (!dry) { ctx.fillStyle = C.ink; ctx.fillRect(x, y + h, w, 3); }
  return y + h + 16;
}

// 横幅に入りきらない文字は小さくする
function fitText(ctx, text, x, y, maxW, size, weight) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && s > 16) { s -= 1; ctx.font = `${weight} ${s}px ${FONT}`; }
  ctx.fillText(text, x, y);
}

function drawPara(ctx, text, x, y, w, size, color, dry) {
  ctx.font = `400 ${size}px ${FONT}`;
  const lines = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const ch of para) {
      if (ctx.measureText(cur + ch).width > w) { lines.push(cur); cur = ch; } else cur += ch;
    }
    lines.push(cur);
  }
  if (!dry) { ctx.fillStyle = color; ctx.textBaseline = "top"; lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * 1.45)); }
  return y + lines.length * size * 1.45;
}

// ---- 表を描く（結合セル・太字・薄い0・区切り線に対応） ----
function drawTable(ctx, table, x, y, maxW, board, dry) {
  const rows = [...table.rows].map((tr) => ({
    head: tr.parentElement.tagName === "THEAD",
    total: tr.classList.contains("total"),
    cells: [...tr.cells].map((td) => ({
      text: td.innerText.replace(/\s+/g, " ").trim(),
      lines: td.classList.contains("pg") || td.querySelector("br") ? td.innerText.split("\n").map((s) => s.trim()).filter(Boolean) : null,
      hit: !!td.querySelector(".hitc"),
      span: td.colSpan || 1,
      left: td.classList.contains("l") || td.classList.contains("team"),
      th: td.tagName === "TH",
      bold: !!td.querySelector("b,strong") || td.classList.contains("r") || td.classList.contains("team"),
      faint: td.children.length === 1 && td.firstElementChild.classList.contains("z"),
      sep: td.classList.contains("sep"),
      gold: board && td.classList.contains("r"),
    })),
  }));
  const ncol = Math.max(...rows.map((r) => r.cells.reduce((n, c) => n + c.span, 0)));
  let fs = board ? 22 : 18;
  let widths, total;
  const calc = () => {
    ctx.font = `600 ${fs}px ${FONT}`;
    const cw = ctx.measureText("あ").width;
    widths = new Array(ncol).fill(0);
    for (const r of rows) {
      let ci = 0;
      for (const c of r.cells) {
        if (c.span === 1) {
          const w = (r.head && !board) ? Math.min(ctx.measureText(c.text).width, cw * 2)
            : c.lines ? Math.max(...c.lines.map((l) => ctx.measureText(l).width), 0) : ctx.measureText(c.text).width;
          widths[ci] = Math.max(widths[ci], w);
        }
        ci += c.span;
      }
    }
    widths = widths.map((w) => w + fs * 0.9);
    total = widths.reduce((a, b) => a + b, 0);
  };
  calc();
  while (total > maxW && fs > 11) { fs -= 1; calc(); }
  // 余った幅は均等に配る
  const extra = Math.max(0, maxW - total);
  widths = widths.map((w) => w + extra / ncol);
  const rowH = fs * 1.75;
  // 見出し行は文字を折り返す
  const wrap = (text, w) => {
    const lines = []; let cur = "";
    for (const ch of text) { if (ctx.measureText(cur + ch).width > w - fs * 0.5 && cur) { lines.push(cur); cur = ch; } else cur += ch; }
    if (cur) lines.push(cur);
    return lines;
  };
  const heights = rows.map((r) => {
    if (!r.head || board) {
      const n = Math.max(1, ...r.cells.map((c) => (c.lines ? c.lines.length : 1)));
      return n > 1 ? Math.max(rowH, n * fs * 1.2 + fs * 0.7) : rowH;
    }
    ctx.font = `700 ${fs * 0.85}px ${FONT}`;
    let ci = 0, n = 1;
    for (const c of r.cells) { const w = widths.slice(ci, ci + c.span).reduce((a, b) => a + b, 0); n = Math.max(n, wrap(c.text, w).length); ci += c.span; }
    return Math.max(rowH, n * fs * 0.85 * 1.2 + fs * 0.7);
  });
  const H = heights.reduce((a, b) => a + b, 0);
  if (dry) return y + H;

  const W = widths.reduce((a, b) => a + b, 0);
  if (board) { ctx.fillStyle = C.board; roundRect(ctx, x, y, W, H, 12); ctx.fill(); }
  let yy = y;
  rows.forEach((r, ri) => {
    const h = heights[ri];
    if (!board && r.head) { ctx.fillStyle = C.head; ctx.fillRect(x, yy, W, h); }
    if (!board && r.total) { ctx.fillStyle = C.total; ctx.fillRect(x, yy, W, h); }
    let xx = x, ci = 0;
    for (const c of r.cells) {
      const w = widths.slice(ci, ci + c.span).reduce((a, b) => a + b, 0);
      const size = r.head && !board ? fs * 0.85 : fs;
      ctx.font = `${c.bold || r.total || (r.head && !board) ? 700 : 400} ${size}px ${FONT}`;
      ctx.fillStyle = board ? (c.gold ? C.gold : r.head ? "rgba(244,241,228,.7)" : C.boardInk) : c.faint ? "#b5bfb8" : r.head ? C.muted : C.ink;
      ctx.textBaseline = "middle";
      const lines = r.head && !board ? wrap(c.text, w) : c.lines || [c.text];
      const center = c.lines && !c.left;
      const lh = size * 1.2;
      lines.forEach((line, li) => {
        const ty = yy + h / 2 + (li - (lines.length - 1) / 2) * lh;
        if (c.left) { ctx.textAlign = "left"; ctx.fillText(line, xx + fs * 0.45, ty); }
        else if (board || r.head || center) { ctx.textAlign = "center"; ctx.fillText(line, xx + w / 2, ty); }
        else { ctx.textAlign = "right"; ctx.fillText(line, xx + w - fs * 0.45, ty); }
      });
      if (c.sep) { ctx.fillStyle = C.ink; ctx.fillRect(xx - 1, yy, 2, h); }
      xx += w; ci += c.span;
    }
    // 罫線
    ctx.fillStyle = board ? "rgba(255,255,255,.12)" : C.line;
    ctx.fillRect(x, yy + h - 1, W, 1);
    yy += h;
  });
  if (!board) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    let xx = x;
    for (let i = 0; i < ncol - 1; i++) { xx += widths[i]; ctx.fillStyle = C.line; ctx.fillRect(xx, y, 1, H); }
  }
  ctx.textAlign = "left";
  return y + H;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---- 画像 → PDF（A4横。長い場合は複数ページに分けます） ----
export async function canvasToPdf(canvas, paper = "A4") {
  const [pageW, pageH] = paper === "A3" ? [1191, 842] : [842, 595];
  const m = 24;
  const scale = (pageW - m * 2) / canvas.width;
  const sliceH = Math.floor((pageH - m * 2) / scale);
  const pages = [];
  for (let sy = 0; sy < canvas.height; sy += sliceH) {
    const h = Math.min(sliceH, canvas.height - sy);
    const c = document.createElement("canvas");
    c.width = canvas.width; c.height = h;
    const cx = c.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, h);
    cx.drawImage(canvas, 0, sy, canvas.width, h, 0, 0, canvas.width, h);
    const jpg = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
    pages.push({ bytes: new Uint8Array(await jpg.arrayBuffer()), w: c.width, h, dw: c.width * scale, dh: h * scale });
  }
  return buildPdf(pages, pageW, pageH, m);
}

function buildPdf(pages, pageW, pageH, m) {
  const enc = new TextEncoder();
  const parts = []; const offsets = []; let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push(`\nendobj\n`); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length;
  // 1:カタログ 2:ページ一覧 3〜：各ページ（ページ・中身・画像の3つずつ）
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`));
  pages.forEach((p, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
    obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    const content = `q ${p.dw.toFixed(2)} 0 0 ${p.dh.toFixed(2)} ${m} ${(pageH - m - p.dh).toFixed(2)} cm /Im${i} Do Q`;
    obj(ct, () => push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`));
    obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`); push(p.bytes); push("\nendstream"); });
  });
  const total = 3 + n * 3;
  const xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

// ---- 共有（スマホは共有メニュー、PCは保存） ----
// 共有メニューが使えるか（アプリ内のブラウザなどでは使えないことがある）
export function canShareFile(file) {
  if (!navigator.share) return false;
  try { return navigator.canShare ? navigator.canShare({ files: [file] }) : true; } catch { return false; }
}
export const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
// 共有メニューを開く。使えないときは "unsupported" を返す（保存や長押しの画面に切り替える）
export async function shareFile(file) {
  if (canShareFile(file)) {
    try { await navigator.share({ files: [file] }); return "shared"; }
    catch (e) { if (e.name === "AbortError") return "cancel"; console.warn(e); }
  }
  return "unsupported";
}
export function downloadFile(file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// 共有メニューが使えないスマホ用：画像を大きく表示（長押し→「共有」「"写真"に保存」ができる）
export function showImageViewer(file) {
  const url = URL.createObjectURL(file);
  const back = document.createElement("div");
  back.className = "viewer";
  back.innerHTML = `<div class="viewer-bar"><span>画像を<b>長押し</b> →「共有」でLINEを選べます。<br>「"写真"に保存」してからLINEで送ることもできます。</span><button class="btn" id="vclose">閉じる</button></div>
    <div class="viewer-body"><img src="${url}" alt="試合結果の画像"></div>`;
  document.body.append(back);
  back.querySelector("#vclose").onclick = () => { back.remove(); URL.revokeObjectURL(url); };
}
export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return "shared"; }
    catch (e) { if (e.name === "AbortError") return "cancel"; }
  }
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { return "fail"; }
}
export const lineUrl = (text) => "https://line.me/R/share?text=" + encodeURIComponent(text);
