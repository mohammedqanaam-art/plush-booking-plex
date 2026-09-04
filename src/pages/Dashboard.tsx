import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Headphones,
  LockKeyhole,
  MapPin,
  MessageSquareWarning,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { branches } from "@/data/branches";

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
    description: "استعرض مواقع الفنادق والخدمات وبيانات التواصل المعتمدة.",
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
    to: "/assistant",
    label: "مساحة الموظفين",
    description: "المساعد التشغيلي والتقارير والإجراءات للحسابات المخولة.",
    icon: LockKeyhole,
    tone: "violet",
  },
];

const privacyPoints = [
  "لا إعلانات أو بيع للبيانات",
  "لا تتبع تفصيلي للزوار",
  "بيانات الموظفين خلف تسجيل الدخول",
];

const cityCount = new Set(branches.map((branch) => branch.city)).size;

const Dashboard = () => (
  <div className="page-wrap public-home">
    <PageHeader title="بوابة خدمات BHG" showBack={false} />

    <section className="privacy-hero" aria-labelledby="privacy-hero-title">
      <div className="privacy-hero__content">
        <span className="privacy-hero__eyebrow"><Sparkles className="h-4 w-4" /> تجربة ضيافة رقمية موثوقة</span>
        <h2 id="privacy-hero-title">خدمة أوضح، وصول أسرع، وخصوصية أعلى.</h2>
        <p>واجهة مختصرة لخدمات الضيوف، ومساحة تشغيل منفصلة ومحمية لموظفي الحجز المركزي.</p>
        <div className="privacy-hero__actions">
          <Link to="/branches" className="privacy-hero__primary">
            استكشف الفروع <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link to="/assistant" className="privacy-hero__secondary">
            <LockKeyhole className="h-4 w-4" /> دخول الموظفين
          </Link>
        </div>
      </div>

      <aside className="privacy-shield" aria-label="التزامات الخصوصية">
        <span className="privacy-shield__icon"><ShieldCheck className="h-7 w-7" /></span>
        <div>
          <span className="privacy-shield__label">PRIVACY FIRST</span>
          <h3>السرية جزء من التصميم</h3>
        </div>
        <ul>
          {privacyPoints.map((point) => (
            <li key={point}><CheckCircle2 className="h-4 w-4" /> {point}</li>
          ))}
        </ul>
      </aside>
    </section>

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
        <p>أبقينا الواجهة العامة بسيطة، وحجبنا المحتوى التشغيلي الحساس.</p>
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
