/** te + en always; `loc` is the same text in the user's language (server-filled). */
export type Pair = { te: string; en: string; loc?: string };
export type Flag = Pair & { source?: "rule" | "ai" };
export type Verdict = "scam" | "suspicious" | "safe";
export type Source = "sms" | "whatsapp" | "call" | "other";

export type ScamResult = {
  id: string;
  verdict: Verdict;
  confidence: number;
  scam_type: string;
  type_label: Pair;
  red_flags: Flag[];
  explanation_te: string;
  explanation_en: string;
  do_now: Pair[];
  dont: Pair[];
  engine?: string | null;
  source?: Source;
  checkedAt: number;
  share: Pair;
  /** In the user's language (server-filled). */
  explanation?: string;
  verdict_label?: Pair;
  lang?: string;
  extracted_text?: string;
  rules?: { verdict: Verdict; score: number; matched: string[] };
  ai?: { verdict: Verdict; confidence: number } | null;
};

export type CheckEntry = { id: string; at: number; type: string; verdict: Verdict; source: Source; demo?: boolean };

export type ScamStats = {
  days: { date: string; label: string; total: number; byType: Record<string, number> }[];
  totals: Record<string, number>;
  verdicts: Record<Verdict, number>;
  top: { type: string; count: number; label: Pair }[];
  recent: CheckEntry[];
  labels: Record<string, Pair>;
  demo: boolean;
};

export const VERDICT: Record<Verdict, { te: string; en: string; banner: string; bar: string; tone: "danger" | "warning" | "success" }> = {
  scam: { te: "మోసం! జాగ్రత్త", en: "SCAM: do not respond", banner: "from-red-600 to-red-700", bar: "bg-critical", tone: "danger" },
  suspicious: { te: "అనుమానాస్పదం", en: "SUSPICIOUS: verify first", banner: "from-amber-500 to-orange-600", bar: "bg-high", tone: "warning" },
  safe: { te: "సురక్షితంగా ఉంది", en: "LOOKS SAFE", banner: "from-green-600 to-emerald-700", bar: "bg-low", tone: "success" },
};

export const SOURCE_LABEL: Record<Source, Pair> = {
  sms: { te: "SMS", en: "SMS" },
  whatsapp: { te: "వాట్సాప్", en: "WhatsApp" },
  call: { te: "ఫోన్ కాల్", en: "Phone call" },
  other: { te: "ఇతర", en: "Other" },
};

export const TYPE_COLORS: Record<string, string> = {
  digital_arrest: "#7c3aed",
  kyc_update: "#2563eb",
  otp_request: "#db2777",
  job_offer: "#0d9488",
  investment_trading: "#d97706",
  electricity_bill: "#ca8a04",
  courier_parcel: "#ea580c",
  lottery_prize: "#16a34a",
  phishing_link: "#0891b2",
  loan_app: "#64748b",
  impersonation_relative: "#9333ea",
  sextortion: "#dc2626",
  other: "#94a3b8",
};

export const SCAM_TYPES: { id: string; label: Pair }[] = [
  { id: "digital_arrest", label: { te: "డిజిటల్ అరెస్ట్ మోసం", en: "Digital arrest scam" } },
  { id: "kyc_update", label: { te: "KYC అప్డేట్ మోసం", en: "KYC / account-block scam" } },
  { id: "otp_request", label: { te: "OTP మోసం", en: "OTP fraud" } },
  { id: "electricity_bill", label: { te: "కరెంట్ బిల్ మోసం", en: "Electricity bill scam" } },
  { id: "courier_parcel", label: { te: "కొరియర్ / పార్సెల్ మోసం", en: "Courier / parcel scam" } },
  { id: "lottery_prize", label: { te: "లాటరీ / బహుమతి మోసం", en: "Lottery / prize scam" } },
  { id: "job_offer", label: { te: "పార్ట్-టైమ్ జాబ్ మోసం", en: "Part-time job / task scam" } },
  { id: "investment_trading", label: { te: "ట్రేడింగ్ / పెట్టుబడి మోసం", en: "Trading / investment scam" } },
  { id: "loan_app", label: { te: "లోన్ యాప్ మోసం", en: "Instant loan app scam" } },
  { id: "impersonation_relative", label: { te: "బంధువు పేరుతో మోసం", en: "Relative impersonation" } },
  { id: "sextortion", label: { te: "బ్లాక్‌మెయిల్ / సెక్స్‌టార్షన్", en: "Sextortion / blackmail" } },
  { id: "phishing_link", label: { te: "ఫిషింగ్ లింక్ / యాప్ మోసం", en: "Phishing link / app" } },
];

export const SAMPLES: { id: string; label: Pair; text: string; textTe?: string; source: Source; safe?: boolean }[] = [
  {
    id: "arrest",
    label: { te: "డిజిటల్ అరెస్ట్", en: "Digital arrest" },
    source: "call",
    text: "This is CBI officer Rajesh Kumar. A parcel in your name with drugs was seized at Mumbai customs. You are under digital arrest. Stay on this video call and do not tell your family. Transfer Rs 95,000 to the RBI verification account to clear your name.",
  },
  {
    id: "kyc",
    label: { te: "KYC అప్డేట్", en: "KYC update" },
    source: "sms",
    text: "Dear SBI user, your YONO account will be blocked today. Update your PAN KYC immediately: http://sbi-kyc-update.xyz/login",
  },
  {
    id: "power",
    label: { te: "కరెంట్ బిల్", en: "Power bill" },
    source: "sms",
    text: "Dear Consumer, your electricity power will be disconnected tonight at 9:30 PM because your previous month bill was not updated. Please call our electricity officer 7XXXXXXX45 immediately.",
  },
  {
    id: "lottery",
    label: { te: "లాటరీ", en: "Lottery" },
    source: "whatsapp",
    text: "Congratulations! Your number has won ₹25,00,000 in the KBC lucky draw. To receive the prize money, send a ₹12,500 processing fee to this UPI ID: kbcprize@ybl",
    textTe: "అభినందనలు! మీ నంబర్ KBC లక్కీ డ్రాలో ₹25,00,000 గెలుచుకుంది. ప్రైజ్ మనీ కోసం ₹12,500 ప్రాసెసింగ్ ఫీజు ఈ UPI ID కి పంపండి: kbcprize@ybl",
  },
  {
    id: "job",
    label: { te: "పార్ట్-టైమ్ జాబ్", en: "Part-time job" },
    source: "whatsapp",
    text: "Hi! Part time job from home. Daily ₹3000-₹8000 income. Just like YouTube videos and complete simple tasks on Telegram. Registration fee only ₹999. Join now: t.me/earnfast_tasks",
  },
  {
    id: "courier",
    label: { te: "కొరియర్", en: "Courier" },
    source: "call",
    text: "FedEx: Your parcel to Taiwan has been held by Mumbai customs. It contains 5 passports and 200g MDMA. Press 1 to talk to the customs officer or your Aadhaar will be blocked within 2 hours.",
  },
  {
    id: "otp",
    label: { te: "OTP అడిగారు", en: "OTP request" },
    source: "call",
    text: "Sir, I am calling from your bank. Your credit card reward points expire today. Tell me the OTP you just received and we will add the points to your account.",
    textTe: "సార్, నేను బ్యాంక్ నుండి మాట్లాడుతున్నా. మీ క్రెడిట్ కార్డ్ రివార్డ్ పాయింట్లు ఈరోజే ఎక్స్‌పైర్ అవుతాయి. మీ ఫోన్‌కి వచ్చిన OTP చెప్పండి, పాయింట్లు మీ అకౌంట్‌లో వేస్తాం.",
  },
  {
    id: "safe",
    label: { te: "నిజమైన OTP", en: "Genuine OTP" },
    source: "sms",
    safe: true,
    text: "482913 is your OTP for login to SBI YONO. Valid for 5 minutes. Do not share this OTP with anyone. -SBI",
  },
];

export const VOICE_SAMPLES = [
  "ఒకరు పోలీస్ అని వీడియో కాల్ చేసి డిజిటల్ అరెస్ట్ అంటున్నారు, డబ్బులు పంపమంటున్నారు",
  "బ్యాంక్ నుంచి అని కాల్ చేసి OTP చెప్పమన్నారు",
  "Electricity office nunchi ani call chesi tonight current cut chestam, ee number ki call cheyandi annaru",
];
export const VOICE_SAMPLES_EN = [
  "Someone called saying he is from the police and that I am under digital arrest. He is asking me to send money.",
  "A caller from 'the bank' asked me to tell him the OTP I just received.",
  "They said my electricity will be cut tonight unless I call their number.",
];
export const VOICE_SAMPLES_HI = [
  "किसी ने पुलिस बनकर वीडियो कॉल किया और कहा कि मैं डिजिटल अरेस्ट में हूँ, पैसे माँग रहे हैं",
  "बैंक से बोलकर किसी ने मेरा OTP माँगा",
];

export const istTime = (t: number) =>
  new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Downscale a picked image to at most `max` px on its long side and return base64 JPEG. */
export async function imageToBase64(file: File, max = 1600): Promise<{ b64: string; mime: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("This file could not be read as an image."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Your browser could not process this image.");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.85);
    return { b64: preview.split(",")[1], mime: "image/jpeg", preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}
