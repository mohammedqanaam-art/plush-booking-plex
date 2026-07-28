import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  api,
  type UnoConnectionStatus,
  type UnoReservation,
  type UnoSearchField,
} from "@/lib/api";

const searchFields: Array<{ value: UnoSearchField; label: string; placeholder: string }> = [
  { value: "phone", label: "رقم التواصل", placeholder: "05xxxxxxxx" },
  { value: "pms", label: "رقم PMS", placeholder: "رقم الحجز PMS" },
  { value: "uno", label: "رقم UNO", placeholder: "رقم الحجز UNO" },
];

const displayDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const AdminUno = () => {
  const [status, setStatus] = useState<UnoConnectionStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [otp, setOtp] = useState("");
  const [field, setField] = useState<UnoSearchField>("phone");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnoReservation[] | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.getUnoConnection()
      .then(setStatus)
      .catch((error: Error) => {
        setFailed(true);
        setMessage(error.message);
      });
  }, []);

  useEffect(() => {
    if (status?.phase !== "otp") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status?.phase]);

  const resendSeconds = useMemo(() => {
    if (!status?.resendAt) return 0;
    return Math.max(0, Math.ceil((new Date(status.resendAt).getTime() - now) / 1_000));
  }, [now, status?.resendAt]);

  const runStatusAction = async (
    name: string,
    action: () => Promise<UnoConnectionStatus>,
    successMessage = "",
  ) => {
    setBusy(name);
    setFailed(false);
    setMessage("");
    try {
      const next = await action();
      setStatus(next);
      setMessage(next.phase === "otp" ? "تم إرسال رمز التحقق." : successMessage);
      if (next.phase !== "otp") setOtp("");
      if (next.phase !== "connected") setResults(null);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الطلب.");
    } finally {
      setBusy("");
    }
  };

  const submitOtp = (event: React.FormEvent) => {
    event.preventDefault();
    if (!otp.trim()) return;
    void runStatusAction("verify", () => api.verifyUno(otp.trim()), "تم الاتصال بـ UNO.");
  };

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setFailed(false);
    setMessage("");
    try {
      const response = await api.searchUnoReservations(field, query.trim());
      setResults(response.reservations);
      setMessage(response.total ? "" : "لا توجد حجوزات مطابقة.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "تعذر البحث في UNO.");
    } finally {
      setBusy("");
    }
  };

  const loadReservations = async () => {
    setBusy("list");
    setFailed(false);
    setMessage("");
    try {
      const response = await api.listUnoReservations();
      setResults(response.reservations);
      setMessage(response.total ? "" : "لا توجد حجوزات متاحة.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "تعذر عرض حجوزات UNO.");
    } finally {
      setBusy("");
    }
  };

  const exportResults = async () => {
    if (!results?.length) return;
    setBusy("export");
    setFailed(false);
    setMessage("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "RES Dashboard";
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet("حجوزات UNO", {
        views: [{ rightToLeft: true }],
      });
      worksheet.columns = [
        { header: "رقم UNO", key: "unoNumber", width: 20 },
        { header: "رقم PMS", key: "pmsNumber", width: 20 },
        { header: "رقم التواصل", key: "phone", width: 18 },
        { header: "العميل", key: "guestName", width: 24 },
        { header: "المنشأة", key: "property", width: 26 },
        { header: "الحالة", key: "status", width: 16 },
        { header: "الوصول", key: "checkIn", width: 16 },
        { header: "المغادرة", key: "checkOut", width: 16 },
        { header: "تاريخ الحجز", key: "bookingDate", width: 18 },
        { header: "القناة", key: "channel", width: 18 },
        { header: "المبلغ", key: "amount", width: 14 },
        { header: "العملة", key: "currency", width: 10 },
      ];
      results.forEach((reservation) => worksheet.addRow(reservation));
      const header = worksheet.getRow(1);
      header.height = 24;
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17243A" } };
      header.alignment = { horizontal: "center", vertical: "middle" };
      worksheet.autoFilter = { from: "A1", to: "L1" };
      worksheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `uno-reservations-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
      setMessage("تعذر تصدير الملف.");
    } finally {
      setBusy("");
    }
  };

  const activeField = searchFields.find((option) => option.value === field) || searchFields[0];
  const phase = status?.phase || "idle";
  const isBusy = Boolean(busy);

  return (
    <div className="page-wrap-narrow">
      <PageHeader
        title="UNO"
        icon={Cable}
        actions={(
          <span className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${
            phase === "connected"
              ? "bg-emerald-100 text-emerald-700"
              : phase === "otp"
                ? "bg-amber-100 text-amber-700"
                : "bg-secondary text-muted-foreground"
          }`}
          >
            {phase === "connected" ? <CheckCircle2 className="h-4 w-4" /> : null}
            {phase === "connected" ? "متصل" : phase === "otp" ? "رمز التحقق" : "غير متصل"}
          </span>
        )}
      />

      {!status ? (
        <section className="page-surface flex min-h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </section>
      ) : null}

      {status && phase === "idle" ? (
        <section className="page-surface">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            onClick={() => void runStatusAction("connect", () => api.connectUno())}
            disabled={isBusy || !status.configured}
          >
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
            اتصال
          </button>
          {!status.configured ? (
            <span className="ms-3 text-xs font-bold text-destructive">إعدادات UNO غير مكتملة.</span>
          ) : null}
        </section>
      ) : null}

      {status && phase === "otp" ? (
        <form className="page-surface flex flex-wrap items-end gap-2" onSubmit={submitOtp}>
          <label className="min-w-52 flex-1">
            <span className="mb-1.5 block text-xs font-bold">رمز التحقق</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\s/g, "").slice(0, 12))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              aria-label="رمز التحقق"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            disabled={isBusy || !otp.trim()}
          >
            {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تأكيد
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50"
            onClick={() => void runStatusAction("resend", () => api.resendUnoOtp(), "تم إرسال رمز جديد.")}
            disabled={isBusy || resendSeconds > 0}
          >
            {busy === "resend" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {resendSeconds > 0 ? `إعادة الإرسال (${resendSeconds})` : "إعادة الإرسال"}
          </button>
        </form>
      ) : null}

      {status && phase === "connected" ? (
        <>
          <section className="page-surface flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block truncate">{status.accountName || "UNO"}</strong>
              {status.propertyCount ? (
                <span className="text-xs text-muted-foreground">{status.propertyCount} منشأة</span>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/25 px-3 text-xs font-bold text-destructive disabled:opacity-50"
              onClick={() => void runStatusAction("disconnect", () => api.disconnectUno())}
              disabled={isBusy}
            >
              {busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              فصل
            </button>
          </section>

          <form className="page-surface space-y-3" onSubmit={submitSearch}>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
              {searchFields.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`h-10 rounded-lg px-2 text-xs font-bold transition-colors ${
                    field === option.value ? "bg-background text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => {
                    setField(option.value);
                    setResults(null);
                    setMessage("");
                  }}
                  aria-pressed={field === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={activeField.placeholder}
                inputMode={field === "phone" ? "tel" : "text"}
                aria-label={activeField.label}
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl gold-gradient px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                disabled={isBusy || !query.trim()}
              >
                {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                بحث
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50"
                onClick={() => void loadReservations()}
                disabled={isBusy}
              >
                {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                عرض
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 px-4 text-sm font-bold disabled:opacity-50"
                onClick={() => void exportResults()}
                disabled={!results?.length || isBusy}
              >
                {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Excel
              </button>
            </div>
          </form>

          {results?.length ? (
            <section className="page-surface overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-right text-xs">
                  <thead className="bg-secondary text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-bold">UNO</th>
                      <th className="px-3 py-3 font-bold">PMS</th>
                      <th className="px-3 py-3 font-bold">التواصل</th>
                      <th className="px-3 py-3 font-bold">العميل</th>
                      <th className="px-3 py-3 font-bold">المنشأة</th>
                      <th className="px-3 py-3 font-bold">الحالة</th>
                      <th className="px-3 py-3 font-bold">الوصول</th>
                      <th className="px-3 py-3 font-bold">المغادرة</th>
                      <th className="px-3 py-3 font-bold">القناة</th>
                      <th className="px-3 py-3 font-bold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.map((reservation, index) => (
                      <tr key={`${reservation.unoNumber}-${reservation.pmsNumber}-${index}`} className="hover:bg-secondary/40">
                        <td className="whitespace-nowrap px-3 py-3 font-bold">{reservation.unoNumber || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3">{reservation.pmsNumber || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3" dir="ltr">{reservation.phone || "—"}</td>
                        <td className="px-3 py-3">{reservation.guestName || "—"}</td>
                        <td className="px-3 py-3">{reservation.property || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3">{reservation.status || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3">{displayDate(reservation.checkIn)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{displayDate(reservation.checkOut)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{reservation.channel || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {[reservation.amount, reservation.currency].filter(Boolean).join(" ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {message ? (
        <p role="status" className={`text-xs font-bold ${failed ? "text-destructive" : "text-emerald-700"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
};

export default AdminUno;
