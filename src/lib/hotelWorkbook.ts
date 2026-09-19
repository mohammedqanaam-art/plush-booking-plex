// Shared display schema only. The workbook snapshot is loaded on the server.
export const hotelFactLabels = {
  englishName: "اسم الفندق بالإنجليزية", openingYear: "سنة الافتتاح", stars: "النجوم بحسب الشيت",
  address: "العنوان والحي", checkIn: "وقت الدخول", checkOut: "وقت الخروج", earlyCheckIn: "الدخول المبكر",
  breakfastHours: "وقت الإفطار", restaurantType: "نوع المطعم", view: "توفر الإطلالة", poolAudience: "الفئات المسموح لها بالمسبح",
  smokingRooms: "غرف المدخنين", connectingRooms: "الغرف المتصلة", extraBed: "إضافة سرير", extraBedFee: "رسوم السرير الإضافي",
  babyCot: "سرير الأطفال", airportTransfer: "النقل من وإلى المطار", meetingRooms: "قاعة اجتماعات",
  conferenceHall: "قاعة مؤتمرات", eventHall: "قاعة مناسبات", weddingPackage: "بكج العرسان",
} as const;
export type HotelFactKey = keyof typeof hotelFactLabels;
export type HotelWorkbookDetails = {
  sourceName: string;
  importedOn: string;
  facts: Record<HotelFactKey, string>;
  connectingRoomTypes: string[];
  receptionPhones: string[];
  warnings: string[];
  references: Array<{ sheet: string; rows: number[] }>;
};

// Deliberately rebuild every nested object; future private fields cannot leak.
export function publicWorkbookDetails(value?: HotelWorkbookDetails): HotelWorkbookDetails | undefined {
  if (!value) return undefined;
  return {
    sourceName: value.sourceName, importedOn: value.importedOn,
    facts: Object.fromEntries(Object.keys(hotelFactLabels).map(key => [key, value.facts[key as HotelFactKey] || ""])) as Record<HotelFactKey, string>,
    connectingRoomTypes: value.connectingRoomTypes.map(String), receptionPhones: value.receptionPhones.map(String),
    warnings: value.warnings.map(String), references: value.references.map(ref => ({ sheet: ref.sheet, rows: [...ref.rows] })),
  };
}

export function workbookKnowledgeLines(value?: HotelWorkbookDetails): string[] {
  if (!value) return [];
  return [
    ...Object.entries(hotelFactLabels).flatMap(([key, label]) => value.facts[key as HotelFactKey] ? [`${label}: ${value.facts[key as HotelFactKey]}`] : []),
    ...value.connectingRoomTypes.map(text => `تفاصيل الكونكت بحسب الشيت: ${text}`),
    ...value.warnings.map(text => `يحتاج تأكيدًا: ${text}`),
    `المصدر: ${value.sourceName}؛ تاريخ الاستيراد: ${value.importedOn}.`,
  ];
}
