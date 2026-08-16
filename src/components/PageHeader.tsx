import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

type PageHeaderProps = {
  title: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  subtitle?: string;
};

const fallbackForPath = (pathname: string) => {
  if (pathname.startsWith("/admin") && pathname !== "/admin") return "/admin";
  if (pathname === "/" || pathname === "/dashboard") return "/";
  return "/";
};

const PageHeader = ({ title, icon: Icon, actions, showBack = true, onBack: customBack, subtitle }: PageHeaderProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onBack = () => {
    if (customBack) {
      customBack();
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate(fallbackForPath(pathname));
  };

  return (
    <header className="page-heading page-heading--executive relative z-10">
      <div className="page-heading__row">
        <div className="page-heading__identity">
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              className="page-back-button touch-target interactive"
              aria-label="رجوع"
            >
              <ArrowRight className="mx-auto h-5 w-5" strokeWidth={1.9} />
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="page-heading__title-line">
              {Icon ? <span className="page-heading__icon"><Icon className="h-5 w-5" strokeWidth={1.9} /></span> : null}
              <h1>{title}</h1>
            </div>
            {subtitle ? <p className="page-heading__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="page-heading__actions">{actions}</div> : null}
      </div>
      <div className="page-heading__rule" aria-hidden="true" />
    </header>
  );
};

export default PageHeader;
