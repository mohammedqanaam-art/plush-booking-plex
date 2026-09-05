import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAdminSession } from "@/lib/adminAuth";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const rawRequestedPath = typeof location.state === "object" && location.state
    && "from" in location.state && typeof location.state.from === "string"
    ? location.state.from
    : "/admin";
  const requestedPath = rawRequestedPath.startsWith("/") && !rawRequestedPath.startsWith("//")
    ? rawRequestedPath
    : "/admin";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAdminSession()) {
      navigate(requestedPath, { replace: true });
    }
  }, [navigate, requestedPath]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(username, password);
      navigate(requestedPath, { replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message === "Corporate network required"
        ? "حسابات الإدارة تتطلب الاتصال بشبكة الشركة أو الـ VPN المؤسسي المعتمد."
        : "بيانات الدخول غير صحيحة.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap-narrow">
      <PageHeader title="دخول الموظفين والإدارة" icon={Lock} />

      <div className="glass-card p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">تسجيل الدخول</h3>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <input
            type="text"
            placeholder="اسم المستخدم"
            dir="ltr"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full max-w-sm mx-auto h-11 px-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground text-sm block"
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full max-w-sm mx-auto h-11 px-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground text-sm block"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full max-w-sm mx-auto h-11 rounded-lg gold-gradient text-primary-foreground font-semibold text-sm block disabled:opacity-50"
          >
            {loading ? "جاري التحقق..." : "تسجيل الدخول"}
          </button>
        </form>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
};

export default AdminLogin;
