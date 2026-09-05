import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { clearAdminSession, getAdminSession, type UserRole } from "@/lib/adminAuth";
import { api } from "@/lib/api";

type ProtectedRouteProps = {
  children: JSX.Element;
  allowedRoles?: readonly UserRole[];
};

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const location = useLocation();
  const cachedSession = getAdminSession();
  const [state, setState] = useState<"checking" | "allowed" | "denied" | "forbidden">(
    cachedSession
      ? allowedRoles && !allowedRoles.includes(cachedSession.role) ? "forbidden" : "checking"
      : "denied",
  );

  useEffect(() => {
    if (!getAdminSession()) return;
    api.validateSession().then((session) => {
      if (session && allowedRoles && !allowedRoles.includes(session.role)) setState("forbidden");
      else if (session) setState("allowed");
      else {
        clearAdminSession();
        setState("denied");
      }
    }).catch(() => {
      clearAdminSession();
      setState("denied");
    });
  }, [allowedRoles]);

  if (state === "checking") {
    return <div className="grid min-h-[45vh] place-items-center text-sm text-muted-foreground">جاري التحقق من صلاحية الدخول…</div>;
  }
  if (state === "denied") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  if (state === "forbidden") {
    return <Navigate to="/assistant" replace />;
  }
  return children;
};

export default ProtectedRoute;
