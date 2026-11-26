/** drawn placeholder pictures (no stock photos): simple scenes in the site's own colour, replaced by real images later */
const uri = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

function shade(hex: string, k: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))).toString(16).padStart(2, "0");
  return "#" + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}

export function placeholder(kind: "exterior" | "interior" | "kitchen" | "garden" | "detail", accent = "#84BF31") {
  const a = accent, light = shade(a, 0.78), mid = shade(a, 0.45), dark = shade(a, -0.45);
  const W = 1600, H = 1000;
  let body = "";
  if (kind === "exterior") {
    let win = "";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) win += `<rect x="${560 + c * 95}" y="${330 + r * 120}" width="58" height="78" rx="3" fill="${c % 3 === r % 3 ? "#fff6d8" : light}"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) win += `<rect x="${1180 + c * 90}" y="${470 + r * 115}" width="54" height="72" rx="3" fill="${light}"/>`;
    body = `<rect width="${W}" height="${H}" fill="${shade(a, 0.9)}"/><circle cx="1320" cy="190" r="90" fill="#fff" opacity=".7"/><rect x="520" y="280" width="620" height="560" rx="6" fill="#fff"/><rect x="520" y="280" width="620" height="26" fill="${dark}"/><rect x="1140" y="420" width="320" height="420" rx="6" fill="${shade(a, 0.62)}"/>${win}<rect y="840" width="${W}" height="160" fill="${mid}"/><circle cx="330" cy="700" r="150" fill="${a}"/><rect x="318" y="760" width="24" height="110" fill="${dark}"/><circle cx="150" cy="780" r="90" fill="${shade(a, 0.2)}"/>`;
  } else if (kind === "interior") {
    body = `<rect width="${W}" height="${H}" fill="${shade(a, 0.92)}"/><rect y="700" width="${W}" height="300" fill="#e9dcc6"/><rect x="170" y="150" width="520" height="420" rx="6" fill="#fff"/><path d="M430 150v420M170 360h520" stroke="${light}" stroke-width="10"/><rect x="820" y="560" width="620" height="170" rx="26" fill="${mid}"/><rect x="800" y="480" width="660" height="130" rx="30" fill="${a}"/><rect x="860" y="640" width="250" height="70" rx="18" fill="${light}"/><rect x="1140" y="640" width="250" height="70" rx="18" fill="${light}"/><rect x="330" y="770" width="420" height="26" rx="13" fill="${dark}"/><rect x="360" y="796" width="18" height="90" fill="${dark}"/><rect x="702" y="796" width="18" height="90" fill="${dark}"/><circle cx="1320" cy="240" r="70" fill="#fff6d8"/><path d="M1320 0v170" stroke="${dark}" stroke-width="6"/>`;
  } else if (kind === "kitchen") {
    body = `<rect width="${W}" height="${H}" fill="${shade(a, 0.9)}"/><rect y="760" width="${W}" height="240" fill="#e9dcc6"/><rect x="140" y="520" width="1320" height="260" rx="8" fill="#fff"/><rect x="140" y="500" width="1320" height="34" rx="6" fill="${dark}"/><path d="M470 540v240M800 540v240M1130 540v240" stroke="${light}" stroke-width="8"/><rect x="140" y="140" width="1320" height="200" rx="8" fill="${mid}"/><path d="M470 140v200M800 140v200M1130 140v200" stroke="${shade(a, 0.3)}" stroke-width="8"/><circle cx="930" cy="470" r="34" fill="${a}"/><rect x="1180" y="420" width="120" height="80" rx="10" fill="${light}"/><rect x="250" y="410" width="60" height="90" rx="8" fill="${a}"/>`;
  } else if (kind === "garden") {
    body = `<rect width="${W}" height="${H}" fill="${shade(a, 0.9)}"/><rect y="640" width="${W}" height="360" fill="${mid}"/><circle cx="300" cy="520" r="210" fill="${a}"/><circle cx="620" cy="590" r="140" fill="${shade(a, 0.25)}"/><circle cx="1250" cy="500" r="230" fill="${shade(a, -0.15)}"/><rect x="1236" y="640" width="28" height="170" fill="${dark}"/><rect x="288" y="640" width="24" height="150" fill="${dark}"/><path d="M0 880c300-60 500 40 800 0s520-60 800 0v120H0Z" fill="${shade(a, 0.3)}"/><circle cx="1380" cy="170" r="70" fill="#fff" opacity=".75"/>`;
  } else {
    body = `<rect width="${W}" height="${H}" fill="${light}"/><circle cx="520" cy="560" r="420" fill="${mid}"/><circle cx="1050" cy="430" r="320" fill="${a}"/><rect x="900" y="560" width="520" height="300" rx="20" fill="#fff" opacity=".85"/><path d="M0 820c400-140 900 120 1600-60" stroke="${dark}" stroke-width="10" fill="none"/>`;
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`);
}
