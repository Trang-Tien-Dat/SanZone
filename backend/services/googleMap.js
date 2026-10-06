/**
 * Tách toạ độ từ link Google Maps chủ sân dán vào.
 * Hỗ trợ: link đầy đủ (…/@10.03,105.78,17z, …!3d10.03!4d105.78, ?q=10.03,105.78),
 *         link rút gọn (maps.app.goo.gl/…, goo.gl/maps/…) -> tự đi theo redirect,
 *         hoặc gõ thẳng "10.0299, 105.7706".
 */
const RE_LIST = [
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // toạ độ đúng của địa điểm (ưu tiên)
  /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  /[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
  /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/,
];

function parseCoords(text) {
  const s = String(text || "");
  for (const re of RE_LIST) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

const isGoogleMapsUrl = (u) =>
  /^https?:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(u);

// Link rút gọn -> đi theo redirect (tối đa 5 bước) để lấy link đầy đủ có toạ độ
async function expandUrl(url) {
  let cur = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(cur, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const next = res.headers.get("location");
    if (!next) break;
    cur = new URL(next, cur).toString();
    if (parseCoords(cur)) break;
  }
  return cur;
}

// -> { map_url, lat, lng } hoặc { error }
async function resolveMapInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { map_url: "", lat: null, lng: null };

  const direct = parseCoords(raw);
  if (direct && !/^https?:/i.test(raw)) {
    return { map_url: `https://www.google.com/maps?q=${direct.lat},${direct.lng}`, ...direct };
  }
  if (!isGoogleMapsUrl(raw)) return { error: "Vui lòng dán link Google Maps (vd: https://maps.app.goo.gl/...)." };

  let coords = direct;
  if (!coords) {
    try {
      coords = parseCoords(await expandUrl(raw));
    } catch (e) {
      console.warn("[map] không mở được link rút gọn:", e.message);
    }
  }
  // Không tách được toạ độ vẫn lưu link (bản đồ nhúng sẽ tìm theo địa chỉ)
  return { map_url: raw.slice(0, 500), lat: coords?.lat ?? null, lng: coords?.lng ?? null };
}

module.exports = { parseCoords, resolveMapInput };
