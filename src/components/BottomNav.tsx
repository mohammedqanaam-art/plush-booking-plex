import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Building2, LayoutDashboard, MessageCircle, Search } from "lucide-react";
import { warmVisitorAssistant } from "@/lib/visitorAssistantClient";

const mainNavItems = [
  { path: "/", label: "الرئيسية", icon: LayoutDashboard },
  { path: "/assistant", label: "المساعد", icon: MessageCircle },
  { path: "/operations", label: "البحث", icon: Search },
  { path: "/branches", label: "الفروع", icon: Building2 },
  { path: "/booking-reports", label: "التقارير", icon: BarChart3 },
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
                onPointerDown={item.path === "/assistant" ? () => void warmVisitorAssistant() : undefined}
                onClick={() => {
                  if (item.path === "/assistant") void warmVisitorAssistant();
                  navigate(item.path);
                }}
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
