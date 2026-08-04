// المتغيرات العامة
let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let currentUser = null;
let editingVesselId = null;
let editingMaintenanceId = null;
let activityInterval = null;
let sessionId = null;

// متغيرات الرسوم البيانية
let chartCategory = null;
let chartDoughnut = null;
let dashChart = null;
let dashLineChart = null;

// متغيرات الخريطة
let userMap = null;
let userMarkers = [];
let mapInitialized = false;
let mapRetryCount = 0;
let mapRefreshInterval = null;

// متغيرات الصوت
let recognition = null;
let isListening = false;
let lastResponseText = '';

// متغيرات استيراد الملفات
let importedData = [];
let importedFileName = '';
let importedNotes = [];
let importedNotesFileName = '';
