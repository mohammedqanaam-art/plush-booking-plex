import { NavLink } from "react-router-dom";
import { BookOpenCheck, CalendarCheck2, Headphones, MessageCircle } from "lucide-react";

const links = [
  { to: "/booking-reports?section=employees", path: "/booking-reports", label: "تقارير الموظفين", icon: CalendarCheck2 },
  { to: "/knowledge-bank", path: "/knowledge-bank", label: "بنك المعلومات", icon: BookOpenCheck },
  { to: "/assistant", path: "/assistant", label: "المساعد الذكي", icon: MessageCircle },
  { to: "/workplace", path: "/workplace", label: "مساحة العمل", icon: Headphones },
];
export default function EmployeeNav() {
  return <nav aria-label="أقسام الموظفين" className="border-b bg-background/95">
    <div className="content-container grid grid-cols-2 gap-2 py-3 sm:grid-cols-4">
      {links.map((item) => <NavLink key={item.path} to={item.to} className={({ isActive }) => `flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><item.icon className="h-4 w-4 shrink-0" />{item.label}</NavLink>)}
    </div>
  </nav>;
}
