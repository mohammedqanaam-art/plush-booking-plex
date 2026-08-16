import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Building2, LayoutDashboard, MessageCircle, PhoneCall, Search, ShieldCheck } from "lucide-react";
import BottomNav from "./BottomNav";
import RiyadhClock from "./RiyadhClock";
import ViewerPreferences from "./ViewerPreferences";
import AnalyticsTracker from "./AnalyticsTracker";
import BrandFooter from "./BrandFooter";
import AiChat from "./AiChat";

const desktopNav = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/assistant", label: "المساعد", icon: MessageCircle },
  { to: "/operations", label: "البحث", icon: Search },
  { to: "/branches", label: "الفروع", icon: Building2 },
  { to: "/booking-reports", label: "التقارير", icon: BarChart3 },
  { to: "/contact-requests", label: "طلبات التواصل", icon: PhoneCall },
];

const Layout = () => {
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith("/admin");

  return (
    <div className={`app-shell ${isAdminArea ? "app-shell--admin" : "app-shell--public"} flex flex-col`}>
      <AnalyticsTracker />

      <header className="app-topbar safe-area-top sticky top-0 z-40">
        <div className="content-container app-topbar__inner">
          <Link to={isAdminArea ? "/admin" : "/"} className="app-brand" aria-label="إدارة الحجز المركزي">
            <span className="app-brand__copy">
              <strong>إدارة الحجز المركزي</strong>
              <small>{isAdminArea ? "لوحة الإدارة والتشغيل" : "BHG · Central Reservation"}</small>
            </span>
          </Link>

          {!isAdminArea ? (
            <nav className="app-desktop-nav hidden md:flex" aria-label="التنقل الرئيسي">
              {desktopNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `app-desktop-nav__item ${isActive ? "is-active" : ""}`}
                >
                  <item.icon className="w-4 h-4" strokeWidth={1.9} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : (
            <div className="hidden md:inline-flex admin-context-pill">
              <ShieldCheck className="h-4 w-4" />
              مساحة إدارية محمية
            </div>
          )}

          <div className="app-topbar__actions">
            {!isAdminArea ? (
              <Link
                to="/admin"
                className="admin-entry-link"
                aria-label="لوحة مدير ومشرفين إدارة الحجز"
                title="لوحة مدير ومشرفين إدارة الحجز"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden xl:inline">الإدارة</span>
              </Link>
            ) : (
              <Link to="/" className="admin-entry-link" aria-label="العودة للموقع العام" title="العودة للموقع العام">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden xl:inline">الموقع العام</span>
              </Link>
            )}
            <div className="hidden lg:block"><RiyadhClock /></div>
            <div className="hidden md:block"><ViewerPreferences /></div>
          </div>
        </div>
      </header>

      <main className="app-main flex-1 min-h-0 overflow-y-auto custom-scrollbar" key={location.pathname}>
        <div className="content-container app-main__inner">
          <Outlet />
          {!isAdminArea ? <BrandFooter className="mt-6 md:hidden" /> : null}
        </div>
      </main>

      {!isAdminArea ? (
        <div className="hidden md:block">
          <BrandFooter />
        </div>
      ) : null}

      {!isAdminArea ? <BottomNav /> : null}
      {isAdminArea && location.pathname !== "/admin/login" ? <AiChat /> : null}
    </div>
  );
};

export default Layout;
