// Scam Shield: checks a suspicious SMS, WhatsApp message, screenshot or a
// spoken description of a call. Fixed rules catch the well-known Indian scam
// patterns and the AI reads everything else. The final verdict is the more
// severe of the two, so a failed or over-trusting AI call can never make a
// known scam pattern look safe.

const TYPES = {
  digital_arrest: ["డిజిటల్ అరెస్ట్ మోసం", "Digital arrest scam"],
  kyc_update: ["KYC అప్డేట్ మోసం", "KYC / account-block scam"],
  otp_request: ["OTP మోసం", "OTP fraud"],
  lottery_prize: ["లాటరీ / బహుమతి మోసం", "Lottery / prize scam"],
  job_offer: ["పార్ట్-టైమ్ జాబ్ మోసం", "Part-time job / task scam"],
  loan_app: ["లోన్ యాప్ మోసం", "Instant loan app scam"],
  investment_trading: ["ట్రేడింగ్ / పెట్టుబడి మోసం", "Trading / investment scam"],
  courier_parcel: ["కొరియర్ / పార్సెల్ మోసం", "Courier / parcel scam"],
  electricity_bill: ["కరెంట్ బిల్ మోసం", "Electricity bill scam"],
  impersonation_relative: ["బంధువు పేరుతో మోసం", "Relative impersonation"],
  sextortion: ["బ్లాక్‌మెయిల్ / సెక్స్‌టార్షన్", "Sextortion / blackmail"],
  phishing_link: ["ఫిషింగ్ లింక్ / యాప్ మోసం", "Phishing link / app"],
  other: ["ఇతర మోసం", "Other fraud"],
  none: ["మోసం కాదు", "No scam"],
};
const label = (type) => {
  const [te, en] = TYPES[type] || TYPES.other;
  return { te, en };
};
const SEVERITY = { safe: 0, suspicious: 1, scam: 2 };
const SOURCES = ["sms", "whatsapp", "call", "other"];

// The 11 app languages: display name for translation prompts, Sarvam voice code.
const LANGS = {
  en: ["English", "en-IN"], hi: ["Hindi", "hi-IN"], te: ["Telugu", "te-IN"], ta: ["Tamil", "ta-IN"], kn: ["Kannada", "kn-IN"],
  ml: ["Malayalam", "ml-IN"], mr: ["Marathi", "mr-IN"], bn: ["Bengali", "bn-IN"], gu: ["Gujarati", "gu-IN"], pa: ["Punjabi", "pa-IN"], od: ["Odia", "od-IN"],
};
const pickLang = (l) => (typeof l === "string" && LANGS[l.toLowerCase()] ? l.toLowerCase() : "en");
const VERDICT_LABEL = {
  scam: { te: "మోసం! జాగ్రత్త", en: "Scam: do not respond" },
  suspicious: { te: "అనుమానాస్పదం", en: "Suspicious: verify first" },
  safe: { te: "సురక్షితంగా ఉంది", en: "Looks safe" },
};

/* ---------------------------------------------------------------- rules */

const OTP_WORD = /(otp|ఓటీపీ|one[\s-]?time\s*password|verification\s*code)/i;
const OTP_ASK = new RegExp(
  "(share|send|tell|forward|give|read\\s*out|cheppandi|cheppu|chepandi|pampandi|pampu|చెప్పండి|చెప్పు|పంపండి|పంపు|ఇవ్వండి)[^.!?\\n]{0,40}" + OTP_WORD.source +
    "|" + OTP_WORD.source + "[^.!?\\n]{0,40}(share|send|tell|forward|give|read\\s*out|cheppandi|cheppu|chepandi|pampandi|pampu|చెప్పండి|చెప్పు|పంపండి|పంపు|ఇవ్వండి)",
  "i",
);
const OTP_WARNING = /(do\s*not|don'?t|dont|never)\s*(share|disclose|tell)|ఎవరికీ\s*(చెప్పకండి|చెప్పొద్దు|షేర్\s*చేయకండి)|evariki\s*cheppakandi/i;

// critical: one hit is enough to call it a scam.
const RULES = [
  { id: "digital_arrest", type: "digital_arrest", weight: 45, critical: true, te: "అరెస్ట్ / డిజిటల్ అరెస్ట్ బెదిరింపు", en: "Arrest or 'digital arrest' threat",
    re: /digital\s*arrest|డిజిటల్\s*అరెస్ట్|arrest\s*warrant|under\s*(digital\s*)?arrest|(will|shall)\s*be\s*arrested|అరెస్ట్|arrest\s*chest/i },
  { id: "authority", type: "digital_arrest", weight: 25, te: "పోలీస్ / CBI / కస్టమ్స్ అధికారులమని చెప్పుకోవడం", en: "Claims to be police, CBI or customs",
    re: /\b(police|cbi|ncb|trai|customs|narcotics|enforcement\s*directorate|crime\s*branch|cyber\s*(crime\s*)?(police|cell)|rbi\s*officer|income\s*tax\s*(officer|department))\b|పోలీస్|సీబీఐ|కస్టమ్స్|నార్కోటిక్స్/i },
  { id: "secrecy", type: "digital_arrest", weight: 20, te: "వీడియో కాల్‌లోనే ఉండమని, ఎవరికీ చెప్పొద్దని ఒత్తిడి", en: "Keeps you on a video call or demands secrecy",
    re: /video\s*call|skype|stay\s*on\s*(the\s*)?(video\s*)?(call|line)|(don'?t|do\s*not)\s*(tell|inform)\s*(anyone|your\s*family|family)|keep\s*(this|it)\s*(secret|confidential)|వీడియో\s*కాల్|ఇంట్లో\s*ఎవరికీ|evariki\s*cheppa(ku|kandi|vaddu|ddu)/i },
  { id: "otp_share", type: "otp_request", weight: 40, critical: true, te: "OTP చెప్పమని అడుగుతున్నారు", en: "Asks you to share an OTP",
    test: (t) => OTP_ASK.test(t) && !OTP_WARNING.test(t) },
  { id: "upi_pin", type: null, weight: 40, critical: true, te: "UPI PIN అడుగుతున్నారు (డబ్బులు రావడానికి PIN అవసరం లేదు)", en: "Asks for a UPI PIN (receiving money never needs a PIN)",
    re: /upi\s*pin|enter\s*(your\s*)?(upi\s*)?pin\s*to\s*(receive|get|claim)|యూపీఐ\s*పిన్|పిన్\s*నంబర్/i },
  { id: "pay_request", type: null, weight: 25, te: "డబ్బులు / ఫీజు పంపమని అడుగుతున్నారు", en: "Asks you to pay money or a fee",
    re: /\b[\w.-]{2,}@(ybl|okaxis|oksbi|okhdfcbank|okicici|paytm|upi|ibl|axl|apl|airtel|fbl)\b|scan\s*(the\s*|this\s*)?qr|processing\s*fee|registration\s*fee|refundable\s*(deposit|amount)|security\s*deposit|clearance\s*fee|(pay|send|transfer|deposit)\s*(rs\.?|₹|inr)\s*[\d,]+|(rs\.?|₹)\s*[\d,]+\s*(processing|registration|fee)|డబ్బులు\s*పంప|ఫీజు\s*పంప|dabbulu\s*pamp|transfer\s*cheyy?andi/i },
  { id: "kyc", type: "kyc_update", weight: 25, te: "KYC / PAN అప్డేట్ లేదా అకౌంట్ బ్లాక్ బెదిరింపు", en: "KYC/PAN update or account-block threat",
    re: /\bkyc\b|కేవైసీ|re-?kyc|(pan|aadhaar|aadhar)\s*(card\s*)?(update|link|verify|verification)|account\s*(will\s*be\s*|is\s*|has\s*been\s*)?(blocked|suspended|frozen|deactivated)|yono\s*(account\s*)?(will\s*be\s*)?(blocked|suspended)|అకౌంట్\s*బ్లాక్/i },
  { id: "electricity", type: "electricity_bill", weight: 30, te: "కరెంట్ కట్ చేస్తామని బెదిరింపు", en: "Threat to cut your electricity",
    re: /(power|electricity|current|కరెంట్|విద్యుత్)[^.\n]{0,60}(cut|disconnect|కట్|నిలిపి)|disconnect(ed|ion)?[^.\n]{0,40}(tonight|today|\d{1,2}[:.]\d{2}\s*pm)/i },
  { id: "parcel", type: "courier_parcel", weight: 30, te: "పార్సెల్‌లో డ్రగ్స్ / కస్టమ్స్ అని బెదిరింపు", en: "Parcel 'seized' or drugs claim",
    re: /(parcel|package|courier|fedex|dhl|పార్సెల్|కొరియర్)[^.\n]{0,80}(held|seized|detained|illegal|drugs|mdma|passports?|customs)|\bdrugs\b|\bmdma\b|డ్రగ్స్/i },
  { id: "lottery", type: "lottery_prize", weight: 30, te: "మీరు ఆడని లాటరీ / బహుమతి గెలిచారని చెప్పడం", en: "A lottery or prize you never entered",
    re: /lottery|lucky\s*draw|\bkbc\b|kaun\s*banega|jackpot|you\s*(have\s*)?won|congratulations[^.\n]{0,40}(won|winner|selected|prize)|claim\s*(your\s*)?(prize|reward|gift)|prize\s*money|లాటరీ|లక్కీ\s*డ్రా|గెలుచుకున్నారు|గెలుచుకుంది|బహుమతి/i },
  { id: "job", type: "job_offer", weight: 25, te: "సులువుగా ఎక్కువ సంపాదన అని జాబ్ / టాస్క్ ఆఫర్", en: "Too-good-to-be-true job or task offer",
    re: /part[\s-]?time|work\s*from\s*home|daily\s*(income|earning|salary)|earn\s*(rs\.?|₹)?\s*[\d,]+|(like|subscribe)[^.\n]{0,30}(youtube|videos?)|telegram\s*task|prepaid\s*task|simple\s*tasks?|పార్ట్\s*టైమ్|ఇంటి\s*నుంచి\s*పని|రోజుకు\s*₹/i },
  { id: "loan", type: "loan_app", weight: 20, te: "పత్రాలు లేకుండానే లోన్ అని ఆఫర్", en: "Instant loan with no checks",
    re: /instant\s*loan|loan\s*(is\s*)?(approved|sanctioned)|pre-?approved\s*loan|without\s*(cibil|documents)|no\s*cibil|loan\s*app|లోన్\s*(మంజూరు|అప్రూవ్)/i },
  { id: "investment", type: "investment_trading", weight: 25, te: "గ్యారంటీ లాభం అని పెట్టుబడి / ట్రేడింగ్ ఆఫర్", en: "Guaranteed-profit investment or trading",
    re: /trading\s*(tips|group|signals)|stock\s*tips|crypto|bitcoin|usdt|double\s*(your\s*)?money|guaranteed\s*(returns?|profit)|\d+\s*%\s*(daily|weekly|monthly)\s*(returns?|profit)|ipo\s*allotment|investment\s*(group|plan|scheme)|పెట్టుబడి|డబ్బులు\s*డబుల్/i },
  { id: "sextortion", type: "sextortion", weight: 45, critical: true, te: "ఫోటోలు / వీడియో లీక్ చేస్తామని బ్లాక్‌మెయిల్", en: "Blackmail with private photos or videos",
    re: /\bnude|\bnaked\b|private\s*video|morphed|leak\s*(your\s*)?(photos?|videos?)|(make|go)\s*viral|obscene|న్యూడ్|వీడియో\s*లీక్|ఫోటోలు\s*లీక్/i },
  { id: "relative", type: "impersonation_relative", weight: 25, te: "బంధువు పేరుతో కొత్త నంబర్ నుంచి డబ్బులు అడగడం", en: "Pretends to be family from a new number",
    re: /\b(hi|hello)\s*(mom|mum|dad|amma|nanna|mummy|papa)\b|this\s*is\s*my\s*new\s*number|my\s*(old\s*)?(phone|number)\s*(is\s*)?(broken|lost|not\s*working)|నా\s*కొత్త\s*నంబర్|kotha\s*number|(accident|hospital)[^.\n]{0,50}(send|urgent|money|pampu)/i },
  { id: "apk_remote", type: "phishing_link", weight: 40, critical: true, te: "APK / స్క్రీన్ షేర్ యాప్ ఇన్‌స్టాల్ చేయమంటున్నారు", en: "Asks you to install an APK or remote-access app",
    re: /\.apk\b|anydesk|teamviewer|quick\s*support|rustdesk|airdroid|screen\s*shar(e|ing)|install\s*(this|the|our)\s*app|download\s*(this|the|our)\s*app|యాప్\s*(డౌన్‌లోడ్|ఇన్‌స్టాల్)/i },
  { id: "shady_link", type: "phishing_link", weight: 25, te: "షార్ట్ / అనుమానాస్పద లింక్", en: "Shortened or look-alike link",
    re: /\b(bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|tiny\.cc|t\.ly)\b|\b[a-z0-9-]+\.(xyz|top|click|link|online|site|shop|live|buzz|icu|info|vip|cc)\b|\bt\.me\//i },
  { id: "link", type: "phishing_link", weight: 10, te: "మెసేజ్‌లో లింక్ ఉంది", en: "Contains a link",
    re: /(https?:\/\/|www\.)\S+/i },
  { id: "urgency", type: null, weight: 15, te: "వెంటనే చేయాలని తొందర పెడుతున్నారు", en: "Creates panic or urgency",
    re: /within\s*\d+\s*(hours?|hrs?|minutes?|mins?)|\b24\s*hours?\b|\bimmediately\b|\burgent(ly)?\b|today\s*itself|last\s*(chance|date|warning)|\btonight\b|act\s*now|అత్యవసరం|వెంటనే|ఈరోజే|ఇప్పుడే|\bventane\b|\bippude\b/i },
  { id: "threat", type: null, weight: 15, te: "కేసు / జైలు / జరిమానా అని భయపెడుతున్నారు", en: "Threatens a case, jail or penalty",
    re: /legal\s*action|fir\s*(is\s*)?(registered|filed|lodged)|case\s*(is\s*|has\s*been\s*)?(registered|filed|booked)|penalty|\bjail\b|court\s*(notice|summons)|money\s*laundering|aadhaar\s*(will\s*be\s*|is\s*)?(blocked|misused)|కేసు\s*(నమోదు|పెడతాం)|జైలు|చట్టపరమైన\s*చర్య/i },
  { id: "robocall", type: null, weight: 15, te: "'1 నొక్కండి' అని ఆటోమేటిక్ కాల్", en: "Robocall asking you to press a key",
    re: /press\s*[0-9]\b|[0-9]\s*నొక్కండి/i },
];

function runRules(text) {
  const hits = RULES.filter((r) => (r.test ? r.test(text) : r.re.test(text)));
  // A plain link is only worth mentioning when nothing more specific explains it.
  const flags = hits.some((h) => h.id === "shady_link") ? hits.filter((h) => h.id !== "link") : hits;
  const score = Math.min(100, flags.reduce((s, r) => s + r.weight, 0));
  const critical = flags.some((r) => r.critical);
  const verdict = critical || score >= 45 ? "scam" : score >= 20 ? "suspicious" : "safe";
  const votes = {};
  for (const r of flags) if (r.type) votes[r.type] = (votes[r.type] || 0) + r.weight;
  const type = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const confidence =
    verdict === "scam" ? Math.min(97, Math.round(60 + score * 0.35)) : verdict === "suspicious" ? Math.min(80, 45 + score) : flags.length ? 55 : 70;
  return { verdict, score, type, confidence, flags: flags.map((r) => ({ id: r.id, te: r.te, en: r.en })) };
}

/* --------------------------------------------------------------- the AI */

const AI_SYSTEM = [
  "You are Scam Shield, a fraud-detection assistant for ordinary people in Andhra Pradesh and Telangana, India.",
  "You get a message, a screenshot transcript, or a caller's description of a phone call. It may be in English, Telugu, or Telugu written in English letters.",
  "Common Indian scams: digital arrest (fake police/CBI/customs on a video call demanding money), KYC/PAN/Aadhaar update or account block, OTP or UPI PIN requests, electricity disconnection tonight, courier/parcel with drugs, lottery/KBC prize with a fee, part-time job or Telegram tasks, instant loan apps, trading/crypto groups with guaranteed profit, relative asking money from a new number, sextortion, phishing links and APK files, screen-sharing apps like AnyDesk.",
  "Facts: real police never arrest anyone on a video call or ask for money; banks never ask for an OTP, PIN or password; receiving money never needs a UPI PIN.",
  "A genuine OTP or transaction alert that the user triggered, which warns not to share it and asks for nothing, is SAFE. Normal personal or business messages are SAFE.",
  "Return ONLY a JSON object (no code fence, no extra text):",
  '{"verdict":"scam"|"suspicious"|"safe","confidence":0-100,"scam_type":"digital_arrest"|"kyc_update"|"otp_request"|"lottery_prize"|"job_offer"|"loan_app"|"investment_trading"|"courier_parcel"|"electricity_bill"|"impersonation_relative"|"sextortion"|"phishing_link"|"other"|"none",',
  '"explanation_te":"…","explanation_en":"…","red_flags_te":["…"],"red_flags_en":["…"],"do_now_te":["…"],"do_now_en":["…"],"dont_te":["…"],"dont_en":["…"]}',
  "explanation_te: two short sentences in simple spoken Telugu (Telugu script) that an elderly person understands. explanation_en: the same in English.",
  "red_flags: at most 4, each under 12 words. do_now and dont: at most 3 each, short and practical (for scams include calling 1930).",
  "Each *_te list is in Telugu script and each *_en list is its English translation, in the same order and with the same length.",
].join("\n");

const hasTelugu = (s) => /[ఀ-౿]/.test(String(s || ""));

function pairs(arr, n) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => (typeof x === "string" ? { te: x, en: x } : x))
    .filter((x) => x && typeof x === "object" && (x.te || x.en))
    .map((x) => ({ te: String(x.te || x.en).trim().slice(0, 200), en: String(x.en || x.te).trim().slice(0, 200) }))
    .slice(0, n);
}

function normaliseAI(d) {
  if (!d || typeof d !== "object") return null;
  const verdict = String(d.verdict || "").toLowerCase().trim();
  if (!(verdict in SEVERITY)) return null;
  const confidence = Math.max(0, Math.min(100, parseInt(d.confidence, 10) || 70));
  const type = TYPES[d.scam_type] ? d.scam_type : verdict === "safe" ? "none" : "other";
  const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  // Parallel te/en string lists are what the model follows reliably; object
  // lists ({te,en}) are still accepted in case it answers that way.
  const zip = (te, en, objs, n) => {
    const a = Array.isArray(te) ? te : [];
    const b = Array.isArray(en) ? en : [];
    if (!a.length && !b.length) return pairs(objs, n);
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({ te: a[i] || b[i], en: b[i] || a[i] }))
      .filter((x) => typeof x.te === "string" && x.te.trim())
      .map((x) => ({ te: String(x.te).trim().slice(0, 200), en: String(x.en).trim().slice(0, 200) }))
      .slice(0, n);
  };
  return {
    verdict,
    confidence,
    scam_type: type,
    red_flags: zip(d.red_flags_te, d.red_flags_en, d.red_flags, 4),
    explanation_te: str(d.explanation_te, 500),
    explanation_en: str(d.explanation_en, 500),
    do_now: zip(d.do_now_te, d.do_now_en, d.do_now, 3),
    dont: zip(d.dont_te, d.dont_en, d.dont, 3),
  };
}

/* ------------------------------------------------------- merge + advice */

const DO_1930 = { te: "1930 కి కాల్ చేసి లేదా cybercrime.gov.in లో ఫిర్యాదు చేయండి", en: "Report it: call 1930 or file on cybercrime.gov.in" };
const DEFAULT_DO = {
  scam: [
    { te: "వెంటనే కాల్ కట్ చేసి, ఆ నంబర్‌ని బ్లాక్ చేయండి", en: "Hang up and block the number now" },
    { te: "మెసేజ్ / కాల్ స్క్రీన్‌షాట్ సాక్ష్యంగా దాచుకోండి", en: "Keep screenshots as evidence" },
    DO_1930,
  ],
  suspicious: [
    { te: "అధికారిక నంబర్‌కి మీరే కాల్ చేసి నిర్ధారించుకోండి", en: "Verify by calling the official number yourself" },
    { te: "ఇంట్లో ఎవరికైనా చూపించి సలహా తీసుకోండి", en: "Show it to a family member before acting" },
    DO_1930,
  ],
  safe: [
    { te: "ఇది మీరే అడిగిన OTP అయితే, మీరే వాడుకోండి", en: "If you requested this OTP, use it yourself" },
    { te: "అనుమానం వస్తే అధికారిక యాప్ / నంబర్ ద్వారానే చెక్ చేయండి", en: "When in doubt, check through the official app or number" },
  ],
};
const DEFAULT_DONT = {
  scam: [
    { te: "భయపడి డబ్బులు పంపకండి", en: "Don't send money out of fear" },
    { te: "OTP, UPI PIN, బ్యాంక్ వివరాలు ఎవరికీ చెప్పకండి", en: "Never share OTP, UPI PIN or bank details" },
    { te: "లింక్‌లు ఓపెన్ చేయకండి, యాప్‌లు ఇన్‌స్టాల్ చేయకండి", en: "Don't open links or install apps they send" },
  ],
  suspicious: [
    { te: "లింక్‌లు ఓపెన్ చేయకండి", en: "Don't open the links" },
    { te: "OTP, PIN ఎవరికీ చెప్పకండి", en: "Don't share any OTP or PIN" },
  ],
  safe: [{ te: "OTP, PIN ఎవరికీ చెప్పకండి, బ్యాంక్ వాళ్ళకి కూడా", en: "Never share an OTP or PIN, not even with 'the bank'" }],
};

function fallbackExplanation(verdict, type) {
  const t = label(type);
  if (verdict === "scam")
    return {
      te: `ఇది ${t.te} లాగా ఉంది. డబ్బులు పంపకండి, OTP లేదా PIN ఎవరికీ చెప్పకండి.`,
      en: `Warning: this looks like a ${t.en}. Don't send money or share any OTP or PIN.`,
    };
  if (verdict === "suspicious")
    return {
      te: "ఇది అనుమానాస్పదంగా ఉంది. అధికారిక నంబర్‌కి మీరే కాల్ చేసి నిర్ధారించుకోండి.",
      en: "This looks suspicious. Verify by calling the official number yourself before you act.",
    };
  return {
    te: "ఇందులో మోసం సంకేతాలు కనిపించలేదు. అయినా OTP, PIN ఎవరికీ చెప్పకండి.",
    en: "No scam signs found. Still, never share your OTP or PIN with anyone.",
  };
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || x.slice(0, 14) === y.slice(0, 14);
}

function shareText(verdict, type) {
  const t = label(type);
  if (verdict === "safe")
    return {
      te: "Scam Shield చెక్ చేసింది: ఈ మెసేజ్‌లో మోసం సంకేతాలు లేవు. అయినా OTP, PIN ఎవరికీ చెప్పకండి.",
      en: "Scam Shield check: no scam signs in this message. Still, never share an OTP or PIN.",
    };
  const v = verdict === "scam" ? ["మోసం", "a SCAM"] : ["అనుమానాస్పదం", "SUSPICIOUS"];
  return {
    te: `⚠️ జాగ్రత్త! నాకు "${t.te}" లాంటి మెసేజ్/కాల్ వచ్చింది. Scam Shield ఇది ${v[0]} అని చెప్పింది. మీకూ ఇలాంటిది వస్తే డబ్బులు పంపకండి, OTP / PIN చెప్పకండి. ఫిర్యాదు: 1930 / cybercrime.gov.in`,
    en: `⚠️ Alert: I got a "${t.en}" type message/call. Scam Shield says it is ${v[1]}. If you get one, don't send money or share any OTP/PIN. Report: 1930 / cybercrime.gov.in`,
  };
}

// The model has more than once advised "don't tell your family", which is
// exactly what a digital-arrest scammer wants. Advice about keeping things
// from family never reaches the user.
const BAD_DONT = /(tell|inform)\s+(your\s+)?(family|relatives|friends|anyone)|family\s+members|కుటుంబ|ఇంట్లో/i;

// A safe verdict gets fixed wording: asked to explain a harmless OTP, the
// model hedged ("genuine… but might be fake"), which only confuses people.
const SAFE_OTP = {
  te: "ఇది మీరు అడిగిన మామూలు OTP మెసేజ్ లాగా ఉంది, ఇందులో మోసం సంకేతాలు లేవు. ఈ OTP ని ఎవరికీ చెప్పకండి, బ్యాంక్ వాళ్ళకి కూడా.",
  en: "This looks like a normal OTP message you requested, with no scam signs. Never share this OTP with anyone, not even 'the bank'.",
};

function merge(rules, ai, engine, source, extracted, text = "") {
  const verdict = ai && SEVERITY[ai.verdict] >= SEVERITY[rules.verdict] ? ai.verdict : rules.verdict;
  const aiLed = !!ai && ai.verdict === verdict;
  let confidence = aiLed ? ai.confidence : rules.confidence;
  if (ai && ai.verdict === rules.verdict) confidence = Math.max(ai.confidence, rules.confidence);

  let type = "none";
  if (verdict !== "safe") {
    const aiType = ai && !["none", "other"].includes(ai.scam_type) ? ai.scam_type : null;
    type = (aiLed && aiType) || rules.type || aiType || "other";
  }

  const red_flags = rules.flags.map((f) => ({ te: f.te, en: f.en, source: "rule" }));
  for (const f of ai?.red_flags || []) {
    if (verdict === "safe" && ai.verdict === "safe") break;
    if (!red_flags.some((g) => similar(g.en, f.en))) red_flags.push({ ...f, source: "ai" });
  }

  const fb = verdict === "safe" && OTP_WORD.test(text) ? SAFE_OTP : fallbackExplanation(verdict, type);
  const useAI = aiLed && verdict !== "safe" && hasTelugu(ai.explanation_te);
  // Telugu-first: AI advice that came back only in English gives way to the
  // vetted bilingual defaults.
  const teluguOnly = (list) => (list || []).filter((x) => hasTelugu(x.te));
  const aiDo = aiLed ? teluguOnly(ai.do_now) : [];
  const aiDont = aiLed ? teluguOnly(ai.dont) : [];
  let do_now = aiDo.length >= 2 ? aiDo : [...aiDo, ...DEFAULT_DO[verdict].filter((d) => !aiDo.some((x) => similar(x.en, d.en)))].slice(0, 3);
  let dont = (aiDont.length >= 2 ? aiDont : [...aiDont, ...DEFAULT_DONT[verdict].filter((d) => !aiDont.some((x) => similar(x.en, d.en)))]).filter(
    (x) => !BAD_DONT.test(`${x.en} ${x.te}`),
  );
  for (const d of DEFAULT_DONT[verdict]) if (dont.length < 2 && !dont.some((x) => similar(x.en, d.en))) dont.push(d);
  dont = dont.slice(0, 3);
  if (verdict !== "safe" && !do_now.some((x) => /1930|cybercrime/i.test(`${x.en} ${x.te}`))) do_now = [...do_now.slice(0, 2), DO_1930];

  return {
    id: `chk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    verdict,
    confidence,
    scam_type: type,
    type_label: label(type),
    red_flags: red_flags.slice(0, 7),
    explanation_te: useAI ? ai.explanation_te : fb.te,
    explanation_en: useAI ? ai.explanation_en || fb.en : fb.en,
    // Fresh objects: localisation adds fields, and the defaults are shared.
    do_now: do_now.map((x) => ({ te: x.te, en: x.en })),
    dont: dont.map((x) => ({ te: x.te, en: x.en })),
    rules: { verdict: rules.verdict, score: rules.score, matched: rules.flags.map((f) => f.id) },
    ai: ai ? { verdict: ai.verdict, confidence: ai.confidence } : null,
    engine: ai ? engine : "rules",
    source,
    checkedAt: Date.now(),
    report: { helpline: "1930", portal: "https://cybercrime.gov.in" },
    share: shareText(verdict, type),
    ...(extracted ? { extracted_text: extracted.slice(0, 800) } : {}),
  };
}

/* --------------------------------------------------------------- module */

const istDate = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// No seeded data: the console shows only checks people actually made.
const seed = () => ({ checks: [] });

export default {
  id: "scam",
  async register(app, ctx) {
    const store = ctx.store("scam", seed);
    const log = (...a) => (ctx.log ? ctx.log("[scam]", ...a) : console.log("[scam]", ...a));

    // Older data files carried a seeded demo week; drop it so only real checks count.
    {
      const checks = Array.isArray(store.data.checks) ? store.data.checks : [];
      const real = checks.filter((c) => !c.demo);
      if (real.length !== checks.length || !Array.isArray(store.data.checks)) {
        store.data.checks = real;
        store.save();
        log(`removed ${checks.length - real.length} seeded demo checks`);
      }
    }

    async function analyse(text, source, extracted) {
      const clean = String(text || "").trim().slice(0, 4000);
      const rules = runRules(clean);
      let ai = null;
      let engine = null;
      try {
        const hint = rules.flags.length ? `Rule-based checks already found: ${rules.flags.map((f) => f.en).join("; ")}.` : "Rule-based checks found nothing.";
        const r = await ctx.ai.llmJSON(
          [
            { role: "system", content: `${AI_SYSTEM}\n${hint}` },
            { role: "user", content: `Source: ${source}\n---\n${clean}` },
          ],
          { max_tokens: 1400, temperature: 0 },
        );
        ai = normaliseAI(r?.data);
        engine = r?.engine || null;
        if (!ai) log("AI answer unusable, using rules only");
      } catch (e) {
        log("AI analysis failed, using rules only:", e.message);
      }
      const result = merge(rules, ai, engine, source, extracted, clean);
      const entry = { id: result.id, at: result.checkedAt, type: result.scam_type, verdict: result.verdict, source };
      const data = store.data;
      data.checks = [...(data.checks || []), entry].slice(-3000);
      store.save();
      ctx.sse.broadcast("scam:check", entry);
      return result;
    }

    // Sarvam answers 429 when several servers warm their voices at once; a
    // short retry turns that into a delay instead of a silent reply.
    const speak = async (text, lang = "te") => {
      if (!text) return null;
      // Untranslated (plain ASCII) text is read by the English voice.
      // eslint-disable-next-line no-control-regex -- "any non-ASCII character" check
      const code = lang !== "en" && /[^\x00-\x7F]/.test(text) ? LANGS[lang][1] : "en-IN";
      for (let i = 0; i < 3; i++) {
        const a = await ctx.voice.tts(text, code).catch(() => null);
        if (a) return a;
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
      return null;
    };

    /* ---- languages: English + Telugu come from the analysis, the rest are translated ---- */

    const tcache = new Map();
    async function translate(lang, strings) {
      if (lang === "en") return strings;
      const key = (s) => `${lang}|${s}`;
      // Core's translator returns { [english]: translated } and caches on disk.
      // Whatever it leaves in English gets one more try below.
      if (ctx.i18n?.translate) {
        try {
          const map = await ctx.i18n.translate(lang, strings);
          if (map && typeof map === "object" && !Array.isArray(map))
            for (const s of strings) if (map[s] && map[s] !== s) tcache.set(key(s), map[s]);
        } catch (e) {
          log("i18n.translate failed:", e.message);
        }
      }
      const todo = [...new Set(strings.filter((s) => s && /[a-z]/i.test(s) && !tcache.has(key(s))))];
      if (todo.length) {
        let got = null;
        {
          try {
            const { data } = await ctx.ai.llmJSON(
              [
                {
                  role: "system",
                  content: `Translate each English string into ${LANGS[lang][0]} in its native script, using simple everyday words. Keep numbers, 1930, OTP, UPI, PIN, KYC, URLs and app names as they are. Return ONLY JSON {"t":[...]} with exactly ${todo.length} strings in the same order.`,
                },
                { role: "user", content: JSON.stringify(todo) },
              ],
              { max_tokens: 1800, temperature: 0 },
            );
            // The model sometimes answers with a bare array instead of {"t": [...]}.
            const t = Array.isArray(data) ? data : data?.t;
            if (Array.isArray(t) && t.length === todo.length) got = t.map((x) => String(x));
          } catch (e) {
            log("translation failed:", e.message);
          }
        }
        if (Array.isArray(got) && got.length === todo.length) todo.forEach((s, i) => got[i] && tcache.set(key(s), got[i]));
      }
      return strings.map((s) => tcache.get(key(s)) ?? s);
    }

    // Adds `loc` (the user's language) next to every te/en pair, plus
    // `explanation` and `verdict_label`. English stays alongside as the subtitle.
    async function localise(result, lang) {
      const lists = [result.red_flags, result.do_now, result.dont];
      const vl = { ...VERDICT_LABEL[result.verdict] };
      if (lang === "te" || lang === "en") {
        for (const list of lists) for (const x of list) x.loc = x[lang];
        result.explanation = lang === "te" ? result.explanation_te : result.explanation_en;
        result.type_label.loc = result.type_label[lang];
        vl.loc = vl[lang];
        result.share.loc = result.share[lang];
      } else {
        const strings = [result.explanation_en, result.type_label.en, vl.en, result.share.en, ...lists.flatMap((l) => l.map((x) => x.en))];
        const tr = await translate(lang, strings);
        let i = 0;
        result.explanation = tr[i++];
        result.type_label.loc = tr[i++];
        vl.loc = tr[i++];
        result.share.loc = tr[i++];
        for (const list of lists) for (const x of list) x.loc = tr[i++];
      }
      result.verdict_label = vl;
      result.lang = lang;
      return result;
    }

    const limited = (req, reply) => {
      if (ctx.rateLimit && ctx.rateLimit(req)) {
        reply.code(429).send({ error: "చాలా ఎక్కువ రిక్వెస్ట్‌లు, కొంచెం ఆగండి. / Too many requests, please slow down." });
        return true;
      }
      return false;
    };

    app.post("/check", async (req, reply) => {
      if (limited(req, reply)) return reply;
      const b = req.body || {};
      const source = SOURCES.includes(b.source) ? b.source : "other";
      let text = typeof b.text === "string" ? b.text : "";
      let extracted = null;

      if (!text.trim() && typeof b.imageBase64 === "string" && b.imageBase64) {
        const b64 = b.imageBase64.replace(/^data:[^,]+,/, "");
        if (b64.length > 7_000_000) return reply.code(413).send({ error: "స్క్రీన్‌షాట్ చాలా పెద్దది. / Screenshot is too large." });
        const unavailable = {
          error: "స్క్రీన్‌షాట్ చదవడం ఇప్పుడు వీలు కాదు, దయచేసి మెసేజ్ టెక్స్ట్ పేస్ట్ చేయండి. / Screenshot reading isn't available right now. Please paste the message text instead.",
          code: "vision-unavailable",
        };
        if (!ctx.ai.hasGemini) return reply.code(400).send(unavailable);
        try {
          const v = await ctx.ai.vision(
            "This is a screenshot an Indian user received (SMS, WhatsApp chat, call screen, payment app or website). Transcribe ALL visible text exactly, keeping the original language. Then add a line starting 'LAYOUT:' that notes the sender name/number, links, buttons, logos, QR codes or payment requests, and anything that looks fake.",
            b64,
            typeof b.mime === "string" ? b.mime : "image/jpeg",
          );
          extracted = String(v?.text || "").trim();
        } catch (e) {
          log("vision failed:", e.message);
          return reply.code(400).send(unavailable);
        }
        if (!extracted) return reply.code(422).send({ error: "స్క్రీన్‌షాట్‌లో టెక్స్ట్ కనిపించలేదు. / No text found in the screenshot." });
        text = extracted;
      }

      if (!text.trim()) return reply.code(400).send({ error: "మెసేజ్ టెక్స్ట్ పేస్ట్ చేయండి. / Paste the message text first." });

      // The screen is English; the voice explains in Telugu (the live voice language).
      // A caller may still ask for another screen language via `lang`.
      const lang = pickLang(b.lang);
      const result = await localise(await analyse(text, source, extracted), lang);
      return { result, audio: await speak(result.explanation_te, "te"), audioLang: "te" };
    });

    /* ---- voice: describe the call or message you got ---- */

    const GREETING = {
      te: "నమస్కారం, ఇది స్కామ్ షీల్డ్. మీకు వచ్చిన అనుమానాస్పద కాల్ లేదా మెసేజ్ గురించి చెప్పండి. వాళ్ళు ఏమన్నారు?",
      en: "Namaskaram, this is Scam Shield. Tell me about the suspicious call or message you got. What did they say?",
    };
    const SORRY = { te: "క్షమించండి, సరిగ్గా వినపడలేదు. వాళ్ళు ఏమన్నారో మళ్ళీ చెప్పండి.", en: "Sorry, I couldn't hear that clearly. Please tell me again what they said." };

    // A reply line in the caller's language, with English as the subtitle
    // (no subtitle when the call itself is in English).
    const line = (loc, en, lang) => ({ te: loc, en: lang === "en" ? "" : en, loc });
    async function fixedLine(pair, lang) {
      if (lang === "te" || lang === "en") return line(pair[lang], pair.en, lang);
      const [loc] = await translate(lang, [pair.en]);
      return line(loc, pair.en, lang);
    }

    app.post("/call/start", async (req, reply) => {
      if (limited(req, reply)) return reply;
      // Telugu is the live voice language; VOICE_LANGS=all lets a caller pick another.
      const lang = process.env.VOICE_LANGS === "all" ? pickLang(req.body?.lang) : "te";
      const sessionId = ctx.sessions.create({ module: "scam", created: Date.now(), lang });
      const greet = await fixedLine(GREETING, lang);
      return { sessionId, reply: [greet], audios: [await speak(greet.te, lang)], engine: ctx.ai.hasGemini ? "gemini" : "sarvam", lang };
    });

    app.post("/call/turn", async (req, reply) => {
      if (limited(req, reply)) return reply;
      const b = req.body || {};
      const session = ctx.sessions.get(b.sessionId);
      if (!session) return reply.code(404).send({ error: "సెషన్ ముగిసింది, మళ్ళీ మొదలుపెట్టండి. / Session expired. Please start again." });

      const lang = pickLang(session.lang || "te");
      let said = typeof b.text === "string" ? b.text.trim().slice(0, 2000) : "";
      const timing = {};
      if (!said && typeof b.audio === "string" && b.audio) {
        const t0 = Date.now();
        said = await ctx.voice.stt(Buffer.from(b.audio, "base64"), LANGS[lang][1]).catch((e) => {
          log("stt failed:", e.message);
          return "";
        });
        timing.sttMs = Date.now() - t0;
      }
      if (!said) {
        const sorry = await fixedLine(SORRY, lang);
        return { sessionId: b.sessionId, said: "", reply: [sorry], audios: [await speak(sorry.te, lang)], done: false, timing };
      }

      const t1 = Date.now();
      const result = await localise(await analyse(said, "call"), lang);
      timing.aiMs = Date.now() - t1;
      const headEn =
        result.verdict === "scam"
          ? `${result.verdict_label.en}. ${result.type_label.en}. ${result.explanation_en}`
          : result.verdict === "suspicious"
            ? `${result.verdict_label.en}. ${result.explanation_en}`
            : result.explanation_en;
      const headLoc =
        result.verdict === "safe" ? result.explanation : `${result.verdict_label.loc}. ${result.verdict === "scam" ? `${result.type_label.loc}. ` : ""}${result.explanation}`;
      const lines = [line(headLoc, headEn, lang)];
      for (const x of [result.dont[0], result.do_now[0]]) if (x) lines.push(line(x.loc || x.en, x.en, lang));
      ctx.sessions.delete(b.sessionId);
      // One render for the whole answer: a third of the requests, and the
      // reply plays as one natural sentence instead of three clips.
      const audio = await speak(lines.map((l) => l.te).join(" "), lang);
      return {
        sessionId: b.sessionId,
        said,
        reply: lines,
        audios: lines.map((_, i) => (i === 0 ? audio : null)),
        done: true,
        result,
        timing,
        engine: result.engine,
      };
    });

    /* ---- console ---- */

    app.get("/stats", async () => {
      const checks = store.data.checks || [];
      const now = Date.now();
      const days = [];
      for (let d = 6; d >= 0; d--) {
        const t = now - d * 864e5;
        days.push({
          date: istDate(t),
          label: new Date(t).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric" }),
          total: 0,
          byType: {},
        });
      }
      const index = Object.fromEntries(days.map((d, i) => [d.date, i]));
      const totals = {};
      const verdicts = { scam: 0, suspicious: 0, safe: 0 };
      for (const c of checks) {
        const i = index[istDate(c.at)];
        if (i === undefined) continue;
        days[i].total++;
        verdicts[c.verdict] = (verdicts[c.verdict] || 0) + 1;
        if (c.verdict === "safe") continue;
        days[i].byType[c.type] = (days[i].byType[c.type] || 0) + 1;
        totals[c.type] = (totals[c.type] || 0) + 1;
      }
      const top = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count, label: label(type) }));
      return {
        days,
        totals,
        verdicts,
        top,
        recent: checks.slice(-15).reverse(),
        labels: Object.fromEntries(Object.keys(TYPES).map((k) => [k, label(k)])),
        demo: checks.some((c) => c.demo),
      };
    });

    const AWARE_FALLBACK = (type) => {
      const t = label(type);
      return {
        te: `⚠️ జాగ్రత్త: "${t.te}" జరుగుతోంది. తెలియని కాల్స్ / మెసేజ్‌లకు భయపడి డబ్బులు పంపకండి, OTP / PIN ఎవరికీ చెప్పకండి, లింక్‌లు ఓపెన్ చేయకండి. ఫిర్యాదు: 1930 / cybercrime.gov.in`,
        en: `⚠️ Alert: "${t.en}" cases are rising. Don't send money under pressure, never share an OTP/PIN, and don't open unknown links. Report: 1930 / cybercrime.gov.in`,
      };
    };

    app.post("/awareness", async (req, reply) => {
      if (limited(req, reply)) return reply;
      const type = TYPES[req.body?.scam_type] && req.body.scam_type !== "none" ? req.body.scam_type : "digital_arrest";
      try {
        const { data, engine } = await ctx.ai.llmJSON(
          [
            {
              role: "system",
              content:
                'You write short public-awareness messages for WhatsApp groups in Andhra Pradesh and Telangana, issued by a district cyber cell. Return ONLY a JSON object {"te":"…","en":"…"}. Each message: at most 60 words, starts with ⚠️, names the scam, explains in one line how it works, gives 2-3 short do/don\'t tips, and ends with "Report: 1930 / cybercrime.gov.in". The Telugu version must be simple spoken Telugu in Telugu script.',
            },
            { role: "user", content: `Scam type: ${label(type).en}` },
          ],
          { max_tokens: 700, temperature: 0.4 },
        );
        if (data && typeof data.te === "string" && typeof data.en === "string" && data.te.trim()) {
          return withLoc({ scam_type: type, label: label(type), te: data.te.trim(), en: data.en.trim(), engine });
        }
      } catch (e) {
        log("awareness AI failed:", e.message);
      }
      return withLoc({ scam_type: type, label: label(type), ...AWARE_FALLBACK(type), engine: "template" });

      async function withLoc(msg) {
        const lang = pickLang(req.body?.lang);
        msg.lang = lang;
        msg.loc = lang === "te" ? msg.te : lang === "en" ? msg.en : (await translate(lang, [msg.en]))[0];
        return msg;
      }
    });

    app.post("/reset", async () => {
      store.reset();
      ctx.sse.broadcast("scam:reset", {});
      return { ok: true };
    });

    // Render the fixed lines once so the first caller hears them instantly.
    // Delayed so it doesn't collide with the other modules' warm-up burst.
    setTimeout(() => {
      speak(GREETING.en, "en")
        .then(() => speak(GREETING.te, "te"))
        .catch(() => {});
    }, 8000).unref?.();

    // In production, translate the fixed wording into every language once
    // (cached on disk by core), so the first Hindi or Tamil check isn't slow.
    if (process.env.NODE_ENV === "production" || process.env.PREWARM === "1") {
      const fixed = [
        GREETING.en, SORRY.en, DO_1930.en, SAFE_OTP.en,
        ...Object.values(VERDICT_LABEL).map((v) => v.en),
        ...Object.values(TYPES).map((v) => v[1]),
        ...RULES.map((r) => r.en),
        ...Object.values(DEFAULT_DO).flat().map((x) => x.en),
        ...Object.values(DEFAULT_DONT).flat().map((x) => x.en),
      ];
      setTimeout(async () => {
        for (const lang of Object.keys(LANGS)) if (lang !== "en" && lang !== "te") await translate(lang, fixed).catch(() => {});
        log("fixed wording translated into all languages");
      }, 20000).unref?.();
    }
  },
};

// Exposed for tests.
export { runRules, merge, normaliseAI };
