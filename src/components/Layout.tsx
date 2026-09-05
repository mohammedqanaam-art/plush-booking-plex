import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Building2, LayoutDashboard, MessageSquareWarning, PhoneCall, ShieldCheck } from "lucide-react";
import BottomNav from "./BottomNav";
import RiyadhClock from "./RiyadhClock";
import ViewerPreferences from "./ViewerPreferences";
import BrandFooter from "./BrandFooter";
import AiChat from "./AiChat";
import VisitorChat from "./VisitorChat";

const desktopNav = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/branches", label: "الفروع", icon: Building2 },
  { to: "/contact-requests", label: "طلب تواصل", icon: PhoneCall },
  { to: "/complaints", label: "شكوى", icon: MessageSquareWarning },
];

const employeePaths = ["/assistant", "/operations", "/booking-reports", "/knowledge-bank"];

const Layout = () => {
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith("/admin");
  const isEmployeeArea = employeePaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const isPrivateArea = isAdminArea || isEmployeeArea;

  return (
    <div className={`app-shell ${isPrivateArea ? "app-shell--admin" : "app-shell--public"} flex flex-col`}>
      <header className="app-topbar safe-area-top sticky top-0 z-40">
        <div className="content-container app-topbar__inner">
          <Link to={isPrivateArea ? "/admin" : "/"} className="app-brand" aria-label="مجموعة بودل للضيافة — إدارة الحجز المركزي">
            <span className="app-brand__mark" aria-hidden="true">
              <img src="/bhg-hospitality-group.jpg" alt="" />
            </span>
            <span className="app-brand__copy">
              <strong>الحجز المركزي · BHG</strong>
              <small>{isPrivateArea ? "PRIVATE OPERATIONS WORKSPACE" : "BOUDL HOSPITALITY GROUP · EST. 1959"}</small>
            </span>
          </Link>

          {!isPrivateArea ? (
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
            <div className="hidden lg:inline-flex admin-context-pill">
              <ShieldCheck className="h-4 w-4" />
              مساحة داخلية محمية
            </div>
          )}

          <div className="app-topbar__actions">
            {!isPrivateArea ? (
              <>
                <Link
                  to="/admin"
                  className="admin-entry-link"
                  aria-label="دخول الموظفين والمشرفين"
                  title="دخول الموظفين والمشرفين"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span className="hidden xl:inline">دخول الموظفين</span>
                </Link>
                <div className="hidden lg:block"><RiyadhClock /></div>
                <div className="hidden md:block"><ViewerPreferences /></div>
              </>
            ) : (
              <Link to="/" className="admin-entry-link" aria-label="العودة للخدمات العامة" title="العودة للخدمات العامة">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">الخدمات العامة</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="app-main flex-1 min-h-0 overflow-y-auto custom-scrollbar" key={location.pathname}>
        <div className="content-container app-main__inner">
          <Outlet />
          {!isPrivateArea ? <BrandFooter className="mt-6 md:hidden" /> : null}
        </div>
      </main>

      {!isPrivateArea ? (
        <div className="hidden md:block">
          <BrandFooter />
        </div>
      ) : null}

      {!isPrivateArea ? <BottomNav /> : null}
      {!isPrivateArea ? <VisitorChat /> : null}
      {isAdminArea && location.pathname !== "/admin/login" ? <AiChat /> : null}
    </div>
  );
};

export default Layout;
