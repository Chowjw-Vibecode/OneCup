import {isPreparation,isProfileSample,shotMeasurements,collapseProgress} from "./brew-timeline.js";
import {stageLabel} from "./stage-labels.js?v=0.2.30";
import {pendingInventoryIds,pendingInventoryCursor,rememberInventoryAttempt,rememberInventoryShot,forgetInventoryShot} from "./inventory-pending.js?v=0.2.30";
import {consumeSavedShot} from "./shot-inventory.js?v=0.2.30";
import {telemetryPath} from "./chart-path.js?v=0.2.30";
import {setGroupHeadHint} from "./ghc-icons.js?v=0.2.30";
import {mountProfileIntro} from "./profile-intro.js?v=0.2.30";
import {mountOnlineProfiles} from "./online-profiles.js?v=0.2.30";
import {mountCeramic} from "./ceramic-ui.js?v=0.2.30";
import {paintGauge,gaugeSpec} from "./instruments.js?v=0.2.30";
import { DecaidClient, selectedProfileContext, profileExecutionKey, resolveProfileIdentity, rebaseWorkflowDraft } from "./client.js?v=0.2.30";
import { createDisplayManager, DEFAULT_DISPLAY_PREFERENCES } from "./display.js?v=0.2.30";
import { createSkinUpdater } from "./update.js?v=0.2.30";
import { createUsageReporter } from "./usage.js?v=0.2.30";

const $ = (id) => document.getElementById(id);
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const num = (v) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v))
    ? null
    : Number(v);
const fmt = (v, digits = 1) =>
  num(v) === null
    ? "—"
    : Number(v)
        .toFixed(digits)
        .replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const enc = encodeURIComponent;
const store = {
  get(k, fallback) {
    try {
      return localStorage.getItem(`thiscup.${k}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`thiscup.${k}`, v);
    } catch {
      queueMicrotask(() => toast(t("preferencesNotSaved"), true));
    }
  },
};
const query = new URLSearchParams(location.search);
const DEFAULT_BASE = `http://${location.hostname || "127.0.0.1"}:8080`;
let client;
let displayManager;
let usageReporter;
let skinUpdater;
const SKIN_VERSION = "0.2.30";
const s = {
  language: store.get("language", "zh"),
  theme: store.get("theme", "light"),
  baseUrl: query.get("api") || store.get("baseUrl", DEFAULT_BASE),
  workflow: null,
  draft: null,
  profiles: [],
  favorites: [],
  history: [],
  selectedProfile: null,
  profileIdentity: null,
  selectedShot: null,
  lastShot: null,
  info: null,
  devices: [],
  connection: {
    connected: false,
    machineConnected: false,
    scaleConnected: false,
    stale: true,
  },
  snapshot: {},
  mode: "prepare",
  busy: false,
  stopPending: false,
  stopAwaiting: false,
  awaiting: null,
  trace: [],
  runWorkflow: null,
  runId: null,
  runOrigin: null,
  lastMachineTime: null,
  stopWeight: null,
  firstConnection: true,
  selectedKey: null,
  keyText: "",
  keyFresh: true,
  modal: null,
  focusBefore: null,
  chartPoints: [],
  chartBox: null,
  historySequence: 0,
  connectSequence: 0,
  error: "",
  favoriteOnly: false,
};
const strings = {
  zh: {
    brand: "这一杯",
    history: "历史",
    currentRecipe: "当前方案",
    chooseProfile: "换方案 ↗",
    dose: "粉量",
    yieldTarget: "目标出液",
    temperature: "冲煮温度",
    temperatureShort: "温度",
    applyDraft: "确认调整",
    discard: "恢复原值",
    saveAs: "另存方案",
    profileDetails: "曲线详情",
    lastShot: "上一杯",
    noHistory: "暂无记录",
    liveWeight: "实时杯重",
    pressure: "压力",
    machineFlow: "机器流量",
    scaleFlow: "杯中流速",
    liveTemperature: "实时温度",
    profileOverview: "方案预览",
    waitingData: "等待设备数据",
    tare: "秤清零",
    flush: "冲洗",
    steam: "蒸汽",
    hotwater: "热水",
    addHotWater: "加热水",
    waterTemperature: "水温",
    waterAmount: "出水量",
    moreSettings: "更多设置",
    applyHotWater: "应用参数",
    startHotWater: "开始加热水",
    hotWaterByWeight: "按杯重停止 · 开始时自动清零",
    hotWaterByVolume: "按机器计量",
    hotWaterPhysicalStart: "应用后，按冲煮头热水键开始。",
    hotWaterApplied: "热水参数已应用并读回",
    hotWaterModeChanged: "计量方式已更新，请确认出水量后再应用。",
    wake: "唤醒",
    sleep: "休眠",
    start: "开始萃取",
    stop: "停止",
    chooseProfileTitle: "换个方案",
    previewHint: "先看一眼，再应用",
    back: "返回",
    applyProfile: "应用此方案",
    draftOnly: "只修改草稿",
    clear: "清空",
    cancel: "取消",
    done: "完成",
    refresh: "刷新",
    save: "保存",
    profileName: "方案名称",
    settings: "设置",
    usageTitle: "匿名国家 / 地区统计",
    usageHelp: "发送随机编号和产品名称，由网络出口判断国家 / 地区；不含出杯记录、配方或设备编号。关闭后停止后续上报。",
    usageOn: "开启",
    usageOff: "关闭",
    updateTitle: "自动更新皮肤",
    updateHelp: "默认关闭。开启后，在空闲且没有未保存修改时安装同一发布频道的新版本。更新失败会提示，可能需要手动重装皮肤包；不清空方案、豆仓、记录或偏好。",
    updateDisabled: "已关闭自动更新",
    updateWaiting: "等待空闲，并保留未保存的修改",
    updateChecking: "正在检查新版本…",
    updateInstalling: "正在更新皮肤，请稍候；停止机器仍可使用",
    updateConfirming: "安装结果待核实，正在读取版本；请勿重复安装",
    updateReload: "新版已安装，等待空闲后刷新；关闭自动更新时不会自动刷新",
    updateCurrent: "当前没有适用的新版本",
    updateError: "本次更新未完成，当前页面保留，稍后再检查",
    updateUnsupported: "当前 Decaid 不支持或不允许自动安装，请在 Decaid 中手动安装皮肤。",
    updateStorageError: "存储不可用，不会开始新的自动安装。请恢复本地存储，重新打开页面后再次设置。",
    updatePreferenceUnsaved: "此开关选择未能保存，仅当前页面有效；恢复存储后需重新打开页面并再次设置。",
    usageUnsaved: "此选择未能保存，仅在当前页面有效。请恢复本地存储，重新打开页面后再次设置；重新打开时可能恢复原设置。",
    language: "语言",
    appearance: "外观",
    toggleTheme: "浅色 / 深色",
    serverAddress: "Decaid 地址",
    nativeSettings: "Decaid 设置 ↗",
    returnDashboard: "返回 Decaid 主界面",
    connect: "连接",
    connecting: "正在连接",
    connected: "已连接",
    disconnected: "连接中断",
    stale: "数据已过期",
    ready: "准备这一杯",
    running: "正在萃取",
    finished: "这一杯，完成",
    heating: "正在预热",
    machineSleeping: "机器休眠中",
    unknownState: "等待机器状态",
    applied: "已应用 · Decaid 已读回",
    saved: "方案已保存",
    dirty: "有未应用的调整",
    unchanged: "当前参数",
    readOnly: "运行中 · 参数只读",
    connectionLost: "连接中断，保留最后读数。请在机器端确认运行状态。",
    machineOffline: "咖啡机尚未连接，操作暂不可用。",
    scaleOffline: "秤未连接",
    scale: "蓝牙秤",
    grinder: "小方",
    target: "目标",
    ratio: "粉液比",
    stopReading: "停泵时",
    settledNotConfirmed: "余滴中 · 最终杯重未确认",
    liveTrace: "本杯实测",
    lastTrace: "上一杯实测",
    planned: "设定预览 · 阶段时长为上限，可能提前切段",
    recordedTrace: "本页接收的实时记录",
    profileSearch: "搜索方案",
    current: "当前",
    noProfiles: "没有匹配的方案",
    choosePreview: "选择左侧方案查看",
    profileNoLongerAvailable: "刚选的方案已被移除或隐藏，请重新选择。",
    steps: "段",
    coffeeSensor: "咖啡探头",
    waterSensor: "水温探头",
    pressureMode: "压力控制",
    flowMode: "流量控制",
    maxTime: "最长",
    exitWeight: "累计杯重",
    limit: "上限",
    notes: "原方案说明",
    waitingConfirm: "请求已发送，等待机器状态",
    acceptedStop: "停止请求已发送，等待机器停机",
    startFailed: "机器未进入萃取，请检查机器状态或冲煮头按键",
    busy: "正在处理",
    notReady: "机器尚未就绪",
    applyBeforeStart: "请先应用或还原本杯调整",
    error: "操作失败",
    loadError: "读取失败",
    retry: "重试",
    nameRequired: "请输入方案名称",
    duplicateName: "此名称已存在，请换个名称",
    newProfile: "副本",
    historyLoad: "正在读取历史",
    historySelect: "选择一杯查看记录",
    noMeasurements: "此记录没有测量数据",
    doseActual: "粉量",
    yieldActual: "记录杯重",
    duration: "记录时长",
    rating: "口感评分",
    ratingUnset: "未评分",
    tastingNotes: "这杯喝起来怎么样？",
    saveRating: "保存评价",
    ratingSaved: "评价已保存",
    score: "分",
    allProfiles: "全部方案",
    favorites: "常用方案",
    favorite: "收藏",
    unfavorite: "取消收藏",
    favoriteSaved: "常用方案已更新",
    noFavorites: "还没有常用方案，选中方案后点星标收藏",
    requestFailed: "请求失败，请重试",
    scaleTared: "清零指令已发送",
    partialReadback: "读回值与请求不同，草稿已保留。请先重新读取，再调整。",
    invalidValue: "请输入范围内的数值",
    range: "范围",
    settingsSaved: "设置已读回",
    workflowChanged: "机器上的配方已改变，请重新检查草稿",
    noConnection: "尚未连接 Decaid",
    version: "Decaid 版本",
    auxSettings: "冲洗、蒸汽与热水",
    durationSetting: "时长",
    flowSetting: "流量",
    volumeSetting: "水量",
    steamOff: "蒸汽加热关闭",
    steamTemperature: "蒸汽温度",
    stopAtTemp: "自动停止温度",
    finishedDetails: "查看本杯",
    compare: "与上一杯对照",
    clearCompare: "取消对照",
    compareCaption: "实线：选中记录 · 虚线：上一条记录",
    noCompare: "没有可对照的上一条记录",
    review: "查看",
    device: "设备",
    scan: "扫描",
    disconnect: "断开",
    scaleDialog: "连接蓝牙秤",
    scaleChoose: "选择已发现的秤",
    scaleConnecting: "正在连接秤",
    scaleDisconnecting: "正在断开秤",
    scanDone: "扫描请求已发送",
    noScale: "尚未发现蓝牙秤",
    scaleReady: "秤已连接",
    loading: "正在读取",
    auxOnly: "应用辅助参数",
    deviceControls: "设备",
    scaleSleep: "秤休眠",
    scaleWake: "秤唤醒",
    unknown: "未知",
    noProfile: "未选择方案",
    readback: "Decaid 配方读回",
    held: "已保留",
    errorRetry: "重试读取",
    readyHint: "按冲煮头按键或点击开始",
    heated: "待机",
    ending: "正在停止",
    refreshContext: "重新读取配方",
    noteSaved: "已保存",
    inputUnit: "数值",
    saveCurrent: "更新方案",
  },
  en: {
    brand: "This Cup",
    history: "History",
    currentRecipe: "CURRENT RECIPE",
    chooseProfile: "Change profile ↗",
    dose: "Dose",
    yieldTarget: "Target yield",
    temperature: "Temperature",
    temperatureShort: "Temperature",
    applyDraft: "Apply to this cup",
    discard: "Reset",
    saveAs: "Save as new",
    profileDetails: "Profile details",
    lastShot: "LAST SHOT",
    noHistory: "No shots yet",
    liveWeight: "LIVE WEIGHT",
    pressure: "Pressure",
    machineFlow: "Machine flow",
    scaleFlow: "Scale flow",
    liveTemperature: "TEMPERATURE",
    profileOverview: "Profile preview",
    waitingData: "Waiting for device data",
    tare: "Tare",
    flush: "Flush",
    steam: "Steam",
    hotwater: "Hot water",
    addHotWater: "Add hot water",
    waterTemperature: "Water temperature",
    waterAmount: "Amount",
    moreSettings: "More settings",
    applyHotWater: "Apply settings",
    startHotWater: "Start hot water",
    hotWaterByWeight: "Stop by weight · scale tares at start",
    hotWaterByVolume: "Machine-measured volume",
    hotWaterPhysicalStart: "Apply, then press the hot-water button on the group head.",
    hotWaterApplied: "Hot-water settings applied and read back",
    hotWaterModeChanged: "The measuring mode changed. Review the amount before applying.",
    wake: "Wake",
    sleep: "Sleep",
    start: "Start espresso",
    stop: "Stop",
    chooseProfileTitle: "Choose a profile",
    previewHint: "Preview, then apply",
    back: "Back",
    applyProfile: "Use this profile",
    draftOnly: "Changes stay in your draft",
    clear: "Clear",
    cancel: "Cancel",
    done: "Done",
    refresh: "Refresh",
    save: "Save",
    profileName: "Profile name",
    settings: "Settings",
    usageTitle: "Anonymous country / region statistics",
    usageHelp: "Sends a random ID and product name; the network exit determines the country / region. No shots, recipes or device IDs are sent. Turn off to stop future check-ins.",
    usageOn: "On",
    usageOff: "Off",
    updateTitle: "Automatic skin updates",
    updateHelp: "Off by default. Installs newer releases from the same channel only while idle with no unsaved edits. A failed update may require manual skin reinstallation. Profiles, beans, shots and preferences are not cleared.",
    updateDisabled: "Automatic updates are off",
    updateWaiting: "Waiting for idle with no unsaved edits",
    updateChecking: "Checking for updates…",
    updateInstalling: "Updating the skin. Please wait; machine Stop remains available",
    updateConfirming: "Verifying the installed version; do not repeat the installation",
    updateReload: "New version installed; waiting to reload while idle. Automatic reload stays off when updates are disabled",
    updateCurrent: "No applicable newer release",
    updateError: "Update did not complete. This page stays open; another check will run later",
    updateUnsupported: "This Decaid installation does not support or allow automatic installation. Install the skin manually in Decaid.",
    updateStorageError: "Storage is unavailable; no new automatic installation will start. Restore storage, reopen the page, then set it again.",
    updatePreferenceUnsaved: "This choice was not saved and applies only to this page. Restore storage, reopen the page, then set it again.",
    usageUnsaved: "This choice could not be saved and applies only to this page. Restore local storage access, reopen the page, then set it again. Reopening may restore the previous setting.",
    language: "Language",
    appearance: "Appearance",
    toggleTheme: "Light / Dark",
    serverAddress: "Decaid address",
    nativeSettings: "Decaid settings ↗",
    returnDashboard: "Back to Decaid dashboard",
    connect: "Connect",
    connecting: "Connecting",
    connected: "Connected",
    disconnected: "Disconnected",
    stale: "Readings are stale",
    ready: "Ready for this cup",
    running: "Extracting",
    finished: "This cup is ready",
    heating: "Preheating",
    machineSleeping: "Machine is asleep",
    unknownState: "Waiting for machine state",
    applied: "Applied · read back from Decaid",
    saved: "Profile saved",
    dirty: "Unapplied changes",
    unchanged: "Current settings",
    readOnly: "Extraction in progress · read only",
    connectionLost:
      "Connection lost. Last readings retained. Check the machine before continuing.",
    machineOffline:
      "The coffee machine is not connected. Controls are unavailable.",
    scaleOffline: "Scale disconnected",
    scale: "Scale",
    grinder: "CRYSTAL",
    target: "Target",
    ratio: "Ratio",
    stopReading: "At pump stop",
    settledNotConfirmed: "Dripping · final yield not confirmed",
    liveTrace: "This shot",
    lastTrace: "Previous shot",
    planned: "Setpoint preview · stages may end before their time limits",
    recordedTrace: "Live measurements received by this page",
    profileSearch: "Search profiles",
    current: "Current",
    noProfiles: "No matching profiles",
    choosePreview: "Select a profile to preview",
    profileNoLongerAvailable: "The selected profile was removed or hidden. Choose another profile.",
    steps: "stages",
    coffeeSensor: "Coffee sensor",
    waterSensor: "Water sensor",
    pressureMode: "Pressure control",
    flowMode: "Flow control",
    maxTime: "Up to",
    exitWeight: "Cumulative weight",
    limit: "limit",
    notes: "Profile notes",
    waitingConfirm: "Request sent · waiting for machine state",
    acceptedStop: "Stop requested · waiting for the machine",
    startFailed:
      "The machine did not start. Check its state or use the group-head button.",
    busy: "Working",
    notReady: "The machine is not ready",
    applyBeforeStart: "Apply or reset your changes first",
    error: "Action failed",
    loadError: "Could not load",
    retry: "Retry",
    nameRequired: "Enter a profile name",
    duplicateName: "That name is already in use",
    newProfile: "copy",
    historyLoad: "Loading shots",
    historySelect: "Select a shot to view its record",
    noMeasurements: "No measurements in this record",
    doseActual: "Dose",
    yieldActual: "Recorded yield",
    duration: "Recorded time",
    rating: "Enjoyment",
    ratingUnset: "Not rated",
    tastingNotes: "How did this cup taste?",
    saveRating: "Save notes",
    ratingSaved: "Notes saved",
    score: "/ 10",
    allProfiles: "All profiles",
    favorites: "Favorites",
    favorite: "Favorite",
    unfavorite: "Remove favorite",
    favoriteSaved: "Favorites updated",
    noFavorites: "Choose a profile and tap the star to add a favorite",
    requestFailed: "Request failed. Please try again.",
    scaleTared: "Tare requested",
    partialReadback: "Readback differs from your request. Your draft is retained. Reload before adjusting again.",
    invalidValue: "Enter a number within the range",
    range: "Range",
    settingsSaved: "Settings read back",
    workflowChanged: "The machine recipe has changed. Review your draft.",
    noConnection: "Not connected to Decaid",
    version: "Decaid version",
    auxSettings: "Flush, steam and hot water",
    durationSetting: "Duration",
    flowSetting: "Flow",
    volumeSetting: "Volume",
    steamOff: "Steam heater off",
    steamTemperature: "Steam temperature",
    stopAtTemp: "Stop temperature",
    finishedDetails: "View this shot",
    compare: "Compare previous shot",
    clearCompare: "Clear comparison",
    compareCaption: "Solid: selected shot · dashed: preceding shot",
    noCompare: "No preceding shot to compare",
    review: "View",
    device: "Device",
    scan: "Scan",
    disconnect: "Disconnect",
    scaleDialog: "Connect a scale",
    scaleChoose: "Choose a discovered scale",
    scaleConnecting: "Connecting scale",
    scaleDisconnecting: "Disconnecting scale",
    scanDone: "Scan requested",
    noScale: "No Bluetooth scales found yet",
    scaleReady: "Scale connected",
    loading: "Loading",
    auxOnly: "Apply auxiliary settings",
    deviceControls: "Devices",
    scaleSleep: "Sleep scale",
    scaleWake: "Wake scale",
    unknown: "Unknown",
    noProfile: "No profile selected",
    readback: "Recipe read back from Decaid",
    held: "Retained",
    errorRetry: "Try loading again",
    readyHint: "Use the group-head button or Start espresso",
    heated: "Idle",
    ending: "Stopping",
    refreshContext: "Reload recipe",
    noteSaved: "Saved",
    inputUnit: "Value",
    saveCurrent: "Update profile",
  },
};
Object.assign(strings.zh, {
  displayTitle:"显示",activeBrightness:"使用亮度",sleepBrightness:"待机亮度",displayRotation:"图片轮播",displayTenMinutes:"10 分钟",displayTwentyMinutes:"20 分钟",displayPictures:"待机图片 ↗",displaySave:"保存显示设置",displaySystem:"跟随系统",displayActual:"当前屏幕：",displayRequested:"请求：",displayBatteryCap:"低电量亮度限制中",displayReading:"正在读取屏幕状态",displayDraft:"尚未保存；拖动不会改变屏幕亮度",displayShared:"保存到平板；自动切换由平板内嵌页面执行。100 为跟随系统。",displaySaved:"显示设置已保存并读回",displaySavedApplied:"显示设置已保存；当前亮度已读回",displaySavedPending:"显示设置已保存；当前机器状态待确认",displayUnsupported:"当前平台不支持屏幕亮度控制",displayReadFailed:"显示设置读取失败，请重新打开设置重试",displaySaveFailed:"显示设置保存未确认，请重新读取",displaySaveMismatch:"保存读回不一致，草稿已保留",displayBrightnessUnconfirmed:"屏幕亮度未确认，请重新读取",displaySavedUnconfirmed:"显示设置已保存；屏幕亮度尚未确认",
});
Object.assign(strings.en, {
  displayTitle:"Display",activeBrightness:"Active brightness",sleepBrightness:"Standby brightness",displayRotation:"Slideshow",displayTenMinutes:"10 minutes",displayTwentyMinutes:"20 minutes",displayPictures:"Standby pictures ↗",displaySave:"Save display settings",displaySystem:"System managed",displayActual:"Current screen: ",displayRequested:"Requested: ",displayBatteryCap:"Low-battery brightness limit",displayReading:"Reading display state",displayDraft:"Unsaved; moving a slider does not change screen brightness",displayShared:"Saved on the tablet. Its embedded skin manages automatic changes. 100 follows the system.",displaySaved:"Display settings saved and read back",displaySavedApplied:"Display settings saved; current brightness read back",displaySavedPending:"Display settings saved; machine state is unconfirmed",displayUnsupported:"Screen brightness control is unavailable on this platform",displayReadFailed:"Could not read display settings. Reopen Settings to retry",displaySaveFailed:"Display settings were not confirmed. Read them again",displaySaveMismatch:"Saved settings differ from the request. Your draft is retained",displayBrightnessUnconfirmed:"Couldn’t read screen brightness. Tap Retry.",displaySavedUnconfirmed:"Display settings saved; screen brightness is unconfirmed",
});
const t = (k) => strings[s.language]?.[k] ?? strings.zh[k] ?? k;
const paramSpec = {
  dose: { label: "dose", min: 1, max: 100, step: 0.1, unit: "g" },
  target: { label: "yieldTarget", min: 0, max: 2000, step: 1, unit: "g" },
  temperature: {
    label: "temperature",
    min: 20,
    max: 100,
    step: 0.5,
    unit: "°C",
  },
};
const auxiliarySpecs = {
  "rinseData.targetTemperature": {
    label: "temperature",
    min: 20,
    max: 100,
    step: 1,
    unit: "°C",
  },
  "rinseData.duration": {
    label: "durationSetting",
    min: 1,
    max: 300,
    step: 1,
    unit: "s",
  },
  "rinseData.flow": {
    label: "flowSetting",
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "mL/s",
  },
  "hotWaterData.targetTemperature": {
    label: "temperature",
    min: 20,
    max: 100,
    step: 1,
    unit: "°C",
  },
  "hotWaterData.duration": {
    label: "durationSetting",
    min: 1,
    max: 300,
    step: 1,
    unit: "s",
  },
  "hotWaterData.volume": {
    label: "volumeSetting",
    min: 0,
    max: 2000,
    step: 1,
    unit: "mL",
  },
  "hotWaterData.flow": {
    label: "flowSetting",
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "mL/s",
  },
  "steamSettings.targetTemperature": {
    label: "steamTemperature",
    min: 135,
    max: 160,
    step: 1,
    unit: "°C",
  },
  "steamSettings.duration": {
    label: "durationSetting",
    min: 1,
    max: 300,
    step: 1,
    unit: "s",
  },
  "steamSettings.flow": {
    label: "flowSetting",
    min: 0.1,
    max: 3,
    step: 0.1,
    unit: "mL/s",
  },
  "steamSettings.stopAtTemperature": {
    label: "stopAtTemp",
    min: 0,
    max: 100,
    step: 1,
    unit: "°C",
  },
};
const profileOf = (p) => p?.profile ?? p;
const viewOf = (w) => ({
  name: w?.profile?.title || t("noProfile"),
  dose: num(w?.context?.targetDoseWeight),
  target: num(w?.context?.targetYield),
  temperature: num(w?.profile?.steps?.[0]?.temperature),
});
const dirty = () =>
  !!s.workflow && JSON.stringify(s.workflow) !== JSON.stringify(s.draft);
const hotWaterDirty = () =>
  !!s.hotWaterDraft &&
  JSON.stringify(s.hotWaterDraft) !== JSON.stringify(s.workflow?.hotWaterData);
const hotWaterUsesWeight = (settings = s.settings) =>
  settings?.stopHotWaterAtWeight === true &&
  s.connection.scaleConnected === true &&
  settings?.gatewayMode !== "full";
const hotWaterUnit = () => (hotWaterUsesWeight() ? "g" : "mL");
const parameterSpec = (key) => {
  const spec = paramSpec[key] ?? auxiliarySpecs[key];
  return key === "hotWaterData.volume" && spec
    ? { ...spec, unit: hotWaterUnit() }
    : spec;
};
const machineState = () =>
  String(s.snapshot.machine?.state?.state ?? "").toLowerCase();
const activeStates = new Set([
  "espresso",
  "steam",
  "hotwater",
  "hotwater_rinse",
  "rinse",
  "flush",
  "cleaning",
  "descaling",
  "calibration",
  "fwupgrade",
  "airpurge",
  "busy",
  "selftest",
  "steamrinse",
]);
const running = () =>
  activeStates.has(machineState()) ||
  ["preheating", "pouring", "stopping"].includes(s.snapshot.shotState?.state);
const connected = () =>
  !!(
    s.connection.connected &&
    s.connection.machineConnected &&
    !s.connection.stale
  );
const editable = () =>
  connected() && !!s.workflow && !running() && !s.busy && !s.awaiting && !s.skinUpdating;
const canStartFromScreen = () => s.machineInfo?.GHC === false;
const ready = () =>
  connected() &&
  machineState() === "idle" &&
  !running() &&
  !s.awaiting &&
  !s.busy &&
  !s.skinUpdating &&
  !(s.settings?.blockOnNoScale && !s.connection.scaleConnected);
const toast = (message, error = false) => {
  clearTimeout(toast.timer);
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  toast.timer = setTimeout(
    () => ($("toast").hidden = true),
    error ? 6500 : 2800,
  );
};
function status(message, error = false) {
  s.error = error ? message : "";
  $("actionStatus").textContent = message;
  $("actionStatus").classList.toggle("error", error);
}
function explainError(error) {
  if (error?.code) {
    const message = t(error.code);
    if (message !== error.code)
      return error.code === "apiRequestFailed" ? `${message} (${error.status})` : message;
  }
  if (s.language === "en" && /[\u3400-\u9fff]/u.test(error?.message || "")) return t("requestFailed");
  if (error instanceof TypeError) return t("apiNetworkError");
  return error?.message || t("requestFailed");
}
function localize() {
  document.documentElement.lang = s.language === "zh" ? "zh-CN" : "en";
  $("connectionButton").setAttribute("aria-label",s.language === "zh" ? "连接状态" : "Connection status");
  $("powerButton").setAttribute("aria-label",s.language === "zh" ? "休眠或唤醒" : "Sleep or wake");
  $("chart").setAttribute("aria-label",s.language === "zh" ? "压力、机器流量、咖啡温度、杯流及杯重曲线" : "Pressure, machine flow, coffee temperature, cup flow and weight chart");
  for (const [id,zh,en] of [["pressureGauge","压力","Pressure"],["flowGauge","机器流量","Machine flow"],["temperatureGauge","咖啡温度","Coffee temperature"]]) $(id).setAttribute("aria-label",s.language==='zh'?zh:en);
  document.querySelectorAll('[data-step]').forEach(button=>{
    const [key,direction]=button.dataset.step.split(':');
    button.setAttribute('aria-label',(Number(direction)<0?(s.language==='zh'?'减少':'Decrease '):(s.language==='zh'?'增加':'Increase '))+t(paramSpec[key]?.label||key));
  });
  document.querySelector('[data-key="delete"]')?.setAttribute('aria-label',s.language==='zh'?'退格':'Backspace');
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("languageButton").textContent = s.language === "zh" ? "EN" : "中";
  $("profileSearch").placeholder = t("profileSearch");
  $("profileSearch").setAttribute("aria-label", t("profileSearch"));
  $("themeButton").setAttribute("aria-label", t("toggleTheme"));
  $("settingsButton").setAttribute("aria-label", t("settings"));
  document.querySelectorAll("[data-close]").forEach((b) => {
    if (!b.dataset.i18n) b.setAttribute("aria-label", t("back"));
  });
  render();
  if (s.modal === "profileDialog") renderProfiles();
  if (s.modal === "settingsDialog") renderSettings();
}
function setTheme(theme) {
  s.theme = theme;
  store.set("theme", theme);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#171c1b" : "#f4f3ef";
  renderChart();
}
function toggleLanguage() {
  s.language = s.language === "zh" ? "en" : "zh";
  store.set("language", s.language);
  localize();
}
function openDialog(id) {
  if (s.modal === "scaleDialog" && id !== s.modal) s.scalePanelSequence = (s.scalePanelSequence ?? 0) + 1;
  s.focusBefore = document.activeElement;
  document
    .querySelectorAll(".overlay")
    .forEach((el) => (el.hidden = el.id !== id));
  s.modal = id;
  render();
  requestAnimationFrame(() =>
    $(id).querySelector("input,button:not(:disabled),textarea")?.focus(),
  );
}
function closeDialog() {
  const guard=document.createElement("div");guard.className="dismiss-guard";document.body.append(guard);setTimeout(()=>guard.remove(),350);
  s.customNumber=null;
  const returnTo = s.modal === "keypadDialog" ? s.keyReturn : null;
  window.ceramicUI?.beforeClose?.(s.modal);
  if (s.modal === "scaleDialog" && s.scaleBusy) toast(t("scaleConnectingBackground"));
  if (s.modal === "scaleDialog") s.scalePanelSequence = (s.scalePanelSequence ?? 0) + 1;
  if (s.modal === "hotWaterDialog") {
    s.hotWaterDraft = null;
    s.hotWaterSequence = (s.hotWaterSequence ?? 0) + 1;
  }
  if (s.modal) $(s.modal).hidden = true;
  s.modal = null;
  s.selectedKey = null;
  s.keyReturn = null;
  s.focusBefore?.focus?.();
  if (returnTo) {
    openDialog(returnTo);
    return;
  }
  render();
}
function markWorkflowConflict(workflow, reason = s.workflowConflictReason || "workflowConflictNotice") {
  s.externalWorkflow = clone(workflow);
  s.workflowConflict = true;
  s.workflowConflictReason = reason;
  status(t(reason), true);
  render();
}
function setWorkflow(workflow, { force = false, profileIdentity } = {}) {
  if (!workflow?.profile) return;
  if (!force && (s.ceramicDraftActive || dirty() || hotWaterDirty() || s.workflowConflict)) {
    if (
      s.workflowConflict ||
      JSON.stringify(workflow) !== JSON.stringify(s.workflow)
    ) {
      markWorkflowConflict(workflow);
    }
    return;
  }
  const unchangedProfile = JSON.stringify(workflow.profile) === JSON.stringify(s.workflow?.profile);
  // Distinguish a user-selected source from a catalog inference. Inferences must
  // be re-evaluated when a later library response introduces another match.
  const retainedExplicit = unchangedProfile && s.profileIdentity && s.profileIdentitySource === "explicit";
  s.profileIdentity = profileIdentity !== undefined ? profileIdentity
    : retainedExplicit ? s.profileIdentity : resolveProfileIdentity(workflow.profile, s.profiles);
  s.profileIdentitySource = profileIdentity !== undefined
    ? (profileIdentity ? "explicit" : null) : retainedExplicit ? "explicit" : "inferred";
  const binding=workflow.context?.extras?.thisCupProfileBinding;
  if(profileIdentity===undefined && binding && binding.execution===profileExecutionKey(workflow.profile) && s.profiles.some(e=>e.id===binding.id)){
    s.profileIdentity=binding.id;
    s.profileIdentitySource="binding";
  }
  s.workflowRevision = (s.workflowRevision ?? 0) + 1;
  s.workflow = clone(workflow);
  s.draft = clone(workflow);
  if (s.hotWaterDraft) s.hotWaterDraft = clone(workflow.hotWaterData);
  s.externalWorkflow = null;
  s.workflowConflict = false;
  s.workflowConflictReason = null;
  render();
}
let profileLibraryRequest = 0;
async function refreshProfileLibrary() {
  const sourceClient = client, request = ++profileLibraryRequest;
  const revision = s.workflowRevision ?? 0;
  const profiles = await sourceClient.get("/profiles?visibility=visible");
  if (sourceClient !== client || request !== profileLibraryRequest || revision !== (s.workflowRevision ?? 0)) return false;
  if (!Array.isArray(profiles)) throw new TypeError("Invalid profile library");
  s.profiles = profiles;
  if (s.modal === "profileDialog" && s.selectedProfile) {
    s.selectedProfile = profiles.find(e => e.id === s.selectedProfile.id && e.visibility !== "hidden") ?? null;
    s.selectedProfileUnavailable = !s.selectedProfile;
  }
  const binding=s.workflow?.context?.extras?.thisCupProfileBinding;
  if(s.profileIdentitySource==="explicit" && profiles.some(e=>e.id===s.profileIdentity)){
    // A confirmed selection wins over inherited context from the prior recipe.
  }else if(binding && binding.execution===profileExecutionKey(s.workflow?.profile) && profiles.some(e=>e.id===binding.id)){
    s.profileIdentity=binding.id;
    s.profileIdentitySource="binding";
  }else{
    s.profileIdentity=resolveProfileIdentity(s.workflow?.profile, profiles);
    s.profileIdentitySource="inferred";
  }
  render();
  return true;
}
let workflowPollTimer = null;
let workflowPollClosed = false;
async function pollWorkflow() {
  if (!workflowPollClosed) displayManager?.tick({settingsOpen:s.modal === "settingsDialog"});
  if (
    workflowPollClosed ||
    !client ||
    !s.workflow ||
    s.workflowPollInFlight ||
    s.busy ||
    s.awaiting
  )
    return;
  const sourceClient = client;
  const revision = s.workflowRevision ?? 0;
  s.workflowPollInFlight = true;
  try {
    const workflow = await sourceClient.get("/workflow");
    if (
      workflowPollClosed ||
      sourceClient !== client ||
      s.busy ||
      s.awaiting ||
      revision !== (s.workflowRevision ?? 0)
    )
      return;
    const needsLibrary = !s.profileIdentity || JSON.stringify(workflow.profile) !== JSON.stringify(s.workflow?.profile);
    if (s.workflowConflict || JSON.stringify(workflow) !== JSON.stringify(s.workflow)) {
      // Do not briefly bind an external profile using the previous catalog while
      // the fresh catalog is still loading. Publish its recipe immediately.
      setWorkflow(workflow, needsLibrary ? {profileIdentity:null} : {});
    }
    // Publish the verified workflow first; catalog latency must not delay it.
    if (needsLibrary) await refreshProfileLibrary().catch(() => {});
  } catch {
    // Keep the local draft. A failed read never implies that a remote recipe is unchanged.
  } finally {
    s.workflowPollInFlight = false;
  }
}
function startWorkflowPolling() {
  clearInterval(workflowPollTimer);
  workflowPollClosed = false;
  workflowPollTimer = setInterval(pollWorkflow, 2500);
}

function setParam(key, value) {
  if (!editable()) return;
  const spec = paramSpec[key] ?? auxiliarySpecs[key];
  if (!spec || !Number.isFinite(value) || value < spec.min || value > spec.max)
    throw new Error(t("invalidValue"));
  const w = clone(s.draft);
  if (key === "dose") {
    w.context = { ...w.context, targetDoseWeight: value };
  } else if (key === "target") {
    w.context = { ...w.context, targetYield: value };
    w.profile.target_weight = value;
  } else if (key === "temperature") {
    const original = num(w.profile.steps?.[0]?.temperature);
    if (original === null) throw new Error(t("loadError"));
    const delta = value - original;
    w.profile.steps = w.profile.steps.map((step) =>
      num(step.temperature) === null
        ? step
        : {
            ...step,
            temperature:
              Math.round((Number(step.temperature) + delta) * 100) / 100,
          },
    );
    if (
      w.profile.steps.some(
        (step) =>
          num(step.temperature) !== null &&
          (step.temperature < 20 || step.temperature > 100),
      )
    )
      throw new Error(t("invalidValue"));
  } else {
    const [group, field] = key.split(".");
    if (!w[group] || !(field in w[group])) throw new Error(t("loadError"));
    w[group][field] = value;
  }
  s.draft = w;
  render();
}
function getParam(key) {
  if (paramSpec[key]) return viewOf(s.draft)[key];
  const [group, field] = key.split(".");
  return num(s.draft?.[group]?.[field]);
}
function openKeypad(key) {
  if (!editable()) return;
  const spec = parameterSpec(key);
  const fromHotWater = s.modal === "hotWaterDialog";
  const value = fromHotWater
    ? num(s.hotWaterDraft?.[key.split(".")[1]])
    : getParam(key);
  if (!spec || value === null) return;
  s.selectedKey = key;
  s.keyText = String(value);
  s.keyFresh = true;
  s.keyReturn = fromHotWater
    ? "hotWaterDialog"
    : ["settingsDialog","ceramicAdjustDialog","ceramicSteamDialog"].includes(s.modal) ? s.modal : null;
  openDialog("keypadDialog");
  $("keypadTitle").textContent = t(spec.label);
  $("keypadUnit").textContent = spec.unit;
  $("keypadRange").textContent =
    `${t("range")} ${spec.min}–${spec.max} ${spec.unit}`;
  $("keypadError").textContent = "";
  renderKeypad();
}
function renderKeypad() {
  $("keypadValue").textContent = s.keyText || "—";
  const spec = parameterSpec(s.selectedKey);
  if (spec) {
    $("keypadUnit").textContent = spec.unit;
    $("keypadRange").textContent =
      `${t("range")} ${spec.min}–${spec.max} ${spec.unit}`;
  }
  const value = num(s.keyText);
  $("keypadDone").disabled =
    !spec ||
    value === null ||
    value < spec.min ||
    value > spec.max ||
    !editable();
}
function keypadInput(key) {
  if (key === "delete") {
    s.keyText = s.keyFresh ? "" : s.keyText.slice(0, -1);
    s.keyFresh = false;
  } else if (key === ".") {
    if (s.keyFresh) s.keyText = "0";
    if (!s.keyText.includes(".")) s.keyText = (s.keyText || "0") + ".";
    s.keyFresh = false;
  } else if (/^\d$/.test(key)) {
    if (s.keyFresh) {
      s.keyText = key;
      s.keyFresh = false;
    } else if (s.keyText.length < 7) {
      s.keyText = s.keyText === "0" ? key : s.keyText + key;
    }
  }
  renderKeypad();
}
async function withWrite(fn, success) {
  if (!editable()) return false;
  s.busy = true;
  s.workflowRevision = (s.workflowRevision ?? 0) + 1;
  render();
  try {
    await fn();
    if (success) {
      status(success);
      toast(success);
    }
    return true;
  } catch (error) {
    if (["partialReadback", "apiWorkflowSuperseded", "apiWorkflowConflict"].includes(error?.code))
      markWorkflowConflict(error.details?.readback, error.code);
    status(explainError(error), true);
    toast(explainError(error), true);
    return false;
  } finally {
    s.busy = false;
    render();
  }
}
async function applyDraft() {
  if (!dirty()) return;
  if (s.workflowConflict) {
    status(t(s.workflowConflictReason || "workflowConflictNotice"), true);
    return;
  }
  const requested = clone(s.draft);
  const expected = clone(s.workflow);
  const sourceProfileId = s.profileIdentity;
  requested.context={...requested.context,extras:{...requested.context?.extras,thisCupProfileBinding:sourceProfileId?{id:sourceProfileId,execution:profileExecutionKey(requested.profile)}:null}};
  const applied = await withWrite(async () => {
    const current = await client.get("/workflow");
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      markWorkflowConflict(current);
      throw new Error(t("workflowConflictNotice"));
    }
    let read;
    try {
      read = await client.saveWorkflow(requested, expected);
    } catch (error) {
      if (error?.code === "workflowConflictNotice") {
        s.workflowConflict = true;
        try {
          markWorkflowConflict(await client.get("/workflow"));
        } catch {
          render();
        }
        throw new Error(t("workflowConflictNotice"));
      }
      throw error;
    }
    setWorkflow(read, { force: true, profileIdentity: sourceProfileId });
  }, t("applied"));
  if(applied) window.ceramicUI?.draftApplied?.();
}
async function resetDraft() {
  if (!editable()) return;
  await withWrite(async () => {
    const current = await client.get("/workflow");
    if (!current?.profile) throw new Error(t("loadError"));
    setWorkflow(current, { force: true });
  }, t("workflowReloaded"));
}

async function sendCommand(action) {
  if (action === "stop") {
    // Firmware uploads have their own native cancellation lifecycle.
    if (machineState() === "fwupgrade") {
      toast(s.language === "zh" ? "请在 Decaid 固件页面管理更新" : "Manage the update in Decaid’s firmware screen.");
      return;
    }
    if (s.stopPending) return;
    const stopClient = client;
    const stopSequence = s.connectSequence;
    const currentStop = () => client === stopClient && s.connectSequence === stopSequence;
    s.stopPending = true;
    s.awaiting = null;
    render();
    try {
      await stopClient.command("stop");
      if (!currentStop()) return;
      s.stopAwaiting = !(connected() && machineState() === "idle");
      status(
        t(
          s.stopAwaiting ? "acceptedStop" : "stopped",
        ),
      );
    } catch (error) {
      if (!currentStop()) return;
      s.stopAwaiting = false;
      status(explainError(error), true);
      toast(explainError(error), true);
    } finally {
      setTimeout(() => {
        if (!currentStop()) return;
        s.stopPending = false;
        render();
      }, 700);
    }
    return;
  }
  if (s.skinUpdating) { toast(t("updateInstalling")); return; }
  if (!connected()) {
    toast(t("noConnection"), true);
    return;
  }
  if (s.awaiting || s.busy || running()) return;
  if (
    ["espresso", "flush", "steam", "hotwater"].includes(action) &&
    !canStartFromScreen()
  ) {
    toast(t("physicalStart"));
    return;
  }
  if (action === "espresso" && dirty()) {
    toast(t("applyBeforeStart"), true);
    return;
  }
  if (action === "espresso" && !ready()) {
    toast(t("notReady"), true);
    return;
  }
  if (
    ["flush", "steam", "hotwater"].includes(action) &&
    machineState() !== "idle"
  ) {
    toast(t("notReady"), true);
    return;
  }
  s.awaiting = { action, at: Date.now() };
  s.stopAwaiting = false;
  status(t("waitingConfirm"));
  render();
  try {
    await client.command(action);
    setTimeout(() => {
      if (s.awaiting?.action === action) {
        s.awaiting = null;
        status(
          action === "espresso" ? t("startFailed") : t("waitingConfirm"),
          true,
        );
        render();
      }
    }, 9000);
  } catch (error) {
    s.awaiting = null;
    status(explainError(error), true);
    toast(explainError(error), true);
    render();
  }
}
function commandConfirmed() {
  if (s.stopAwaiting && connected() && machineState() === "idle") {
    s.stopAwaiting = false;
    status(t("stopped"));
  }
  if (!s.awaiting) return;
  const state = machineState();
  const action = s.awaiting.action;
  const matched =
    action === "wake"
      ? state === "idle"
      : action === "sleep"
        ? state === "sleeping"
        : action === "flush"
          ? ["hotwater_rinse", "rinse", "flush"].includes(state)
          : state === action;
  if (matched) {
    s.awaiting = null;
    status("");
  }
}
function sampleOf(snapshot, origin) {
  const m = snapshot?.machine;
  if (!m) return null;
  const timestamp = Date.parse(m.timestamp);
  if (!Number.isFinite(timestamp)) return null;
  return {
    time: (timestamp - origin) / 1000,
    pressure: num(m.pressure),
    flow: num(m.flow),
    temperature: num(m.groupTemperature),
    scaleFlow: num(snapshot.scale?.weightFlow),
    weight: num(snapshot.scale?.weight),
    targetPressure: num(m.targetPressure),
    targetFlow: num(m.targetFlow),
    targetTemperature: num(m.targetGroupTemperature),
    timestamp,
    preparation: isPreparation(m),
    frame: num(m.profileFrame),
  };
}
// Scale and machine snapshots arrive independently. Never stamp a newer
// scale reading onto an older machine point. Keep a small timestamped buffer.
function alignedScale(scale, machineTime) {
  const timestamp = Date.parse(scale?.timestamp);
  s.scaleSamples ??= [];
  if (Number.isFinite(timestamp)) {
    const index = s.scaleSamples.findIndex(item => item.timestamp === timestamp);
    const item = { timestamp, scale: { ...scale } };
    if (index >= 0) s.scaleSamples[index] = item;
    else s.scaleSamples.push(item);
    s.scaleSamples.sort((a,b) => a.timestamp-b.timestamp);
    if (s.scaleSamples.length > 128) s.scaleSamples.splice(0, s.scaleSamples.length-128);
  }
  if (s.connection.scaleStale) return null;
  const sample = s.scaleSamples.findLast(item => item.timestamp <= machineTime);
  return sample && machineTime-sample.timestamp <= 5000 ? sample.scale : null;
}
let lastRunDraftAt = 0;
function persistRunDraft(force = false) {
  if (!s.runId || (!force && Date.now()-lastRunDraftAt < 2000)) return;
  lastRunDraftAt = Date.now();
  try { sessionStorage.setItem('thiscup.run', JSON.stringify({base:s.baseUrl,id:s.runId,origin:s.runOrigin,originKnown:s.runOriginKnown,trace:s.trace})); } catch {}
}
function onSnapshot(snapshot) {
  const incomingTime = Date.parse(snapshot.machine?.timestamp);
  const acceptedTime = Date.parse(s.snapshot.machine?.timestamp);
  if (Number.isFinite(incomingTime) && Number.isFinite(acceptedTime) && incomingTime < acceptedTime) return;
  const previousState = machineState();
  const scaleForPoint = alignedScale(snapshot.scale, incomingTime);
  s.snapshot = { ...s.snapshot, ...snapshot };
  displayManager?.machineChanged();
  if (snapshot.deviceError?.kind === "scaleConnectFailed") {
    const owner = client;
    const id = snapshot.deviceError.deviceId;
    // Only the tablet controlling this machine initiates background recovery.
    owner.recoverPreferredScale(snapshot.deviceError, () =>
      owner === client && canReturnToDashboard() && window.__DECENT_HOST__?.platform === "android" &&
      document.visibilityState !== "hidden" && connected() && machineState() === "idle" &&
      !running() && !s.awaiting && !s.scaleBusy && !owner.connection.scaleConnected &&
      owner.manuallyDisconnectedScale !== id);
  }
  if (Array.isArray(snapshot.devices)) {
    const grinders = snapshot.devices.filter((device) => device.type === "grinder");
    const signature = JSON.stringify(grinders
      .map(({id, state, available}) => [id, state, available]).sort());
    const changed = s.grinderDeviceSignature !== signature && (s.grinderDeviceSignature !== undefined || grinders.length > 0);
    s.grinderDeviceSignature = signature;
    if (changed) client?.grinder.refreshObservation?.().catch(() => {});
  }
  const m = s.snapshot.machine;
  if (m) {
    const state = machineState();
    const ts = Date.parse(m.timestamp);
    const espresso = state === "espresso";
    if (state !== previousState && activeStates.has(state)) {
      window.ceramicUI?.operationStarted(state);
      if (s.modal && !(state === "steam" && s.modal === "ceramicSteamDialog")) {
        // A physical start must reveal the live controls, not reopen the
        // editor underneath a numeric keypad.
        s.keyReturn = null;
        closeDialog();
      }
    }
    if (espresso && previousState !== "espresso") {
      s.restoredRunId = null;
      s.runGeneration = (s.runGeneration ?? 0) + 1;
      s.loadingFinishedId = null;
      s.loadedFinishedId = null;
      s.finishedReadFailure = null;
      s.mode = "running";
      s.trace = [];
      s.preheatTrace = []; s.preparing = isPreparation(m); s.collapseStarted = null;
      s.runOrigin = Number.isFinite(ts) ? ts : null;
      s.runOriginKnown = !!previousState && !s.connection.stale;
      s.runWorkflow = clone(s.workflow);
      s.stopWeight = null;
      s.lastMachineTime = null;
      s.runId = s.snapshot.shotState?.state !== "finished" ? s.snapshot.shotState?.shotId ?? null : null;
      try {
        const saved = JSON.parse(sessionStorage.getItem('thiscup.run') || 'null');
        if (saved?.base === s.baseUrl && saved.id && saved.id === s.runId && saved.origin <= ts) {
          s.runOrigin = saved.origin;
          s.runOriginKnown = saved.originKnown === true;
          s.trace = saved.trace || [];
        }
      } catch {}
    }
    if (espresso && s.snapshot.shotState?.shotId && s.snapshot.shotState.state !== 'finished') {
      const id = s.snapshot.shotState.shotId;
      if(s.runId !== id || !s.restoredRunId) {
        try {
          const saved=JSON.parse(sessionStorage.getItem('thiscup.run')||'null');
          if(saved?.base===s.baseUrl&&saved.id===id&&saved.origin<=ts&&saved.trace?.at(-1)?.timestamp<=ts){
            s.runOrigin=saved.origin;s.runOriginKnown=saved.originKnown===true;s.trace=saved.trace;
          }
        } catch {}
        s.restoredRunId=id;s.runId=id;
      }
    }
    if (espresso && s.runOrigin !== null) {
      if (isProfileSample(m) && s.trace.some(p=>p.preparation)) {
        s.preheatTrace = s.trace.filter(p=>p.preparation);
        s.preheatChartBox = s.chartBox;
        s.trace = []; s.runOrigin = ts; s.runOriginKnown = true;
        s.collapseStarted = performance.now();
        persistRunDraft(true);
      }
      s.preparing = isPreparation(m);
      const point = sampleOf(
        {
          ...s.snapshot,
          scale: scaleForPoint,
        },
        s.runOrigin,
      );
      if (point && point.time >= 0) {
        if (s.trace.at(-1)?.timestamp === ts) s.trace[s.trace.length - 1] = point;
        else s.trace.push(point);
        if (s.trace.length > 10000) s.trace.splice(0, 100);
        s.lastMachineTime = ts;
        persistRunDraft();
      }
    }
    if (!espresso && (previousState === "espresso" || s.mode === "running") && ["idle", "sleeping", "needswater"].includes(state)) {
      s.mode = "finished";
      s.stopWeight = s.connection.scaleStale ? null : num(s.snapshot.scale?.weight);
      persistRunDraft(true);
      // A stale finished event may still describe the preceding cup.
      s.runId = s.runId ?? (s.snapshot.shotState?.state !== "finished" ? s.snapshot.shotState?.shotId : null);
      if (s.runId) loadFinishedShot(s.runId);
      else refreshHistory(false);
    }
    if (espresso) { s.mode = "running"; if (s.snapshot.shotState?.shotId && s.snapshot.shotState.state !== "finished") s.runId = s.snapshot.shotState.shotId; }
    commandConfirmed();
  }
  if (
    s.snapshot.shotState?.state === "finished" &&
    s.snapshot.shotState.shotId === s.runId &&
    s.mode === "finished" &&
    s.loadedFinishedId !== s.snapshot.shotState.shotId
  )
    loadFinishedShot(s.snapshot.shotState.shotId);
  scheduleRender();
}
async function loadFinishedShot(id, { retry = false } = {}) {
  const phase = s.snapshot?.shotState?.shotId === id && s.snapshot.shotState.state === "finished" ? "finished" : "stopping";
  const failure = s.finishedReadFailure;
  if (!id || s.runId !== id) return;
  // The finished notification can arrive while an earlier stopping read is
  // still in flight. Persist its ID before the in-flight/history guards.
  if (phase === "finished" && s.runWorkflow?.context?.extras?.thisCupBeanId) {
    const prior=s.finishedInventoryQueue;
    const same=prior?.id===id && prior.client===client && prior.generation===s.runGeneration;
    if (!same || prior.status!=='done') {
      try {
        rememberInventoryShot(client,id);
        s.finishedInventoryQueue={id,client,generation:s.runGeneration,status:'done'};
      } catch {
        if (!same || prior.status!=='error') toast(s.language === 'zh' ? '本杯待补记信息未保存，请保留此页并重试' : 'Could not save the pending cup. Keep this page open and retry.', true);
        s.finishedInventoryQueue={id,client,generation:s.runGeneration,status:'error'};
      }
    }
  }
  if (s.loadingFinishedId === id || s.loadedFinishedId === id ||
      (!retry && failure?.id === id && failure.generation === s.runGeneration && failure.client === client && failure.phase === phase)) return;
  s.loadingFinishedId = id;
  const generation = s.runGeneration, sourceClient = client;
  const current = () => generation === s.runGeneration && sourceClient === client && s.runId === id;
  // Stopping precedes persistence. A later finished event gets its own bounded
  // window, including time for the history writer to commit after that event.
  const waits = phase === "finished" ? [500, 1000, 2000, 3000, 5000] : [500, 1000, 1500];
  try {
    let shot;
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      if (!current()) return;
      try {
        shot = await sourceClient.shot(id);
        if (shot?.id === id) break;
        throw new Error("History returned a different shot");
      } catch (error) {
        if (attempt === waits.length) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, waits[attempt]));
    }
    if (shot?.id === id && current() && s.mode !== "running") {
      s.loadedFinishedId = id;
      s.finishedReadFailure = null;
      s.lastShot = shot;
      if (shot.measurements?.length) s.trace = pointsOf(shot);
      if (shot.workflow) s.runWorkflow = clone(shot.workflow);
      status("");
      render();
      void syncFinishedInventory(shot, sourceClient);
      await refreshHistory(false);
    }
  } catch (error) {
    if (current()) {
      s.finishedReadFailure = {id, generation, client:sourceClient, phase};
      status(error.status === 404 ? (s.language === 'zh' ? '本次尚无历史记录，实时曲线已保留' : 'No saved shot is available. The live trace is retained.') : `${t("history")}: ${explainError(error)}`, true);
    }
  } finally {
    if (current() && s.loadingFinishedId === id) {
      s.loadingFinishedId = null;
      // A finished event can arrive while the stopping read is still pending.
      if (phase === "stopping" && s.loadedFinishedId !== id &&
          s.snapshot?.shotState?.shotId === id && s.snapshot.shotState.state === "finished") loadFinishedShot(id);
    }
    render();
  }
}

async function syncFinishedInventory(shot, sourceClient=client) {
  if (!shot?.workflow?.context?.extras?.thisCupBeanId) return;
  const prior=s.inventorySync;
  if (prior?.id===shot.id && prior.client===sourceClient && ['pending','done'].includes(prior.status)) return;
  const sync={id:shot.id,client:sourceClient,status:'pending'};
  s.inventorySync=sync;
  const visible=()=>s.inventorySync===sync&&sourceClient===client&&s.runId===shot.id;
  try {
    rememberInventoryShot(sourceClient,shot.id);
    const result=await consumeSavedShot(sourceClient,shot);
    forgetInventoryShot(sourceClient,shot.id);
    sync.status='done';
    if(visible()&&result?.needsCalibration) toast(s.language==='zh'?'豆子消耗已记录，剩余库存需要称重校准':'Coffee use recorded. Weigh the remaining beans to check inventory.',true);
  } catch(error) {
    sync.status='error';
    if(visible()) toast(s.language==='zh'?'豆仓扣重未确认，可在品鉴页重试':'Inventory update not confirmed. Retry from the tasting page.',true);
  } finally {if(visible()) render();}
}

function onConnection(connection) {
  const wasHealthy=connected();
  s.connection = { ...s.connection, ...connection };
  displayManager?.machineChanged();
  document.body.classList.toggle("is-stale", !connected());
  if(!wasHealthy&&connected()) void recoverPendingInventory(client);
  scheduleRender();
}
const inventoryRecoveries=new WeakSet();
async function recoverPendingInventory(sourceClient) {
  if(!sourceClient||inventoryRecoveries.has(sourceClient))return;
  inventoryRecoveries.add(sourceClient);
  let failures=0;
  try {
    const ids=pendingInventoryIds(sourceClient);
    // Only explicitly observed completed cups enter this queue. Never scan or
    // deduct arbitrary historical shots. A reconnect performs one bounded pass.
    const previous=ids.indexOf(pendingInventoryCursor(sourceClient));
    const ordered=previous<0?ids:[...ids.slice(previous+1),...ids.slice(0,previous+1)];
    for(const id of ordered.slice(0,50)) {
      if(sourceClient!==client)break;
      // Advance after failures too, so an unavailable prefix cannot starve
      // later completed cups on subsequent reconnects.
      rememberInventoryAttempt(sourceClient,id);
      try {
        const shot=await sourceClient.shot(id);
        if(shot?.id!==id||!shot.workflow?.context?.extras?.thisCupBeanId)throw Error('Invalid queued shot');
        await consumeSavedShot(sourceClient,shot);
        forgetInventoryShot(sourceClient,id);
        if(s.inventorySync?.client===sourceClient&&s.inventorySync.id===id)s.inventorySync.status='done';
      } catch {failures++;}
    }
    if(ids.length>50)failures+=ids.length-50;
  } catch {failures++;}
  finally {
    inventoryRecoveries.delete(sourceClient);
    if(sourceClient===client){
      if(failures)toast(s.language==='zh'?'还有豆子消耗待补记，连接恢复后会重试':'Some coffee use is still pending and will retry after reconnection.',true);
      render();
    }
  }
}

async function connect(base) {
  let origin;
  try {
    const url = new URL(base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      throw new Error(t("invalidAddress"));
    origin = url.origin;
  } catch {
    $("settingsError").textContent = t("invalidAddress");
    return;
  }
  const sameAddress = origin === s.baseUrl;
  if (!sameAddress && (dirty() || hotWaterDirty() || s.workflowConflict)) {
    $("settingsError").textContent = t("draftBeforeAddressChange");
    return;
  }
  if (s.busy || s.awaiting) return;
  $("settingsError").textContent = "";
  const sequence = ++s.connectSequence;
  s.stopPending = false;
  s.stopAwaiting = false;
  displayManager?.stop();
  s.grinderSubscription?.();
  window.thisCupGrinderPanel?.closeProtection();
  s.grinderObserverStop?.();
  client?.close();
  s.historySequence++;
  s.runGeneration = (s.runGeneration ?? 0) + 1;
  s.snapshot = {};
  if (!sameAddress) {
    s.trace=[];s.runId=null;s.runWorkflow=null;s.lastShot=null;s.selectedShot=null;
    s.history=[];s.comparison=null;s.mode='prepare';s.lastMachineTime=null;
    s.loadedFinishedId=null;s.loadingFinishedId=null;s.finishedReadFailure=null;
  }
  s.scaleSamples = [];
  s.connection = {
    connected: false,
    machineConnected: false,
    scaleConnected: false,
    stale: true,
  };
  render();
  try {
    s.baseUrl = origin;
    client = new DecaidClient(s.baseUrl);
    const displayClient = client;
    if (!sameAddress) { s.displayDraft = null; s.displayDirty = false; }
    displayManager = createDisplayManager({
      client:displayClient,
      isController:()=>canReturnToDashboard() && window.__DECENT_HOST__?.platform === "android" && document.visibilityState !== "hidden",
      getMachineState:()=>s.connection.machineConnected && !s.connection.stale ? machineState() : null,
      onChange:state=>{
        if (client !== displayClient) return;
        const previous = s.displaySettings?.preferences?.rotationMinutes ?? 20;
        s.displaySettings = state;
        if (!s.displayDirty) s.displayDraft = clone(state.preferences);
        if (previous !== state.preferences.rotationMinutes && machineState() === "sleeping" && !$("ambientScreen")?.hidden) scheduleAmbientRotation();
        if (s.modal === "settingsDialog") renderDisplaySettings();
      },
    });
    s.displaySettings = displayManager.state;
    if (s.modal === "settingsDialog") renderDisplaySettings();
    displayManager.refresh();
    s.grinderDeviceSignature = undefined;
    if (!sameAddress) s.grinderOperationPending = false;
    s.grinderSubscription = client.grinder.subscribe(() => renderDevicesAndAmbient());
    s.grinderObserverStop = client.grinder.observe();
    const subscribedClient = client;
    client.subscribe(snapshot => { if (client === subscribedClient) onSnapshot(snapshot); },
      connection => { if (client === subscribedClient) onConnection(connection); });
    const context = await client.loadContext();
    if (sequence !== s.connectSequence) return;
    s.info = context.info;
    s.settings = context.settings ?? {};
    usageReporter?.refresh();
    skinUpdater?.refresh();
    s.machineInfo = context.machineInfo ?? null;
    s.devices = Array.isArray(context.devices) ? context.devices : [];
    s.profiles = Array.isArray(context.profiles) ? context.profiles : [];
    if (!sameAddress) s.profileIdentity = null;
    setWorkflow(context.workflow, { force: !sameAddress });
    store.set("baseUrl", s.baseUrl);
    if (!s.workflowConflict) status("");
    await Promise.allSettled([loadFavorites(), refreshHistory(false)]);
    render();
    return true;
  } catch (error) {
    if (sequence !== s.connectSequence) return;
    status(explainError(error), true);
    $("settingsError").textContent = explainError(error);
    render();
  }
}
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; render(); });
}
function render() {
  const current = viewOf(s.draft),
    base = viewOf(s.workflow),
    m = s.snapshot.machine ?? {},
    scale = s.snapshot.scale ?? {},
    state = machineState(),
    isRunning = running(),
    canEdit = editable();
  $("recipeName").textContent = current.name;
  $("recipeName").title = current.name;
  const coffee = s.draft?.context?.coffeeName;
  $("beanInfo").hidden = !coffee;
  $("beanInfo").textContent = [
    coffee,
    s.draft?.context?.coffeeRoaster,
    s.draft?.context?.grinderModel,
  ]
    .filter(Boolean)
    .join(" · ");
  for (const key of ["dose", "target", "temperature"]) {
    $(`${key}Value`).textContent = Number.isFinite(current[key]) ? current[key].toFixed(1) : "—";
    const element = document
      .querySelector(`[data-edit="${key}"]`)
      .closest(".parameter");
    element.classList.toggle("dirty", current[key] !== base[key]);
  }
  document
    .querySelectorAll("[data-edit],[data-step]")
    .forEach(
      (b) =>
        (b.disabled =
          !canEdit ||
          getParam(b.dataset.edit ?? b.dataset.step.split(":")[0]) === null),
    );
  $("applyDraft").disabled = !canEdit || !dirty() || !!s.workflowConflict;
  $("resetDraft").disabled = !canEdit || (!dirty() && !s.workflowConflict);
  $("resetDraft").textContent = t(
    s.workflowConflict ? "reloadRecipe" : "discard",
  );
  if ($("applyAux"))
    $("applyAux").disabled = !canEdit || !dirty() || !!s.workflowConflict;
  $("saveProfile").disabled = !canEdit;
  $("draftStatus").textContent = isRunning
    ? t("readOnly")
    : s.busy
      ? t("busy")
      : s.workflowConflict
        ? t(s.workflowConflictReason && s.workflowConflictReason !== "workflowConflictNotice" ? "readbackUnconfirmed" : "workflowConflict")
        : dirty()
          ? t("dirty")
          : s.workflow
            ? t("unchanged")
            : t("waitingData");
  $("draftStatus").classList.toggle("dirty", dirty());
  $("chooseProfile").disabled = isRunning || s.busy || !s.connection.connected;
  $("profileDetails").disabled = !s.draft?.profile;
  $("connectionDot").className = connected()
    ? "online"
    : s.connection.connected
      ? "stale"
      : "";
  $("connectionText").textContent = s.connection.stale
    ? t("stale")
    : s.connection.connected
      ? t("connected")
      : t("connecting");
  $("deviceName").textContent =
    s.devices.find((d) => d.type === "machine" && d.state === "connected")
      ?.name ?? "";
  const alert =
    !s.connection.connected
      ? t("connectionLost")
      : s.connection.stale ? t("stale")
      : !s.connection.machineConnected
        ? t("machineOffline")
        : "";
  $("connectionAlert").textContent = alert;
  $("connectionAlert").hidden = !alert;
  let heading = t("ready");
  if (!m.state) heading = t("unknownState");
  else if (state === "sleeping") heading = t("machineSleeping");
  else if (["heating", "preheating"].includes(state)) heading = t("heating");
  else if (state === "needswater") heading = t("needsWater");
  else if (
    [
      "cleaning",
      "descaling",
      "fwupgrade",
      "busy",
      "error",
      "booting",
      "calibration",
      "selftest",
      "airpurge",
    ].includes(state)
  )
    heading = t("state_" + state);
  else if (s.mode === "finished" && !isRunning) heading = t("finished");
  else if (state === "espresso") heading = t("running");
  else if (["steam", "hotwater"].includes(state)) heading = t(state);
  else if (["hotwater_rinse", "rinse", "flush"].includes(state))
    heading = t("flush");
  else if (s.snapshot.shotState?.state === "preheating") heading = t("heating");
  $("stageTitle").textContent = heading;
  const step = s.workflow?.profile?.steps?.[Number(m.profileFrame)];
  $("phaseName").textContent = state === "espresso" ? stageLabel(step?.name,s.language) : "";
  const startHint = s.awaiting
    ? t("waitingConfirm")
    : !s.connection.scaleConnected
      ? t("scaleOffline")
      : state === "idle" && s.mode !== "finished"
        ? t(canStartFromScreen() ? "readyHint" : "physicalStart")
        : "";
  setGroupHeadHint($("stateDetail"), startHint,
    !s.awaiting && s.connection.scaleConnected && state === "idle" && s.mode !== "finished" ? "brew" : null);
  $("liveWeight").textContent = s.connection.scaleStale || num(scale.weight)===null?"—":Number(scale.weight).toFixed(1);
  $("tareWeight").textContent = `${fmt(scale.weight)} g`;
  $("weightNote").textContent =
    s.mode === "finished"
      ? t("settledNotConfirmed")
      : current.target !== null
        ? `${t("target")} ${fmt(current.target)} g`
        : "—";
  const duration = s.preparing && s.mode === "running" ? 0 : s.trace.length ? s.trace.at(-1).time : null;
  $("liveTime").innerHTML = `${num(duration)===null?"—":Number(duration).toFixed(1)}<small>s</small>`;
  const weight = s.connection.scaleStale ? null : num(scale.weight);
  $("weightProgress").style.width =
    weight !== null && current.target > 0
      ? `${Math.max(0, Math.min(100, (weight / current.target) * 100))}%`
      : "0%";
  drawGauge(
    "pressureGauge",
    num(m.pressure),
    12,
    num(m.targetPressure),
    "var(--green)",
  );
  drawGauge("flowGauge", num(m.flow), Math.max(10,Math.ceil(Math.max(num(m.flow)||0,num(m.targetFlow)||0)/2)*2), num(m.targetFlow), "var(--blue)");
  $("liveTemperature").textContent = fmt(m.groupTemperature);
  $("temperatureNote").textContent =
    m.mixTemperature !== undefined
      ? `${s.language === "zh" ? "混水" : "Mix"} ${fmt(m.mixTemperature)}°`
      : "—";
  $("startButton").hidden = !canStartFromScreen();
  $("startButton").disabled = !ready() || dirty() || !!s.modal;
  $("startButton").querySelector("span").textContent =
    s.awaiting?.action === "espresso" ? t("waitingConfirm") : t("start");
  $("stopButton").hidden = state === "fwupgrade";
  $("stopButton").disabled = state === "fwupgrade";
  $("stopButton").classList.toggle("active", isRunning);
  $("stopButton").setAttribute("aria-busy", String(s.stopPending));
  $("tareButton").disabled =
    !s.connection.scaleConnected ||
    !s.connection.connected ||
    isRunning ||
    s.busy;
  $("powerButton").disabled =
    !connected() || isRunning || s.busy || s.skinUpdating || !!s.awaiting || !!s.modal;
  $("powerButton").querySelector("span").textContent =
    state === "sleeping" ? t("wake") : t("sleep");
  document.querySelectorAll("[data-command]").forEach((b) => {
    b.disabled = canStartFromScreen()
      ? !ready() || (!!s.modal && s.modal !== "settingsDialog")
      : !s.workflow || running() || s.busy || s.skinUpdating || (!!s.modal && s.modal !== "settingsDialog");
    b.querySelector("span").textContent = t(
      b.dataset.command,
    );
  });
  renderHotWater();
  $("stopWeight").textContent =
    s.stopWeight !== null ? `${t("stopReading")} ${fmt(s.stopWeight)} g` : "";
  $("chartDetails").textContent = s.trace.length
    ? s.mode === "running"
      ? t("liveTrace")
      : t("lastTrace")
    : t("profileOverview");
  $("chartCaption").textContent = s.trace.length
    ? t("recordedTrace")
    : t("planned");
  const previous = s.lastShot ?? s.history[0];
  $("lastShotTitle").textContent = previous?.workflow?.profile?.title ?? "—";
  $("lastShotSummary").textContent = previous
    ? `${fmt(previous.workflow?.context?.targetDoseWeight)} → ${fmt(shotYield(previous))} g · ${shotDate(previous.timestamp, true)}`
    : t("noHistory");
  $("lastShotButton").disabled = !previous;
  $("applyProfile").disabled = !s.selectedProfile || !canEdit || dirty() || hotWaterDirty() || !!s.workflowConflict;
  window.ceramicUI?.render();
  window.profileIntro?.render();
  window.onlineProfiles?.update();
  renderChart();
  renderDevicesAndAmbient();
  if (typeof window.thisCupDevicesRender === "function")
    window.thisCupDevicesRender({
      connection: s.connection,
      snapshot: s.snapshot,
      devices: s.devices,
    });
}
function drawGauge(id,value,max,target,color){
 const step=s.workflow?.profile?.steps?.[Number(s.snapshot.machine?.profileFrame)]??{};
 const limits=gaugeSpec(step,id==='pressureGauge'?'pressure':'flow');
 paintGauge($(id),{value,max,target:limits.limit===null?target:null,limit:limits.limit,color,label:id==='pressureGauge'?t('pressure'):t('machineFlow'),format:fmt});
}
function plannedPoints(profile) {
  const points = [];
  let time = 0;
  (profile?.steps ?? []).forEach((step, index) => {
    const seconds = num(step.seconds);
    if (seconds === null || seconds < 0) return;
    const point = {
      time,
      pressure: step.pump === "pressure" ? num(step.pressure) : null,
      flow: step.pump === "flow" ? num(step.flow) : null,
      temperature: num(step.temperature),
      scaleFlow: null,
      step: index,
    };
    points.push({ ...point });
    time += seconds;
    points.push({ ...point, time });
  });
  return points;
}
function pointsOf(shot) {
  const measurements = shotMeasurements(Array.isArray(shot?.measurements) ? shot.measurements : []);
  const first = measurements.find((x) =>
    Number.isFinite(Date.parse(x.machine?.timestamp)),
  );
  if (!first) return [];
  const origin = Date.parse(first.machine.timestamp);
  return measurements.map((x) => sampleOf(x, origin)).filter(Boolean);
}
function pathFor(points, key, x, y, options = {}) {
  return telemetryPath(points, key, x, y, options);
}
function plot(svg, points, { preview = false, comparison = null, live = false, transition = null, stageLabels = true } = {}) {
  const width = Math.max(220, svg.clientWidth || 700),
    height = Math.max(90, svg.clientHeight || 180),
    left = preview ? 34 : 78,
    right = preview ? 48 : live ? 35 : 78,
    top = 28,
    bottom = live ? 10 : 23;
  const lastTime = Math.max(
    1,
    ...points.map((p) => p.time),
    ...(comparison ?? []).map((p) => p.time),
  );
  const baseInterval = lastTime > 120 ? 30 : lastTime > 60 ? 20 : lastTime > 40 ? 10 : 5;
  const interval = Math.max(baseInterval, Math.ceil(lastTime / Math.max(2, Math.floor((width-left-right)/65)) / 5)*5);
  // Leave a small amount of room for the live endpoint labels.
  const maxTime = preview || !live ? lastTime : Math.max(10, lastTime * 1.06);
  // Show the measured range more clearly while retaining explicit axis values.
  let magnitude = 0;
  for (const series of [points, comparison || []]) {
    for (const p of series) {
      magnitude = Math.max(magnitude, num(p.pressure) ?? 0, num(p.flow) ?? 0,
        num(p.scaleFlow) ?? 0, num(p.targetPressure) ?? 0, num(p.targetFlow) ?? 0);
    }
  }
  if (live) {
    for (const step of (s.runWorkflow || s.workflow)?.profile?.steps || []) {
      magnitude = Math.max(magnitude, num(step.pressure) ?? 0, num(step.flow) ?? 0);
    }
  }
  const requiredMax = live ? Math.max(6, magnitude * 1.1) : Math.max(10, magnitude);
  const axisStep = Math.max(2, Math.ceil(requiredMax / 20) * 2);
  const ymax = Math.ceil(requiredMax / axisStep) * axisStep;
  const seam = transition ? transition.startFraction * (1-transition.progress) : 0;
  const x = (time) => left + (width-left-right) * (seam + (1-seam)*time/maxTime),
    y = (value) => top + (height - top - bottom) * (1 - value / ymax);
  const maxWeight=Math.max(60,...points.map(p=>num(p.weight)??0),...(comparison??[]).map(p=>num(p.weight)??0));
  const weightMax=Math.ceil(maxWeight/20)*20;
  const tempMin=0,tempMax=100;
  const yt = value => top + (height - top - bottom) * (1 - value / 100);
  const yw=v=>top+(height-top-bottom)*(1-v/weightMax);
  let content = "";
  for(let i=0;i<=4;i++){let yy=top+(height-top-bottom)*i/4;content+=`<text class="chart-temperature-tick" x="${width-right+8}" y="${yy+6}">${fmt(tempMax-(tempMax-tempMin)*i/4,0)}</text>`;}
  if(!preview){
    const weightStep=weightMax<=80?20:Math.ceil(weightMax/80)*20;
    for(let value=0;value<=weightMax;value+=weightStep)content+=`<text x="23" y="${yw(value)+6}" text-anchor="end" fill="var(--purple)">${fmt(value,0)}</text>`;
    content+=`<path d="M27 ${top}V${height-bottom}" stroke="var(--purple)" stroke-width="1"/>`;
  }
  for (let value = 0; value <= ymax; value += axisStep) {
    content += `<path d="M${left} ${y(value)}H${width - right}" stroke="var(--line)" stroke-width=".7" opacity=".7"/><text x="${left - 8}" y="${y(value) + 3}" text-anchor="end">${fmt(value, 0)}</text>`;
  }
  const timeLabelY = live ? top - 8 : height - 5;
  for (let time = 0; time <= maxTime; time += interval) {
    content += `<path d="M${x(time)} ${top}V${height - bottom}" stroke="var(--line)" stroke-width=".7" opacity=".55"/><text class="chart-time-tick" x="${x(time)}" y="${timeLabelY}" text-anchor="middle">${fmt(time, 0)}${live&&time===0?' s':''}</text>`;
  }
  if(maxTime%interval>interval*.35)content+=`<text class="chart-time-tick" x="${x(maxTime)}" y="${timeLabelY}" text-anchor="middle">${fmt(maxTime)}</text>`;
  content += `${live?'':`<text x="${width - 5}" y="${height - 5}" text-anchor="end">s</text>`}${!preview?'<text x="23" y="14" text-anchor="end" fill="var(--purple)">g</text>':""}`;
  content += `<path d="M${left} ${top}V${height-bottom}H${width-right}M${width-right} ${top}V${height-bottom}" stroke="var(--muted)" stroke-width="1"/>`;
  const lines = [
    ["pressure", "var(--green)"],
    ["flow", "var(--blue)"],
    ["scaleFlow", "var(--brown)"],
    ["temperature", "var(--red)"],
    ["weight", "var(--purple)"],
  ];
  for (const [key, color] of lines) {
    if (comparison?.length)
      content += `<path d="${pathFor(comparison, key, x, key==="temperature"?yt:key==="weight"?yw:y)}" stroke="${color}" stroke-width="1.4" stroke-dasharray="5 5" opacity=".5"/>`;
    content += `<path d="${pathFor(points, key, x, key==="temperature"?yt:key==="weight"?yw:y, {smooth: !preview})}" stroke="${color}" stroke-width="${preview ? 1.8 : 2}" ${preview ? 'stroke-dasharray="5 4"' : ""}/>`;
  }
  if(!preview && !(live && s.preparing)){
   for(const [key,color,scale] of [['targetPressure','var(--target-pressure)',y],['targetFlow','var(--target-flow)',y],['targetTemperature','var(--target-temperature)',yt]])content+=`<path d="${pathFor(points,key,x,scale,{smooth:false})}" stroke="${color}" stroke-width="1.2" stroke-dasharray="5 5"/>`;
   for(let i=1;i<points.length;i++)if(points[i].frame!==null&&points[i-1].frame!==null&&points[i].frame!==points[i-1].frame){
    const px=x(points[i].time);
    content+=`<path d="M${px} ${top}V${height-bottom}" stroke="var(--blue)" stroke-dasharray="5 5"/>`;
    if(stageLabels)content+=`<text class="chart-phase-label" x="${px}" y="${timeLabelY}" text-anchor="middle" fill="var(--blue)">${fmt(points[i].time)} s</text>`;
   }
   const last=points.at(-1);
   if(last){
    const labels=lines.filter(([key])=>num(last[key])!==null).map(([key,color])=>({key,color,position:(key==='temperature'?yt:key==='weight'?yw:y)(last[key])}));
    for(const label of labels)content+=`<g class="chart-end-label" data-point-x="${x(last.time)}" data-point-y="${label.position}"><path stroke="${label.color}" stroke-width=".7" opacity=".6"/><circle cx="${x(last.time)}" cy="${label.position}" r="2.5" fill="${label.color}" stroke="none"/><text x="0" y="0" fill="${label.color}">${Number(last[label.key]).toFixed(1)}${label.key==='weight'?' g':''}</text></g>`;
   }
  }
  if(live && s.preparing) content+=`<text x="${left+10}" y="${top+20}">${s.language==='zh'?'预热中':'Preheating'}</text>`;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `<g fill="none" stroke-linejoin="round" stroke-linecap="round">${content}</g><g class="chart-cursor"></g>`;
  svg.querySelectorAll("text").forEach((el) => {
    if(!el.hasAttribute("fill"))el.setAttribute("fill", "var(--muted)");
    el.setAttribute("stroke", "none");
    el.style.fontSize = preview ? "12px" : `${Math.max(12,Math.min(20,window.innerWidth*.0126))}px`;
    el.style.fontFamily = "inherit";
  });
  // Use the rendered font bounds: CJK/serif fallback fonts can be taller than
  // their CSS size. Move labels only; sample markers and curves stay exact.
  const endLabels=[...svg.querySelectorAll('.chart-end-label')].map(group=>{
    const text=group.querySelector('text'),box=text.getBBox();
    return {group,text,box,target:Number(group.dataset.pointY),pointX:Number(group.dataset.pointX)};
  }).sort((a,b)=>a.target-b.target);
  if(endLabels.length){
    const lower=top+3,upper=height-bottom-3,gap=3;
    let edge=lower;
    for(const label of endLabels){label.center=Math.max(label.target,edge+label.box.height/2);edge=label.center+label.box.height/2+gap;}
    edge=upper;
    for(let i=endLabels.length-1;i>=0;i--){const label=endLabels[i];label.center=Math.min(label.center,edge-label.box.height/2);edge=label.center-label.box.height/2-gap;}
    // Keep the complete label box clear of the endpoint/cursor markers.
    const pointX=endLabels[0].pointX;
    const labelOnLeft=live && pointX-left>100;
    const labelX=labelOnLeft?pointX-12:pointX+14;
    const labelLayer=document.createElementNS('http://www.w3.org/2000/svg','g');
    labelLayer.setAttribute('class','chart-end-label-layer');
    labelLayer.style.pointerEvents='none';
    for(const label of endLabels){
      label.text.setAttribute('x',labelX);
      if(labelOnLeft)label.text.setAttribute('text-anchor','end');
      label.text.setAttribute('y',label.center-label.box.y-label.box.height/2);
      const lineEnd=labelOnLeft?labelX+3:labelX-3;
      label.group.querySelector('path').setAttribute('d',Math.abs(label.center-label.target)>2?`M${label.pointX} ${label.target}L${lineEnd} ${label.center}`:'');
      // A real opaque backing survives the shared SVG text stroke reset.
      // Paint both backing and text after the cursor layer, not just markers.
      const box=label.text.getBBox(),backing=document.createElementNS('http://www.w3.org/2000/svg','rect');
      backing.setAttribute('class','chart-end-label-backing');
      backing.setAttribute('x',box.x-3);backing.setAttribute('y',box.y-1);
      backing.setAttribute('width',box.width+6);backing.setAttribute('height',box.height+2);
      backing.setAttribute('rx','2');
      backing.style.fill='var(--paper, #faf9f5)';backing.style.stroke='none';
      label.text.style.stroke='none';
      labelLayer.append(backing,label.text);
    }
    svg.append(labelLayer);
    const labelBoxes = [...labelLayer.querySelectorAll('rect')].map(rect => rect.getBBox());
    for (const tick of svg.querySelectorAll('.chart-temperature-tick')) {
      const overlaps = box => labelBoxes.some(label => box.x < label.x + label.width && box.x + box.width > label.x && box.y < label.y + label.height && box.y + box.height > label.y);
      if (overlaps(tick.getBBox())) {
        tick.setAttribute('x', width - 4);
        tick.setAttribute('text-anchor', 'end');
        if (overlaps(tick.getBBox())) tick.setAttribute('x', width - right - 5);
      }
    }
  }
  // Work in SVG coordinates after the endpoint and temperature labels are final.
  // Give each phase its position on the time axis before placing ordinary ticks.
  const phases = [...svg.querySelectorAll('.chart-phase-label')];
  if (!preview) {
    const fixed = [...svg.querySelectorAll('text:not(.chart-phase-label):not(.chart-time-tick), .chart-end-label-backing')]
      .map(el => el.getBBox());
    for (const label of [...phases, ...svg.querySelectorAll('.chart-time-tick')]) {
      const box = label.getBBox(), gap = 2;
      let best = null;
      // Try successive rows inward. On each row free intervals start or end
      // at existing labels; a tiny sideways nudge can avoid a whole axis.
      for (let row = 0; row * (box.height + gap) < height; row++) {
        const dy = row * (box.height + gap) * (live ? 1 : -1);
        if (best && Math.abs(dy) >= best.cost) break;
        const y = box.y + dy;
        if (y < -1 || y + box.height > height + 1) continue;
        const occupied = fixed.filter(other => y < other.y + other.height + gap && y + box.height + gap > other.y);
        const candidates = [box.x];
        for (const other of occupied) candidates.push(other.x - gap - box.width, other.x + other.width + gap);
        for (const x of candidates) {
          if (x < 0 || x + box.width > width) continue;
          const dx = x - box.x, cost = Math.abs(dx) * 6 + Math.abs(dy);
          if (best && cost >= best.cost) continue;
          if (occupied.some(other => x < other.x + other.width + gap - .01 && x + box.width + gap > other.x + .01)) continue;
          best = {dx, dy, cost};
        }
      }
      if (best && (best.dx || best.dy)) label.setAttribute('transform', `translate(${best.dx} ${best.dy})`);
      fixed.push({x:box.x + (best?.dx || 0), y:box.y + (best?.dy || 0), width:box.width, height:box.height});
    }
  }
  return { x, y, yt, yw, top, bottom, left, right, width, height, maxTime };
}
let chartCache = null;
let collapseAnimationFrame = null;
let chartDeferred = null;
function renderChart() {
  if (!$("chart") || (!running() && s.mode !== 'finished')) return;
  const el = $("chart"), now = performance.now();
  const latest=s.trace.at(-1);
  const key = [s.trace.length,latest?.timestamp,latest?.time,latest?.weight,latest?.scaleFlow,latest?.pressure,latest?.flow,latest?.temperature,s.workflowRevision,s.mode,s.language,s.theme,el.clientWidth,el.clientHeight].join('|');
  const collapsing = s.mode === "running" && s.collapseStarted != null && now-s.collapseStarted<1500;
  if (!collapsing && chartCache?.trace === s.trace && chartCache.key === key) return;
  if (!collapsing && running() && chartCache && now-chartCache.at < 200) {
    if(chartDeferred===null)chartDeferred=setTimeout(()=>{chartDeferred=null;renderChart();},200-(now-chartCache.at));
    return;
  }
  chartCache = {trace:s.trace,key,at:now};
  const points = s.trace.length ? s.trace : plannedPoints(s.draft?.profile);
  s.chartPoints = points;
  $("chartEmpty").hidden = points.length > 0;
  const progress=collapsing?collapseProgress(now,s.collapseStarted):1;
  const oldBox=s.preheatChartBox;
  const oldMaxTime=oldBox?.maxTime || Math.max(1,s.preheatTrace?.at(-1)?.time || 1);
  const startFraction=Math.min(1,(s.preheatTrace?.at(-1)?.time || 0)/oldMaxTime);
  s.chartBox = plot($("chart"), points, { preview: !s.trace.length, live:s.mode==='running', transition:collapsing?{progress,startFraction}:null });
  if(collapsing && s.preheatTrace?.length){
    const b=s.chartBox;
    const x=t=>b.left+(b.width-b.left-b.right)*(t/oldMaxTime)*(1-progress);
    for(const [key,color,scale] of [['pressure','var(--green)',b.y],['flow','var(--blue)',b.y],['scaleFlow','var(--brown)',b.y],['temperature','var(--red)',b.yt],['weight','var(--purple)',b.yw]]){
      const overlay=document.createElementNS('http://www.w3.org/2000/svg','path');
      overlay.setAttribute('d',pathFor(s.preheatTrace,key,x,scale,{smooth:true}));
      overlay.setAttribute('fill','none');overlay.setAttribute('stroke',color);overlay.setAttribute('stroke-width','2');
      overlay.setAttribute('opacity',String(Math.min(1,(1-progress)*5)));el.append(overlay);
    }
    if(collapseAnimationFrame===null) collapseAnimationFrame=requestAnimationFrame(()=>{collapseAnimationFrame=null;chartCache=null;renderChart();});
  }
  if(s.trace.length) drawChartReading(s.mode==='finished'&&s.chartCursorTime!=null?points.reduce((best,p)=>Math.abs(p.time-s.chartCursorTime)<Math.abs(best.time-s.chartCursorTime)?p:best,points[0]):points.at(-1));
}
function showChartCursor(event) {
  if (!s.chartPoints.length || !s.chartBox) return;
  const rect = $("chart").getBoundingClientRect(),
    pos = event.clientX - rect.left,
    b = s.chartBox;
  const time = ((pos - b.left) / (b.width - b.left - b.right)) * b.maxTime;
  const p = s.chartPoints.reduce(
    (best, item) =>
      Math.abs(item.time - time) < Math.abs(best.time - time) ? item : best,
    s.chartPoints[0],
  );
  s.chartCursorTime=p.time;drawChartReading(p);
}
function drawChartReading(p){
 if(!p||!s.chartBox)return;
 let readout=$('ceramicChartReadout');
 if(!readout){readout=document.createElement('div');readout.id='ceramicChartReadout';$('chartWrap').parentElement.append(readout);}
 const series=[['pressure',t('pressure'),'bar','var(--green)'],['flow',s.language==='zh'?'流速':'Flow','mL/s','var(--blue)'],['temperature',s.language==='zh'?'咖啡温度':'Coffee temp','°C','var(--red)'],['scaleFlow',s.language==='zh'?'杯流':'Cup flow','g/s','var(--brown)'],['weight',s.language==='zh'?'杯重':'Cup weight','g','var(--purple)']];
 const reading=v=>num(v)===null?'—':Number(v).toFixed(1);
 readout.innerHTML=`<strong>${reading(p.time)} s</strong>`+series.map(([key,label,unit,color])=>`<span><i style="background:${color}"></i>${label} ${reading(p[key])} ${unit}</span>`).join('');
 const b=s.chartBox;
 $('chart').querySelector('.chart-cursor').innerHTML=`<path d="M${b.x(p.time)} ${b.top}V${b.height-b.bottom}" stroke="var(--red)" stroke-dasharray="5 5" stroke-width="1"/>`+series.filter(([k])=>num(p[k])!==null).map(([key,,,color])=>`<circle cx="${b.x(p.time)}" cy="${(key==='weight'?b.yw:key==='temperature'?b.yt:b.y)(p[key])}" r="5" fill="${color}" stroke="none"/>`).join('');
}

function profileType(p) {
  const types = {espresso:['浓缩','Espresso'],pourover:['滤泡','Filter'],cleaning:['清洁','Cleaning'],manual:['手动','Manual']};
  return (types[p?.beverage_type] || [p?.beverage_type || '—',p?.beverage_type || '—'])[s.language === 'zh' ? 0 : 1];
}
function profileSummary(entry) {
  const p = profileOf(entry);
  return `${fmt(selectedProfileContext(entry,s.workflow?.context).targetYield)} g · ${fmt(p?.steps?.[0]?.temperature)} °C · ${p?.steps?.length ? `${p.steps.length} ${t("steps")}` : t("apiInvalidProfile")}`;
}
function exitSummary(exit) {
  const fields = { pressure: ["压力", "Pressure", "bar"], flow: ["流量", "Flow", "mL/s"] };
  const field = fields[exit?.type];
  const condition = {over:["高于", "above"],under:["低于", "below"]}[exit?.condition];
  if (!field || !condition) return s.language === "zh" ? "切段条件未识别" : "Unrecognized exit condition";
  const lang = s.language === "zh" ? 0 : 1;
  return `${lang === 0 ? "切段：" : "Exit: "}${field[lang]} ${condition[lang]} ${fmt(exit.value)} ${field[2]}`;
}
function stepMarkup(profile) {
  return `<ol class="step-list">${(profile?.steps ?? []).map((step, index) => `<li><span>${index + 1}</span><div><strong>${escapeHTML(stageLabel(step.name,s.language) || `${index + 1}`)}</strong><small>${t(step.pump === "pressure" ? "pressureMode" : "flowMode")} ${fmt(step[step.pump], 2)} ${step.pump === "pressure" ? "bar" : "mL/s"} · ${fmt(step.temperature)} °C · ${t(step.sensor === "water" ? "waterSensor" : "coffeeSensor")}<br>${t("maxTime")} ${fmt(step.seconds)} s${num(step.weight) > 0 ? ` · ${t("exitWeight")} ${fmt(step.weight)} g` : ""}${step.exit ? ` · ${escapeHTML(exitSummary(step.exit))}` : ""}${num(step.limiter?.value) > 0 ? ` · ${fmt(step.limiter.value)} ${step.pump === "pressure" ? "mL/s" : "bar"} ${t("limit")}` : ""}</small></div></li>`).join("")}</ol>`;
}
async function openProfiles() {
  if (running() || s.busy) return;
  const sequence = s.profileDialogSequence = (s.profileDialogSequence ?? 0) + 1;
  const currentEntry = () => s.profiles.find(e => e.id === s.profileIdentity && e.visibility !== "hidden") ?? null;
  s.selectedProfileUnavailable = false;
  s.selectedProfile = currentEntry();
  const initialSelection = s.selectedProfile;
  const selectionRevision = s.profileSelectionRevision ?? 0;
  // The current profile may not be a favorite. Always make it visible on entry.
  s.favoriteOnly = false;
  $("profileSearch").value = "";
  openDialog("profileDialog");
  renderProfiles();
  scrollSelectedProfile(sequence);
  const results = await Promise.allSettled([loadFavorites(), refreshProfileLibrary()]);
  if (s.modal === "profileDialog" && sequence === s.profileDialogSequence) {
    const untouched = (s.profileSelectionRevision ?? 0) === selectionRevision && s.selectedProfile === initialSelection;
    if (untouched) s.selectedProfile = currentEntry();
    else if (results[1].status === "fulfilled" && s.selectedProfile) {
      const selectedId = s.selectedProfile.id;
      s.selectedProfile = s.profiles.find(e => e.id === selectedId && e.visibility !== "hidden") ?? null;
      s.selectedProfileUnavailable = !s.selectedProfile;
    }
    if (results[1].status === "rejected") toast(explainError(results[1].reason), true);
    renderProfiles();
    if (untouched && !$("profileSearch").value.trim()) scrollSelectedProfile(sequence);
  }
}
function scrollSelectedProfile(sequence) {
  requestAnimationFrame(() => {
    if (s.modal === "profileDialog" && sequence === s.profileDialogSequence)
      $("profileList").querySelector(".profile-item.selected")?.scrollIntoView({block:"nearest"});
  });
}
function renderProfiles() {
  const search = $("profileSearch").value.trim().toLocaleLowerCase();
  const entries = s.profiles.filter(
    (e) =>
      e.visibility !== "hidden" &&
      (!s.favoriteOnly || s.favorites.includes(e.id)) &&
      (profileOf(e)?.title ?? "").toLocaleLowerCase().includes(search),
  );
  $("profileList").innerHTML =
    `<div class="profile-filters"><button data-filter="all" class="${!s.favoriteOnly ? "active" : ""}">${t("allProfiles")}</button><button data-filter="favorites" class="${s.favoriteOnly ? "active" : ""}">☆ ${t("favorites")}</button><button data-online-profiles="official">${s.language==='zh'?'更多':'More'}</button></div>` +
    (entries.length
      ? entries
          .map(
            (e) =>
              `<button class="profile-item ${s.selectedProfile?.id === e.id ? "selected" : ""}" data-profile-id="${escapeHTML(e.id)}"><strong><span class="profile-item-name" title="${escapeHTML(profileOf(e).title)}">${s.favorites.includes(e.id) ? "★ " : ""}${escapeHTML(profileOf(e).title)}</span>${s.profileIdentity === e.id ? `<small>${s.language === "zh" ? "当前使用" : "In use"}</small>` : ""}</strong><small>${profileSummary(e)} · ${escapeHTML(profileType(profileOf(e)))}</small></button>`,
          )
          .join("")
      : `<div class="empty-message">${t(s.favoriteOnly ? "noFavorites" : "noProfiles")}</div>`);
  renderProfilePreview();
}
function renderProfilePreview() {
  const entry = s.selectedProfile,
    p = profileOf(entry);
  $("applyProfile").disabled = !p?.steps?.length || !editable() || dirty() || hotWaterDirty() || !!s.workflowConflict;
  $("profileSelectionNote").textContent = s.workflowConflict
    ? t(s.workflowConflictReason || "workflowConflictNotice") : dirty() || hotWaterDirty() ? t("draftBeforeProfileChange") : s.selectedProfileUnavailable ? t("profileNoLongerAvailable") : "";
  if (!p) {
    $("profilePreview").innerHTML =
      `<div class="empty-message">${t("choosePreview")}</div>`;
    return;
  }
  const context = selectedProfileContext(entry,s.workflow?.context);
  const previewValues = [
    [context.targetDoseWeight, 'g', t('dose')],
    [context.targetYield, 'g', t('yieldTarget')],
    [p.steps?.[0]?.temperature, '°C', t('temperature')],
  ];
  $("profilePreview").innerHTML =
    `<p class="preview-eyebrow">${s.language === 'zh' ? '方案预览' : 'Profile preview'}</p>
    <div class="preview-heading"><h3 class="${p.title?.length > 25 ? 'long-name' : ''}">${escapeHTML(p.title)}</h3><button id="favoriteProfile" class="favorite-star" aria-label="${t(s.favorites.includes(entry.id) ? "unfavorite" : "favorite")}">${s.favorites.includes(entry.id) ? "★" : "☆"}</button></div>
    <p>${escapeHTML(profileType(p))}</p><div class="preview-recipe-values">${previewValues.map(([value, unit, label]) => `<div><strong>${fmt(value)}</strong><small>${unit}</small><span>${label}</span></div>`).join('')}</div>
    ${!p.steps?.length ? `<p class="empty-message" role="alert">${t("apiInvalidProfile")}</p>` : ""}
    <div class="mini-chart"><svg id="profileMiniChart" aria-label="${t("profileOverview")}"></svg></div><div class="preview-chart-legend"><span><i class="pressure-sample"></i>bar</span><span><i class="flow-sample"></i>mL/s</span><span><i class="temperature-sample"></i>°C</span><span>${s.language === "zh" ? "分段目标" : "Stage targets"}</span></div>
    <details class="profile-step-details"><summary>${s.language === 'zh' ? '查看分段' : 'View stages'}</summary>${stepMarkup(p)}${p.notes ? `<p class="description">${escapeHTML(p.notes)}</p>` : ''}</details>`;
  requestAnimationFrame(() => {
    if ($("profileMiniChart"))
      plot($("profileMiniChart"), plannedPoints(p), { preview: true });
  });
  $("favoriteProfile").onclick = () => toggleFavorite(entry.id);
}
async function loadFavorites() {
  const source=client;
  const sequence=s.favoritesReadSequence=(s.favoritesReadSequence??0)+1;
  try {
    const value = await source.get("/store/thiscup/favorites");
    if(source!==client || sequence!==s.favoritesReadSequence || s.favoriteBusy)return;
    s.favorites = Array.isArray(value)
      ? value.filter((x) => typeof x === "string")
      : [];
  } catch {
    if(source===client && sequence===s.favoritesReadSequence && s.modal==="profileDialog")toast(t("loadError"),true);
  }
}
async function toggleFavorite(id) {
  if (s.favoriteBusy) return;
  s.favoriteBusy = true;
  s.favoritesReadSequence=(s.favoritesReadSequence??0)+1;
  // Keep the user's displayed add/remove intent, but merge it into a fresh read.
  // Native store writes have no compare-and-set; simultaneous writes can still race.
  const add = !s.favorites.includes(id);
  try {
    const stored = await client.get("/store/thiscup/favorites");
    const current = stored === null ? [] : stored;
    if (!Array.isArray(current) || current.some((value) => typeof value !== "string"))
      throw new Error(t("loadError"));
    const next = add ? [...new Set([...current, id])] : current.filter((value) => value !== id);
    await client.post("/store/thiscup/favorites", next);
    const read = await client.get("/store/thiscup/favorites");
    if (!Array.isArray(read)) throw new Error(t("loadError"));
    s.favorites = read;
    renderProfiles();
    if (JSON.stringify([...new Set(read)].sort()) !== JSON.stringify([...new Set(next)].sort()))
      throw new Error(t("favoriteReadbackMismatch"));
    toast(t("favoriteSaved"));
  } catch (error) {
    toast(explainError(error), true);
  } finally {
    s.favoriteBusy = false;
  }
}
async function applyProfile() {
  if (!s.selectedProfile) return;
  if (s.workflowConflict || dirty() || hotWaterDirty()) {
    status(t(s.workflowConflict ? s.workflowConflictReason || "workflowConflictNotice" : "draftBeforeProfileChange"), true);
    return;
  }
  const selected = clone(s.selectedProfile);
  const expected = clone(s.workflow);
  const ok = await withWrite(async () => {
    let workflow;
    try {
      workflow = await client.selectProfile(selected, expected);
    } catch (error) {
      if (error?.code === "workflowConflictNotice") {
        markWorkflowConflict(error.details?.readback);
        throw new Error(t("workflowConflictNotice"));
      }
      throw error;
    }
    setWorkflow(workflow, { force: true, profileIdentity: selected.id });
  }, t("applied"));
  if (ok) {s.mode="ready";closeDialog();}
}
function openDetails() {
  if (!s.draft?.profile) return;
  const p = s.draft.profile,
    v = viewOf(s.draft);
  $("detailContent").innerHTML =
    `<h3>${escapeHTML(p.title)}</h3><table class="data-table"><tr><td>${t("dose")}</td><td>${fmt(v.dose)} g</td></tr><tr><td>${t("yieldTarget")}</td><td>${fmt(v.target)} g</td></tr><tr><td>${t("ratio")}</td><td>${v.dose > 0 && v.target > 0 ? `1 : ${fmt(v.target / v.dose, 2)}` : "—"}</td></tr></table>${stepMarkup(p)}${p.notes ? `<p class="description">${escapeHTML(p.notes)}</p>` : ""}`;
  openDialog("detailDialog");
}
function openSave() {
  if (!editable()) return;
  $("saveName").value = `${s.draft.profile.title} · ${t("newProfile")}`;
  $("saveError").textContent = "";
  openDialog("saveDialog");
}
async function saveAs() {
  const title = $("saveName").value.trim();
  if (!title) {
    $("saveError").textContent = t("nameRequired");
    return;
  }
  if (s.profiles.some((e) => profileOf(e)?.title === title)) {
    $("saveError").textContent = t("duplicateName");
    return;
  }
  const profile = clone(s.draft.profile);
  profile.title = title;
  if (resolveProfileIdentity(profile, s.profiles)) {
    $("saveError").textContent = t("sameExecutionExists");
    return;
  }
  const ok = await withWrite(async () => {
    const saved = await client.saveProfile({
      profile,
      metadata: {
        thisCupContext: {
          targetDoseWeight: s.draft.context.targetDoseWeight,
          targetYield: s.draft.context.targetYield,
        },
      },
    });
    const context = await client.loadContext();
    s.profiles = context.profiles ?? s.profiles;
    const record = s.profiles.find((entry) => entry.id === saved?.id);
    if (!record || record.profile?.title !== title ||
        profileExecutionKey(record.profile) !== profileExecutionKey(profile) ||
        record.metadata?.thisCupContext?.targetDoseWeight !== s.draft.context.targetDoseWeight ||
        record.metadata?.thisCupContext?.targetYield !== s.draft.context.targetYield) {
      throw new Error(t("saveReadbackMismatch"));
    }
  }, t("saved"));
  if (ok) closeDialog();
}
function shotDate(value, short = false) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(
        s.language === "zh" ? "zh-CN" : "en-GB",
        short
          ? {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }
          : {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            },
      );
}
function shotYield(shot) {
  if (num(shot?.annotations?.actualYield) !== null)
    return num(shot.annotations.actualYield);
  const samples = shot?.measurements ?? [];
  for (let i = samples.length - 1; i >= 0; i--)
    if (num(samples[i].scale?.weight) !== null)
      return num(samples[i].scale.weight);
  return null;
}
async function refreshHistory(show = true) {
  if (show) $("historyMessage").textContent = t("historyLoad");
  const historyClient = client, generation = s.runGeneration;
  try {
    const result = await historyClient.history();
    if (historyClient !== client || generation !== s.runGeneration) return;
    s.history = Array.isArray(result) ? result : (result?.items ?? []);
    s.historyHasMore = s.history.length === 50;
    // List entries are summaries; never replace this cup's full record.
    if (s.history[0] && s.lastShot?.id !== s.runId && (!s.lastShot || s.lastShot.id !== s.history[0].id))
      s.lastShot = s.history[0];
    if (show) renderHistoryList();
    $("historyMessage").textContent = "";
    render();
  } catch (error) {
    if (historyClient !== client || generation !== s.runGeneration) return;
    $("historyMessage").textContent = explainError(error);
    if (show) toast(explainError(error), true);
  }
}
async function openHistory(id = null) {
  openDialog("historyDialog");
  $("historyDetail").innerHTML =
    `<div class="empty-message">${t("historySelect")}</div>`;
  renderHistoryList();
  await refreshHistory(true);
  if (id) selectShot(id);
  else if (s.history.length) selectShot(s.history[0].id);
}
function renderHistoryList() {
  $("historyList").innerHTML = s.history.length
    ? s.history
        .map(
          (shot) =>
            `<button class="history-item ${s.selectedShot?.id === shot.id ? "selected" : ""}" data-shot-id="${escapeHTML(shot.id)}"><small>${shotDate(shot.timestamp)}</small><strong>${escapeHTML(shot.workflow?.profile?.title || shot.workflow?.name || shot.id)}</strong><small>${fmt(shot.workflow?.context?.targetDoseWeight)} → ${fmt(shotYield(shot))} g</small></button>`,
        )
        .join("")
    : `<div class="empty-message">${t("noHistory")}</div>`;
  if (s.historyHasMore) {
    const more = document.createElement("button");
    more.className = "text-button";
    more.textContent = t("moreHistory");
    more.onclick = loadMoreHistory;
    $("historyList").append(more);
  }
}
async function selectShot(id) {
  const sourceClient = client;
  const sequence = ++s.historySequence;
  $("historyDetail").innerHTML =
    `<div class="empty-message">${t("loading")}</div>`;
  try {
    const shot = await sourceClient.shot(id);
    if (sourceClient !== client || sequence !== s.historySequence) return;
    s.selectedShot = shot;
    s.comparison = null;
    renderHistoryList();
    renderShotDetail();
  } catch (error) {
    if (sourceClient !== client || sequence !== s.historySequence) return;
    $("historyDetail").innerHTML =
      `<div class="empty-message">${escapeHTML(explainError(error))}<br><button id="shotRetry" class="text-button">${t("retry")}</button></div>`;
    $("shotRetry").onclick = () => selectShot(id);
  }
}
function chartLegend() {
  const labels = s.language === 'zh' ? ['压力 · bar','流速 · mL/s','咖啡温度 · °C','杯流 · g/s','杯重 · g','目标 / 限制'] : ['Pressure · bar','Flow · mL/s','Coffee temp · °C','Cup flow · g/s','Weight · g','Target / limit'];
  return `<div class="history-chart-legend">${['pressure','flow','temperature','weight','cupweight','target'].map((key,i)=>`<span><i class="${key}-color"></i>${labels[i]}</span>`).join('')}</div>`;
}
function renderShotDetail() {
  const shot = s.selectedShot;
  if (!shot) return;
  const points = pointsOf(shot),
    yieldG = shotYield(shot),
    enjoyment = num(shot.annotations?.enjoyment);
  $("historyDetail").innerHTML =
    `<h3>${escapeHTML(shot.workflow?.profile?.title || shot.workflow?.name || shot.id)}</h3><div class="history-date">${shotDate(shot.timestamp)}</div><div class="history-metrics"><div><small>${t("doseActual")}</small><strong>${fmt(shot.annotations?.actualDoseWeight ?? shot.workflow?.context?.targetDoseWeight)} <small>g</small></strong></div><div><small>${t("yieldActual")}</small><strong>${fmt(yieldG)} <small>g</small></strong></div><div><small>${t("duration")}</small><strong>${fmt(points.at(-1)?.time)} <small>s</small></strong></div></div><div class="mini-chart"><svg id="historyChart"></svg></div>${chartLegend()}${!points.length ? `<p class="empty-message">${t("noMeasurements")}</p>` : ""}<button class="text-button" id="compareShot">${t(s.comparison ? "clearCompare" : "compare")}</button><div class="history-compare-caption">${s.comparison ? `${t("compareCaption")} · ${shotDate(s.comparison.timestamp, true)} · ${escapeHTML(s.comparison.workflow?.profile?.title ?? "")}` : ""}</div><div class="shot-review"><label for="enjoyment">${t("rating")} <span id="ratingValue">${enjoyment === null ? t("ratingUnset") : `${fmt(enjoyment)} / 10`}</span></label><input type="range" id="enjoyment" min="0" max="10" step=".5" value="${enjoyment ?? 5}" data-touched="false"><textarea id="tastingNotes" rows="2" maxlength="4000" placeholder="${t("tastingNotes")}">${escapeHTML(shot.annotations?.espressoNotes ?? "")}</textarea><button id="saveReview" class="button secondary">${t("saveRating")}</button></div>`;
  requestAnimationFrame(() => {
    const svg=$("historyChart");
    if (svg) {
      const comparison=s.comparison ? pointsOf(s.comparison) : [];
      const box=plot(svg, points, {comparison});
      const output=document.createElement('div');output.className='history-cursor-reading';svg.parentElement.after(output);
      svg.onpointermove=event=>{
        if(!points.length||!box)return;
        const rect=svg.getBoundingClientRect();
        const time=((event.clientX-rect.left)*box.width/rect.width-box.left)/(box.width-box.left-box.right)*box.maxTime;
        const nearest=series=>series.reduce((a,b)=>Math.abs(b.time-time)<Math.abs(a.time-time)?b:a,series[0]);
        const current=nearest(points);
        const reading=p=>`${fmt(p.time)} s · ${fmt(p.pressure)} bar · ${fmt(p.flow)} mL/s · ${fmt(p.temperature)} °C · ${fmt(p.scaleFlow)} g/s · ${fmt(p.weight)} g`;
        output.textContent=(s.language==='zh'?'本杯：':'This shot: ')+reading(current)+(comparison.length?(s.language==='zh'?' ｜ 对比杯：':' | Comparison: ')+reading(nearest(comparison)):'');
        svg.querySelector('.chart-cursor').innerHTML=`<path d="M${box.x(current.time)} ${box.top}V${box.height-box.bottom}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
      };
      svg.onpointerdown=svg.onpointermove;
      svg.style.touchAction='none';
    }
  });
  $("enjoyment").oninput = (e) => {
    e.target.dataset.touched = "true";
    $("ratingValue").textContent = `${e.target.value} / 10`;
  };
  $("saveReview").onclick = saveReview;
  $("compareShot").onclick = compareShot;
}
async function saveReview() {
  const sourceClient=client;
  const shot = s.selectedShot;
  if (!shot) return;
  const annotations = { espressoNotes: $("tastingNotes").value };
  if ($("enjoyment").dataset.touched === "true")
    annotations.enjoyment = Number($("enjoyment").value);
  $("saveReview").disabled = true;
  try {
    const latest=await sourceClient.shot(shot.id);
    if(sourceClient!==client || s.selectedShot?.id!==shot.id)return;
    for(const key of Object.keys(annotations))if((latest.annotations?.[key]??null)!==(shot.annotations?.[key]??null))throw new Error(s.language==='zh'?'评价已在其他页面修改，请重新打开':'Notes changed elsewhere. Reopen this shot.');
    await sourceClient.put(`/shots/${enc(shot.id)}`, { annotations });
    const read=await sourceClient.shot(shot.id);
    if(sourceClient!==client || s.selectedShot?.id!==shot.id)return;
    s.selectedShot=read;
    renderShotDetail();
    toast(t("ratingSaved"));
  } catch (error) {
    toast(explainError(error), true);
    if ($("saveReview")) $("saveReview").disabled = false;
  }
}
async function compareShot() {
  const sourceClient=client, selectedId=s.selectedShot?.id;
  if (s.comparison) {
    s.comparison = null;
    renderShotDetail();
    return;
  }
  const index = s.history.findIndex((x) => x.id === s.selectedShot?.id),
    previous = s.history[index + 1];
  if (!previous) {
    toast(t("noCompare"));
    return;
  }
  try {
    const comparison = await sourceClient.shot(previous.id);
    if(sourceClient!==client || selectedId!==s.selectedShot?.id)return;
    s.comparison=comparison;
    renderShotDetail();
  } catch (error) {
    toast(explainError(error), true);
  }
}
function renderHotWater() {
  const button = $("hotWaterButton");
  if (!button) return;
  const applied = s.workflow?.hotWaterData;
  $("hotWaterSummary").textContent =
    `${fmt(applied?.targetTemperature)}°C · ${fmt(applied?.volume)} ${hotWaterUnit()}`;
  button.disabled = !applied || running() || s.busy || !!s.modal;
  if (!s.hotWaterDraft) return;
  const values = {
    targetTemperature: "hotWaterTemperature",
    volume: "hotWaterAmount",
    duration: "hotWaterDuration",
    flow: "hotWaterFlow",
  };
  Object.entries(values).forEach(([field, id]) => {
    $(id).textContent = fmt(s.hotWaterDraft[field]);
  });
  const modeChanged = s.hotWaterDraftByWeight !== undefined && s.hotWaterDraftByWeight !== hotWaterUsesWeight();
  if (modeChanged) { s.hotWaterMessage = t('hotWaterModeChanged'); s.hotWaterError = true; }
  $("hotWaterUnit").textContent = s.hotWaterDraftByWeight ? 'g' : 'mL';
  $("hotWaterMode").textContent = t(
    hotWaterUsesWeight() ? "hotWaterByWeight" : "hotWaterByVolume",
  );
  document.querySelectorAll("[data-hot-water-edit]").forEach((item) => {
    const field = item.dataset.hotWaterEdit;
    item.disabled =
      !editable() || s.hotWaterPolicyPending || num(s.hotWaterDraft[field]) === null;
    item.classList.toggle("dirty", s.hotWaterDraft[field] !== applied?.[field]);
  });
  $("hotWaterApply").disabled =
    !editable() || !hotWaterDirty() || s.workflowConflict || s.hotWaterPolicyPending || modeChanged;
  $("hotWaterReset").disabled =
    !editable() || (!hotWaterDirty() && !s.workflowConflict);
  $("hotWaterReset").textContent = t(s.workflowConflict ? "reloadRecipe" : "discard");
  $("hotWaterStart").hidden = !canStartFromScreen();
  $("hotWaterStart").disabled =
    !editable() ||
    machineState() !== "idle" ||
    hotWaterDirty() ||
    s.workflowConflict ||
    s.hotWaterPolicyPending;
  setGroupHeadHint($("hotWaterStartHint"),
    canStartFromScreen() ? "" : t("hotWaterPhysicalStart"), "water");
  $("hotWaterMessage").textContent = s.workflowConflict
    ? t(s.workflowConflictReason || "workflowConflictNotice")
    : s.hotWaterPolicyPending
      ? t("loading")
      : s.hotWaterMessage || "";
  $("hotWaterMessage").classList.toggle(
    "error",
    !!s.workflowConflict || !!s.hotWaterError,
  );
  if (s.modal === "keypadDialog" && s.keyReturn === "hotWaterDialog")
    renderKeypad();
}
async function openHotWater() {
  if (!s.workflow?.hotWaterData || running() || s.busy) return;
  const sequence = (s.hotWaterSequence ?? 0) + 1;
  s.hotWaterSequence = sequence;
  s.hotWaterDraft = clone(s.draft?.hotWaterData ?? s.workflow.hotWaterData);
  s.hotWaterDraftByWeight = hotWaterUsesWeight();
  s.hotWaterMessage = "";
  s.hotWaterError = false;
  s.hotWaterPolicyPending = true;
  $("hotWaterMore").open = false;
  openDialog("hotWaterDialog");
  try {
    const settings = await client.get("/settings");
    if (sequence === s.hotWaterSequence) s.settings = settings;
  } catch (error) {
    if (sequence === s.hotWaterSequence) {
      s.hotWaterMessage = explainError(error);
      s.hotWaterError = true;
    }
  } finally {
    if (sequence === s.hotWaterSequence) {
      s.hotWaterPolicyPending = false;
      renderHotWater();
    }
  }
}
function setHotWaterParam(key, value) {
  if (!editable() || !s.hotWaterDraft) return;
  const spec = parameterSpec(key);
  const [group, field] = key.split(".");
  if (
    group !== "hotWaterData" ||
    !spec ||
    !(field in s.hotWaterDraft) ||
    !Number.isFinite(value) ||
    value < spec.min ||
    value > spec.max
  )
    throw new Error(t("invalidValue"));
  s.hotWaterDraft[field] = value;
  s.hotWaterMessage = "";
  s.hotWaterError = false;
  renderHotWater();
}
async function applyHotWater() {
  if (!hotWaterDirty() || s.workflowConflict || s.hotWaterPolicyPending) return;
  const expected = clone(s.workflow);
  const requested = clone(expected);
  requested.hotWaterData = clone(s.hotWaterDraft);
  const preservedDraft = clone(s.draft);
  const byWeight = s.hotWaterDraftByWeight;
  if (byWeight !== hotWaterUsesWeight()) { toast(t("hotWaterModeChanged"),true); return; }
  const ok = await withWrite(async () => {
    const settings = await client.get("/settings");
    s.settings = settings;
    if (hotWaterUsesWeight(settings) !== byWeight)
      throw new Error(t("hotWaterModeChanged"));
    const current = await client.get("/workflow");
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      markWorkflowConflict(current);
      throw new Error(t("workflowConflictNotice"));
    }
    let read;
    try {
      read = await client.saveWorkflow(requested, expected);
    } catch (error) {
      if (error?.code === "workflowConflictNotice") {
        s.workflowConflict = true;
        throw new Error(t("workflowConflictNotice"));
      }
      throw error;
    }
    s.workflowRevision = (s.workflowRevision ?? 0) + 1;
    s.workflow = clone(read);
    s.draft = rebaseWorkflowDraft(expected, preservedDraft, read);
    s.draft.hotWaterData = clone(read.hotWaterData);
    s.hotWaterDraft = clone(read.hotWaterData);
    s.externalWorkflow = null;
    s.workflowConflict = false;
    s.workflowConflictReason = null;
  }, t("hotWaterApplied"));
  s.hotWaterMessage = ok ? t("hotWaterApplied") : s.error || t("requestFailed");
  s.hotWaterError = !ok;
  render();
}
async function resetHotWater() {
  if (!editable()) return;
  if (s.workflowConflict) {
    await resetDraft();
    if (s.workflowConflict) return;
  }
  s.hotWaterDraft = clone(s.workflow.hotWaterData);
  s.hotWaterDraftByWeight = hotWaterUsesWeight();
  s.hotWaterMessage = "";
  s.hotWaterError = false;
  renderHotWater();
}
function canReturnToDashboard() {
  return (
    window.__DECENT_HOST__?.app === "decent.app" &&
    typeof window.decentApp?.exitToDashboard === "function"
  );
}
function updateDashboardExitButton() {
  const button = $("returnDashboard");
  const available = canReturnToDashboard();
  button.hidden = !available;
  button.disabled = !available;
}
function returnToDashboard() {
  if (!canReturnToDashboard()) {
    updateDashboardExitButton();
    return;
  }
  try {
    window.decentApp.exitToDashboard();
  } catch (error) {
    $("settingsError").textContent = explainError(error);
  }
}
function renderSettings() {
  updateDashboardExitButton();
  renderDisplaySettings();
  renderUsageSetting();
  renderSkinUpdateSetting();
  $("serverUrl").value = s.baseUrl;
  $("deviceDetails").innerHTML =
    `${t("version")} ${escapeHTML(s.info?.fullVersion ?? "—")}<br>${s.devices
      .filter((d) => d.state === "connected")
      .map((d) => escapeHTML(d.name))
      .join(" · ")}`;
  let aux = $("auxSettings");
  if (!aux) {
    aux = document.createElement("div");
    aux.id = "auxSettings";
    $("deviceDetails").before(aux);
  }
  aux.innerHTML =
    `<h3>${t("auxSettings")}</h3>` +
    [
      ["rinseData", "flush"],
      ["steamSettings", "steam"],
      ["hotWaterData", "hotwater"],
    ]
      .map(
        ([group, label]) =>
          `<section class="aux-setting-group"><h4>${t(label)}</h4><div>${Object.entries(
            auxiliarySpecs,
          )
            .filter(
              ([path]) =>
                path.startsWith(group + ".") &&
                num(s.draft?.[group]?.[path.split(".")[1]]) !== null,
            )
            .map(
              ([path, spec]) =>
                `<button class="setting-value" data-aux-edit="${path}" ${!editable() ? "disabled" : ""}><span>${t(spec.label)}</span><strong>${fmt(getParam(path))}<small>${parameterSpec(path).unit}</small></strong></button>`,
            )
            .join("")}</div></section>`,
      )
      .join("") +
    `<button id="applyAux" class="button primary" ${!editable() || !dirty() || s.workflowConflict ? "disabled" : ""}>${s.language === "zh" ? "应用已修改参数" : "Apply changes"}</button>`;
  addSettingsExtras();
  $("auxSettings")
    .querySelectorAll("[data-aux-edit]")
    .forEach((b) => (b.onclick = () => openKeypad(b.dataset.auxEdit)));
  $("applyAux").onclick = async () => {
    await applyDraft();
    renderSettings();
  };
}
function renderUsageSetting() {
  const enabled = usageReporter?.enabled ?? true;
  $("usageEnabled").setAttribute("aria-checked", String(enabled));
  $("usageEnabled").textContent = t(enabled ? "usageOn" : "usageOff");
  $("usageStatus").hidden = usageReporter?.preferenceSaved !== false;
  $("usageStatus").textContent = $("usageStatus").hidden ? "" : t("usageUnsaved");
}
function renderSkinUpdateSetting() {
  const value=skinUpdater?.status ?? {phase:'disabled',enabled:false};
  const labels={disabled:'updateDisabled',waiting:'updateWaiting',checking:'updateChecking',installing:'updateInstalling',awaiting_confirmation:'updateConfirming',reload_pending:'updateReload',current:'updateCurrent',error:'updateError',unsupported:'updateUnsupported',storage_error:'updateStorageError'};
  $('skinUpdateEnabled').setAttribute('aria-checked',String(value.enabled));
  $('skinUpdateEnabled').textContent=t(value.enabled?'usageOn':'usageOff');
  $('skinUpdateStatus').textContent=t(labels[value.phase]??'updateWaiting')+(value.version?' · '+value.version:'')+(value.preferenceSaved===false&&value.phase!=='storage_error'?' '+t('updatePreferenceUnsaved'):'');
}
function skinUpdateContext() {
  const grinder=client?.grinder?.cachedState;
  const grinderBusy=grinder?.available!==false&&Boolean(s.grinderOperationPending||grinder?.busy||grinder?.operation||grinder?.state==='grinding'||['checking','unknown'].includes(grinder?.observation)||(grinder?.connected&&grinder.state!=='idle'));
  const dialog=[...document.querySelectorAll('.overlay:not([hidden]),[role="dialog"],[aria-modal="true"]')].some(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
  return {pageUrl:location.href,apiUrl:s.baseUrl,host:window.__DECENT_HOST__,connection:s.connection,settings:s.settings,machineState:machineState(),
    busy:s.busy||Boolean(s.awaiting)||running(),
    canInstall:!s.skinUpdating&&!s.modal&&!dialog&&!s.stopPending&&!s.stopAwaiting&&!s.displayDirty&&!s.favoriteBusy&&!s.scaleBusy&&!s.scaleTimerBusy&&!s.workflowConflict&&s.inventorySync?.status!=='pending'&&!grinderBusy&&!dirty()&&!hotWaterDirty()&&window.ceramicUI?.canAutoUpdate?.()===true};
}
function openSettings() {
  renderSettings();
  $("settingsError").textContent = "";
  openDialog("settingsDialog");
  displayManager?.refresh();
}

function renderDisplaySettings() {
  const state = s.displaySettings ?? {ready:false,preferences:DEFAULT_DISPLAY_PREFERENCES};
  const draft = s.displayDraft ?? state.preferences;
  for (const [id,key] of [["activeBrightness","activeBrightness"],["sleepBrightness","sleepBrightness"]]) {
    $(id).value = draft[key];
    $(id).disabled = !state.ready || state.busy;
    $(id + "Value").textContent = draft[key] === 100 ? t("displaySystem") : `${draft[key]}%`;
  }
  $("rotationMinutes").value = draft.rotationMinutes;
  $("rotationMinutes").disabled = !state.ready || state.busy;
  $("saveDisplay").disabled = !state.ready || state.busy || !s.displayDirty;
  $("retryDisplay").hidden = !state.error;
  $("retryDisplay").disabled = Boolean(state.busy);
  const actual = state.display;
  $("displayActual").textContent = actual
    ? actual.platformSupported.brightness
      ? `${t("displayActual")}${actual.brightness === 100 ? t("displaySystem") : `${actual.brightness}%`} · ${t("displayRequested")}${actual.requestedBrightness === 100 ? t("displaySystem") : `${actual.requestedBrightness}%`}${actual.lowBatteryBrightnessActive ? ` · ${t("displayBatteryCap")}` : ""}`
      : t("displayUnsupported")
    : state.error ? "" : t("displayReading");
  $("displayMessage").textContent = state.error ? t(state.error) : s.displayDirty ? t("displayDraft") : state.message ? t(state.message) : t("displayShared");
  $("displayMessage").classList.toggle("error-text", Boolean(state.error));
}

// All hardware actions go through the shared Decaid client. UI state changes only on readback.
$("chooseProfile").onclick = openProfiles;
$("profileSearch").oninput = renderProfiles;
$("profileList").onclick = (e) => {
  const onlineEntry=e.target.closest('[data-online-profiles]');if(onlineEntry){window.onlineProfiles?.open(onlineEntry.dataset.onlineProfiles);return;}
  const filter = e.target.closest("[data-filter]");
  if (filter) {
    s.favoriteOnly = filter.dataset.filter === "favorites";
    renderProfiles();
    return;
  }
  const button = e.target.closest("[data-profile-id]");
  if (button) {
    s.selectedProfileUnavailable = false;
    s.profileSelectionRevision = (s.profileSelectionRevision ?? 0) + 1;
    s.selectedProfile = s.profiles.find(
      (p) => p.id === button.dataset.profileId,
    );
    renderProfiles();
  }
};
$("applyProfile").onclick = applyProfile;
$("parameters").onclick = (e) => {
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    openKeypad(edit.dataset.edit);
    return;
  }
  const step = e.target.closest("[data-step]");
  if (step) {
    const [key, delta] = step.dataset.step.split(":");
    try {
      setParam(
        key,
        Math.round((getParam(key) + Number(delta) * paramSpec[key].step) * 10) /
          10,
      );
    } catch (error) {
      toast(explainError(error), true);
    }
  }
};
$("keypadKeys").onclick = (e) => {
  const button = e.target.closest("[data-key]");
  if (button) keypadInput(button.dataset.key);
};
$("keypadClear").onclick = () => {
  s.keyText = "";
  s.keyFresh = false;
  renderKeypad();
};
$("keypadDone").onclick = () => {
  try {
    const back = s.keyReturn;
    if(s.customNumber){const fn=s.customNumber;fn(Number(s.keyText));s.customNumber=null;s.keyReturn=null;closeDialog();if(back)openDialog(back);return;}
    if (back === "hotWaterDialog") setHotWaterParam(s.selectedKey, Number(s.keyText));
    else setParam(s.selectedKey, Number(s.keyText));
    s.keyReturn = null;
    closeDialog();
    if (back === "hotWaterDialog") openDialog("hotWaterDialog");
    else if (back==="settingsDialog") openSettings();
    else if(back)openDialog(back);
  } catch (error) {
    $("keypadError").textContent = explainError(error);
  }
};
$("applyDraft").onclick = applyDraft;
$("resetDraft").onclick = resetDraft;
$("saveProfile").onclick = openSave;
$("saveConfirm").onclick = saveAs;
$("profileDetails").onclick = openDetails;
$("chartDetails").onclick = () =>
  s.mode === "finished" && s.runId ? openHistory(s.runId) : openDetails();
$("startButton").onclick = () => sendCommand("espresso");
$("stopButton").onclick = () => sendCommand("stop");
$("hotWaterButton").onclick = openHotWater;
$("hotWaterApply").onclick = applyHotWater;
$("hotWaterReset").onclick = resetHotWater;
$("hotWaterStart").onclick = () => {
  if ($("hotWaterStart").disabled || !canStartFromScreen()) return;
  closeDialog();
  sendCommand("hotwater");
};
document.querySelectorAll("[data-hot-water-edit]").forEach((button) => {
  button.onclick = () => openKeypad(`hotWaterData.${button.dataset.hotWaterEdit}`);
});
document.querySelectorAll("[data-command]").forEach(
  (b) =>
    (b.onclick = () => {
      if (canStartFromScreen()) sendCommand(b.dataset.command);
      else {
        openSettings();
        const groups = {
          flush: "rinseData",
          steam: "steamSettings",
          hotwater: "hotWaterData",
        };
        const target = $("auxSettings").querySelector(
          `[data-aux-edit^="${groups[b.dataset.command]}."]`,
        );
        target?.scrollIntoView({ block: "center" });
        toast(t(b.dataset.command === "flush" ? "physicalFlush" : b.dataset.command === "steam" ? "physicalSteam" : "physicalHotWater"));
      }
    }),
);
$("powerButton").onclick = () =>
  sendCommand(machineState() === "sleeping" ? "wake" : "sleep");
$("tareButton").onclick = async () => {
  if ($("tareButton").disabled) return;
  $("tareButton").disabled = true;
  try {
    await client.tare();
    status(t("scaleTared"));
  } catch (error) {
    toast(explainError(error), true);
  } finally {
    render();
  }
};
$("historyButton").onclick = () => openHistory();
$("lastShotButton").onclick = () =>
  openHistory((s.lastShot ?? s.history[0])?.id);
$("refreshHistory").onclick = () => refreshHistory(true);
$("historyList").onclick = (e) => {
  const b = e.target.closest("[data-shot-id]");
  if (b) selectShot(b.dataset.shotId);
};
$("themeButton").onclick = $("settingsTheme").onclick = () =>
  setTheme(s.theme === "light" ? "dark" : "light");
$("languageButton").onclick = $("settingsLanguage").onclick = toggleLanguage;
$("settingsButton").onclick = $("connectionButton").onclick = openSettings;
$("skinUpdateEnabled").onclick = () => { skinUpdater?.setEnabled(!skinUpdater.enabled); renderSkinUpdateSetting(); };
$("usageEnabled").onclick = () => {
  usageReporter?.setEnabled(!usageReporter.enabled);
  renderUsageSetting();
};
for (const id of ["activeBrightness","sleepBrightness","rotationMinutes"]) $(id).oninput = () => {
  s.displayDraft = {...(s.displayDraft ?? s.displaySettings?.preferences ?? DEFAULT_DISPLAY_PREFERENCES),[id]:Number($(id).value)};
  s.displayDirty = true;
  renderDisplaySettings();
};
$("retryDisplay").onclick = () => displayManager?.refresh();
$("saveDisplay").onclick = async () => {
  const manager = displayManager;
  try {
    const result = await manager?.save(s.displayDraft);
    if (manager !== displayManager) return;
    if (result?.saved) { s.displayDirty = false; s.displayDraft = clone(s.displaySettings.preferences); }
  } catch (error) {
    if (manager !== displayManager) return;
    s.displaySettings.error = error.displayCode || "displaySaveFailed";
  }
  renderDisplaySettings();
};
$("galleryButton").onclick = openGallery;
$("nativeSettings").onclick = () => {
  location.href = `${s.baseUrl}/api/v1/plugins/settings.reaplugin/ui?backName=${enc(t("brand"))}`;
};
$("returnDashboard").onclick = returnToDashboard;
$("connectButton").onclick = async () => {
  const address = $("serverUrl").value.trim();
  $("connectButton").disabled = true;
  try {
    const ok = await connect(address);
    if (ok && s.workflow && s.connection.connected) closeDialog();
  } finally {
    $("connectButton").disabled = false;
  }
};
$("chartWrap").onpointermove = showChartCursor;
$("chartWrap").onpointerdown = showChartCursor;
$("chartWrap").onpointerleave = () => ($("chartTooltip").hidden = true);
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = closeDialog));
document.querySelectorAll(".overlay").forEach((el) =>
  el.addEventListener("pointerdown", (e) => {
    if (e.target === el) closeDialog();
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.(".gp-overlay")) return;
  if (e.key === "Escape" && s.modal) {
    closeDialog();
    return;
  }
  if (s.modal === "keypadDialog") {
    if (/^\d$/.test(e.key) || e.key === ".") {
      e.preventDefault();
      keypadInput(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      keypadInput("delete");
    } else if (e.key === "Enter" && !$("keypadDone").disabled) {
      e.preventDefault();
      $("keypadDone").click();
    }
  }
  if (e.key === "Tab" && s.modal) {
    const items = [
      ...$(s.modal).querySelectorAll(
        "button:not(:disabled),input:not(:disabled),textarea:not(:disabled)",
      ),
    ].filter((el) => el.offsetParent !== null);
    if (running()) items.push($("stopButton"));
    const index = items.indexOf(document.activeElement);
    if (e.shiftKey && index <= 0) {
      e.preventDefault();
      items.at(-1)?.focus();
    } else if (!e.shiftKey && index === items.length - 1) {
      e.preventDefault();
      items[0]?.focus();
    }
  }
});
new ResizeObserver(() => {
  renderChart();
  if (s.modal === "profileDialog") renderProfilePreview();
}).observe($("chartWrap"));
setTheme(s.theme);
localize();
usageReporter = createUsageReporter({getContext:() => ({
  pageUrl:location.href, apiUrl:s.baseUrl, host:window.__DECENT_HOST__,
  settings:s.settings, connection:s.connection, machineState:machineState(),
  busy:s.busy || Boolean(s.awaiting) || running(),
})});
usageReporter.start();
connect(s.baseUrl);
startWorkflowPolling();
window.addEventListener("pagehide", () => {
  persistRunDraft(true);
  displayManager?.stop();
  workflowPollClosed = true;
  clearInterval(workflowPollTimer);
  s.grinderSubscription?.();
  window.thisCupGrinderPanel?.closeProtection();
  s.grinderObserverStop?.();
  client?.close();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    client?.grinder.refreshObservation?.().catch(() => {});
    displayManager?.refresh();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    s.busy = false; s.awaiting = null;
    startWorkflowPolling();
    connect(s.baseUrl);
  }
});
// Device panels use these small hooks without gaining access to a second connection.
window.thisCup = {
  get client() {
    return client;
  },
  get state() {
    return s;
  },
  getWorkflow: () => clone(s.workflow),
  getProfileIdentity: () => s.workflowConflict ? null : s.profileIdentity,
  refreshProfileLibrary,
  isRunning: () => running() || Boolean(s.skinUpdating),
  stop: () => sendCommand("stop"),
  translate: t,
  notice: toast,
  openDialog,
  closeDialog,
  refreshContext: async () => {
    const c = await client.loadContext();
    s.devices = c.devices ?? [];
    s.profiles = c.profiles ?? [];
    setWorkflow(c.workflow);
    render();
  },
  onSnapshot,
  renderIntroShot: (svg, shot) => {
    const points = pointsOf(shot);
    if (!svg || points.length < 2) return false;
    plot(svg, points, {stageLabels:false});
    return true;
  },
  render,
};

// Peripheral controls do not gate the main coffee workflow unless Decaid itself requires a scale.
Object.assign(strings.zh, {
  apiWriteDuringRun: "发送设置期间机器状态已变化。设置可能已受理，请停止后核对，草稿已保留。",
  preferencesNotSaved: "偏好未保存，浏览器存储不可用",
  scaleConnectingBackground: "已关闭秤面板，可重新打开查看连接状态",
  readbackUnconfirmed: "操作未确认 · 草稿已保留",
  apiWorkflowSuperseded: "本次操作已被后续操作替代，结果未确认。草稿已保留，请重新读取后再调整。",
  apiWorkflowConflict: "设备拒绝了本次配方请求，冲突原因未确认。草稿已保留，请重新读取后再调整。",
  draftBeforeProfileChange: "请先应用或还原本杯调整，再切换方案。",
  draftBeforeAddressChange: "草稿已保留。请先应用或还原，再连接其他地址。",
  invalidAddress: "请输入有效的 Decaid HTTP 或 HTTPS 地址。",
  favoriteReadbackMismatch: "收藏读回与请求不同，本次更新未确认。",
  scalePowerWriteUnknown: "保存响应中断，结果未确认。本页已暂停修改此设置；其他功能可正常使用。",
  scalePowerUnconfirmed: "设置结果未确认，请重新打开此页读取实际设置。",
  scalePowerReadbackMismatch: "秤休眠设置读回与请求不同，本次设置未生效或已被更改。",
  apiInvalidResponse: "设备返回了无法读取的数据",
  apiRequestFailed: "设备请求失败",
  apiNetworkError: "设备连接失败，请检查连接；已发送的操作请先核实结果。",
  apiNoScale: "未连接秤；Decaid 当前设置要求先连接秤",
  apiTareDuringShot: "萃取中不可清零",
  apiReadTimeout: "读取设备超时，请检查连接",
  apiWriteTimeout: "设备响应超时，操作结果待核实；请勿重复点击",
  apiMachineRunning: "机器正在运行，停止后才能更改",
  apiUnknownState: "尚未确认机器状态，请重新读取后再操作",
  apiWriteBusy: "上一项操作仍在处理",
  apiInvalidProfile: "该方案缺少可执行步骤",
  apiUnknownAction: "未知操作",
  apiPhysicalStart: "这台机器需按冲煮头实体按键启动",
  apiUnknownCapability: "尚未确认机器的启动能力",
  apiStateUnconfirmed: "已发送请求，但机器尚未进入目标状态；请检查冲煮头按键和设备状态",
  sameExecutionExists: "Decaid 已有相同曲线参数的方案，不能只改名称另存。",
  saveReadbackMismatch: "保存后的名称或参数与本次提交不一致，保存结果尚未确认。",
  workflowConflict: "其他页面已修改配方",
  workflowConflictNotice:
    "其他页面已修改配方，草稿已保留。请先重新读取，再调整。",
  reloadRecipe: "重新读取",
  workflowReloaded: "已重新读取当前配方",
  stopped: "已停止",
  state_cleaning: "正在清洁",
  state_descaling: "正在除垢",
  state_fwupgrade: "固件更新中",
  state_busy: "机器处理中",
  state_error: "机器需要检查",
  state_booting: "机器启动中",
  state_calibration: "正在校准",
  state_selftest: "机器自检中",
  state_airpurge: "正在排空",
  gallery: "待机图库",
  allIllustrations: "经典插画",
  slideshow: "自动轮播",
  useImage: "使用这张",
  imageSaved: "待机图片已设置",
  manualGrindSaved: "研磨备注已加入草稿",
  physicalStart: "按冲煮头按键开始",
  physicalFlush: "请按冲煮头上的冲洗键开始冲洗",
  physicalSteam: "请按冲煮头上的蒸汽键开始出蒸汽",
  physicalHotWater: "请按冲煮头上的热水键开始出热水",
  flushSettings: "冲洗设置",
  steamSettings: "蒸汽设置",
  hotwaterSettings: "热水设置",
  moreHistory: "加载更早记录",
  scalePower: "机器休眠时",
  displayOff: "休眠并保持连接",
  disconnectMode: "关机并断开",
  disabledMode: "保持开启",
  scalePowerHint: "休眠：唤醒机器时恢复称重。关机：需手动开秤后重连。手动断开也可能关闭秤电源，具体行为取决于秤的支持情况。",
  timerStart: "计时开始",
  timerStop: "计时暂停",
  timerReset: "计时归零",
  timerCommandSent: "计时指令已发送",
  timerReading: "秤计时",
  scaleStale: "秤读数已过期",
  needsWater: "给水箱加点水",
  waterHint: "补水后，机器会自行恢复。",
  ambientBack: "查看状态",
  ambientWake: "唤醒咖啡机",
  scaleBlocked: "Decaid 设置要求连接秤后才能萃取",
  scaleOptional: "未连接秤，无法按重量停杯",
  grinderNotes: "研磨备注",
  grinderModel: "磨豆机",
  grinderSetting: "研磨刻度",
  connectMachine: "连接咖啡机",
  available: "可连接",
  unavailable: "未发现",
  connectingDevice: "连接中",
  deviceDisconnected: "已断开",
});
Object.assign(strings.en, {
  apiWriteDuringRun: "Machine state changed while saving. The request may already be accepted. Check settings after stopping; your draft is retained.",
  preferencesNotSaved: "Preferences could not be saved. Browser storage is unavailable.",
  scaleConnectingBackground: "Reopen the scale panel to check the connection.",
  readbackUnconfirmed: "Update unconfirmed · draft retained",
  apiWorkflowSuperseded: "This operation was superseded by a later operation. The result is unconfirmed. Your draft is retained; reload before adjusting again.",
  apiWorkflowConflict: "The device rejected this recipe request. The cause of the conflict is unconfirmed. Your draft is retained; reload before adjusting again.",
  draftBeforeProfileChange: "Apply or reset your cup changes before switching profiles.",
  draftBeforeAddressChange: "Your draft is retained. Apply or reset it before connecting to another address.",
  invalidAddress: "Enter a valid Decaid HTTP or HTTPS address.",
  favoriteReadbackMismatch: "Favorite readback differs from the request. This update is unconfirmed.",
  scalePowerWriteUnknown: "The save response was interrupted. Further changes to this setting are paused on this page; other features remain available.",
  scalePowerUnconfirmed: "Setting not confirmed. Reopen this page to check the saved value.",
  scalePowerReadbackMismatch: "Scale sleep readback differs from the request. The setting was not applied or was changed elsewhere.",
  apiInvalidResponse: "The device returned unreadable data",
  apiRequestFailed: "Device request failed",
  apiNetworkError: "The device connection failed. Check the connection and verify any request already sent.",
  apiNoScale: "No scale is connected. Decaid requires a scale before brewing.",
  apiTareDuringShot: "The scale cannot be tared during a shot",
  apiReadTimeout: "Reading the device timed out. Check the connection.",
  apiWriteTimeout: "The device response timed out. Verify the result before trying again.",
  apiMachineRunning: "The machine is running. Stop it before making changes.",
  apiUnknownState: "The machine state is unconfirmed. Reload before continuing.",
  apiWriteBusy: "The previous operation is still in progress",
  apiInvalidProfile: "This profile has no executable stages",
  apiUnknownAction: "Unknown action",
  apiPhysicalStart: "Use the physical group-head button to start this machine",
  apiUnknownCapability: "The machine's start capability has not been confirmed",
  apiStateUnconfirmed: "Request sent, but the machine has not reached the requested state. Check the group-head button and machine status.",
  sameExecutionExists: "Decaid already has a profile with these curve settings. A different name alone cannot create another copy.",
  saveReadbackMismatch: "The saved name or settings differ from what you submitted. The save could not be confirmed.",
  workflowConflict: "Recipe changed elsewhere",
  workflowConflictNotice:
    "Another page changed the recipe. Your draft is retained. Reload before making further changes.",
  reloadRecipe: "Reload recipe",
  workflowReloaded: "Current recipe reloaded",
  stopped: "Stopped",
  state_cleaning: "Cleaning",
  state_descaling: "Descaling",
  state_fwupgrade: "Updating firmware",
  state_busy: "Machine busy",
  state_error: "Check the machine",
  state_booting: "Machine starting",
  state_calibration: "Calibrating",
  state_selftest: "Self-test",
  state_airpurge: "Purging",
  gallery: "Sleep gallery",
  allIllustrations: "Classic illustrations",
  slideshow: "Slideshow",
  useImage: "Use this image",
  imageSaved: "Sleep image saved",
  manualGrindSaved: "Grind notes added to draft",
  physicalStart: "Start with the group-head button",
  physicalFlush: "Press the flush button on the group head to start rinsing",
  physicalSteam: "Press the steam button on the group head to start steaming",
  physicalHotWater: "Press the hot-water button on the group head to dispense water",
  flushSettings: "Flush settings",
  steamSettings: "Steam settings",
  hotwaterSettings: "Hot water settings",
  moreHistory: "Load earlier shots",
  scalePower: "When the machine sleeps",
  displayOff: "Sleep and stay connected",
  disconnectMode: "Power off and disconnect",
  disabledMode: "Keep scale on",
  scalePowerHint: "Sleep resumes weighing when the machine wakes. Power off requires turning the scale on manually before reconnecting. Disconnecting manually may also power the scale off. Support varies by scale.",
  timerStart: "Start timer",
  timerStop: "Pause timer",
  timerReset: "Reset timer",
  timerCommandSent: "Timer command sent",
  timerReading: "Scale timer",
  scaleStale: "Scale readings are stale",
  needsWater: "Time to refill the tank",
  waterHint: "The machine will resume when water is available.",
  ambientBack: "View status",
  ambientWake: "Wake the machine",
  scaleBlocked: "Decaid requires a connected scale before brewing",
  scaleOptional: "No scale · weight stop unavailable",
  grinderNotes: "Grind notes",
  grinderModel: "Grinder",
  grinderSetting: "Grind setting",
  connectMachine: "Connect machine",
  available: "Available",
  unavailable: "Not found",
  connectingDevice: "Connecting",
  deviceDisconnected: "Disconnected",
});
function setupExtraPanels() {
  const scale = document.createElement("div");
  scale.className = "overlay";
  scale.id = "scaleDialog";
  scale.hidden = true;
  scale.setAttribute("role", "dialog");
  scale.setAttribute("aria-modal", "true");
  scale.innerHTML = `<section class="dialog scale-dialog"><header class="dialog-header"><h2 id="scaleDialogTitle">${t("scaleDialog")}</h2><button id="scanScales" class="text-button">${t("scan")}</button><button id="closeScale" class="close-button" aria-label="${t("back")}">×</button></header><div class="dialog-content"><div id="scaleList" class="scale-list"></div><div class="scale-controls"><strong id="scalePanelWeight">— g</strong><span id="scalePanelTimer" hidden></span><button id="scalePanelTare" class="button secondary">${t("tare")}</button></div><div id="scaleTimerControls" class="scale-controls"><button data-timer="start" class="button secondary">${t("timerStart")}</button><button data-timer="stop" class="button secondary">${t("timerStop")}</button><button data-timer="reset" class="button secondary">${t("timerReset")}</button></div><div class="scale-mode"><label for="scalePowerMode">${t("scalePower")}</label><select id="scalePowerMode"><option value="displayOff">${t("displayOff")}</option><option value="disconnect">${t("disconnectMode")}</option><option value="disabled">${t("disabledMode")}</option></select></div><p id="scalePowerHint" class="scale-power-hint"></p><p id="scalePanelMessage" class="error-text" role="status"></p></div><footer class="dialog-footer"><button id="scaleBack" class="button secondary">${t("back")}</button></footer></section>`;
  document.body.append(scale);
  $("closeScale").onclick = $("scaleBack").onclick = closeDialog;
  $("scanScales").onclick = scanScales;
  $("scaleList").onclick = (e) => {
    const b = e.target.closest("[data-scale-connect]");
    if (b) connectScale(b.dataset.scaleConnect, b.dataset.connected === "true");
  };
  $("scalePanelTare").onclick = () => $("tareButton").click();
  scale
    .querySelectorAll("[data-timer]")
    .forEach((b) => (b.onclick = () => scaleTimer(b.dataset.timer)));
  $("scalePowerMode").onchange = saveScalePower;
  scale.onpointerdown = (e) => {
    if (e.target === scale) closeDialog();
  };
  $("scaleButton").onclick = openScales;
  const ambient = document.createElement("section");
  ambient.id = "ambientScreen";
  ambient.className = "ambient-screen";
  ambient.hidden = true;
  ambient.innerHTML =
    '<img id="ambientImage" alt=""><div class="ambient-shade"></div><div class="ambient-top"><span id="ambientClock" class="ambient-clock"></span><button id="ambientBack"></button></div><div class="ambient-content"><h2 id="ambientTitle"></h2><p id="ambientMessage"></p></div>';
  document.body.append(ambient);
  $("ambientBack").onclick = () => {
    s.ambientDismissed = machineState();
    renderDevicesAndAmbient();
  };
  const wakeFromImage = () => {
    if (machineState() === "sleeping" && connected() && !s.awaiting)
      sendCommand("wake");
  };
  ambient.addEventListener("click", wakeFromImage);
  ambient.addEventListener("keydown", (e) => {
    if (machineState() !== "sleeping") return;
    e.stopPropagation();
    if (["Enter", " ", "Tab"].includes(e.key)) e.preventDefault();
    if (!e.repeat && ["Enter", " "].includes(e.key)) wakeFromImage();
  });
  async function loadAmbientAssets(attempt=0) {
    try {
      const response=await fetch('./assets/ambient.json',{cache:'no-store'});
      if(!response.ok) throw new Error('manifest');
      const data=await response.json();
      if(!Array.isArray(data.sleep) || !data.sleep.length) throw new Error('manifest');
      s.ambientAssets=data; renderDevicesAndAmbient();
    } catch {
      if(attempt<12) setTimeout(()=>loadAmbientAssets(attempt+1),Math.min(30000,2000*(attempt+1)));
    }
  }
  loadAmbientAssets();
  document.addEventListener(
    "pointerdown",
    () => {
      if (
        connected() &&
        machineState() !== "sleeping" &&
        Date.now() - (s.lastHeartbeat ?? 0) > 15000
      ) {
        s.lastHeartbeat = Date.now();
        client.post("/machine/heartbeat").catch(() => {});
      }
    },
    { passive: true },
  );
}
function renderDevicesAndAmbient() {
  const scaleButton = $("scaleButton");
  if (!scaleButton) return;
  scaleButton.classList.toggle(
    "connected",
    s.connection.scaleConnected && !s.connection.scaleStale,
  );
  scaleButton.title = s.connection.scaleStale
    ? t("scaleStale")
    : t(s.connection.scaleConnected ? "scaleReady" : "scaleOffline");
  if (s.connection.scaleStale) {
    $("weightTitle").textContent = t("scaleStale");
    $("weightNote").textContent = t("scaleStale");
  } else $("weightTitle").textContent = s.mode === "running" ? (s.language === "zh" ? "当前出液" : "Cup weight") : t("liveWeight");
  if (!s.connection.scaleConnected && machineState() === "idle" && !s.awaiting && s.mode !== "finished") {
    const blocked = !!s.settings?.blockOnNoScale;
    const physical = !blocked && !canStartFromScreen();
    const detail = $("stateDetail");
    const message = blocked ? t("scaleBlocked") : t("scaleOptional");
    setGroupHeadHint(detail, physical ? t("physicalStart") + "\n" + message : message, physical ? "brew" : null);
  }
  if ($("scalePanelWeight")) {
    $("scalePanelWeight").textContent = s.connection.scaleStale ? t("scaleStale") : `${fmt(s.snapshot.scale?.weight)} g`;
    $("scalePanelTare").disabled =
      !s.connection.scaleConnected || running() || s.connection.scaleStale;
    document
      .querySelectorAll("[data-timer]")
      .forEach(
        (b) =>
          (b.disabled =
            !s.connection.scaleConnected || running() || !!s.scaleTimerBusy),
      );
    renderScaleTimer();
  }
  if (Array.isArray(s.snapshot.devices)) {
    const changed = JSON.stringify(s.devices) !== JSON.stringify(s.snapshot.devices);
    s.devices = s.snapshot.devices;
    if (changed && s.modal === "scaleDialog") renderScaleList();
  }
  const ambient = $("ambientScreen");
  if (!ambient) return;
  const state = machineState(),
    isSleep = state === "sleeping",
    isWater = state === "needswater";
  const grinder = client?.grinder.cachedState;
  const uncertainGrinder = ["checking", "unknown"].includes(grinder?.observation);
  if (grinder?.busy || grinder?.state === "grinding" || grinder?.operation)
    s.grinderOperationPending = true;
  else if ((!grinder?.observation || grinder.observation === "ready") && grinder?.connected && grinder.state === "idle")
    s.grinderOperationPending = false;
  if (!uncertainGrinder && !s.grinderOperationPending)
    window.thisCupGrinderPanel?.closeProtection();
  if ((isSleep || isWater) && (s.grinderOperationPending || uncertainGrinder)) {
    // Unknown remote state must not cover Stop. This mode only observes; unlike
    // a manual panel open, it never connects the grinder or requests readAll.
    ambient.hidden = true;
    window.thisCupGrinderPanel?.openProtection();
    return;
  }
  if (!isSleep && !isWater) {
    s.ambientDismissed = null;
    ambient.hidden = true;
    return;
  }
  if (s.ambientDismissed === state) {
    ambient.hidden = true;
    return;
  }
  const enteringSleep =
    isSleep && (ambient.hidden || !ambient.classList.contains("sleep"));
  ambient.hidden = false;
  ambient.className = `ambient-screen ${isSleep ? "sleep" : "water"}`;
  ambient.querySelector(".ambient-shade").hidden = isSleep;
  ambient.querySelector(".ambient-top").hidden = isSleep;
  ambient.querySelector(".ambient-content").hidden = isSleep;
  if (isSleep) {
    ambient.setAttribute("role", "button");
    ambient.setAttribute("aria-label", t("ambientWake"));
    ambient.setAttribute(
      "aria-disabled",
      String(!connected() || !!s.awaiting || s.busy),
    );
    ambient.tabIndex = 0;
  } else {
    ambient.removeAttribute("role");
    ambient.removeAttribute("aria-label");
    ambient.removeAttribute("aria-disabled");
    ambient.removeAttribute("tabindex");
  }
  $("ambientClock").textContent = isSleep
    ? ""
    : new Date().toLocaleTimeString(
        s.language === "zh" ? "zh-CN" : "en-GB",
        { hour: "2-digit", minute: "2-digit" },
      );
  $("ambientBack").textContent = isSleep ? "" : t("ambientBack");
  $("ambientTitle").textContent = isSleep ? "" : t("needsWater");
  $("ambientMessage").textContent = isSleep
    ? ""
    : !connected()
      ? t("connectionLost")
      : t("waterHint");
  const assets = s.ambientAssets;
  const rawSleep = assets?.sleep ?? assets?.sleepImages ?? [];
  let images = Array.isArray(rawSleep) ? rawSleep : [];
  try {
    const chosen = JSON.parse(store.get("sleepImages", "null"));
    if (Array.isArray(chosen) && chosen.length) {
      const filtered = images.filter((path) => chosen.includes(path));
      if (filtered.length) images = filtered;
    }
  } catch {}
  const savedImage = store.get("sleepImage", "");
  const raw = isSleep
    ? savedImage && images.includes(savedImage)
      ? savedImage
      : images[(s.ambientIndex ?? 0) % Math.max(1, images.length)]
    : (assets?.waterNeeded ?? assets?.water ?? assets?.needsWater);
  const image = typeof raw === "string" ? raw : (raw?.src ?? raw?.path);
  if (image) {
    const path =
      image.startsWith("assets/") ||
      image.startsWith("./") ||
      image.startsWith("/")
        ? image
        : `assets/${image}`;
    if ($("ambientImage").getAttribute("src") !== path)
      $("ambientImage").src = path;
    $("ambientImage").hidden = false;
  } else { $("ambientImage").src = "assets/sleep/1280x800/Cozy-Home.jpg"; $("ambientImage").hidden = false; }
  if (enteringSleep) {
    scheduleAmbientRotation();
    ambient.focus({ preventScroll: true });
  }
}
function scheduleAmbientRotation() {
  clearTimeout(s.ambientTimer);
  s.ambientTimer = setTimeout(() => {
    if (machineState() !== "sleeping" || $("ambientScreen").hidden) return;
    s.ambientIndex = (s.ambientIndex ?? 0) + 1;
    renderDevicesAndAmbient();
    scheduleAmbientRotation();
  }, (s.displaySettings?.preferences?.rotationMinutes ?? 20) * 60 * 1000);
}
async function openScales() {
  const sequence = s.scalePanelSequence = (s.scalePanelSequence ?? 0) + 1;
  const scaleClient = client;
  const settingsRevision = s.scaleSettingsRevision ?? 0;
  const active = () => s.modal === "scaleDialog" && s.scalePanelSequence === sequence && client === scaleClient;
  openDialog("scaleDialog");
  renderScalePanel();
  try {
    const [, settings] = await Promise.all([
      scaleClient.refreshDevices(),
      scaleClient.get("/settings"),
    ]);
    if (!active()) return;
    const devices = scaleClient.snapshot.devices;
    s.devices = devices;
    if ((s.scaleSettingsRevision ?? 0) === settingsRevision) s.settings = settings;
    renderScalePanel();
    const scales=devices.filter(d=>d.type==='scale');
    const only = scales.length === 1 ? scales[0] : null;
    if (only?.available === true && !["connected","connecting"].includes(only.state) &&
        scaleClient.manuallyDisconnectedScale !== only.id && settings &&
        (!settings.preferredScaleId || settings.preferredScaleId === only.id)) {
      await connectScale(only.id, false);
    }
  } catch (error) {
    if (!active() || (s.scaleSettingsRevision ?? 0) !== settingsRevision) return;
    $("scalePanelMessage").textContent = explainError(error);
    window.ceramicUI?.error(new Error(explainError(error)),openScales);
  }
}
function renderScalePanel() {
  $("scaleDialogTitle").textContent = t("scaleDialog");
  $("scanScales").textContent = t("scan");
  $("scanScales").disabled = !!s.scaleBusy || running();
  $("scaleBack").textContent = t("back");
  $("closeScale").setAttribute("aria-label", t("back"));
  $("scalePanelTare").textContent = t("tare");
  $("scalePowerMode").previousElementSibling.textContent = t("scalePower");
  $("scalePowerHint").textContent = t(scalePowerRequests.get(s.baseUrl)?.uncertain ? "scalePowerWriteUnknown" : "scalePowerHint");
  [...$("scalePowerMode").options].forEach(
    (option) =>
      (option.textContent = t(
        {
          displayOff: "displayOff",
          disconnect: "disconnectMode",
          disabled: "disabledMode",
        }[option.value],
      )),
  );
  $("scalePowerMode").value = s.settings?.scalePowerMode ?? "disabled";
  $("scalePowerMode").disabled = scalePowerRequests.has(s.baseUrl);
  document
    .querySelectorAll("[data-timer]")
    .forEach(
      (b) =>
        (b.textContent = t(
          { start: "timerStart", stop: "timerStop", reset: "timerReset" }[
            b.dataset.timer
          ],
        )),
    );
  renderScaleList();
  renderDevicesAndAmbient();
}
function renderScaleList() {
  const list = $("scaleList");
  const focused = list.contains(document.activeElement);
  const focusedId = document.activeElement?.dataset?.scaleConnect;
  const scales = s.devices.filter((d) => d.type === "scale");
  $("scaleList").innerHTML = scales.length
    ? scales
        .map(
          (d) =>
            `<div class="scale-item"><div><strong>${escapeHTML(d.name)}</strong><small>${t(d.state === "connected" ? "scaleReady" : d.state === "connecting" ? "connectingDevice" : d.available ? "available" : "deviceDisconnected")}</small></div><button class="button secondary" data-scale-connect="${escapeHTML(d.id)}" data-connected="${d.state === "connected"}" ${running() || s.scaleBusy || d.state === "connecting" ? "disabled" : ""}>${t(d.state === "connected" ? "disconnect" : "connect")}</button></div>`,
        )
        .join("")
    : `<div class="empty-message">${t("noScale")}</div>`;
  if (focused) {
    const next = [...list.querySelectorAll('[data-scale-connect]')]
      .find(button => button.dataset.scaleConnect === focusedId && !button.disabled);
    (next || $("closeScale")).focus({preventScroll:true});
  }
}
async function scanScales() {
  if (s.scaleBusy || running()) return;
  const owner = client;
  const sequence = s.scalePanelSequence;
  const visible = () => owner === client && sequence === s.scalePanelSequence && s.modal === "scaleDialog";
  s.scaleBusy = true;
  $("scanScales").disabled = true;
  $("scalePanelMessage").textContent = t("loading");
  try {
    const devices = await owner.scanDevices();
    if (!visible()) return;
    s.devices = devices;
    $("scalePanelMessage").textContent = t("scanDone");
  } catch (error) {
    if (visible()) $("scalePanelMessage").textContent = explainError(error);
  } finally {
    s.scaleBusy = false;
    $("scanScales").disabled = false;
    renderScalePanel();
  }
}
async function connectScale(id, disconnect) {
  if (s.scaleBusy || running()) return;
  const sequence = s.scalePanelSequence;
  const scaleClient = client;
  const active = () => s.modal === "scaleDialog" && s.scalePanelSequence === sequence && client === scaleClient;
  if (!active()) return;
  s.scaleBusy = true;
  renderScalePanel();
  $("scalePanelMessage").textContent = t(
    disconnect ? "scaleDisconnecting" : "scaleConnecting",
  );
  try {
    if (disconnect) {
      scaleClient.manuallyDisconnectedScale = id;
      await scaleClient.put("/devices/disconnect", {deviceId:id});
    } else {
      scaleClient.manuallyDisconnectedScale = null;
      const discovered = await scaleClient.scanDevices();
      if (!active() || running()) return;
      const availableTarget = devices => {
        const device = devices.find(d => d.id === id && d.type === "scale");
        if (device && (device.available !== false || ["connected","connecting"].includes(device.state))) return device;
        throw new Error(s.language === "zh" ? "没有找到这台秤。请确认秤已开机，再点连接。" :
          "Scale not found. Turn it on, then tap Connect again.");
      };
      const target = availableTarget(discovered);
      // A scan can itself complete native auto-connect. Do not connect twice.
      if (target.state !== "connected" && target.state !== "connecting") {
        // A physical start can reach the host before its next UI status frame.
        await scaleClient.requireIdle();
        if (!active() || running()) return;
        const current = availableTarget(scaleClient.snapshot.devices);
        if (!["connecting","connected"].includes(current?.state)) {
          try {
            await scaleClient.put("/devices/connect", {deviceId:id});
          } catch (error) {
            if (!active()) return;
            const latest = await scaleClient.refreshDevices();
            if (!latest.some(d => d.id === id && ["connecting","connected"].includes(d.state))) throw error;
          }
        }
      }
    }
    if (!active()) return;
    const devices = await scaleClient.refreshDevices();
    if (!active()) return;
    s.devices = devices;
    let matched = false;
    for(let attempt=0;attempt<8;attempt++){
      const device=s.devices.find(d=>d.id===id);
      matched=disconnect?device?.state!=="connected":device?.state==="connected";
      if(matched)break;
      await new Promise(resolve=>setTimeout(resolve,500));
      if(!active())return;
      const devices=await scaleClient.refreshDevices();
      if(!active())return;
      s.devices=devices;
    }
    if(!matched)throw new Error(s.language==='zh'?'蓝牙秤未连接，请确认秤已开机且未被其他应用占用。':'Scale did not connect. Check that it is on and not connected to another app.');
    $("scalePanelMessage").textContent = t(disconnect?"deviceDisconnected":"connected");
  } catch (error) {
    if (!active()) return;
    $("scalePanelMessage").textContent = explainError(error);
    window.ceramicUI?.error(new Error(explainError(error)),()=>connectScale(id,disconnect));
  } finally {
    s.scaleBusy = false;
    renderScalePanel();
  }
}
function renderScaleTimer() {
  const output = $("scalePanelTimer");
  if (!output) return;
  const milliseconds = num(s.snapshot.scale?.timerValue);
  const available =
    s.connection.scaleConnected &&
    !s.connection.scaleStale &&
    milliseconds !== null &&
    milliseconds >= 0;
  output.hidden = !available;
  if (!available) {
    output.textContent = "";
    return;
  }
  const seconds = Math.floor(milliseconds / 1000);
  output.textContent = `${t("timerReading")} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
async function scaleTimer(action) {
  if (
    !s.connection.scaleConnected ||
    running() ||
    s.scaleTimerBusy ||
    !["start", "stop", "reset"].includes(action)
  )
    return;
  s.scaleTimerBusy = true;
  $("scalePanelMessage").textContent = t("loading");
  renderDevicesAndAmbient();
  try {
    await client.put(`/scale/timer/${action}`);
    $("scalePanelMessage").textContent = t("timerCommandSent");
  } catch (error) {
    $("scalePanelMessage").textContent = explainError(error);
  } finally {
    s.scaleTimerBusy = false;
    renderDevicesAndAmbient();
  }
}
const scalePowerRequests = new Map();
async function saveScalePower() {
  const sourceClient = client;
  const sourceUrl = s.baseUrl;
  if (scalePowerRequests.has(sourceUrl)) return;
  const request = { client: sourceClient, connection: s.connectSequence, panel: s.scalePanelSequence };
  const current = () => client === sourceClient && s.connectSequence === request.connection;
  const visible = () => current() && s.modal === "scaleDialog" && s.scalePanelSequence === request.panel;
  const value = $("scalePowerMode").value;
  s.scalePowerSave = request;
  scalePowerRequests.set(sourceUrl, request);
  s.scaleSettingsRevision = (s.scaleSettingsRevision ?? 0) + 1;
  $("scalePowerMode").disabled = true;
  try {
    await sourceClient.post("/settings", { scalePowerMode: value });
    request.acknowledged = true;
    if (!current()) return;
    const settings = await sourceClient.get("/settings");
    if (!current()) return;
    s.settings = settings;
    $("scalePowerMode").value = settings?.scalePowerMode ?? "disabled";
    if (settings?.scalePowerMode !== value)
      throw new Error(t("scalePowerReadbackMismatch"));
    if (visible()) toast(t("settingsSaved"));
  } catch (error) {
    // A transport failure does not mean the server abandoned the write.
    request.uncertain = !request.acknowledged && (!error.status || error.code === "apiInvalidResponse");
    if (request.uncertain && s.baseUrl === sourceUrl) {
      $("scalePowerHint").textContent = t("scalePowerWriteUnknown");
    }
    if (!current()) return;
    $("scalePowerMode").value = s.settings?.scalePowerMode ?? "disabled";
    if (s.modal === "scaleDialog") {
      $("scalePanelMessage").textContent = t("scalePowerUnconfirmed");
      toast(t("scalePowerUnconfirmed") + " " + explainError(error), true);
    }
  } finally {
    if (!request.uncertain && scalePowerRequests.get(sourceUrl) === request) scalePowerRequests.delete(sourceUrl);
    if (s.scalePowerSave === request) s.scalePowerSave = null;
    if (current()) {
      // Ignore settings reads begun before this save finished.
      s.scaleSettingsRevision = (s.scaleSettingsRevision ?? 0) + 1;
      $("scalePowerMode").disabled = scalePowerRequests.has(s.baseUrl);
    } else if (s.baseUrl === sourceUrl && s.modal === "scaleDialog") {
      // A reconnect to the same server must wait for its earlier write, then refresh.
      await openScales();
    }
  }
}

setupExtraPanels();
async function loadMoreHistory() {
  const sourceClient=client;
  try {
    const result = await sourceClient.history(s.history.length, 50);
    if(sourceClient!==client)return;
    const rows = Array.isArray(result) ? result : (result?.items ?? []);
    s.historyHasMore = rows.length === 50;
    const known = new Set(s.history.map((x) => x.id));
    s.history.push(...rows.filter((x) => !known.has(x.id)));
    renderHistoryList();
  } catch (error) {
    toast(explainError(error), true);
  }
}
function addSettingsExtras() {
  let node = $("settingsExtras");
  if (!node) {
    node = document.createElement("div");
    node.id = "settingsExtras";
    $("deviceDetails").before(node);
  }
  node.innerHTML = `<h3>${t("grinderNotes")}</h3><div class="setting-row"><label for="manualGrinder">${t("grinderModel")}</label><input id="manualGrinder" maxlength="120" value="${escapeHTML(s.draft?.context?.grinderModel ?? "")}" ${!editable() ? "disabled" : ""}></div><div class="setting-row"><label for="manualGrindSetting">${t("grinderSetting")}</label><input id="manualGrindSetting" maxlength="120" value="${escapeHTML(s.draft?.context?.grinderSetting ?? "")}" ${!editable() ? "disabled" : ""}></div><button id="stageGrindNotes" class="text-button" ${!editable() ? "disabled" : ""}>${s.language === "zh" ? "记入本杯草稿" : "Add to cup draft"}</button>`;
  $("stageGrindNotes").onclick = () => {
    if (!editable()) return;
    s.draft.context = {
      ...s.draft.context,
      grinderModel: $("manualGrinder").value.trim(),
      grinderSetting: $("manualGrindSetting").value.trim(),
    };
    render();
    $("applyAux").disabled = !editable() || !dirty() || !!s.workflowConflict;
    toast(t("manualGrindSaved"));
  };
}
function openGallery(preserve = false) {
  let dialog = $("galleryDialog");
  const sleeps = s.ambientAssets?.sleep ?? [];
  const classics = s.ambientAssets?.classic ?? [];
  if (preserve !== true || !s.gallerySelection) {
    let saved;
    try {
      saved = JSON.parse(store.get("sleepImages", "null"));
    } catch {}
    s.gallerySelection = new Set(
      Array.isArray(saved) && saved.length ? saved : sleeps,
    );
  }
  if (!dialog) {
    dialog = document.createElement("div");
    dialog.id = "galleryDialog";
    dialog.className = "overlay";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML =
      '<section class="dialog gallery-dialog"><header class="dialog-header"><h2 id="galleryTitle"></h2><button id="gallerySlideshow" class="button secondary"></button><button id="galleryClear" class="text-button"></button><button id="closeGallery" class="close-button">×</button></header><div id="galleryGrid" class="gallery-grid"></div><footer class="dialog-footer"><span id="galleryHint"></span><button id="galleryBack" class="button secondary"></button><button id="gallerySave" class="button primary"></button></footer></section>';
    document.body.append(dialog);
    $("closeGallery").onclick = $("galleryBack").onclick = openSettings;
    $("gallerySlideshow").onclick = () => {
      s.gallerySelection = new Set(s.ambientAssets?.sleep ?? []);
      openGallery(true);
    };
    $("galleryClear").onclick = () => {
      s.gallerySelection.clear();
      openGallery(true);
    };
    $("gallerySave").onclick = () => {
      if (!s.gallerySelection.size) return;
      store.set("sleepImages", JSON.stringify([...s.gallerySelection]));
      store.set("sleepImage", "");
      toast(t("imageSaved"));
      openSettings();
    };
    dialog.onpointerdown = (e) => {
      if (e.target === dialog) openSettings();
    };
  }
  $("galleryTitle").textContent = t("gallery");
  $("gallerySlideshow").textContent =
    s.language === "zh" ? "全选" : "Select all";
  $("galleryClear").textContent = t("clear");
  $("gallerySave").textContent = t("save");
  $("gallerySave").disabled = !s.gallerySelection.size;
  $("galleryBack").textContent = t("back");
  $("closeGallery").setAttribute("aria-label", t("back"));
  $("galleryHint").textContent =
    s.language === "zh"
      ? `已选 ${s.gallerySelection.size} / ${sleeps.length} 张 · 自动轮播`
      : `${s.gallerySelection.size} / ${sleeps.length} images · slideshow`;
  $("galleryGrid").innerHTML =
    sleeps
      .map(
        (path, i) =>
          `<button class="gallery-item ${s.gallerySelection.has(path) ? "selected" : ""}" aria-pressed="${s.gallerySelection.has(path)}" data-sleep-image="${escapeHTML(path)}"><img src="${escapeHTML(path)}" alt="${i + 1}" loading="lazy"><span>${i + 1}<b>${s.gallerySelection.has(path) ? "✓" : ""}</b></span></button>`,
      )
      .join("") +
    `<h3>${t("allIllustrations")}</h3>` +
    classics
      .map(
        (path) =>
          `<button class="gallery-item" data-classic-image="${escapeHTML(path)}"><img src="${escapeHTML(path)}" alt="${escapeHTML(path.split("/").at(-1))}" loading="lazy"><span>${escapeHTML(
            path
              .split("/")
              .at(-1)
              .replace(/\.[^.]+$/, ""),
          )} ↗</span></button>`,
      )
      .join("");
  $("galleryGrid").onclick = (e) => {
    const classic = e.target.closest("[data-classic-image]");
    if (classic) {
      $("galleryGrid").innerHTML =
        `<div class="gallery-full"><button id="galleryReturn" class="text-button">← ${t("back")}</button><img src="${escapeHTML(classic.dataset.classicImage)}" alt="${t("allIllustrations")}"></div>`;
      $("galleryReturn").onclick = () => openGallery(true);
      return;
    }
    const b = e.target.closest("[data-sleep-image]");
    if (b) {
      const path = b.dataset.sleepImage;
      if (s.gallerySelection.has(path)) s.gallerySelection.delete(path);
      else s.gallerySelection.add(path);
      b.classList.toggle("selected", s.gallerySelection.has(path));
      b.setAttribute("aria-pressed", String(s.gallerySelection.has(path)));
      b.querySelector("b").textContent = s.gallerySelection.has(path)
        ? "✓"
        : "";
      $("gallerySave").disabled = !s.gallerySelection.size;
      $("galleryHint").textContent =
        s.language === "zh"
          ? `已选 ${s.gallerySelection.size} / ${sleeps.length} 张 · 自动轮播`
          : `${s.gallerySelection.size} / ${sleeps.length} images · slideshow`;
    }
  };
  openDialog("galleryDialog");
}

window.ceramicUI=mountCeramic({state:s,get client(){return client},render,notice:toast,explainError,viewOf,shotYield,machineState,running,editable,canStart:canStartFromScreen,openDialog,closeDialog,openProfiles,command:sendCommand,
retryInventory:()=>s.mode==="finished"&&s.lastShot?.id===s.runId?syncFinishedInventory(s.lastShot):Promise.resolve(),
retryFinishedShot:()=>s.mode==="finished"&&s.runId?loadFinishedShot(s.runId,{retry:true}):Promise.resolve(),
setWorkflow:w=>setWorkflow(w,{force:true}),
updateAux:read=>{const draft=rebaseWorkflowDraft(s.workflow,s.draft,read);setWorkflow(read,{force:true});s.draft=draft;render()},
setProfileDraft:p=>{s.draft.profile=p;render()},
openCustomNumber:({value,key,onSave})=>{const back=s.modal;openKeypad(key);if(s.modal==='keypadDialog'){s.customNumber=onSave;s.keyText=String(value??'');s.keyReturn=back;renderKeypad();}}
});

window.profileIntro = mountProfileIntro(window.thisCup);
window.onlineProfiles = mountOnlineProfiles({getClient:()=>client,getLanguage:()=>s.language,getProfiles:()=>s.profiles,
 isAllowed:()=>s.modal==='profileDialog'&&!running()&&!s.busy,
 onLibrary:entries=>{s.profiles=entries;renderProfiles();},
 onBrowseLocal:entry=>{if(entry){s.selectedProfile=entry;s.selectedProfileUnavailable=false;s.profileSelectionRevision=(s.profileSelectionRevision??0)+1;s.favoriteOnly=false;$("profileSearch").value='';}renderProfiles();scrollSelectedProfile(s.profileDialogSequence);},notice:toast,explainError});

// This module is created after the tasting UI so pending drafts can block reloads.
skinUpdater=createSkinUpdater({currentVersion:SKIN_VERSION,getClient:()=>client,getContext:skinUpdateContext,onStatus:value=>{
  const blocked=['installing','awaiting_confirmation'].includes(value.phase),changed=Boolean(s.skinUpdating)!==blocked;
  s.skinUpdating=blocked;renderSkinUpdateSetting();if(changed)render();
  if(value.phase==='awaiting_confirmation')status(t('updateConfirming'),true);
}});
skinUpdater.start();
