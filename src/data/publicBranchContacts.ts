// Public hotel reception numbers only. Workbook column D, imported 2026-09-18.
// Existing conflicting numbers are retained and disclosed; no manager or hall contacts.
export type PublicBranchContact = { phone: string | null; additionalPhones?: string[]; note?: string; sourceUrl?: string };
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
    "phone": "+966112114980",
    "additionalPhones": [
      "+966113114981"
    ]
  },
  "boudl-bani-amro": {
    "phone": "+966172820001"
  },
  "aber-khamis": {
    "phone": "+966172389777",
    "note": "يختلف رقم الشيت الجديد عن الرقم المسجل في الدليل؛ يرجى تأكيده مع الفرع.",
    "additionalPhones": [
      "+966509150191"
    ]
  },
  "aber-city-center": {
    "phone": "+966137239361"
  },
  "aber-uniza": {
    "phone": "+966163632785",
    "additionalPhones": [
      "+966163632629"
    ]
  },
  "boudl-abha": {
    "phone": "+966172322222"
  },
  "boudl-tahlia": {
    "phone": "+966122614131"
  },
  "boudl-jubail": {
    "phone": "+966133454111",
    "note": "يختلف رقم الشيت الجديد عن الرقم المسجل في الدليل؛ يرجى تأكيده مع الفرع.",
    "additionalPhones": [
      "+966133454930"
    ]
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
    "phone": "+966114107033",
    "additionalPhones": [
      "+966114107022"
    ]
  },
  "boudl-taif": {
    "phone": "+966127433030",
    "additionalPhones": [
      "+966127340395"
    ]
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
    "phone": "+966172240152",
    "additionalPhones": [
      "+966546841665"
    ]
  },
  "boudl-quraish": {
    "phone": "+966126334445"
  },
  "boudl-mahayel": {
    "phone": "+966172855549"
  },
  "boudl-makkah": {
    "phone": "+966125506660",
    "additionalPhones": [
      "+966125508880"
    ]
  },
  "boudl-wadi-dawasir": {
    "phone": "+966115554655"
  },
  "braira-abha": {
    "phone": "+966172266622",
    "additionalPhones": [
      "+966172227666"
    ]
  },
  "braira-ahsa": {
    "phone": "+966135833338",
    "additionalPhones": [
      "+966135834334"
    ]
  },
  "braira-dammam": {
    "phone": "+966138348289"
  },
  "braira-rass": {
    "phone": "+966163252410",
    "additionalPhones": [
      "+966163252416"
    ]
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
    "phone": "+966173265555",
    "additionalPhones": [
      "+966173278888"
    ]
  },
  "braira-hettin": {
    "phone": "+966112364247",
    "sourceUrl": "https://brairahotels.com/hittin/"
  },
  "braira-hafr": {
    "phone": "+966137257397",
    "additionalPhones": [
      "+966137237891"
    ]
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
    "phone": "+966114061515",
    "additionalPhones": [
      "+966114061529"
    ]
  },
  "braira-jubail": {
    "phone": "+966135120987"
  },
  "boudl-salmia": {
    "phone": "+96525757999",
    "additionalPhones": [
      "+96525748782"
    ]
  },
  "boudl-fahahil": {
    "phone": "+96523922507",
    "additionalPhones": [
      "+96523922506"
    ]
  },
  "zamn-riyadh": {
    "phone": "+966549427334"
  }
};
