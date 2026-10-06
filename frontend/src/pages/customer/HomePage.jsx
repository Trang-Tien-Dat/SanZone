import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  MapPin,
  Phone,
  ChevronRight,
  CalendarCheck,
  Search,
  LogOut,
  UserRound,
  Star,
  Swords,
  Clock,
  Navigation,
  ExternalLink,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getSports, getVenues, getCourts } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import LoginModal from "../../components/LoginModal";
import RegisterModal from "../../components/RegisterModal";
import { ROLES } from "../../utils/roles";
import { getOpenMatches, findFreeCourts } from "../../services/BookingApi";
import { getFavorites, toggleFavorite } from "../../services/authApi";
import { levelLabel } from "../../utils/TeamLevel";
import { hasMap, mapEmbedUrl, mapOpenUrl, mapDirectionsUrl } from "../../utils/map";

const toDateStr = (d) => d.toLocaleDateString("sv-SE");
const toMinHM = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHMStr = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Ô tìm kiếm: giờ bắt đầu 05:00 -> 23:00, bước 30 phút
// Section 2, 3, 4: cùng nền, mỗi section là 1 khung viền nhẹ để dễ phân biệt
const SECTION_CLASS = "scroll-mt-20 bg-pitch-50 px-4 pt-6 last-of-type:pb-6 md:px-6 md:pt-8 md:last-of-type:pb-8";
const SECTION_BOX =
  "mx-auto max-w-6xl rounded-3xl border border-edge bg-white/70 px-5 py-10 shadow-[0_1px_2px_rgba(11,61,36,0.04),0_8px_24px_-12px_rgba(11,61,36,0.12)] md:px-10 md:py-12";
const SEARCH_TIMES = Array.from({ length: 37 }, (_, i) => toHMStr(5 * 60 + i * 30));
const SEARCH_LENGTHS = [
  { value: 60, label: "1 giờ" },
  { value: 90, label: "1 giờ 30" },
  { value: 120, label: "2 giờ" },
];
// "Hôm nay" / "Ngày mai" / "T5 08/10"
function shortDay(str) {
  const now = new Date();
  const today = toDateStr(now);
  const tomorrow = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (str === today) return "Hôm nay";
  if (str === tomorrow) return "Ngày mai";
  const [y, m, d] = str.split("-").map(Number);
  const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(y, m - 1, d).getDay()];
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

// venues chưa có field "image" -> dùng ảnh mặc định theo môn thể thao
const SPORT_FALLBACK_IMAGE = {
  SP01:
    "https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=800&auto=format&fit=crop", // bóng đá
  SP02:
    "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=800&auto=format&fit=crop", // cầu lông
};
const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=800&auto=format&fit=crop";
function venueImage(v) {
  const url = v.images?.[0]?.url;
  if (!url) return SPORT_FALLBACK_IMAGE[v.sport_id] || DEFAULT_IMAGE;
  // Nhờ Cloudinary tự chọn định dạng nhẹ nhất + thu về 800px cho thẻ sân
  return url.replace("/upload/", "/upload/f_auto,q_auto,w_800/");
}

// Các class dùng lại nhiều lần
const fieldClass =
  "mb-4 flex h-12 items-center gap-2.5 rounded-lg border-[1.5px] border-edge bg-white px-3.5 transition focus-within:border-pitch-600 focus-within:ring-3 focus-within:ring-pitch-600/15";
const inputClass =
  "h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-[#93a69a]";
const labelClass = "mb-1.5 block text-sm font-semibold text-ink-soft";
const navLinkClass =
  "border-b-2 border-transparent py-1.5 font-medium text-white/80 transition hover:border-whistle hover:text-white";
const outlineBtnClass =
  "flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-white/35 px-4.5 text-[0.95rem] font-semibold transition hover:border-white";

export default function HomePage({ onBook, onOpenBookings }) {
  const { user, token, checking, logout } = useAuth();

  // null | "login" | "register"
  const [authMode, setAuthMode] = useState(null);
  // useCallback để modal không bị reset form mỗi khi trang render lại
  const closeAuth = useCallback(() => setAuthMode(null), []);
  const openLogin = useCallback(() => setAuthMode("login"), []);
  const openRegister = useCallback(() => setAuthMode("register"), []);

  const [sports, setSports] = useState([]);
  const [venues, setVenues] = useState([]);
  const [courtsByVenue, setCourtsByVenue] = useState({}); // { V001: { minPrice, count } }

  const [activeSport, setActiveSport] = useState(null); // = sportID, vd "SP01"
  const [area, setArea] = useState("");
  // Ô tìm sân trống theo giờ (section 1)
  const [searchDate, setSearchDate] = useState(() => toDateStr(new Date()));
  const [searchStart, setSearchStart] = useState("");
  // Hôm nay: chỉ hiện giờ chưa qua
  const searchTimes = (() => {
    if (searchDate !== toDateStr(new Date())) return SEARCH_TIMES;
    const now = new Date();
    return SEARCH_TIMES.filter((t) => toMinHM(t) > now.getHours() * 60 + now.getMinutes());
  })();
  // Đổi sang hôm nay mà giờ đang chọn đã qua -> bỏ chọn giờ
  function changeSearchDate(d) {
    setSearchDate(d);
    const now = new Date();
    if (searchStart && d === toDateStr(now) && toMinHM(searchStart) <= now.getHours() * 60 + now.getMinutes()) setSearchStart("");
  }
  const [searchLen, setSearchLen] = useState(90);
  const [free, setFree] = useState(null); // null = chưa tìm | { date, start, end, map: { V001: [court...] } }
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [loadingSports, setLoadingSports] = useState(true);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [error, setError] = useState(null);

  // ----- GET /api/sports -----
  useEffect(() => {
    getSports()
      .then((data) => {
        setSports(data);
        if (data.length > 0) setActiveSport(data[0].sportID);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSports(false));
  }, []);

  // ----- GET /api/venues?sport_id=...&area=... -----
  useEffect(() => {
    if (!activeSport) return;
    setLoadingVenues(true);

    getVenues({ sportId: activeSport, area })
      .then((data) => setVenues(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingVenues(false));
  }, [activeSport, area]);

  // ----- GET /api/courts?venue_id=V001,V002 — lấy giá cho các sân đang hiển thị -----
  useEffect(() => {
    if (venues.length === 0) {
      setCourtsByVenue({});
      return;
    }
    const ids = venues.map((v) => v.venue_id);

    getCourts(ids)
      .then((courts) => {
        const grouped = {};
        courts.forEach((c) => {
          const entry = grouped[c.venue_id] || { minPrice: Infinity, count: 0 };
          entry.minPrice = Math.min(entry.minPrice, c.price_per_hour);
          entry.count += 1;
          grouped[c.venue_id] = entry;
        });
        setCourtsByVenue(grouped);
      })
      .catch((err) => setError(err.message));
  }, [venues]);

  // ----- Kèo nửa sân đang chờ ghép (mọi cụm sân) -----
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  useEffect(() => {
    setLoadingMatches(true);
    getOpenMatches({ days: 7, sportId: activeSport || undefined })
      .then(setMatches)
      .catch(() => setMatches([]))
      .finally(() => setLoadingMatches(false));
  }, [activeSport]);

  // ----- Sân yêu thích -----
  // Yêu thích lưu theo tài khoản -> phải đăng nhập
  const [favs, setFavs] = useState([]);
  const pendingFav = useRef(null); // sân bấm sao lúc chưa đăng nhập -> lưu sau khi đăng nhập
  const [matchDay, setMatchDay] = useState("all");
  const [mapVenue, setMapVenue] = useState(null); // cụm sân đang mở bản đồ
  const [showAllMatches, setShowAllMatches] = useState(false);
  useEffect(() => {
    if (!token || !user) {
      setFavs([]);
      return;
    }
    getFavorites(token)
      .then(async (list) => {
        // Vừa đăng nhập xong từ nút sao -> thêm luôn sân đó
        const pending = pendingFav.current;
        if (pending && !list.includes(pending)) list = await toggleFavorite(token, pending);
        setFavs(list);
      })
      .catch(() => {})
      .finally(() => {
        pendingFav.current = null;
      });
  }, [token, user]);

  function toggleFav(venueId) {
    if (!user || !token) {
      pendingFav.current = venueId;
      openLogin();
      return;
    }
    const prev = favs;
    setFavs(favs.includes(venueId) ? favs.filter((id) => id !== venueId) : [...favs, venueId]); // đổi ngay trên giao diện
    toggleFavorite(token, venueId)
      .then(setFavs)
      .catch(() => setFavs(prev)); // lỗi -> trả lại như cũ
  }

  // Section 2 = sân yêu thích, section 3 = các sân còn lại (không lặp lại)
  const favVenues = useMemo(() => venues.filter((v) => favs.includes(v.venue_id)), [venues, favs]);
  const otherVenues = useMemo(() => venues.filter((v) => !favs.includes(v.venue_id)), [venues, favs]);

  // Kèo ở sân yêu thích lên trước
  const shownMatches = useMemo(() => {
    const fav = new Set(favs);
    return [...matches].sort((a, b) => Number(fav.has(b.venue_id)) - Number(fav.has(a.venue_id)));
  }, [matches, favs]);

  const dayMatches = useMemo(() => {
    const f = MATCH_DAY_FILTERS.find((x) => x.key === matchDay) ?? MATCH_DAY_FILTERS[0];
    return shownMatches.filter((m) => f.test(m.date));
  }, [shownMatches, matchDay]);

  // Đổi môn / khu vực -> kết quả tìm cũ không còn đúng
  useEffect(() => setFree(null), [venues]);

  const searchEnd = searchStart ? toHMStr(Math.min(toMinHM(searchStart) + searchLen, 24 * 60)) : "";
  const scrollTo = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  async function runSearch() {
    setSearchError("");
    if (!searchStart) {
      setFree(null);
      scrollTo("venues"); // chưa chọn giờ -> chỉ lọc theo khu vực
      return;
    }
    if (!venues.length) return;
    setSearching(true);
    try {
      const map = await findFreeCourts({ date: searchDate, start: searchStart, end: searchEnd, venueIds: venues.map((v) => v.venue_id) });
      setFree({ date: searchDate, start: searchStart, end: searchEnd, map });
      scrollTo("venues");
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  }

  const freeCount = free ? Object.values(free.map).filter((l) => l.length > 0).length : 0;
  // Đang lọc theo giờ: section 4 chỉ hiện sân còn trống
  const otherShown = useMemo(
    () => (free ? otherVenues.filter((v) => free.map[v.venue_id]?.length) : otherVenues),
    [free, otherVenues]
  );

  // Đặt sân từ kết quả tìm -> mở trang đặt với ngày/giờ/sân trống đã chọn sẵn
  function bookVenue(v) {
    const courts = free?.map[v.venue_id];
    handleBook(
      courts?.length ? { ...v, prefill: { date: free.date, start: free.start, end: free.end, court_id: courts[0].court_id } } : v
    );
  }

  function joinFromHome(m) {
    const v = venues.find((x) => x.venue_id === m.venue_id) || {
      venue_id: m.venue_id,
      venue_name: m.venue_name,
      address: m.address,
      sport_id: activeSport,
    };
    handleBook({ ...v, preselect: m });
  }

  // Chưa đăng nhập mà bấm "Đặt sân" -> mở form đăng nhập trước
  function handleBook(venue) {
    if (!user) {
      openLogin();
      return;
    }
    onBook(venue);
  }

  const activeSportInfo = sports.find((s) => s.sportID === activeSport);
  const isOwner = Number(user?.role_id) === ROLES.OWNER;

  return (
    <div className="min-h-screen bg-pitch-50 font-sans leading-relaxed text-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-pitch-900 text-white">
        <div className="mx-auto flex h-17 max-w-6xl items-center gap-4 px-6 md:gap-8">
          <Link to="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
            <img src="/img/sanzone.jpg" alt="SanZone" className="size-9 rounded-full bg-white object-cover" />
            SanZone
          </Link>

          <nav className="hidden flex-1 gap-6 md:flex">
            <a href="#search" className={navLinkClass}>
              Tìm sân
            </a>
            <a href="#matches" className={navLinkClass}>
              Ghép kèo
            </a>
            <a href="#favorites" className={navLinkClass}>
              Yêu thích
            </a>
            <a href="#venues" className={navLinkClass}>
              Các sân
            </a>
            {user && (
              <button onClick={onOpenBookings} className={navLinkClass}>
                Sân đã đặt
              </button>
            )}
            {isOwner && (
              <Link to="/owner" className={navLinkClass}>
                Quản lý sân
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2.5 md:ml-0">
            {checking ? null : user ? (
              <>
                {/* Khách hàng: bấm vào tên/ảnh -> trang tài khoản */}
                {Number(user.role_id) === ROLES.CUSTOMER ? (
                  <Link
                    to="/account"
                    title="Tài khoản của bạn"
                    className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition hover:bg-white/10"
                  >
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url.replace("/upload/", "/upload/f_auto,q_auto,w_64,h_64,c_fill,g_face/")}
                        alt=""
                        className="size-8 rounded-full object-cover ring-2 ring-whistle"
                      />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-full bg-whistle text-xs font-extrabold text-pitch-900">
                        {String(user.fullName || "?").trim().split(/\s+/).pop()[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="hidden flex-col leading-tight sm:flex">
                      <span className="font-semibold text-white">{user.fullName}</span>
                      {user.team_name && <span className="text-[11px] text-white/70">{user.team_name}</span>}
                    </span>
                  </Link>
                ) : (
                  <span className="hidden items-center gap-2 text-sm text-white/80 sm:flex">
                    <UserRound size={16} className="text-whistle" />
                    <span className="font-semibold text-white">{user.fullName}</span>
                  </span>
                )}
                <button onClick={logout} className={outlineBtnClass}>
                  <LogOut size={16} />
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <button onClick={openLogin} className={outlineBtnClass}>
                  Đăng nhập
                </button>
                <button
                  onClick={openRegister}
                  className="hidden h-10 rounded-full bg-whistle px-4.5 text-[0.95rem] font-semibold text-pitch-900 transition hover:bg-[#ffd560] sm:block"
                >
                  Đăng ký
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ================= SECTION 1/4: TÌM SÂN TRỐNG ================= */}
      <section id="search" className="bg-pitch-stripes relative scroll-mt-17 overflow-hidden py-12 text-white md:py-20">
        {/* vạch giữa sân + vòng tròn trung tâm */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-[58%] hidden w-0.5 bg-white/20 lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[28%] left-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20 lg:top-1/2 lg:left-[58%]"
        />

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-widest text-whistle uppercase">
              <Search size={14} /> 01 · Tìm sân
            </p>
            <h1 className="mb-4 max-w-[14ch] text-4xl leading-[1.08] font-extrabold tracking-tighter md:text-5xl lg:text-6xl">
              Tìm sân trống, đặt xong trong một phút
            </h1>
            <p className="mb-9 max-w-[44ch] text-lg text-white/80">
              Sân bóng đá và cầu lông quanh Cần Thơ, đặt là giữ chỗ ngay.
            </p>
            <div className="flex gap-6 text-[0.95rem] text-white/75 md:gap-10">
              <div className="border-l-3 border-whistle pl-4">
                <div className="text-3xl leading-tight font-extrabold text-white">{venues.length || "--"}</div>
                sân đang hoạt động
              </div>
              <div className="border-l-3 border-whistle pl-4">
                <div className="text-3xl leading-tight font-extrabold text-white">{sports.length || "--"}</div>
                môn thể thao
              </div>
            </div>
          </div>

          {/* Booking search card */}
          <div className="rounded-2xl bg-white p-6 text-ink shadow-[0_24px_48px_-16px_rgba(5,40,22,0.55)]">
            {loadingSports ? (
              <p className="mb-3 text-sm text-ink-soft">Đang tải danh sách môn thể thao...</p>
            ) : sports.length === 0 ? (
              <p className="mb-3 text-sm text-ink-soft">Chưa có dữ liệu môn thể thao. Kiểm tra API /api/sports.</p>
            ) : (
              <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-1.5 rounded-xl bg-pitch-100 p-1.5">
                {sports.map((s) => {
                  const active = activeSport === s.sportID;
                  return (
                    <button
                      key={s.sportID}
                      onClick={() => setActiveSport(s.sportID)}
                      className={`flex h-11 items-center justify-center gap-2 rounded-[10px] text-[0.95rem] font-semibold transition ${active ? "bg-pitch-700 text-white" : "text-pitch-700 hover:bg-white/60"
                        }`}
                    >
                      <span className="text-[1.05rem]">{s.sportID === "SP01" ? "⚽" : "🏸"}</span>
                      {s.sportName}
                    </button>
                  );
                })}
              </div>
            )}

            <label className={labelClass}>Khu vực</label>
            <div className={fieldClass}>
              <MapPin size={16} className="shrink-0 text-pitch-600" />
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Ninh Kiều, Cái Răng..."
                className={inputClass}
              />
            </div>

            <label className={labelClass}>Ngày chơi</label>
            <div className={fieldClass}>
              <CalendarCheck size={16} className="shrink-0 text-pitch-600" />
              <input
                type="date"
                value={searchDate}
                min={toDateStr(new Date())}
                onChange={(e) => e.target.value && changeSearchDate(e.target.value)}
                className={inputClass}
                aria-label="Ngày chơi"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="search-start" className={labelClass}>Giờ bắt đầu</label>
                <div className={fieldClass}>
                  <Clock size={16} className="shrink-0 text-pitch-600" />
                  <select id="search-start" value={searchStart} onChange={(e) => setSearchStart(e.target.value)} className={`${inputClass} cursor-pointer`}>
                    <option value="">Giờ bất kỳ</option>
                    {searchTimes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="search-len" className={labelClass}>Đá trong</label>
                <div className={fieldClass}>
                  <select
                    id="search-len"
                    value={searchLen}
                    onChange={(e) => setSearchLen(Number(e.target.value))}
                    disabled={!searchStart}
                    className={`${inputClass} cursor-pointer disabled:opacity-50`}
                  >
                    {SEARCH_LENGTHS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {searchError && <p className="mb-3 text-sm font-medium text-red-700">{searchError}</p>}

            <button
              onClick={runSearch}
              disabled={searching}
              className="mt-1 flex h-13 w-full items-center justify-center gap-2 rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900 disabled:opacity-60"
            >
              <Search size={16} />
              {searching ? "Đang tìm..." : searchStart ? `Tìm sân trống ${searchStart}–${searchEnd}` : "Tìm sân"}
            </button>
            {free && (
              <p className="mt-2.5 text-center text-sm text-ink-soft">
                <b className="text-pitch-700">{freeCount}</b>/{venues.length} cụm sân còn trống {free.start}–{free.end}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================= SECTION 2/4: KÈO GHÉP TRẬN ================= */}
      <section id="matches" className={SECTION_CLASS}>
        <div className={SECTION_BOX}>
          <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-widest text-amber-800 uppercase">
                <Swords size={14} /> 02 · Ghép trận
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                Kèo đang chờ ghép
                {!loadingMatches && matches.length > 0 && (
                  <span className="ml-3 inline-grid h-8 min-w-8 place-items-center rounded-full bg-whistle px-2.5 align-middle text-base font-bold text-pitch-900">
                    {matches.length}
                  </span>
                )}
              </h2>
              <p className="mt-2 max-w-[52ch] text-ink-soft">
                Thiếu đối thủ? Vào ghép nửa sân với đội đang chờ — mỗi đội chỉ trả một nửa tiền sân.
              </p>
            </div>

            {matches.length > 0 && (
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo ngày">
                {MATCH_DAY_FILTERS.map((f) => {
                  const n = matches.filter((m) => f.test(m.date)).length;
                  const active = matchDay === f.key;
                  return (
                    <button
                      key={f.key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setMatchDay(f.key);
                        setShowAllMatches(false);
                      }}
                      className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                        active ? "bg-pitch-700 text-white" : "bg-white text-ink-soft ring-1 ring-edge hover:text-ink hover:ring-pitch-600"
                      }`}
                    >
                      {f.label}
                      <span className={`ml-1.5 ${active ? "text-white/70" : "text-ink-soft/60"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {loadingMatches ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-pitch-100" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-edge bg-white px-6 py-12 text-center">
              <Swords size={36} className="mx-auto mb-3 text-amber-500" />
              <p className="text-lg font-bold">Chưa có kèo nào trong 7 ngày tới</p>
              <p className="mt-1 text-ink-soft">Đặt nửa sân để mở kèo đầu tiên — đội khác sẽ vào ghép với bạn.</p>
              <a
                href="#venues"
                className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-full bg-whistle px-5 font-bold text-pitch-900 transition hover:bg-[#ffd560]"
              >
                Chọn sân để mở kèo <ChevronRight size={16} />
              </a>
            </div>
          ) : dayMatches.length === 0 ? (
            <p className="rounded-2xl bg-white px-6 py-10 text-center text-ink-soft ring-1 ring-edge">Không có kèo nào trong ngày này.</p>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(showAllMatches ? dayMatches : dayMatches.slice(0, MATCHES_PREVIEW)).map((m) => (
                  <MatchCard key={m.detail_id} match={m} isFav={favs.includes(m.venue_id)} onJoin={() => joinFromHome(m)} />
                ))}
              </div>
              {dayMatches.length > MATCHES_PREVIEW && (
                <div className="mt-7 text-center">
                  <button
                    onClick={() => setShowAllMatches((v) => !v)}
                    className="h-11 rounded-full border-[1.5px] border-pitch-700 px-6 font-semibold text-pitch-700 transition hover:bg-pitch-700 hover:text-white"
                  >
                    {showAllMatches ? "Thu gọn" : `Xem thêm ${dayMatches.length - MATCHES_PREVIEW} kèo`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ================= SECTION 3/4: SÂN YÊU THÍCH ================= */}
      <section id="favorites" className={SECTION_CLASS}>
        <div className={SECTION_BOX}>
          <SectionHeading
            icon={<Star size={14} className="fill-amber-500" />}
            eyebrow="03 · Yêu thích"
            eyebrowClass="bg-amber-100 text-amber-800"
            title="Sân yêu thích của bạn"
            count={favVenues.length}
            subtitle={user ? "Lưu theo tài khoản — mở trên máy nào cũng thấy." : "Đăng nhập để lưu sân hay đá và đặt lại nhanh."}
          />

          {!user ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-edge bg-white px-6 py-10 text-center sm:flex-row sm:text-left">
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-amber-100">
                <Star size={30} className="fill-amber-400 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-bold">Đăng nhập để dùng danh sách yêu thích</p>
                <p className="text-ink-soft">Lưu những sân bạn hay đá — sân yêu thích sẽ được ghim ở đây và đi theo tài khoản của bạn.</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={openLogin}
                  className="h-11 rounded-full bg-pitch-700 px-5 font-bold text-white transition hover:bg-pitch-600"
                >
                  Đăng nhập
                </button>
                <button
                  onClick={openRegister}
                  className="h-11 rounded-full border-[1.5px] border-pitch-700 px-5 font-bold text-pitch-700 transition hover:bg-pitch-100"
                >
                  Đăng ký
                </button>
              </div>
            </div>
          ) : loadingVenues ? (
            <SkeletonGrid count={Math.min(Math.max(favs.length, 1), 3)} />
          ) : favVenues.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-edge bg-white px-6 py-10 text-center sm:flex-row sm:text-left">
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-amber-100">
                <Star size={30} className="fill-amber-400 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-bold">Chưa có sân yêu thích</p>
                <p className="text-ink-soft">
                  Bấm vào <Star size={14} className="inline fill-amber-400 text-amber-400" /> ở góc ảnh sân bên dưới — sân sẽ được ghim lên đây để đặt lại nhanh.
                </p>
              </div>
              <a
                href="#venues"
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-amber-400 px-5 font-bold text-amber-950 transition hover:bg-amber-300"
              >
                Xem các sân <ChevronRight size={16} />
              </a>
            </div>
          ) : (
            <VenueGrid
              list={favVenues}
              courtsByVenue={courtsByVenue}
              favs={favs}
              matches={matches}
              free={free}
              onToggleFav={toggleFav}
              onBook={bookVenue}
              onShowMap={setMapVenue}
            />
          )}
        </div>
      </section>

      {/* ================= SECTION 4/4: CÁC SÂN CÒN LẠI ================= */}
      <section id="venues" className={SECTION_CLASS}>
        <div className={SECTION_BOX}>
          <SectionHeading
            icon={<MapPin size={14} />}
            eyebrow="04 · Các sân"
            eyebrowClass="bg-pitch-100 text-pitch-700"
            title={`${favVenues.length ? "Các sân còn lại" : "Tất cả sân"}${activeSportInfo ? ` · ${activeSportInfo.sportName}` : ""}`}
            count={otherShown.length}
            subtitle={loadingVenues ? "Đang tải danh sách sân..." : "Bấm ngôi sao để đưa sân lên mục Yêu thích."}
          />

          {free && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-pitch-700 px-4 py-3 text-white">
              <Clock size={18} className="text-whistle" />
              <span className="flex-1">
                Đang lọc sân còn trống <b>{shortDay(free.date)} · {free.start}–{free.end}</b>
                {otherVenues.length > otherShown.length && (
                  <span className="text-white/70"> · ẩn {otherVenues.length - otherShown.length} sân đã kín</span>
                )}
              </span>
              <button
                onClick={() => setFree(null)}
                className="h-8 rounded-full bg-white/15 px-3.5 text-sm font-semibold transition hover:bg-white/25"
              >
                Bỏ lọc giờ
              </button>
            </div>
          )}

          {error && (
            <p className="mb-5 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 font-medium text-red-700">Lỗi: {error}</p>
          )}

          {loadingVenues ? (
            <SkeletonGrid count={3} />
          ) : venues.length === 0 ? (
            !error && <p className="text-ink-soft">Chưa có sân nào cho môn này.</p>
          ) : otherShown.length === 0 ? (
            <p className="rounded-2xl bg-white px-6 py-10 text-center text-ink-soft ring-1 ring-edge">
              {free
                ? `Không còn sân nào trống ${free.start}–${free.end}. Thử giờ khác, hoặc xem kèo ghép nửa sân ở trên.`
                : "Bạn đã thêm tất cả sân vào yêu thích 🎉"}
            </p>
          ) : (
            <VenueGrid
              list={otherShown}
              courtsByVenue={courtsByVenue}
              favs={favs}
              matches={matches}
              free={free}
              onToggleFav={toggleFav}
              onBook={bookVenue}
              onShowMap={setMapVenue}
            />
          )}
        </div>
      </section>

      <footer className="bg-pitch-900 text-sm text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 py-6 sm:flex-row">
          <span>SanZone. Đặt sân bóng đá & cầu lông.</span>
          <span>Cần Thơ, Việt Nam</span>
        </div>
      </footer>

      {mapVenue && <MapModal venue={mapVenue} onClose={() => setMapVenue(null)} onBook={() => { setMapVenue(null); bookVenue(mapVenue); }} />}
      <LoginModal open={authMode === "login"} onClose={closeAuth} onSwitchToRegister={openRegister} />
      <RegisterModal open={authMode === "register"} onClose={closeAuth} onSwitchToLogin={openLogin} />
    </div>
  );
}

/* ================= Thẻ kèo ghép ================= */

const MATCHES_PREVIEW = 6;
const isWeekend = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 || wd === 6;
};
const MATCH_DAY_FILTERS = [
  { key: "all", label: "Tất cả", test: () => true },
  { key: "today", label: "Hôm nay", test: (s) => shortDay(s) === "Hôm nay" },
  { key: "tomorrow", label: "Ngày mai", test: (s) => shortDay(s) === "Ngày mai" },
  { key: "weekend", label: "Cuối tuần", test: isWeekend },
];

// "Đội K4821" -> "K4", "FC Ninh Kiều" -> "NK"
function teamInitials(name) {
  const words = String(name || "").replace(/^(đội|fc|clb)\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function MatchCard({ match: m, isFav, onJoin }) {
  const day = shortDay(m.date);
  const urgent = day === "Hôm nay";
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-sm ring-1 ring-edge transition hover:-translate-y-1 hover:shadow-xl">
      {/* Giờ đá */}
      <div className={`flex items-center justify-between px-5 py-3 ${urgent ? "bg-whistle" : "bg-pitch-100"}`}>
        <span className={`text-xs font-bold tracking-wide uppercase ${urgent ? "text-pitch-900" : "text-pitch-700"}`}>
          {urgent && "🔥 "}
          {day}
        </span>
        <span className="flex items-center gap-1.5 text-lg font-extrabold text-pitch-900 tabular-nums">
          <Clock size={16} /> {m.start_time}–{m.end_time}
        </span>
      </div>

      {/* Đội chờ VS ? */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 pt-5 pb-4">
        <div className="min-w-0 text-center">
          <div className="mx-auto mb-2 grid size-14 place-items-center rounded-full bg-pitch-700 text-lg font-extrabold text-white ring-4 ring-pitch-100">
            {teamInitials(m.team_name)}
          </div>
          <p className="truncate text-sm font-bold" title={m.team_name}>
            {m.team_name}
          </p>
          <p className="text-[11px] text-ink-soft">đang chờ</p>
        </div>
        <span className="text-sm font-black text-ink-soft/60 italic">VS</span>
        <div className="min-w-0 text-center">
          <div className="mx-auto mb-2 grid size-14 place-items-center rounded-full border-2 border-dashed border-amber-400 bg-amber-50 text-xl font-extrabold text-amber-500 transition group-hover:bg-whistle group-hover:text-pitch-900">
            ?
          </div>
          <p className="text-sm font-bold text-amber-600">Đội bạn?</p>
          <p className="text-[11px] text-ink-soft">còn trống</p>
        </div>
      </div>

      {/* Sân + điều kiện */}
      <div className="mx-5 border-t border-dashed border-edge pt-3">
        <p className="flex items-center gap-1.5 truncate font-semibold">
          {isFav && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Sân yêu thích" />}
          <span className="truncate">{m.venue_name}</span>
        </p>
        <p className="truncate text-sm text-ink-soft">
          {m.court_name}
          {m.court_type && ` · ${m.court_type}`}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
            {m.wanted_level ? `Tìm đội ${levelLabel(m.wanted_level).toLowerCase()}` : "Trình độ bất kỳ"}
          </span>
          {m.price > 0 && (
            <span className="rounded-full bg-pitch-100 px-2.5 py-0.5 text-xs font-semibold text-pitch-700">
              {Number(m.price).toLocaleString("vi-VN")}đ / đội
            </span>
          )}
        </div>
      </div>

      <div className="grow" />
      <div className="p-5 pt-4">
        <button
          onClick={onJoin}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900"
        >
          <Swords size={16} /> Vào ghép kèo
        </button>
      </div>
    </article>
  );
}

/* ================= Thẻ cụm sân ================= */

function VenueCard({ venue: v, courtInfo, isFav, waiting, freeCourts, freeLabel, onToggleFav, onBook, onShowMap }) {
  const full = freeCourts && freeCourts.length === 0; // đang lọc giờ mà cụm này kín hết
  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition hover:-translate-y-1 hover:shadow-xl ${
        isFav ? "ring-2 ring-amber-300" : "ring-edge"
      } ${full ? "opacity-60" : ""}`}
    >
      <div className="relative">
        <img
          src={venueImage(v)}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = SPORT_FALLBACK_IMAGE[v.sport_id] || DEFAULT_IMAGE;
          }}
          alt={v.venue_name}
          className="block aspect-[16/10] w-full bg-pitch-100 object-cover transition duration-500 group-hover:scale-105"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />

        <button
          onClick={onToggleFav}
          aria-pressed={isFav}
          aria-label={isFav ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
          title={isFav ? "Bỏ yêu thích" : "Thêm vào yêu thích (cần đăng nhập)"}
          className="absolute top-3 left-3 grid size-10 place-items-center rounded-full bg-white/95 shadow-md transition hover:scale-110 active:scale-95"
        >
          <Star size={20} className={isFav ? "fill-amber-400 text-amber-400" : "text-ink-soft"} />
        </button>

        {waiting > 0 && (
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-whistle px-2.5 py-1 text-xs font-bold text-pitch-900 shadow-md">
            <Swords size={13} /> {waiting} kèo chờ
          </span>
        )}

        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-2 text-white">
          <span className="text-sm font-semibold drop-shadow">
            {courtInfo ? (
              <>
                Từ <b className="text-lg">{Number(courtInfo.minPrice).toLocaleString("vi-VN")}đ</b>/giờ
              </>
            ) : (
              "Đang cập nhật giá"
            )}
          </span>
          {courtInfo && (
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">{courtInfo.count} sân</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-2 text-lg leading-snug font-bold">{v.venue_name}</h3>
        <button
          onClick={onShowMap}
          title="Xem bản đồ"
          className="mb-1 flex items-start gap-1.5 text-left text-sm text-ink-soft transition hover:text-pitch-700"
        >
          <MapPin size={14} className="mt-0.5 shrink-0 text-pitch-600" />
          <span className="underline decoration-edge decoration-dashed underline-offset-4 hover:decoration-pitch-600">{v.address}</span>
        </button>
        {v.open_time && (
          <p className="mb-1 flex items-start gap-1.5 text-sm text-ink-soft">
            <Clock size={14} className="mt-0.5 shrink-0 text-pitch-600" /> Mở cửa {v.open_time}–{v.close_time}
          </p>
        )}
        {v.phone && (
          <p className="flex items-start gap-1.5 text-sm text-ink-soft">
            <Phone size={14} className="mt-0.5 shrink-0 text-pitch-600" /> {v.phone}
          </p>
        )}
        {freeCourts && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
              full ? "bg-red-50 text-red-700" : "bg-pitch-100 text-pitch-700"
            }`}
          >
            {full
              ? `Đã kín lúc ${freeLabel}`
              : `✓ Còn ${freeCourts.length} sân trống ${freeLabel}: ${freeCourts.map((c) => c.court_name).join(", ")}`}
          </p>
        )}
        <div className="min-h-4 grow" />
        <div className="flex gap-2">
          <button
            onClick={onShowMap}
            title={hasMap(v) ? "Xem vị trí trên Google Maps" : "Xem bản đồ theo địa chỉ"}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-edge px-3.5 text-sm font-semibold text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700"
          >
            <Navigation size={16} /> Bản đồ
          </button>
          <button
            onClick={onBook}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl border-[1.5px] border-pitch-700 font-bold text-pitch-700 transition group-hover:bg-pitch-700 group-hover:text-white"
          >
            Đặt sân <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ================= Phần dùng chung giữa các section ================= */

function SectionHeading({ icon, eyebrow, eyebrowClass, title, count, subtitle }) {
  return (
    <div className="mb-8">
      <p className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase ${eyebrowClass}`}>
        {icon} {eyebrow}
      </p>
      <h2 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight md:text-4xl">
        {title}
        {count > 0 && (
          <span className="inline-grid h-8 min-w-8 place-items-center rounded-full bg-ink/5 px-2.5 text-base font-bold text-ink-soft">{count}</span>
        )}
      </h2>
      {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
    </div>
  );
}

function SkeletonGrid({ count }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-2xl bg-pitch-100" />
      ))}
    </div>
  );
}

function VenueGrid({ list, courtsByVenue, favs, matches, free, onToggleFav, onBook, onShowMap }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((v) => (
        <VenueCard
          key={v.venue_id || v._id}
          venue={v}
          courtInfo={courtsByVenue[v.venue_id]}
          isFav={favs.includes(v.venue_id)}
          waiting={matches.filter((m) => m.venue_id === v.venue_id).length}
          freeCourts={free ? free.map[v.venue_id] ?? [] : null}
          freeLabel={free ? `${free.start}–${free.end}` : ""}
          onToggleFav={() => onToggleFav(v.venue_id)}
          onBook={() => onBook(v)}
          onShowMap={() => onShowMap(v)}
        />
      ))}
    </div>
  );
}

/* ================= Bản đồ Google Maps của 1 cụm sân ================= */

function MapModal({ venue: v, onClose, onBook }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Bản đồ ${v.venue_name}`}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold">{v.venue_name}</h3>
            <p className="flex items-start gap-1.5 text-sm text-ink-soft">
              <MapPin size={14} className="mt-0.5 shrink-0 text-pitch-600" /> {v.address}
            </p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-pitch-100 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <iframe title={`Bản đồ ${v.venue_name}`} src={mapEmbedUrl(v)} className="block h-80 w-full border-y border-edge md:h-96" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          {!hasMap(v) && <p className="mr-auto text-xs text-ink-soft">Vị trí ước tính theo địa chỉ</p>}
          <a
            href={mapDirectionsUrl(v)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] border-edge px-4 text-sm font-semibold text-ink transition hover:border-pitch-600 hover:text-pitch-700"
          >
            <Navigation size={15} /> Chỉ đường
          </a>
          <a
            href={mapOpenUrl(v)}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] border-edge px-4 text-sm font-semibold text-ink transition hover:border-pitch-600 hover:text-pitch-700"
          >
            <ExternalLink size={15} /> Mở Google Maps
          </a>
          <button onClick={onBook} className="flex h-10 items-center gap-1 rounded-lg bg-pitch-700 px-4 text-sm font-bold text-white transition hover:bg-pitch-600">
            Đặt sân <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
