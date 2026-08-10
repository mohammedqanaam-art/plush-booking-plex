import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cable,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import {
  api,
  type UnoConnectionStatus,
  type UnoReportFilters,
  type UnoReservation,
  type UnoSearchField,
} from "@/lib/api";
import { buildOperaExport, normalizeUnoNumber } from "@/lib/unoOperaExport";

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

const displayTimestamp = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

type ResultFilter = "all" | "confirmed" | "cancelled" | "arrivals" | "departures";

const riyadhToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const dateKey = (value: string) => {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (iso) return iso;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const reservationState = (status: string) => {
  const normalized = status.trim().toLocaleLowerCase("en");
  if (["c", "ns"].includes(normalized) || /ملغ|عدم حضور|cancel|no[\s-]?show/.test(normalized)) return "cancelled";
  if (["1", "3", "m", "o", "n", "i"].includes(normalized) || /مؤكد|معدل|معدّل|confirm|modif/.test(normalized)) return "confirmed";
  return "other";
};

const AdminUno = () => {
  const copyResetTimer = useRef<number | null>(null);
  const [status, setStatus] = useState<UnoConnectionStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [otp, setOtp] = useState("");
  const [field, setField] = useState<UnoSearchField>("phone");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnoReservation[] | null>(null);
  const [snapshotSyncedAt, setSnapshotSyncedAt] = useState<string | null>(null);
  const [snapshotTotal, setSnapshotTotal] = useState(0);
  const [snapshotSource, setSnapshotSource] = useState<"automatic" | "manual" | null>(null);
  const reportToday = riyadhToday();
  const [reportDateType, setReportDateType] = useState<UnoReportFilters["dateType"]>("booking");
  const [reportFrom, setReportFrom] = useState(`${reportToday.slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(reportToday);
  const [reportProperty, setReportProperty] = useState("all");
  const [reportStatus, setReportStatus] = useState<UnoReportFilters["status"]>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [resultQuery, setResultQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [dateField, setDateField] = useState<"booking" | "checkin" | "checkout">("booking");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [operaBatchSize, setOperaBatchSize] = useState<250 | 500>(250);
  const [now, setNow] = useState(Date.now());

  const reportFilters = useMemo<UnoReportFilters>(() => ({
    dateType: reportDateType,
    from: reportFrom,
    to: reportTo,
    property: reportProperty,
    status: reportStatus,
  }), [reportDateType, reportFrom, reportProperty, reportStatus, reportTo]);

  useEffect(() => {
    api.getUnoConnection()
      .then(setStatus)
      .catch((error: Error) => {
        setFailed(true);
        setMessage(error.message);
      });

    api.getUnoSnapshot({ limit: 1 })
      .then((snapshot) => {
        setSnapshotSyncedAt(snapshot.syncedAt);
        setSnapshotTotal(snapshot.summary.total);
        setSnapshotSource(snapshot.source);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const filters = status?.reportFilters;
    if (!filters) return;
    setReportDateType(filters.dateType);
    setReportFrom(filters.from);
    setReportTo(filters.to);
    setReportProperty(filters.property);
    setReportStatus(filters.status);
  }, [status?.reportFilters]);

  useEffect(() => {
    if (status?.phase !== "otp") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status?.phase]);

  useEffect(() => () => {
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
  }, []);

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
      if (next.phase === "otp") {
        setMessage("تم إرسال رمز التحقق من UNO. أدخل الرمز لإكمال الجلسة وجلب التقرير.");
      } else if (next.phase === "connected" && next.reportReady) {
        const snapshot = await api.getUnoSnapshot({ limit: 5_000 });
        setResults(snapshot.reservations);
        setSnapshotSyncedAt(snapshot.syncedAt);
        setSnapshotTotal(snapshot.summary.total);
        setSnapshotSource(snapshot.source);
        if (next.productivityReady) {
          setMessage(`تم التحقق من OTP وتحديث تقرير الإنتاجية من UNO: ${(next.productivityRecords ?? snapshot.summary.total).toLocaleString("ar-SA")} سجل · ${(next.productivityEmployees ?? 0).toLocaleString("ar-SA")} موظف.`);
        } else if (next.reportError) {
          setFailed(true);
          setMessage(`تم التحقق من UNO وجلب ${snapshot.summary.total.toLocaleString("ar-SA")} حجزًا، لكن ${next.reportError}`);
        } else {
          setMessage(`تم التحقق من UNO وجلب ${snapshot.summary.total.toLocaleString("ar-SA")} حجزًا.`);
        }
      } else if (next.phase === "connected" && next.reportError) {
        setFailed(true);
        setMessage(next.reportError);
      } else {
        setMessage(successMessage);
      }
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

  const resetResultFilters = () => {
    setResultFilter("all");
    setResultQuery("");
    setPropertyFilter("all");
    setDateField("booking");
    setFromDate("");
    setToDate("");
  };

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setFailed(false);
    setMessage("");
    try {
      const snapshot = await api.getUnoSnapshot({
        q: query.trim(),
        field,
        limit: 5_000,
      });
      setSnapshotSyncedAt(snapshot.syncedAt);
      setSnapshotTotal(snapshot.summary.total);
      setSnapshotSource(snapshot.source);
      resetResultFilters();

      if (snapshot.reservations.length || status?.phase !== "connected") {
        setResults(snapshot.reservations);
        setMessage(snapshot.total ? "" : "لا توجد حجوزات مطابقة في آخر مزامنة.");
        return;
      }

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
      const snapshot = await api.getUnoSnapshot({ limit: 5_000 });
      setResults(snapshot.reservations);
      setSnapshotSyncedAt(snapshot.syncedAt);
      setSnapshotTotal(snapshot.summary.total);
      setSnapshotSource(snapshot.source);
      resetResultFilters();
      setMessage(snapshot.total ? "" : "لا توجد بيانات UNO متزامنة حتى الآن.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "تعذر عرض سجل UNO المتزامن.");
    } finally {
      setBusy("");
    }
  };

  const refreshReservations = async () => {
    setBusy("refresh");
    setFailed(false);
    setMessage("");
    try {
      const response = await api.exportUnoReport(reportFilters);
      setResults(response.reservations);
      setSnapshotSyncedAt(response.syncedAt || response.searchedAt);
      setSnapshotTotal(response.total);
      setSnapshotSource("manual");
      setStatus((current) => current ? {
        ...current,
        reportReady: true,
        lastExportAt: response.syncedAt || response.searchedAt,
        lastExportCount: response.total,
        lastExportSource: "manual",
        reportFilters: response.reportFilters || reportFilters,
        productivityReady: response.productivityReady,
        productivityUpdatedAt: response.productivityUpdatedAt,
        productivityRecords: response.productivityRecords,
        productivityEmployees: response.productivityEmployees,
        reportError: response.reportError,
      } : current);
      resetResultFilters();
      if (response.productivityReady) {
        setMessage(`تم تصدير بيانات UNO وتحديث تقرير الإنتاجية: ${(response.productivityRecords ?? response.total).toLocaleString("ar-SA")} سجل · ${(response.productivityEmployees ?? 0).toLocaleString("ar-SA")} موظف.`);
      } else if (response.reportError) {
        setFailed(true);
        setMessage(`تم جلب ${response.total.toLocaleString("ar-SA")} حجزًا، لكن ${response.reportError}`);
      } else {
        setMessage(`تم جلب ${response.total.toLocaleString("ar-SA")} حجزًا من UNO.`);
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "تعذر تحديث حجوزات UNO.");
    } finally {
      setBusy("");
    }
  };

  const properties = useMemo(
    () => Array.from(new Set((results || []).map((reservation) => reservation.property).filter(Boolean))).sort((left, right) => left.localeCompare(right, "ar")),
    [results],
  );

  const resultSummary = useMemo(() => {
    const today = riyadhToday();
    return (results || []).reduce((summary, reservation) => {
      const state = reservationState(reservation.status);
      if (state === "confirmed") summary.confirmed += 1;
      if (state === "cancelled") summary.cancelled += 1;
      if (dateKey(reservation.checkIn) === today) summary.arrivals += 1;
      if (dateKey(reservation.checkOut) === today) summary.departures += 1;
      return summary;
    }, { confirmed: 0, cancelled: 0, arrivals: 0, departures: 0 });
  }, [results]);

  const visibleResults = useMemo(() => {
    const today = riyadhToday();
    const searchText = resultQuery.trim().toLocaleLowerCase("ar");
    return (results || []).filter((reservation) => {
      if (propertyFilter !== "all" && reservation.property !== propertyFilter) return false;
      if (resultFilter === "confirmed" && reservationState(reservation.status) !== "confirmed") return false;
      if (resultFilter === "cancelled" && reservationState(reservation.status) !== "cancelled") return false;
      if (resultFilter === "arrivals" && dateKey(reservation.checkIn) !== today) return false;
      if (resultFilter === "departures" && dateKey(reservation.checkOut) !== today) return false;
      const filterDate = dateKey(
        dateField === "checkin"
          ? reservation.checkIn
          : dateField === "checkout"
            ? reservation.checkOut
            : reservation.bookingDate,
      );
      if (fromDate && (!filterDate || filterDate < fromDate)) return false;
      if (toDate && (!filterDate || filterDate > toDate)) return false;
      if (!searchText) return true;
      return [
        reservation.unoNumber,
        reservation.pmsNumber,
        reservation.phone,
        reservation.guestName,
        reservation.agentName,
        reservation.property,
        reservation.city,
        reservation.status,
      ].some((value) => value.toLocaleLowerCase("ar").includes(searchText));
    });
  }, [dateField, fromDate, propertyFilter, resultFilter, resultQuery, results, toDate]);

  const copyReservation = async (reservation: UnoReservation) => {
    const text = [
      `UNO: ${reservation.unoNumber || "—"}`,
      `PMS: ${reservation.pmsNumber || "—"}`,
      `الضيف: ${reservation.guestName || "—"}`,
      `الموظف: ${reservation.agentName || "—"}`,
      `التواصل: ${reservation.phone || "—"}`,
      `الفرع: ${reservation.property || "—"}`,
      `المدينة: ${reservation.city || "—"}`,
      `الحالة: ${reservation.status || "—"}`,
      `الوصول: ${displayDate(reservation.checkIn)}`,
      `المغادرة: ${displayDate(reservation.checkOut)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      const key = `${reservation.unoNumber}-${reservation.pmsNumber}`;
      setCopiedKey(key);
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopiedKey(""), 1_500);
    } catch {
      setFailed(true);
      setMessage("تعذر نسخ بيانات الحجز.");
    }
  };

  const exportResults = async () => {
    if (!visibleResults.length) return;
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
        { header: "Agent Name", key: "agentName", width: 24 },
        { header: "المنشأة", key: "property", width: 26 },
        { header: "المدينة", key: "city", width: 16 },
        { header: "الحالة", key: "status", width: 16 },
        { header: "الوصول", key: "checkIn", width: 16 },
        { header: "المغادرة", key: "checkOut", width: 16 },
        { header: "تاريخ الحجز", key: "bookingDate", width: 18 },
        { header: "القناة", key: "channel", width: 18 },
        { header: "المبلغ", key: "amount", width: 14 },
        { header: "العملة", key: "currency", width: 10 },
      ];
      visibleResults.forEach((reservation) => worksheet.addRow(reservation));
      const header = worksheet.getRow(1);
      header.height = 24;
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07533F" } };
      header.alignment = { horizontal: "center", vertical: "middle" };
      worksheet.autoFilter = { from: "A1", to: "N1" };
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

  const exportOperaBatches = async () => {
    if (!visibleResults.length) return;
    setBusy("opera-export");
    setFailed(false);
    setMessage("");
    try {
      const prepared = buildOperaExport(visibleResults, operaBatchSize);
      if (!prepared.eligible) {
        setFailed(true);
        setMessage("لا توجد حجوزات مؤكدة أو معدلة صالحة للتصدير إلى OPERA.");
        return;
      }

      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "RES Dashboard";
      workbook.created = new Date();

      const summary = workbook.addWorksheet("SUMMARY", { views: [{ rightToLeft: true }] });
      summary.columns = [
        { header: "البيان", key: "label", width: 30 },
        { header: "القيمة", key: "value", width: 22 },
      ];
      summary.addRows([
        { label: "حجوزات السعودية", value: prepared.saudi.numbers.length },
        { label: "حجوزات الكويت", value: prepared.kuwait.numbers.length },
        { label: "الإجمالي الجاهز", value: prepared.eligible },
        { label: "حجم الدفعة", value: operaBatchSize },
        { label: "التكرارات المستبعدة", value: prepared.duplicateReservations },
        { label: "الأرقام غير الصالحة", value: prepared.invalidReservations },
        { label: "الحالات المستبعدة", value: prepared.excludedStatuses },
      ]);

      const addBatchSheet = (name: string, batches: typeof prepared.saudi.batches) => {
        const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
        sheet.columns = [
          { header: "الدفعة", key: "batch", width: 12 },
          { header: "العدد", key: "count", width: 12 },
          { header: "قائمة النسخ — COPY", key: "value", width: 110 },
          { header: "الحالة", key: "status", width: 14 },
        ];
        batches.forEach((batch) => sheet.addRow({ ...batch, status: "جاهز" }));
        sheet.getColumn("value").numFmt = "@";
        sheet.getColumn("value").alignment = { horizontal: "left", vertical: "middle", wrapText: false };
        sheet.autoFilter = { from: "A1", to: "D1" };
        return sheet;
      };

      const saudiSheet = addBatchSheet("OPERA SAUDI", prepared.saudi.batches);
      const kuwaitSheet = addBatchSheet("OPERA KUWAIT", prepared.kuwait.batches);
      const raw = workbook.addWorksheet("UNO RECORDS", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
      raw.columns = [
        { header: "النظام", key: "region", width: 16 },
        { header: "رقم UNO", key: "uno", width: 20 },
        { header: "رقم PMS", key: "pms", width: 20 },
        { header: "المنشأة", key: "property", width: 28 },
        { header: "المدينة", key: "city", width: 18 },
        { header: "الحالة", key: "status", width: 16 },
      ];
      const saudiNumbers = new Set(prepared.saudi.numbers);
      const kuwaitNumbers = new Set(prepared.kuwait.numbers);
      const rawSeen = new Set<string>();
      visibleResults.forEach((reservation) => {
        const uno = normalizeUnoNumber(reservation.unoNumber);
        if (rawSeen.has(uno) || (!saudiNumbers.has(uno) && !kuwaitNumbers.has(uno))) return;
        rawSeen.add(uno);
        raw.addRow({
          region: kuwaitNumbers.has(uno) ? "OPERA Kuwait" : "OPERA Saudi",
          uno,
          pms: reservation.pmsNumber,
          property: reservation.property,
          city: reservation.city,
          status: reservation.status,
        });
      });
      raw.autoFilter = { from: "A1", to: "F1" };

      [summary, saudiSheet, kuwaitSheet, raw].forEach((sheet) => {
        const header = sheet.getRow(1);
        header.height = 26;
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07533F" } };
        header.alignment = { horizontal: "center", vertical: "middle" };
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          row.height = 23;
          if (rowNumber % 2 === 0) {
            row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F8F5" } };
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `UNO_OPERA_COPY_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage(`تم تجهيز OPERA: السعودية ${prepared.saudi.numbers.length.toLocaleString("ar-SA")} · الكويت ${prepared.kuwait.numbers.length.toLocaleString("ar-SA")} · بدون مسافات.`);
    } catch {
      setFailed(true);
      setMessage("تعذر تجهيز ملف OPERA.");
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
        title="UNO Voice"
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
            {phase === "connected"
              ? (status?.productivityReady ? "UNO موثّق · تقرير الإنتاجية جاهز" : "UNO موثّق · التقرير غير جاهز")
              : phase === "otp" ? "بانتظار رمز التحقق" : "غير متصل"}
          </span>
        )}
      />

      {!status ? (
        <section className="page-surface flex min-h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </section>
      ) : null}

      {status ? (
        <section className="page-surface space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="section-title">تصدير ومزامنة UNO</h2>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${status.automaticSyncEnabled ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
              {status.automaticSyncEnabled ? "التحديث التلقائي: مفعّل / 30 دقيقة" : "التحديث التلقائي: غير مفعّل"}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                step: "01",
                title: "تسجيل الدخول",
                value: status.configured ? "بيانات UNO جاهزة بالخادم" : "الإعدادات ناقصة",
                done: status.configured,
              },
              {
                step: "02",
                title: "OTP",
                value: phase === "connected" ? `تم التحقق ${displayTimestamp(status.verifiedAt)}` : phase === "otp" ? "بانتظار إدخال الرمز" : "لم يبدأ التحقق",
                done: phase === "connected",
              },
              {
                step: "03",
                title: "جلب بيانات UNO",
                value: status.reportReady
                  ? `${(status.lastExportCount ?? snapshotTotal).toLocaleString("ar-SA")} حجز · ${displayTimestamp(status.lastExportAt || snapshotSyncedAt || undefined)}`
                  : "لم يتم جلب بيانات في الجلسة الحالية",
                done: Boolean(status.reportReady),
              },
              {
                step: "04",
                title: "تقرير الإنتاجية",
                value: status.productivityReady
                  ? `${(status.productivityRecords ?? 0).toLocaleString("ar-SA")} سجل · ${(status.productivityEmployees ?? 0).toLocaleString("ar-SA")} موظف · ${displayTimestamp(status.productivityUpdatedAt)}`
                  : status.reportError || "لم يتم تحديث تقرير الموظفين بعد",
                done: Boolean(status.productivityReady),
              },
            ].map((item) => (
              <article key={item.step} className={`rounded-2xl border p-3 ${item.done ? "border-emerald-500/25 bg-emerald-500/5" : "border-border/50 bg-secondary/20"}`}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${item.done ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground"}`}>{item.step}</span>
                  <strong className="text-xs">{item.title}</strong>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.value}</p>
              </article>
            ))}
          </div>
          <div className="grid gap-2 rounded-2xl border border-border/50 bg-secondary/15 p-3 md:grid-cols-2 xl:grid-cols-5" aria-label="فلاتر تقرير UNO">
            <label className="text-xs font-bold">
              <span className="mb-1 block text-muted-foreground">نوع التاريخ</span>
              <select className="h-10 w-full rounded-xl border bg-background px-3" value={reportDateType} onChange={(event) => setReportDateType(event.target.value as UnoReportFilters["dateType"])} disabled={phase === "otp"}>
                <option value="booking">تاريخ الحجز</option>
                <option value="checkin">تاريخ الوصول</option>
                <option value="checkout">تاريخ المغادرة</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              <span className="mb-1 block text-muted-foreground">من</span>
              <input type="date" className="h-10 w-full rounded-xl border bg-background px-3" value={reportFrom} max={reportTo || undefined} onChange={(event) => setReportFrom(event.target.value)} disabled={phase === "otp"} />
            </label>
            <label className="text-xs font-bold">
              <span className="mb-1 block text-muted-foreground">إلى</span>
              <input type="date" className="h-10 w-full rounded-xl border bg-background px-3" value={reportTo} min={reportFrom || undefined} onChange={(event) => setReportTo(event.target.value)} disabled={phase === "otp"} />
            </label>
            <label className="text-xs font-bold">
              <span className="mb-1 block text-muted-foreground">الحالة</span>
              <select className="h-10 w-full rounded-xl border bg-background px-3" value={reportStatus} onChange={(event) => setReportStatus(event.target.value as UnoReportFilters["status"])} disabled={phase === "otp"}>
                <option value="all">الكل</option>
                <option value="confirmed">مؤكد</option>
                <option value="cancelled">ملغي / No-show</option>
                <option value="modified">معدل</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              <span className="mb-1 block text-muted-foreground">المنشأة</span>
              <select className="h-10 w-full rounded-xl border bg-background px-3" value={reportProperty} onChange={(event) => setReportProperty(event.target.value)} disabled={phase === "otp"}>
                <option value="all">جميع المنشآت</option>
                {reportProperty !== "all" && !properties.includes(reportProperty) ? <option value={reportProperty}>{reportProperty}</option> : null}
                {properties.map((property) => <option key={property} value={property}>{property}</option>)}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {status && phase === "idle" ? (
        <section className="page-surface flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            onClick={() => void runStatusAction("connect", () => api.connectUno(reportFilters))}
            disabled={isBusy || !status.configured}
          >
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
            اتصال وطلب OTP
          </button>
          <a
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
            href={status.loginUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink className="h-4 w-4" /> فتح حجوزات Voice
          </a>
          <Link className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 text-sm font-bold text-primary" to="/admin?tab=bookings">
            <FileSpreadsheet className="h-4 w-4" /> استيراد ملفات التقارير
          </Link>
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

      {status && (phase === "connected" || Boolean(snapshotSyncedAt)) ? (
        <>
          <section className={`overflow-hidden rounded-2xl border p-4 shadow-sm ${phase === "connected" ? "border-emerald-500/20 bg-gradient-to-l from-emerald-500/10 via-background to-primary/8" : "border-primary/15 bg-secondary/25"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${phase === "connected" ? "bg-emerald-500/12 text-emerald-700" : "bg-primary/10 text-primary"}`}>
                  {phase === "connected" ? <CheckCircle2 className="h-6 w-6" /> : <Database className="h-6 w-6" />}
                </span>
                <div className="min-w-0">
                  <strong className="block truncate">{phase === "connected" ? (status.accountName || "UNO") : "سجل UNO المتزامن"}</strong>
                  <span className="text-xs text-muted-foreground">
                    {phase === "connected"
                      ? `${(status.propertyCount || 0).toLocaleString("ar-SA")} منشأة · ${status.automaticSyncEnabled ? "تحديث تلقائي كل 30 دقيقة" : "التحديث التلقائي غير مفعّل"} · تنتهي الجلسة ${displayTimestamp(status.expiresAt)}`
                      : `آخر تقرير محفوظ ${displayTimestamp(snapshotSyncedAt || undefined)} · ${(snapshotTotal || 0).toLocaleString("ar-SA")} حجز`}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/50 bg-background/70 px-3 text-xs font-bold"
                  href={status.loginUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <ExternalLink className="h-4 w-4" /> فتح حجوزات Voice
                </a>
                <Link
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/25 bg-background/70 px-3 text-xs font-bold text-primary"
                  to="/admin?tab=bookings"
                >
                  <FileSpreadsheet className="h-4 w-4" /> استيراد ملفات التقارير
                </Link>
                {phase === "connected" ? (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/25 bg-background/70 px-3 text-xs font-bold text-destructive disabled:opacity-50"
                    onClick={() => void runStatusAction("disconnect", () => api.disconnectUno())}
                    disabled={isBusy}
                  >
                    {busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    فصل
                  </button>
                ) : null}
              </div>
            </div>
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
                {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                السجل
              </button>
              {phase === "connected" ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 px-4 text-sm font-bold text-emerald-700 disabled:opacity-50"
                  onClick={() => void refreshReservations()}
                  disabled={isBusy}
                >
                  {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  تحديث تقرير الإنتاجية من UNO
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 px-4 text-sm font-bold disabled:opacity-50"
                onClick={() => void exportResults()}
                disabled={!visibleResults.length || isBusy}
              >
                {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                تصدير Excel
              </button>
              <div className="flex h-11 overflow-hidden rounded-xl border border-primary/30 bg-background">
                <select
                  className="h-full min-w-[82px] border-0 bg-transparent px-2 text-xs font-bold"
                  value={operaBatchSize}
                  onChange={(event) => setOperaBatchSize(Number(event.target.value) === 500 ? 500 : 250)}
                  aria-label="حجم دفعة OPERA"
                  disabled={isBusy}
                >
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 border-r border-primary/25 px-4 text-sm font-bold text-primary disabled:opacity-50"
                  onClick={() => void exportOperaBatches()}
                  disabled={!visibleResults.length || isBusy}
                >
                  {busy === "opera-export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
                  تصدير OPERA
                </button>
              </div>
            </div>
          </form>

          {results?.length ? (
            <>
              <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { filter: "confirmed" as const, label: "المؤكدة", value: resultSummary.confirmed, icon: CheckCircle2, tone: "text-emerald-700" },
                  { filter: "cancelled" as const, label: "الملغاة / NS", value: resultSummary.cancelled, icon: LogOut, tone: "text-red-700" },
                  { filter: "arrivals" as const, label: "وصول اليوم", value: resultSummary.arrivals, icon: CalendarCheck2, tone: "text-primary" },
                  { filter: "departures" as const, label: "مغادرة اليوم", value: resultSummary.departures, icon: CalendarClock, tone: "text-amber-700" },
                ].map(({ filter: nextFilter, label, value, icon: Icon, tone }) => (
                  <button
                    key={nextFilter}
                    type="button"
                    className={`compact-card text-right transition hover:border-primary/40 ${resultFilter === nextFilter ? "border-primary/55 bg-primary/8" : ""}`}
                    onClick={() => setResultFilter((current) => current === nextFilter ? "all" : nextFilter)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <Icon className={`h-4 w-4 ${tone}`} />
                    </div>
                    <strong className={`mt-2 block text-2xl ${tone}`}>{value.toLocaleString("ar-SA")}</strong>
                  </button>
                ))}
              </section>

              <section className="page-surface space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="section-title">نتائج UNO</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      عرض {visibleResults.length.toLocaleString("ar-SA")} من {(results || []).length.toLocaleString("ar-SA")} · آخر تقرير {displayTimestamp(snapshotSyncedAt || undefined)}{snapshotSource ? ` · ${snapshotSource === "automatic" ? "تلقائي" : "يدوي"}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/50 px-3 text-xs font-bold"
                    onClick={resetResultFilters}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> مسح الفلاتر
                  </button>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  <label className="relative xl:col-span-2">
                    <span className="sr-only">بحث داخل نتائج UNO</span>
                    <Filter className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="h-11 w-full rounded-xl border bg-secondary/35 px-10 text-sm outline-none focus:border-primary"
                      placeholder="فلترة النتائج: اسم، جوال، UNO أو PMS"
                      value={resultQuery}
                      onChange={(event) => setResultQuery(event.target.value)}
                    />
                  </label>
                  <label>
                    <span className="sr-only">فلترة حسب المنشأة</span>
                    <select
                      className="h-11 w-full rounded-xl border bg-secondary/35 px-3 text-sm font-bold outline-none focus:border-primary"
                      value={propertyFilter}
                      onChange={(event) => setPropertyFilter(event.target.value)}
                    >
                      <option value="all">جميع المنشآت</option>
                      {properties.map((property) => <option key={property} value={property}>{property}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">نوع التاريخ</span>
                    <select
                      className="h-11 w-full rounded-xl border bg-secondary/35 px-3 text-sm font-bold outline-none focus:border-primary"
                      value={dateField}
                      onChange={(event) => setDateField(event.target.value as "booking" | "checkin" | "checkout")}
                    >
                      <option value="booking">تاريخ الحجز</option>
                      <option value="checkin">تاريخ الوصول</option>
                      <option value="checkout">تاريخ المغادرة</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="sr-only">من تاريخ</span>
                      <input
                        type="date"
                        className="h-11 w-full rounded-xl border bg-secondary/35 px-2 text-xs font-bold outline-none focus:border-primary"
                        value={fromDate}
                        max={toDate || undefined}
                        onChange={(event) => setFromDate(event.target.value)}
                        aria-label="من تاريخ"
                      />
                    </label>
                    <label>
                      <span className="sr-only">إلى تاريخ</span>
                      <input
                        type="date"
                        className="h-11 w-full rounded-xl border bg-secondary/35 px-2 text-xs font-bold outline-none focus:border-primary"
                        value={toDate}
                        min={fromDate || undefined}
                        onChange={(event) => setToDate(event.target.value)}
                        aria-label="إلى تاريخ"
                      />
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-border/45">
                  <table className="w-full min-w-[1060px] text-right text-xs">
                    <thead className="bg-secondary text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3 font-bold">UNO</th>
                        <th className="px-3 py-3 font-bold">PMS</th>
                        <th className="px-3 py-3 font-bold">التواصل</th>
                        <th className="px-3 py-3 font-bold">العميل</th>
                        <th className="px-3 py-3 font-bold">الموظف</th>
                        <th className="px-3 py-3 font-bold">المنشأة</th>
                        <th className="px-3 py-3 font-bold">الحالة</th>
                        <th className="px-3 py-3 font-bold">الوصول</th>
                        <th className="px-3 py-3 font-bold">المغادرة</th>
                        <th className="px-3 py-3 font-bold">القناة</th>
                        <th className="px-3 py-3 font-bold">المبلغ</th>
                        <th className="px-3 py-3 font-bold">أدوات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleResults.map((reservation, index) => {
                        const key = `${reservation.unoNumber}-${reservation.pmsNumber}`;
                        return (
                          <tr key={`${reservation.unoNumber}-${reservation.pmsNumber}-${index}`} className="hover:bg-secondary/40">
                            <td className="whitespace-nowrap px-3 py-3 font-bold">{reservation.unoNumber || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3">{reservation.pmsNumber || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3" dir="ltr">{reservation.phone || "—"}</td>
                            <td className="px-3 py-3">{reservation.guestName || "—"}</td>
                            <td className="px-3 py-3">{reservation.agentName || "—"}</td>
                            <td className="px-3 py-3">{reservation.property || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3">{reservation.status || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3">{displayDate(reservation.checkIn)}</td>
                            <td className="whitespace-nowrap px-3 py-3">{displayDate(reservation.checkOut)}</td>
                            <td className="whitespace-nowrap px-3 py-3">{reservation.channel || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-3">
                              {[reservation.amount, reservation.currency].filter(Boolean).join(" ") || "—"}
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/50 px-2 text-[11px] font-bold hover:border-primary/50"
                                onClick={() => void copyReservation(reservation)}
                              >
                                {copiedKey === key ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                {copiedKey === key ? "تم النسخ" : "نسخ"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!visibleResults.length ? <div className="p-10 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للفلاتر الحالية.</div> : null}
                </div>
              </section>
            </>
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
