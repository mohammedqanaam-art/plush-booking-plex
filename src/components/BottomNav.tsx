import { useLocation, useNavigate } from "react-router-dom";
import { Building2, LayoutDashboard, LockKeyhole, MessageSquareWarning, PhoneCall } from "lucide-react";

const mainNavItems = [
  { path: "/", label: "الرئيسية", icon: LayoutDashboard },
  { path: "/branches", label: "الفروع", icon: Building2 },
  { path: "/contact-requests", label: "تواصل", icon: PhoneCall },
  { path: "/complaints", label: "شكوى", icon: MessageSquareWarning },
  { path: "/admin/login", label: "دخول", icon: LockKeyhole },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="mobile-nav-wrap relative z-50 md:hidden">
      <nav className="mobile-tab-bar safe-area-bottom" aria-label="التنقل الرئيسي">
        <div className="mobile-tab-bar__inner">
          {mainNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`mobile-tab-item touch-target interactive ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="mobile-tab-item__icon">
                  <item.icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default BottomNav;
