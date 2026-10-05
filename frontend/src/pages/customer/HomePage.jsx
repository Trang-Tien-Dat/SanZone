import { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Phone,
  ChevronRight,
  CalendarCheck,
  Search,
  LogOut,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getSports, getVenues, getCourts } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import LoginModal from "../../components/LoginModal";
import RegisterModal from "../../components/RegisterModal";
import { ROLES } from "../../utils/roles";

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
function formatPrice(n) {
  return `${Number(n).toLocaleString("vi-VN")}đ/giờ`;
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
  const { user, checking, logout } = useAuth();

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
  const [date, setDate] = useState("");

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
            <a href="#venues" className={navLinkClass}>
              Tìm sân
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
                <span className="hidden items-center gap-2 text-sm text-white/80 sm:flex">
                  <UserRound size={16} className="text-whistle" />
                  <span className="font-semibold text-white">{user.fullName}</span>
                </span>
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

      {/* Hero – mặt sân cỏ */}
      <section className="bg-pitch-stripes relative overflow-hidden py-12 text-white md:py-20">
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

            <label className={labelClass}>Ngày & giờ chơi</label>
            <div className={fieldClass}>
              <CalendarCheck size={16} className="shrink-0 text-pitch-600" />
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="Hôm nay, 19:00"
                className={inputClass}
              />
            </div>

            <button className="mt-1 flex h-13 w-full items-center justify-center gap-2 rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900">
              <Search size={16} />
              Tìm sân trống
            </button>
          </div>
        </div>
      </section>

      {/* Venues */}
      <section id="venues" className="py-18 md:py-22">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="mb-1 text-2xl font-extrabold tracking-tight md:text-3xl">
                Sân nổi bật
                {activeSportInfo ? ` cho ${activeSportInfo.sportName}` : ""}
              </h2>
              <p className="text-ink-soft">
                {loadingVenues ? "Đang tải danh sách sân..." : `${venues.length} sân đang nhận đặt trong khu vực của bạn.`}
              </p>
            </div>
            <a
              href="#venues"
              className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-pitch-700 underline-offset-4 hover:underline"
            >
              Xem tất cả <ChevronRight size={16} />
            </a>
          </div>

          {error && (
            <p className="mb-5 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 font-medium text-red-700">
              Lỗi: {error}
            </p>
          )}

          {!loadingVenues && venues.length === 0 && !error && (
            <p className="mb-3 text-sm text-ink-soft">Chưa có sân nào cho môn này. Kiểm tra API /api/venues.</p>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
            {venues.map((v) => {
              const courtInfo = courtsByVenue[v.venue_id];
              return (
                <div
                  key={v.venue_id || v._id}
                  className="flex flex-col overflow-hidden rounded-xl border border-edge bg-white transition hover:border-pitch-600"
                >
                  <img
                    src={venueImage(v)}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = SPORT_FALLBACK_IMAGE[v.sport_id] || DEFAULT_IMAGE;
                    }}
                    alt={v.venue_name}
                    className="block aspect-[16/10] w-full border-b-4 border-pitch-700 bg-pitch-100 object-cover"
                  />
                  <div className="flex flex-1 flex-col p-4.5">
                    <h3 className="mb-2 text-lg leading-snug font-bold">{v.venue_name}</h3>
                    <p className="mb-1 flex items-start gap-1.5 text-sm text-ink-soft">
                      <MapPin size={13} className="mt-1 shrink-0 text-pitch-600" /> {v.address}
                    </p>
                    {v.phone && (
                      <p className="mb-1 flex items-start gap-1.5 text-sm text-ink-soft">
                        <Phone size={13} className="mt-1 shrink-0 text-pitch-600" /> {v.phone}
                      </p>
                    )}
                    {/* đẩy phần giá xuống đáy thẻ, luôn cách nội dung tối thiểu 14px */}
                    <div className="min-h-3.5 grow" />
                    <div className="flex items-center justify-between gap-3 border-t border-dashed border-edge pt-3.5">
                      <span className="text-sm font-bold text-pitch-700">
                        {courtInfo ? `Từ ${formatPrice(courtInfo.minPrice)} · ${courtInfo.count} sân` : "Đang cập nhật giá"}
                      </span>
                      <button
                        onClick={() => handleBook(v)}
                        className="h-9.5 shrink-0 rounded-full border-[1.5px] border-pitch-700 px-4 text-sm font-bold text-pitch-700 transition hover:bg-pitch-700 hover:text-white"
                      >
                        Đặt sân
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-pitch-900 text-sm text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 py-6 sm:flex-row">
          <span>SanZone. Đặt sân bóng đá & cầu lông.</span>
          <span>Cần Thơ, Việt Nam</span>
        </div>
      </footer>

      <LoginModal open={authMode === "login"} onClose={closeAuth} onSwitchToRegister={openRegister} />
      <RegisterModal open={authMode === "register"} onClose={closeAuth} onSwitchToLogin={openLogin} />
    </div>
  );
}