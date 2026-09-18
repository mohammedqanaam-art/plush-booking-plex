import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, PhoneCall } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { publicBranches } from "@/data/publicBranches";
import { publicBranchContacts } from "@/data/publicBranchContacts";

const brands = [...new Set(publicBranches.map(branch => branch.brand))];

export default function HotelPhoneDirectory() {
  const [status, setStatus] = useState("");
  async function copy(phone: string, name: string) {
    try { await navigator.clipboard.writeText(phone); setStatus(`تم نسخ رقم ${name}`); }
    catch { setStatus("تعذر النسخ تلقائيًا؛ يمكنك تحديد الرقم ونسخه يدويًا."); }
  }
  return <div className="page-wrap" dir="rtl">
    <PageHeader title="أرقام الفنادق" icon={PhoneCall} actions={<Link to="/branches" className="text-sm text-primary underline">دليل الفروع</Link>} />
    <p className="text-sm text-muted-foreground">جميع أرقام الاستقبال في قائمة واحدة، مصنفة حسب البراند. اضغط الرقم للاتصال.</p>
    <p role="status" aria-live="polite" className="text-sm text-primary">{status}</p>
    <div className="space-y-6">
      {brands.map(brand => <section key={brand} aria-label={`أرقام ${brand}`} className="page-surface overflow-hidden">
        <h2 className="mb-4 text-xl font-bold text-primary">{brand}</h2>
        <Table>
          <TableHeader><TableRow><TableHead className="text-right">الفندق</TableHead><TableHead className="text-right">المدينة</TableHead><TableHead className="text-right">رقم الاستقبال</TableHead><TableHead className="text-right">نسخ</TableHead></TableRow></TableHeader>
          <TableBody>{publicBranches.filter(branch => branch.brand === brand).map(branch => {
            const contact = publicBranchContacts[branch.id];
            return <TableRow key={branch.id}>
              <TableCell className="min-w-36 font-semibold">{branch.name}{contact?.note && <p className="mt-2 text-sm font-normal text-muted-foreground">{contact.note}</p>}</TableCell>
              <TableCell>{branch.city}</TableCell>
              <TableCell>{contact?.phone ? <a className="inline-block select-all whitespace-nowrap py-3 text-base font-semibold text-primary" dir="ltr" href={`tel:${contact.phone}`}>{contact.phone}</a> : "غير مسجل"}{contact?.sourceUrl && <a href={contact.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline">مصدر الرقم</a>}</TableCell>
              <TableCell>{contact?.phone && <button type="button" onClick={() => void copy(contact.phone!, branch.name)} aria-label={`نسخ رقم ${branch.name}`} className="rounded-lg border p-3 hover:bg-secondary"><Copy className="h-4 w-4" aria-hidden="true" /></button>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </section>)}
    </div>
  </div>;
}
