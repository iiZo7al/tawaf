/**
 * Bilingual UI (Arabic / English).
 *
 * Every visible string - including fall reasons and the spoken announcements -
 * lives here, so one language switch flips the whole console.  Arabic is the
 * default; the choice is remembered in localStorage.
 */

const STORAGE_KEY = "bsg.lang";

const STRINGS = {
  ar: {
    "doc.title": "حارس الحجر الأسود الذكي — Smart Black Stone Guard",
    "brand.title": "حارس الحجر الأسود الذكي",
    "brand.sub": "SMART BLACK STONE GUARD · WRO 2026 · مبدعو الأندلس",

    "chip.role": "دور",
    "chip.ai": "AI",
    "chip.arduino": "الأردوينو",
    "chip.cloud": "السحابة",
    "chip.fps": "FPS",
    "camera.switch": "تغيير الكاميرا",
    "camera.select": "اختيار الكاميرا",
    "chip.role.camera": "كاميرا + تحليل",
    "chip.role.view": "شاشة عرض",
    "chip.ai.loading": "جارٍ التحميل",
    "chip.ai.idle": "بانتظار البدء",
    "chip.ai.off": "متوقف",
    "chip.ai.remote": "بث بعيد",
    "chip.serial.connecting": "جارٍ الاتصال",
    "chip.serial.sim": "وضع محاكاة",
    "chip.serial.nolib": "بلا مكتبة",
    "chip.serial.off": "غير متصل",
    "chip.serial.agentOff": "الوكيل متوقف",
    "chip.cloud.ready": "جاهزة",
    "chip.cloud.connecting": "جارٍ الاتصال",
    "chip.cloud.offline": "غير متصل",
    "chip.cloud.sending": "جارٍ البث",
    "chip.cloud.sent": "تم البث",
    "chip.cloud.failed": "فشل",
    "chip.cloud.resolved": "تم الإلغاء",

    "sidebar.title": "القياسات الحيوية",
    "metric.torso": "زاوية الجذع",
    "metric.lying": "0° مستلقٍ",
    "metric.standing": "90° واقف",
    "metric.drop": "سرعة السقوط",
    "metric.unit": "م/ث",
    "metric.stability": "الاستقرار",
    "metric.incidents": "الحوادث",
    "metric.light": "الإضاءة",

    "lamp.idle": "اللمبة التلقائية: غير مفعّلة",
    "lamp.on": "اللمبة التلقائية: تعمل (إضاءة {level})",
    "lamp.off": "اللمبة التلقائية: متوقفة (إضاءة {level})",
    "lamp.onShort": "اللمبة التلقائية: تعمل",
    "lamp.offShort": "اللمبة التلقائية: متوقفة",

    "subjects.none": "لا يوجد شخص في الإطار",
    "subjects.one": "شخص واحد في الإطار · بث مباشر من الكاميرا",
    "subjects.remote": "شخص في الإطار (بث بعيد)",

    "rail.title": "الصندوق الأسود",
    "rail.empty": "لا توجد حوادث مسجّلة بعد",
    "rail.incident": "حادثة",

    "ctl.fullscreen": "ملء الشاشة",
    "ctl.hud": "الواجهة",
    "ctl.test": "اختبار محاكاة",
    "ctl.lamp": "اختبار اللمبة",
    "ctl.voice": "الصوت",
    "ctl.sidebar": "القياسات",
    "ctl.quit": "إيقاف",
    "btn.fullscreen": "ملء الشاشة (F)",
    "btn.hud": "إخفاء الواجهة (H)",
    "btn.settings": "التشخيص والاتصال",

    "alert.title": "حالة طوارئ — سقوط مؤكد",
    "recovery.label": "المصاب يقف — إلغاء تلقائي",

    "setup.title": "بدء الجلسة",
    "setup.desc": "اختر الدور ثم ابدأ المراقبة. الكشف يعمل داخل المتصفح، والصورة تنتقل بين الكاميرا والشاشة عبر السحابة — بدون نفق مؤقت وبدون نفس الشبكة.",
    "setup.cameraRole.title": "كاميرا فقط",
    "setup.cameraRole.desc": "يشغّل الكاميرا والتحليل ويرسل للبقية، بلا واجهة — فقط مؤشر «متصل» في الزاوية.",
    "setup.viewRole.title": "شاشة فقط",
    "setup.viewRole.desc": "يستقبل الصورة والإنذارات من جهاز الكاميرا ويعرضها بكل الواجهة (مثل الآيباد).",
    "setup.bothRole.title": "كاميرا + شاشة",
    "setup.bothRole.desc": "الواجهة الكاملة مع الكاميرا على نفس الجهاز: القياسات والإنذارات مباشرة.",
    "solo.connected": "متصل",
    "solo.connecting": "جارٍ الاتصال…",
    "solo.waiting": "بانتظار الشاشة",
    "solo.offline": "غير متصل",
    "solo.monitoring": "المراقبة شغّالة",
    "solo.hold": "اضغط مطولاً للإيقاف",
    "setup.camera": "كاميرا هذا الجهاز",
    "setup.defaultCamera": "الكاميرا الافتراضية",
    "setup.hint": "تُدرج كاميرا USB أو كاميرا IR تلقائياً بمجرد توصيلها.",
    "setup.start": "▶ تشغيل الكاميرا",
    "setup.startView": "▶ بدء العرض",
    "setup.startBoth": "▶ بدء الكاميرا والواجهة",
    "setup.selftest": "اختبار المنطق",
    "setup.serial": "اتصال الأردوينو (بلوتوث)",
    "setup.pairLabel": "رقم الشاشة (6 أرقام)",
    "setup.pairHint": "افتح الشاشة على الجهاز الآخر واختر «شاشة فقط»، ثم اكتب الرقم الظاهر هنا.",
    "share.title": "روابط التشغيل من أي شبكة",
    "share.camera": "رابط جهاز الكاميرا",
    "share.view": "رابط الشاشة (الآيباد)",
    "share.note": "افتح أحد الرابطين على الجهاز الآخر أياً كانت شبكته — لا يلزم نفس الـIP.",
    "share.copied": "تم نسخ الرابط",
    "share.copyFailed": "تعذّر النسخ — انسخ الرابط يدوياً",
    "share.localOnly": "أنت على localhost: لن يفتح هذا الرابط على جهاز آخر. شغّل «نشر_عام» للحصول على رابط عام.",
    "theme.toDark": "الوضع الليلي",
    "theme.toLight": "الوضع النهاري",

    "waiting.title": "بانتظار جهاز الكاميرا…",
    "waiting.desc": "افتح الصفحة على جهاز الكاميرا، واكتب رقم الاقتران التالي في خانة «رقم الشاشة».",
    "waiting.codeLabel": "رقم الاقتران",
    "waiting.copy": "نسخ الرقم",
    "waiting.copied": "تم نسخ رقم الاقتران",
    "waiting.codeHint": "الرقم يتغيّر لكل جلسة، ويعمل من أي شبكة — لا يلزم نفس الواي فاي.",

    "pair.codeLabel": "الرقم الذي أدخلته",
    "pair.pendingTitle": "جارٍ تأكيد الرقم…",
    "pair.pendingDesc": "تأكد أن الشاشة مفتوحة وتحمل نفس الرقم. الكاميرا ستبدأ تلقائياً بعد تأكيد الشاشة.",
    "pair.pendingNote": "لن تُفتح الكاميرا إلا بعد تأكيد الشاشة.",
    "pair.failed": "لم تؤكّد الشاشة الرقم — أدخل الرقم الصحيح أو تأكد أن الشاشة تعمل ثم أعد المحاولة",
    "pair.opening": "تم التأكيد — جارٍ تشغيل الكاميرا…",

    "drawer.title": "التشخيص والاتصال",
    "drawer.run": "تشغيل الاختبار الذاتي",
    "drawer.idle": "لم يُشغَّل بعد.",
    "drawer.serialTitle": "منفذ الأردوينو / بلوتوث HC-05",
    "drawer.connect": "اتصال",
    "drawer.refresh": "تحديث المنافذ",
    "drawer.portsHint": "اقترن بـ HC-05 من إعدادات ويندوز أولاً، ثم اختر المنفذ هنا.",
    "drawer.logTitle": "آخر الأوامر المرسلة",
    "drawer.noLog": "لا توجد أوامر بعد",
    "drawer.cloudTitle": "الموقع السحابي (tawaf.alk.sa)",
    "drawer.cloudCheck": "فحص الموقع",
    "drawer.cloudHint": "كل إنذار يُرسل إلى /api/alert ويُلغى بـ /api/resolve عند وقوف المصاب.",
    "cloud.checking": "جارٍ فحص الموقع…",
    "cloud.safe": "الموقع: صحن المطاف آمن",
    "cloud.emergency": "الموقع: حالة إنذار نشطة",
    "cloud.offline": "تعذّر الوصول: {err}",
    "cloud.disabled": "الإرسال السحابي معطّل (--no-cloud)",

    "status.idle": "اختر الدور ثم ابدأ المراقبة",
    "status.opening": "جارٍ فتح الكاميرا…",
    "status.loadingModel": "جارٍ تحميل نموذج الذكاء الاصطناعي…",
    "status.active": "المراقبة نشطة — ابحث عن شخص في الإطار",
    "status.normal": "الوضع طبيعي — الحارس يراقب (زاوية الجذع {angle}°)",
    "status.noSubject": "لا يوجد شخص في الإطار — المراقبة مستمرة",
    "status.alarm": "🚨 حالة طوارئ: سقوط مؤكد — {reason}",
    "status.recovering": "المصاب واقف — جارٍ الإلغاء التلقائي {pct}",
    "status.viewWait": "جارٍ الاتصال بجهاز الكاميرا…",
    "status.viewConnected": "جهاز الكاميرا متصل — في انتظار أول صورة",
    "status.viewLive": "الوضع طبيعي — استقبال بث مباشر من جهاز الكاميرا",
    "status.pairPending": "بانتظار تأكيد الشاشة للرقم {code}…",
    "status.stopped": "تم إيقاف المراقبة",
    "status.cameraFailed": "تعذّر فتح الكاميرا",
    "status.modelFailed": "فشل تحميل نموذج MediaPipe",

    "toast.voiceOn": "🔊 الإعلانات الصوتية مفعّلة",
    "toast.voiceOff": "🔇 الإعلانات الصوتية متوقفة",
    "toast.sim": "▶ محاكاة سقوط لمدة 3.8 ثانية ثم وقوف",
    "toast.lampTest": "💡 اللمبة قيد الاختبار لمدة 4 ثوانٍ",
    "toast.viewerOnly": "هذا الإجراء يُشغَّل من جهاز الكاميرا",
    "toast.pairRequired": "اكتب رقم الشاشة أولاً (6 أرقام من شاشة العرض)",
    "toast.cloudOffline": "السحابة غير متصلة الآن — سيعمل الاقتران عند عودة الاتصال",
    "toast.snapshotSaved": "📸 تم حفظ الحادثة في الصندوق الأسود: {file}",
    "toast.snapshotError": "تعذّر حفظ الصورة: {err}",
    "toast.captureError": "تعذّر التقاط الصورة: {err}",
    "toast.cameraError": "تعذّر فتح الكاميرا: {err}",
    "toast.modelError": "تعذّر تحميل النموذج: {err}",
    "toast.noArabicVoice": "لا يوجد صوت عربي مثبت على هذا الجهاز — سيُستخدم الصوت الافتراضي.",
    "toast.langSwitched": "تم التحويل إلى العربية",
    "hint.clickVideo": "انقر على الفيديو لعرضه بملء الشاشة",
    "hint.exitVideo": "انقر مرة أخرى للعودة إلى الواجهة",
    "lightbox.close": "إغلاق",
    "lightbox.incident": "حادثة مسجّلة",

    "setup.note.cameraBlocked": "لم نتمكن من الوصول إلى الكاميرا. على الشبكة المحلية يجب فتح الصفحة عبر HTTPS، وعلى المتصفح السماح بالكاميرا.",
    "setup.note.noCamera": "لم يُعثر على كاميرا متاحة. في المتصفح اسمح بالوصول إلى الكاميرا، وتأكد من توصيل كاميرا IR عبر USB.",

    "voice.fall": "تحذير! رصد سقوط في قطاع الحجر الأسود. جارٍ تنبيه المسعفين.",
    "voice.resolved": "تم التأكد من وقوف المعتمر. أُلغي التنبيه.",

    "reason.lying": "مستلقٍ (الزاوية: {angle}°)",
    "reason.curled": "متكور على الأرض",
    "reason.collapsed": "منهار على الأرض",
    "reason.head": "الرأس منكفئ نحو الأرض",
    "reason.sim": "سقوط محاكى (عرض للجنة)",

    "serial.connected": "متصل على {port}",
    "serial.sim": "وضع محاكاة (بلا أردوينو)",
    "serial.connecting": "جارٍ الاتصال…",
    "serial.error": "تعذّر الاتصال: {err}",
    "serial.noport": "لم يُعثر على منفذ",
    "serial.agentOff": "لم يبدأ وكيل الأردوينو على اللابتوب (تشغيل_الموقع)",

    "selftest.standing": "شخص واقف لا يُصنَّف سقوطاً",
    "selftest.lying": "مستلقٍ يُصنَّف سقوطاً (Lying Flat)",
    "selftest.collapsed": "انهيار على الأرض يُصنَّف سقوطاً",
    "selftest.slumped": "الرأس منخفض يُصنَّف سقوطاً",
    "selftest.confirm": "ثلاث إطارات متتالية تُطلق الإنذار",
    "selftest.resolve": "وقوف 3.5 ثانية يُلغي الإنذار",
    "selftest.empty": "إطار بلا شخص لا يُطلق إنذاراً",
    "selftest.summary": "{passed}/{total} اختبارات ناجحة",
    "selftest.emptyFrame": "إطارات فارغة",
    "selftest.angle": "الزاوية {angle}°",
  },

  en: {
    "doc.title": "Smart Black Stone Guard — Pilgrim Safety Console",
    "brand.title": "Smart Black Stone Guard",
    "brand.sub": "WRO 2026 · FUTURE INNOVATORS · AL-ANDALUS TEAM",

    "chip.role": "Role",
    "chip.ai": "AI",
    "chip.arduino": "Arduino",
    "chip.cloud": "Cloud",
    "chip.fps": "FPS",
    "camera.switch": "Change camera",
    "camera.select": "Select camera",
    "chip.role.camera": "Camera + AI",
    "chip.role.view": "Display",
    "chip.ai.loading": "Loading",
    "chip.ai.idle": "Idle",
    "chip.ai.off": "Stopped",
    "chip.ai.remote": "Remote stream",
    "chip.serial.connecting": "Connecting",
    "chip.serial.sim": "Simulation",
    "chip.serial.nolib": "No library",
    "chip.serial.off": "Offline",
    "chip.serial.agentOff": "Agent off",
    "chip.cloud.ready": "Ready",
    "chip.cloud.connecting": "Connecting",
    "chip.cloud.offline": "Offline",
    "chip.cloud.sending": "Sending",
    "chip.cloud.sent": "Sent",
    "chip.cloud.failed": "Failed",
    "chip.cloud.resolved": "Resolved",

    "sidebar.title": "Bio-metrics",
    "metric.torso": "Torso angle",
    "metric.lying": "0° lying",
    "metric.standing": "90° upright",
    "metric.drop": "Drop speed",
    "metric.unit": "m/s",
    "metric.stability": "Stability",
    "metric.incidents": "Incidents",
    "metric.light": "Brightness",

    "lamp.idle": "Auto lamp: idle",
    "lamp.on": "Auto lamp: ON (brightness {level})",
    "lamp.off": "Auto lamp: OFF (brightness {level})",
    "lamp.onShort": "Auto lamp: ON",
    "lamp.offShort": "Auto lamp: OFF",

    "subjects.none": "No person in frame",
    "subjects.one": "One person in frame · live camera",
    "subjects.remote": "Person in frame (remote stream)",

    "rail.title": "Black box",
    "rail.empty": "No incidents recorded yet",
    "rail.incident": "Incident",

    "ctl.fullscreen": "Fullscreen",
    "ctl.hud": "HUD",
    "ctl.test": "Simulate fall",
    "ctl.lamp": "Test lamp",
    "ctl.voice": "Voice",
    "ctl.sidebar": "Metrics",
    "ctl.quit": "Stop",
    "btn.fullscreen": "Fullscreen (F)",
    "btn.hud": "Hide HUD (H)",
    "btn.settings": "Diagnostics & link",

    "alert.title": "EMERGENCY — fall confirmed",
    "recovery.label": "Pilgrim standing — auto cancel",

    "setup.title": "Start session",
    "setup.desc": "Choose a role, then start monitoring. Detection runs inside this browser; the stream travels between camera and display through the cloud — no tunnel and no shared network needed.",
    "setup.cameraRole.title": "Camera only",
    "setup.cameraRole.desc": "Runs the camera and the AI and streams to the others, with no interface — just a small “connected” badge in the corner.",
    "setup.viewRole.title": "Display only",
    "setup.viewRole.desc": "Receives the stream and alerts from the camera device and shows the full interface (e.g. an iPad).",
    "setup.bothRole.title": "Camera + display",
    "setup.bothRole.desc": "Full interface with the camera on the same device: metrics and alerts right here.",
    "solo.connected": "Connected",
    "solo.connecting": "Connecting…",
    "solo.waiting": "Waiting for display",
    "solo.offline": "Offline",
    "solo.monitoring": "Monitoring",
    "solo.hold": "Hold to stop",
    "setup.camera": "Camera on this device",
    "setup.defaultCamera": "Default camera",
    "setup.hint": "USB and IR cameras appear here as soon as they are plugged in.",
    "setup.start": "▶ Start camera",
    "setup.startView": "▶ Start display",
    "setup.startBoth": "▶ Start camera + interface",
    "setup.selftest": "Logic self-test",
    "setup.serial": "Arduino link (Bluetooth)",
    "setup.pairLabel": "Display code (6 digits)",
    "setup.pairHint": "Open the page on the other device, pick “Display only”, then type the code it shows here.",
    "share.title": "Links that work on any network",
    "share.camera": "Camera device link",
    "share.view": "Display link (iPad)",
    "share.note": "Open either link on the other device from any network — no shared IP needed.",
    "share.copied": "Link copied",
    "share.copyFailed": "Copy failed — copy the link manually",
    "share.localOnly": "You are on localhost, so this link will not open elsewhere. Run “نشر_عام” to get a public link.",
    "theme.toDark": "Dark mode",
    "theme.toLight": "Light mode",

    "waiting.title": "Waiting for the camera device…",
    "waiting.desc": "Open the page on the camera device and type the pairing code below into “Display code”.",
    "waiting.codeLabel": "Pairing code",
    "waiting.copy": "Copy code",
    "waiting.copied": "Pairing code copied",
    "waiting.codeHint": "The code is new for every session and works on any network — no shared wifi needed.",

    "pair.codeLabel": "The code you entered",
    "pair.pendingTitle": "Confirming the code…",
    "pair.pendingDesc": "Make sure the display is open with the same code. The camera starts automatically once it answers.",
    "pair.pendingNote": "The camera opens only after the display confirms.",
    "pair.failed": "The display did not confirm the code — type the right code or check that the display is running, then try again",
    "pair.opening": "Confirmed — opening the camera…",

    "drawer.title": "Diagnostics & link",
    "drawer.run": "Run self-test",
    "drawer.idle": "Not run yet.",
    "drawer.serialTitle": "Arduino port / HC-05 Bluetooth",
    "drawer.connect": "Connect",
    "drawer.refresh": "Refresh ports",
    "drawer.portsHint": "Pair the HC-05 in Windows first, then pick its port here.",
    "drawer.logTitle": "Last commands sent",
    "drawer.noLog": "No commands yet",
    "drawer.cloudTitle": "Cloud dashboard (tawaf.alk.sa)",
    "drawer.cloudCheck": "Check site",
    "drawer.cloudHint": "Every alert posts to /api/alert and is cleared with /api/resolve when the pilgrim stands.",
    "cloud.checking": "Checking the dashboard…",
    "cloud.safe": "Site: the Mataf is safe",
    "cloud.emergency": "Site: emergency alert active",
    "cloud.offline": "Unreachable: {err}",
    "cloud.disabled": "Cloud disabled (--no-cloud)",

    "status.idle": "Pick a role, then start",
    "status.opening": "Opening camera…",
    "status.loadingModel": "Loading the AI model…",
    "status.active": "Monitoring — show a person to the camera",
    "status.normal": "Normal — guard watching (torso {angle}°)",
    "status.noSubject": "No person in frame — still watching",
    "status.alarm": "🚨 Emergency: fall confirmed — {reason}",
    "status.recovering": "Pilgrim standing — auto cancel {pct}",
    "status.viewWait": "Connecting to the camera device…",
    "status.viewConnected": "Camera connected — waiting for the first frame",
    "status.pairPending": "Waiting for the display to confirm code {code}…",
    "status.viewLive": "Normal — receiving a live stream from the camera device",
    "status.stopped": "Monitoring stopped",
    "status.cameraFailed": "Could not open the camera",
    "status.modelFailed": "MediaPipe model failed to load",

    "toast.voiceOn": "🔊 Voice announcements enabled",
    "toast.voiceOff": "🔇 Voice announcements muted",
    "toast.sim": "▶ Simulating a fall for 3.8s, then recovery",
    "toast.lampTest": "💡 Lamp test running for 4s",
    "toast.viewerOnly": "Run this on the camera device",
    "toast.pairRequired": "Type the display code first (6 digits from the display device)",
    "toast.cloudOffline": "Cloud is offline right now — pairing resumes when the connection returns",
    "toast.snapshotSaved": "📸 Incident saved to the black box: {file}",
    "toast.snapshotError": "Could not save the snapshot: {err}",
    "toast.captureError": "Could not capture the frame: {err}",
    "toast.cameraError": "Could not open the camera: {err}",
    "toast.modelError": "Could not load the model: {err}",
    "toast.noArabicVoice": "No Arabic voice is installed — using the default voice.",
    "toast.langSwitched": "Switched to English",
    "hint.clickVideo": "Tap the video to open it full screen",
    "hint.exitVideo": "Tap again to return to the dashboard",
    "lightbox.close": "Close",
    "lightbox.incident": "Recorded incident",

    "setup.note.cameraBlocked": "Could not reach the camera. On a LAN the page must be opened over HTTPS, and the browser must allow camera access.",
    "setup.note.noCamera": "No camera found. Allow camera access in the browser and check that the IR camera is plugged in.",

    "voice.fall": "Warning! Emergency fall detected in the Black Stone sector. Alerting medical responders.",
    "voice.resolved": "Pilgrim standing confirmed. Incident resolved.",

    "reason.lying": "Lying flat (angle {angle}°)",
    "reason.curled": "Curled / fetal on the floor",
    "reason.collapsed": "Collapsed to the ground",
    "reason.head": "Head inverted / slumped",
    "reason.sim": "Simulated fall (judge demo)",

    "serial.connected": "Connected on {port}",
    "serial.sim": "Simulation (no Arduino)",
    "serial.connecting": "Connecting…",
    "serial.error": "Connection failed: {err}",
    "serial.noport": "No port found",
    "serial.agentOff": "Arduino agent not running on the laptop (تشغيل_الموقع)",

    "selftest.standing": "A standing person is not a fall",
    "selftest.lying": "Lying flat is classified as a fall",
    "selftest.collapsed": "Collapsed on the ground is a fall",
    "selftest.slumped": "Head below the hips is a fall",
    "selftest.confirm": "Three falling frames raise the alarm",
    "selftest.resolve": "3.5s of standing cancels the alarm",
    "selftest.empty": "An empty frame never raises an alarm",
    "selftest.summary": "{passed}/{total} checks passed",
    "selftest.emptyFrame": "empty landmarks",
    "selftest.angle": "angle {angle}°",
  },
};

let current = "ar";
const listeners = new Set();

function detectInitial() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  const stored = localStorage.getItem(STORAGE_KEY);
  const candidate = (fromUrl || stored || "ar").toLowerCase();
  return candidate === "en" ? "en" : "ar";
}

export function getLang() {
  return current;
}

export function isRtl() {
  return current === "ar";
}

export function t(key, vars) {
  const table = STRINGS[current] || STRINGS.ar;
  let value = table[key] ?? STRINGS.ar[key] ?? key;
  if (vars) {
    value = String(value).replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
    );
  }
  return value;
}

/** Fill every element that carries a data-i18n* attribute. */
export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
  document.title = t("doc.title");
  document.documentElement.lang = current;
  document.documentElement.dir = isRtl() ? "rtl" : "ltr";
  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langBtn === current);
  });
}

export function setLang(next) {
  const lang = next === "en" ? "en" : "ar";
  if (lang === current) return;
  current = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  applyStatic();
  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch (err) {
      console.warn("[i18n] listener failed", err);
    }
  });
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The detector works in English; show a localised label without touching it. */
export function translateReason(reason) {
  const text = String(reason || "");
  if (current === "ar") {
    const lying = /^Lying Flat \(Angle: (\d+) deg\)/.exec(text);
    if (lying) return t("reason.lying", { angle: lying[1] });
    if (text.startsWith("Curled")) return t("reason.curled");
    if (text.startsWith("Collapsed")) return t("reason.collapsed");
    if (text.startsWith("Head Inverted")) return t("reason.head");
    if (text.startsWith("Simulated")) return t("reason.sim");
  }
  return text;
}

export function voiceLine(kind) {
  return {
    text: t(kind === "resolved" ? "voice.resolved" : "voice.fall"),
    lang: current === "ar" ? "ar-SA" : "en-US",
  };
}

/** True when the platform has a speech voice for the current language. */
export function hasVoiceForCurrentLang() {
  if (!("speechSynthesis" in window)) return false;
  const voices = speechSynthesis.getVoices() || [];
  const prefix = current === "ar" ? "ar" : "en";
  return voices.some((v) => (v.lang || "").toLowerCase().startsWith(prefix));
}

current = detectInitial();

export { STRINGS };
