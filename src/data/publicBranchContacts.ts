// Reception-only snapshot from hotelBranches.phone, matched by exact public branch ID.
// Do not import private datasets or include employee, manager or sales contacts here.
// Braira Hittin corrected against its official contact page; Khamis conflict is disclosed.
export type PublicBranchContact = { phone: string | null; note?: string; sourceUrl?: string };
export const publicBranchContacts: Record<string, PublicBranchContact> = {
  "aber-abha": {
    "phone": "+966172740880"
  },
  "aber-takhassusi": {
    "phone": "+966112163900"
  },
  "aber-sahafa": {
    "phone": "+966112270093"
  },
  "aber-mounsiya": {
    "phone": "+966112637693"
  },
  "aber-yasmin": {
    "phone": "+966112114980"
  },
  "boudl-bani-amro": {
    "phone": "+966172820001"
  },
  "aber-khamis": {
    "phone": "+966172389777",
    "note": "رقم الدليل المسجل؛ يوجد اختلاف بين المصادر ويحتاج إلى تأكيد من الفرع."
  },
  "aber-city-center": {
    "phone": "+966137239361"
  },
  "aber-uniza": {
    "phone": "+966163632785"
  },
  "boudl-abha": {
    "phone": "+966172322222"
  },
  "boudl-tahlia": {
    "phone": "+966122614131"
  },
  "boudl-jubail": {
    "phone": "+966133454111"
  },
  "boudl-rass": {
    "phone": "+966163512288"
  },
  "boudl-rawdah-breda": {
    "phone": "+966163167930"
  },
  "boudl-sulaimaniyah": {
    "phone": "+966112227900"
  },
  "boudl-shatee": {
    "phone": "+966138091117"
  },
  "boudl-sahafa": {
    "phone": "+966114107033"
  },
  "boudl-taif": {
    "phone": "+966127433030"
  },
  "boudl-olaya": {
    "phone": "+966114626883"
  },
  "boudl-fakhreyah": {
    "phone": "+966163216555"
  },
  "boudl-fayha": {
    "phone": "+966112424500"
  },
  "boudl-qasr": {
    "phone": "+966112255400"
  },
  "boudl-cornish": {
    "phone": "+966138021274"
  },
  "boudl-majmaa": {
    "phone": "+966164211780"
  },
  "boudl-moaz": {
    "phone": "+966114559841"
  },
  "boudl-malaz": {
    "phone": "+966112063050"
  },
  "boudl-mounsiya": {
    "phone": "+966118103725"
  },
  "boudl-maydan": {
    "phone": "+966137293737"
  },
  "boudl-nakhil": {
    "phone": "+966163637121"
  },
  "boudl-wadi": {
    "phone": "+966112500010"
  },
  "boudl-woroud": {
    "phone": "+966114561294"
  },
  "boudl-burayda": {
    "phone": "+966163810919"
  },
  "boudl-jaber": {
    "phone": "+966112319221"
  },
  "boudl-gardenia": {
    "phone": "+966138993000"
  },
  "boudl-khamis": {
    "phone": "+966172240152"
  },
  "boudl-quraish": {
    "phone": "+966126334445"
  },
  "boudl-mahayel": {
    "phone": "+966172855549"
  },
  "boudl-makkah": {
    "phone": "+966125506660"
  },
  "boudl-wadi-dawasir": {
    "phone": "+966115554655"
  },
  "braira-abha": {
    "phone": "+966172266622"
  },
  "braira-ahsa": {
    "phone": "+966135833338"
  },
  "braira-dammam": {
    "phone": "+966138348289"
  },
  "braira-rass": {
    "phone": "+966163252410"
  },
  "braira-aziziya": {
    "phone": "+966136649999"
  },
  "braira-olaya": {
    "phone": "+966112933354"
  },
  "braira-nakheel": {
    "phone": "+966112523444"
  },
  "braira-wezarat": {
    "phone": "+966112765440"
  },
  "braira-yarmouk": {
    "phone": "+966112114646"
  },
  "braira-jazan": {
    "phone": "+966173265555"
  },
  "braira-hettin": {
    "phone": "+966112364247",
    "sourceUrl": "https://brairahotels.com/hittin/"
  },
  "braira-hafr": {
    "phone": "+966137257397"
  },
  "braira-qurtubah": {
    "phone": "+966112254614"
  },
  "narcissus-riyadh": {
    "phone": "+966112946300"
  },
  "narcissus-obhur": {
    "phone": "+966126099100"
  },
  "narcissus-hamra": {
    "phone": "+966122617700"
  },
  "narcissus-royal": {
    "phone": "+966114061515"
  }
};
