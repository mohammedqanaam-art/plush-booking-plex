import {
  ArrowLeft,
  BarChart3,
  BookOpen,
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
  { to: "/help", label: "مركز المساعدة", description: "الإرشادات العامة والأسئلة الشائعة، متاحة دون تسجيل دخول.", icon: BookOpen, tone: "green" },
  { to: "/branches/information", label: "معلومات الفنادق", description: "الغرف والمرافق والوجبات والقاعات حسب الفرع المختار.", icon: Building2, tone: "violet" },
  { to: "/branches/phones", label: "أرقام الفنادق", description: "قائمة واحدة بأرقام الاستقبال، مصنفة حسب البراند.", icon: PhoneCall, tone: "orange" },
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
  { to: "/guides/calls", label: "المكالمات وخريطة البروتوكول", description: "خطوات استقبال المكالمة ومسار الحجز والمتابعة.", icon: Headphones, tone: "green" },
  { to: "/guides/escalation", label: "آلية التعامل مع الشكاوى", description: "خطوات تسجيل الملاحظة وتوجيهها ومتابعة النتيجة.", icon: MessageSquareWarning, tone: "red" },
  { to: "/policies", label: "إرشادات الإلغاء والتعديل", description: "مسار الإلغاء حسب مصدر الحجز وشروطه.", icon: Building2, tone: "orange" },
  { to: "/guides/arrival", label: "الدخول المبكر والطلبات الخاصة", description: "ما يلزم معرفته قبل التواصل مع الفندق لتأكيد الطلب.", icon: Building2, tone: "violet" },
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
          <span>متاح دون تسجيل دخول</span>
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
    <section className="page-surface space-y-3" aria-labelledby="employee-entry-title">
      <h2 id="employee-entry-title" className="flex items-center gap-2 font-bold"><LockKeyhole className="h-5 w-5 text-primary" />خدمات الموظفين — تتطلب تسجيل الدخول</h2>
      <div className="flex flex-wrap gap-4 text-sm text-primary">
        <Link to="/workplace" className="underline">مساحة الموظفين</Link>
        <Link to="/booking-reports?section=employees" className="inline-flex items-center gap-2 underline"><BarChart3 className="h-4 w-4" />تقارير الموظفين من UNO</Link>
        <Link to="/workplace?section=feedback" className="underline">التغذية الراجعة والمتابعة الداخلية</Link>
      </div>
    </section>
  </div>
);

export default Dashboard;
