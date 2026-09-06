import {
  ArrowLeft,
  Building2,
  Headphones,
  LockKeyhole,
  MapPin,
  MessageSquareWarning,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { publicBranches as branches } from "@/data/publicBranches";

type ServiceTone = "green" | "orange" | "red" | "violet";
type PublicEntry = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: ServiceTone;
};

const publicEntries: PublicEntry[] = [
  {
    to: "/branches",
    label: "دليل الفروع",
    description: "تعرّف على الفروع ومدنها، وتحقق من التفاصيل عبر موقع الفندق الرسمي.",
    icon: Building2,
    tone: "green",
  },
  {
    to: "/contact-requests",
    label: "طلب تواصل",
    description: "أرسل طلبك ليتم التواصل معك عبر القناة المناسبة.",
    icon: PhoneCall,
    tone: "orange",
  },
  {
    to: "/complaints",
    label: "تسجيل شكوى",
    description: "وثّق الملاحظة بوضوح لتصل إلى الفريق المختص.",
    icon: MessageSquareWarning,
    tone: "red",
  },
  {
    to: "/workplace",
    label: "مساحة الموظفين",
    description: "الدخول المبكر، العملاء المحتملون وطلبات المشرفين والمتابعة.",
    icon: LockKeyhole,
    tone: "violet",
  },
  { to: "/workplace?section=calls", label: "المكالمات وخريطة البروتوكول", description: "خطوات استقبال المكالمة ومسار الحجز والمتابعة.", icon: Headphones, tone: "green" },
  { to: "/workplace?section=escalation", label: "آلية تصعيد الشكاوى", description: "الأولوية وجهة التصعيد وملف الحالة.", icon: MessageSquareWarning, tone: "red" },
  { to: "/workplace?section=cancellation", label: "سياسات الإلغاء", description: "مسار الإلغاء حسب مصدر الحجز وشروطه.", icon: Building2, tone: "orange" },
  { to: "/workplace?section=feedback", label: "التغذية الراجعة", description: "سجل ملاحظتك أو اقتراحك وتابع النتيجة.", icon: PhoneCall, tone: "violet" },
];

const cityCount = new Set(branches.map((branch) => branch.city)).size;

const Dashboard = () => (
  <div className="page-wrap public-home">
    <PageHeader title="بوابة خدمات BHG" showBack={false} />

    <section className="home-directory" aria-label="ملخص دليل الفروع">
      <div className="home-directory__identity">
        <span className="home-directory__icon"><Building2 className="h-6 w-6" strokeWidth={1.7} /></span>
        <div>
          <p>دليل الضيافة</p>
          <strong>{branches.length.toLocaleString("ar-SA")} فرعًا</strong>
        </div>
      </div>
      <span><MapPin className="h-4 w-4" /> {cityCount.toLocaleString("ar-SA")} مدن</span>
      <span><Headphones className="h-4 w-4" /> خدمة مركزية</span>
    </section>

    <section aria-labelledby="public-services-title" className="space-y-3">
      <div className="home-section-heading">
        <div>
          <span>الخدمات المتاحة</span>
          <h2 id="public-services-title">اختر ما تحتاجه</h2>
        </div>
        <p>أدوات الحجز ودليل الفروع في مكان واحد.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {publicEntries.map((item) => (
          <Link key={item.to} to={item.to} className="service-card service-card--detailed group">
            <span className={`service-icon service-icon--${item.tone}`}><item.icon className="h-5 w-5" strokeWidth={1.8} /></span>
            <div className="min-w-0 flex-1">
              <h3>{item.label}</h3>
              <p>{item.description}</p>
            </div>
            <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" strokeWidth={1.8} />
          </Link>
        ))}
      </div>
    </section>
  </div>
);

export default Dashboard;
