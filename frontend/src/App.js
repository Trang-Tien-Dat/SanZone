import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Homepages from "./pages/customer/HomePage";
import CourtBookingPage from "./pages/customer/CourtBookingPage";
import MyBookingPage from "./pages/customer/MyBookingPages";
import { AuthProvider } from "./context/AuthContext";
import RoleRoute from "./components/RoleRoute";
import { ROLES } from "./utils/roles";
import OwnerLayout from "./pages/owner/OwnerLayout";
import OwnerDashboard from "./pages/owner/OwnerDashboard";
import OwnerBookings from "./pages/owner/OwnerBookings";
import OwnerBookSlot from "./pages/owner/OwnerBookSlot";
import OwnerRevenue from "./pages/owner/OwnerRevenue";
import OwnerSubscription from "./pages/owner/OwnerSubscription";
import OwnerCustomers from "./pages/owner/OwnerCustomers";
import AccountPage from "./pages/customer/AccountPage";
import OwnerVenue from "./pages/owner/OwnerVenue";
import LogoutOnLeave from "./components/LogoutOnLeave";


// admin
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminAccounts from "./pages/admin/AdminAccounts";
import AdminBookings from "./pages/admin/AdminBookings";
import AdminRevenue from "./pages/admin/AdminRevenue";
import AdminPromotions from "./pages/admin/AdminPromotions";

// Mỗi lần đổi trang thì cuộn lên đầu (thay cho window.scrollTo cũ)
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/* Bọc các trang cũ: giữ nguyên props onBook / onBack / onOpenBookings, chỉ đổi sang điều hướng bằng URL */
function HomeRoute() {
  const navigate = useNavigate();
  return (
    <Homepages
      onBook={(venue) => navigate("/booking", { state: { venue } })}
      onOpenBookings={() => navigate("/my-bookings")}
    />
  );
}

function BookingRoute() {
  const navigate = useNavigate();
  const venue = useLocation().state?.venue;
  // F5 ở trang đặt sân sẽ mất venue -> quay về trang chủ
  if (!venue) return <Navigate to="/" replace />;
  return <CourtBookingPage venue={venue} onBack={() => navigate("/")} />;
}

function MyBookingsRoute() {
  const navigate = useNavigate();
  return <MyBookingPage onBack={() => navigate("/")} />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <LogoutOnLeave />
        <Routes>
          {/* Khách hàng */}
          <Route path="/" element={<HomeRoute />} />
          <Route path="/booking" element={<BookingRoute />} />
          <Route path="/my-bookings" element={<MyBookingsRoute />} />
          <Route element={<RoleRoute allow={[ROLES.CUSTOMER]} />}>
            <Route path="/account" element={<AccountPage />} />
          </Route>

          {/* Chủ sân */}
          <Route element={<RoleRoute allow={[ROLES.OWNER]} />}>
            <Route path="/owner" element={<OwnerLayout />}>
              <Route index element={<OwnerDashboard />} />
              <Route path="bookings" element={<OwnerBookings />} />
              <Route path="book" element={<OwnerBookSlot />} />
              <Route path="revenue" element={<OwnerRevenue />} />
              <Route path="subscription" element={<OwnerSubscription />} />
              <Route path="customers" element={<OwnerCustomers />} />
              <Route path="venue" element={<OwnerVenue />} />
            </Route>
          </Route>
          {/*admin */}

          <Route element={<RoleRoute allow={[ROLES.ADMIN]} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="accounts" element={<AdminAccounts />} />
              <Route path="bookings" element={<AdminBookings />} />
              <Route path="revenue" element={<AdminRevenue />} />
              <Route path="promotions" element={<AdminPromotions />} />
            </Route>
          </Route>
          {/* URL lạ -> về trang chủ */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;