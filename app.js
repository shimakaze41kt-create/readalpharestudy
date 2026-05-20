const LEGACY_STORAGE_KEY = "lead-alpha-review-data-v1";
const USER_INDEX_KEY = "lead-alpha-user-index-v1";
const VAULT_PREFIX = "lead-alpha-vault-v1:";
const GITHUB_SETTINGS_PREFIX = "lead-alpha-github-settings-v1:";
const CSV_BACKUP_PREFIX = "lead-alpha-csv-backup-v1:";
const PBKDF2_ITERATIONS = 210000;
const ADMIN_GITHUB = {
  owner: "",
  repo: "",
  branch: "main",
  token: "",
};

const sampleProblems = [
  {
    id: "例題12",
    topic: "力学",
    type: "基本例題",
    stage: 2,
    prerequisites: "基礎C-05",
    related: "p42-3",
    attempts: 3,
    correct: 1,
    lastDate: "2026-05-12",
    note: "力の分解で符号ミス",
  },
  {
    id: "p42-3",
    topic: "力学",
    type: "基本問題",
    stage: 3,
    prerequisites: "例題12",
    related: "章末A-15",
    attempts: 1,
    correct: 1,
    lastDate: "2026-05-17",
    note: "次は時間を測る",
  },
  {
    id: "p58-7",
    topic: "波動",
    type: "基本問題",
    stage: 3,
    prerequisites: "基礎C-18,例題21",
    related: "",
    attempts: 2,
    correct: 0,
    lastDate: "2026-05-08",
    note: "位相差の式を確認",
  },
  {
    id: "章末A-15",
    topic: "電磁気",
    type: "応用問題",
    stage: 4,
    prerequisites: "例題12,p42-3",
    related: "",
    attempts: 4,
    correct: 3,
    lastDate: "2026-05-02",
    note: "計算は安定",
  },
  {
    id: "p91-4",
    topic: "熱",
    type: "基礎CHECK",
    stage: 1,
    prerequisites: "",
    related: "",
    attempts: 0,
    correct: 0,
    lastDate: "",
    note: "未着手",
  },
];

let problems = [];
let activeUser = null;
let activeKey = null;
let currentVault = null;
let autoSyncTimer = null;
let displayName = "";
let activeSalt = null;

const authScreen = document.querySelector("#authScreen");
const authForm = document.querySelector("#authForm");
const loginIdInput = document.querySelector("#loginIdInput");
const loginPasswordInput = document.querySelector("#loginPasswordInput");
const createUserButton = document.querySelector("#createUserButton");
const authMessage = document.querySelector("#authMessage");
const appShell = document.querySelector(".app-shell");
const currentUserLabel = document.querySelector("#currentUserLabel");
const todayInput = document.querySelector("#todayInput");
const countInput = document.querySelector("#countInput");
const topicFilter = document.querySelector("#topicFilter");
const typeFilter = document.querySelector("#typeFilter");
const pickButton = document.querySelector("#pickButton");
const recommendationList = document.querySelector("#recommendationList");
const recommendationMeta = document.querySelector("#recommendationMeta");
const problemTableBody = document.querySelector("#problemTableBody");
const resultForm = document.querySelector("#resultForm");
const csvInput = document.querySelector("#csvInput");
const exportButton = document.querySelector("#exportButton");
const resetButton = document.querySelector("#resetButton");
const logoutButton = document.querySelector("#logoutButton");
const displayNameInput = document.querySelector("#displayNameInput");
const saveGitHubSettingsButton = document.querySelector("#saveGitHubSettingsButton");
const pullGitHubButton = document.querySelector("#pullGitHubButton");
const pushGitHubButton = document.querySelector("#pushGitHubButton");
const syncStatus = document.querySelector("#syncStatus");

todayInput.value = toDateInputValue(new Date());
document.querySelector("#attemptDateInput").value = todayInput.value;
appShell.classList.add("is-hidden");

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loginUser();
});

createUserButton.addEventListener("click", async () => {
  await createUser();
});

logoutButton.addEventListener("click", () => {
  activeUser = null;
  activeKey = null;
  currentVault = null;
  activeSalt = null;
  displayName = "";
  problems = [];
  authForm.reset();
  appShell.classList.add("is-hidden");
  authScreen.classList.remove("is-hidden");
  recommendationList.innerHTML = "";
  problemTableBody.innerHTML = "";
});

pickButton.addEventListener("click", pickRecommendations);
exportButton.addEventListener("click", exportCsv);
saveGitHubSettingsButton.addEventListener("click", saveGitHubSettings);
pullGitHubButton.addEventListener("click", pullFromGitHub);
pushGitHubButton.addEventListener("click", pushToGitHub);
resetButton.addEventListener("click", async () => {
  problems = structuredClone(sampleProblems);
  await saveProblems();
  renderAll();
  pickRecommendations();
  scheduleAutoPush("サンプルに戻した内容をGitHubへ自動保存中...");
});

csvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  problems = parseCsv(text);
  await saveProblems();
  renderAll();
  pickRecommendations();
  csvInput.value = "";
  scheduleAutoPush("CSVの内容をGitHubへ自動保存中...");
});

resultForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.querySelector("#problemIdInput").value.trim();
  const topic = document.querySelector("#topicInput").value.trim();
  const type = document.querySelector("#typeInput").value;
  const isCorrect = document.querySelector("#correctInput").value === "true";
  const lastDate = document.querySelector("#attemptDateInput").value;
  const note = document.querySelector("#noteInput").value.trim();

  const existing = problems.find((problem) => problem.id === id);
  if (existing) {
    existing.topic = topic || existing.topic;
    existing.type = type || existing.type || "基本問題";
    existing.stage = existing.stage || stageForType(existing.type);
    existing.attempts += 1;
    existing.correct += isCorrect ? 1 : 0;
    existing.lastDate = lastDate;
    existing.note = note || existing.note;
  } else {
    problems.push({
      id,
      topic: topic || "未分類",
      type: type || "基本問題",
      stage: stageForType(type),
      prerequisites: "",
      related: "",
      attempts: 1,
      correct: isCorrect ? 1 : 0,
      lastDate,
      note,
    });
  }

  await saveProblems();
  renderAll();
  pickRecommendations();
  resultForm.reset();
  document.querySelector("#attemptDateInput").value = todayInput.value;
  scheduleAutoPush("記録をGitHubへ自動保存中...");
});

async function createUser() {
  setAuthMessage("");
  const userId = normalizeUserId(loginIdInput.value);
  const password = loginPasswordInput.value;
  if (!validateAuthInput(userId, password)) return;

  const users = loadUserIndex();
  if (users[userId]) {
    setAuthMessage("このユーザーIDはすでにあります。ログインしてください。");
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const initialProblems = loadLegacyProblems();
  const vault = await encryptVault(key, initialProblems);
  currentVault = vault;
  localStorage.setItem(vaultKey(userId), JSON.stringify(vault));
  localStorage.setItem(csvBackupKey(userId), buildCsv(initialProblems));
  users[userId] = { salt: bytesToBase64(salt), createdAt: new Date().toISOString() };
  localStorage.setItem(USER_INDEX_KEY, JSON.stringify(users));

  activeUser = userId;
  activeKey = key;
  activeSalt = salt;
  problems = initialProblems;
  showApp();
  if (hasCompleteGitHubSettings()) scheduleAutoPush("新規データをGitHubへ保存中...");
}

async function loginUser() {
  setAuthMessage("");
  const userId = normalizeUserId(loginIdInput.value);
  const password = loginPasswordInput.value;
  if (!validateAuthInput(userId, password)) return;

  const users = loadUserIndex();
  const user = users[userId];
  if (!user) {
    const cloudLoggedIn = await loginFromGitHub(userId, password);
    if (!cloudLoggedIn) {
      setAuthMessage("この端末にはユーザーがありません。GitHub情報を入力してログインするか、初回は新規作成してください。");
    }
    return;
  }

  try {
    const salt = base64ToBytes(user.salt);
    const key = await deriveKey(password, salt);
    const vault = JSON.parse(localStorage.getItem(vaultKey(userId)));
    problems = await decryptVault(key, vault);
    currentVault = vault;
    activeUser = userId;
    activeKey = key;
    activeSalt = salt;
    showApp();
  } catch {
    setAuthMessage("ユーザーIDまたはパスワードが違います。");
  }
}

async function loginFromGitHub(userId, password) {
  const settings = readAuthCloudSettings(userId);
  if (!settings.owner || !settings.repo || !settings.token) return false;
  try {
    setAuthMessage("GitHubから復元中...");
    const remote = await fetchGitHubFile(settings, true);
    const payload = JSON.parse(base64ToUtf8(remote.content.replace(/\n/g, "")));
    const salt = base64ToBytes(payload.salt);
    const key = await deriveKey(password, salt);
    const vault = payload.vault || payload;
    problems = await decryptVault(key, vault);
    currentVault = vault;
    activeUser = userId;
    activeKey = key;
    activeSalt = salt;
    const users = loadUserIndex();
    users[userId] = { salt: payload.salt, createdAt: payload.createdAt || new Date().toISOString() };
    localStorage.setItem(USER_INDEX_KEY, JSON.stringify(users));
    localStorage.setItem(vaultKey(userId), JSON.stringify(vault));
    localStorage.setItem(csvBackupKey(userId), buildCsv(problems));
    showApp();
    await saveGitHubSettings(false);
    setAuthMessage("");
    return true;
  } catch {
    return false;
  }
}

function showApp() {
  authScreen.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  loadGitHubSettings();
  updateCurrentUserLabel();
  renderAll();
  pickRecommendations();
}

function validateAuthInput(userId, password) {
  if (!/^[0-9]{4}$/.test(userId)) {
    setAuthMessage("IDは数字4桁で入力してください。");
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(password)) {
    setAuthMessage("誕生日を選んでください。");
    return false;
  }
  if (!crypto?.subtle) {
    setAuthMessage("このブラウザでは暗号化機能が使えません。ChromeやEdgeで開いてください。");
    return false;
  }
  return true;
}

function loadUserIndex() {
  try {
    return JSON.parse(localStorage.getItem(USER_INDEX_KEY)) || {};
  } catch {
    return {};
  }
}

function loadLegacyProblems() {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : structuredClone(sampleProblems);
  } catch {
    return structuredClone(sampleProblems);
  }
}

async function saveProblems() {
  if (!activeUser || !activeKey) return;
  const vault = await encryptVault(activeKey, problems);
  currentVault = vault;
  localStorage.setItem(vaultKey(activeUser), JSON.stringify(vault));
  localStorage.setItem(csvBackupKey(activeUser), buildCsv(problems));
}

async function saveGitHubSettings(eventOrAutoPush = true) {
  const shouldAutoPush = eventOrAutoPush !== false;
  if (!activeUser || !activeKey) return;
  const settings = readGitHubSettingsForm();
  displayName = settings.displayName;
  updateCurrentUserLabel();
  const encrypted = await encryptVault(activeKey, settings);
  localStorage.setItem(githubSettingsKey(activeUser), JSON.stringify(encrypted));
  if (hasCompleteGitHubSettings() && shouldAutoPush) {
    scheduleAutoPush("GitHub設定を保存しました。学習データも自動保存中...");
  } else {
    setSyncStatus("設定を端末内に暗号化保存しました。管理者側のクラウド設定は未設定です。");
  }
}

async function loadGitHubSettings() {
  clearGitHubSettingsForm();
  const saved = localStorage.getItem(githubSettingsKey(activeUser));
  if (!saved) {
    setSyncStatus("GitHub同期は未設定です。");
    return;
  }
  try {
    const settings = await decryptVault(activeKey, JSON.parse(saved), "settings");
    displayName = settings.displayName || "";
    displayNameInput.value = displayName;
    updateCurrentUserLabel();
    setSyncStatus(`GitHub同期設定を読み込みました。保存先: ${autoGitHubPath()}`);
  } catch {
    setSyncStatus("GitHub同期設定を読み込めませんでした。", true);
  }
}

async function pushToGitHub() {
  if (!activeUser || !activeKey) return;
  const settings = readGitHubSettingsForm();
  if (!validateGitHubSettings(settings)) return;
  await saveGitHubSettings(false);
  await saveProblems();
  await pushVaultToGitHub(settings, "GitHubへ保存中...");
}

async function pullFromGitHub() {
  if (!activeUser || !activeKey) return;
  const settings = readGitHubSettingsForm();
  if (!validateGitHubSettings(settings)) return;
  await saveGitHubSettings();
  setSyncStatus("GitHubから読み込み中...");
  try {
    const remote = await fetchGitHubFile(settings, true);
    const payload = JSON.parse(base64ToUtf8(remote.content.replace(/\n/g, "")));
    const vault = payload.vault || payload;
    const remoteProblems = await decryptVault(activeKey, vault);
    problems = remoteProblems;
    currentVault = vault;
    if (payload.salt) activeSalt = base64ToBytes(payload.salt);
    localStorage.setItem(vaultKey(activeUser), JSON.stringify(vault));
    localStorage.setItem(csvBackupKey(activeUser), buildCsv(problems));
    renderAll();
    pickRecommendations();
    setSyncStatus(`GitHubから読み込みました: ${settings.path}`);
  } catch (error) {
    setSyncStatus(error.message, true);
  }
}

async function fetchGitHubFile(settings, required) {
  const response = await fetch(githubContentUrl(settings), {
    headers: githubHeaders(settings),
  });
  if (response.status === 404 && !required) return null;
  if (!response.ok) throw new Error(`GitHubファイルの取得に失敗しました: ${response.status}`);
  return response.json();
}

async function githubRequest(settings, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders(settings),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `GitHub保存に失敗しました: ${response.status}`;
    try {
      const body = await response.json();
      if (body.message) message += ` ${body.message}`;
    } catch {
      // Keep the status-only message when GitHub does not return JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

function githubHeaders(settings) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${settings.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function githubContentUrl(settings) {
  const path = settings.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(
    settings.repo,
  )}/contents/${path}?ref=${encodeURIComponent(settings.branch)}`;
}

function githubWriteUrl(settings) {
  const path = settings.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(
    settings.repo,
  )}/contents/${path}`;
}

function readGitHubSettingsForm() {
  return {
    displayName: displayNameInput.value.trim(),
    owner: ADMIN_GITHUB.owner,
    repo: ADMIN_GITHUB.repo,
    branch: ADMIN_GITHUB.branch || "main",
    path: autoGitHubPath(),
    token: ADMIN_GITHUB.token,
  };
}

function readAuthCloudSettings(userId) {
  return {
    owner: ADMIN_GITHUB.owner,
    repo: ADMIN_GITHUB.repo,
    branch: ADMIN_GITHUB.branch || "main",
    path: `data/users/${userId}.json`,
    token: ADMIN_GITHUB.token,
  };
}

function validateGitHubSettings(settings) {
  if (!settings.owner || !settings.repo || !settings.token) {
    setSyncStatus("管理者側のクラウド設定が未設定です。", true);
    return false;
  }
  return true;
}

function hasCompleteGitHubSettings() {
  const settings = readGitHubSettingsForm();
  return Boolean(settings.owner && settings.repo && settings.token);
}

function scheduleAutoPush(message) {
  if (!activeUser || !activeKey || !hasCompleteGitHubSettings()) return;
  clearTimeout(autoSyncTimer);
  setSyncStatus(message);
  autoSyncTimer = setTimeout(async () => {
    try {
      await saveProblems();
      await pushVaultToGitHub(readGitHubSettingsForm(), "GitHubへ自動保存中...");
    } catch (error) {
      setSyncStatus(`端末内には保存済みです。GitHub自動保存は失敗しました: ${error.message}`, true);
    }
  }, 700);
}

async function pushVaultToGitHub(settings, progressMessage) {
  setSyncStatus(progressMessage);
  const existing = await fetchGitHubFile(settings, false);
  const body = {
    message: `Update encrypted study data for ${activeUser}`,
    content: utf8ToBase64(JSON.stringify(buildRemotePayload(), null, 2)),
    branch: settings.branch,
  };
  if (existing?.sha) body.sha = existing.sha;
  await githubRequest(settings, githubWriteUrl(settings), {
    method: "PUT",
    body: JSON.stringify(body),
  });
  await pushEncryptedCsvToGitHub(settings);
  setSyncStatus(`GitHubへ保存しました: ${settings.path} / ${autoGitHubCsvPath()}`);
}

function buildRemotePayload() {
  return {
    version: 2,
    userId: activeUser,
    salt: bytesToBase64(activeSalt),
    path: autoGitHubPath(),
    vault: currentVault,
    updatedAt: new Date().toISOString(),
  };
}

async function pushEncryptedCsvToGitHub(settings) {
  const csv = localStorage.getItem(csvBackupKey(activeUser)) || buildCsv(problems);
  const csvVault = await encryptVault(activeKey, {
    kind: "csv-backup",
    userId: activeUser,
    csv,
    exportedAt: new Date().toISOString(),
  });
  const csvSettings = { ...settings, path: autoGitHubCsvPath() };
  const existing = await fetchGitHubFile(csvSettings, false);
  const body = {
    message: `Update encrypted CSV backup for ${activeUser}`,
    content: utf8ToBase64(JSON.stringify(csvVault, null, 2)),
    branch: settings.branch,
  };
  if (existing?.sha) body.sha = existing.sha;
  await githubRequest(csvSettings, githubWriteUrl(csvSettings), {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function clearGitHubSettingsForm() {
  displayNameInput.value = "";
}

function setSyncStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("is-error", isError);
}

function updateCurrentUserLabel() {
  const name = displayName || `${activeUser}さん`;
  currentUserLabel.textContent = `${name}、今日の復習を選びます。保存先: ${autoGitHubPath()}。CSVもクラウドへ暗号化バックアップします。`;
}

function autoGitHubPath() {
  return `data/users/${activeUser || "0000"}.json`;
}

function autoGitHubCsvPath() {
  return `data/users/${activeUser || "0000"}.csv.enc.json`;
}


async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptVault(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify({ problems: data }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    version: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString(),
  };
}

async function decryptVault(key, vault, payloadKey = "problems") {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(vault.iv) },
    key,
    base64ToBytes(vault.data),
  );
  const parsed = JSON.parse(new TextDecoder().decode(decrypted));
  if (payloadKey === "settings") return parsed.problems || {};
  return Array.isArray(parsed.problems) ? parsed.problems : [];
}

function vaultKey(userId) {
  return `${VAULT_PREFIX}${userId}`;
}

function githubSettingsKey(userId) {
  return `${GITHUB_SETTINGS_PREFIX}${userId}`;
}

function csvBackupKey(userId) {
  return `${CSV_BACKUP_PREFIX}${userId}`;
}

function normalizeUserId(value) {
  return value.trim();
}

function setAuthMessage(message) {
  authMessage.textContent = message;
}

function renderAll() {
  renderTopicFilter();
  renderTypeFilter();
  renderTable();
}

function renderTopicFilter() {
  const current = topicFilter.value;
  const topics = [...new Set(problems.map((problem) => problem.topic).filter(Boolean))].sort();
  topicFilter.innerHTML = '<option value="">すべて</option>';
  for (const topic of topics) {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    topicFilter.append(option);
  }
  topicFilter.value = topics.includes(current) ? current : "";
}

function renderTypeFilter() {
  const current = typeFilter.value;
  const types = ["基礎CHECK", "基本例題", "基本問題", "応用問題"];
  typeFilter.innerHTML = '<option value="">すべて</option>';
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeFilter.append(option);
  }
  typeFilter.value = types.includes(current) ? current : "";
}

function renderTable() {
  problemTableBody.innerHTML = "";
  for (const problem of sortedByPriority(problems, todayInput.value)) {
    const rate = accuracy(problem);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(problem.id)}</strong></td>
      <td>${escapeHtml(problem.topic || "未分類")}</td>
      <td>${escapeHtml(problem.type || "基本問題")}</td>
      <td>${problem.attempts}</td>
      <td class="${rate < 0.7 ? "rate-low" : "rate-good"}">${formatPercent(rate)}</td>
      <td>${problem.lastDate || "未実施"}</td>
      <td>${nextDueLabel(problem, todayInput.value)}</td>
      <td>${relationLabel(problem)}</td>
      <td>${escapeHtml(problem.note || "")}</td>
    `;
    problemTableBody.append(tr);
  }
}

function pickRecommendations() {
  const today = todayInput.value;
  const count = Number(countInput.value || 10);
  const topic = topicFilter.value;
  const type = typeFilter.value;
  const candidates = problems.filter(
    (problem) => (!topic || problem.topic === topic) && (!type || problem.type === type),
  );
  const picks = sortedByPriority(candidates, today).slice(0, count);

  recommendationList.innerHTML = "";
  if (picks.length === 0) {
    recommendationList.innerHTML = '<div class="empty-state">問題データがありません。</div>';
    recommendationMeta.textContent = "0問";
    return;
  }

  for (const problem of picks) {
    const li = document.createElement("li");
    li.className = "problem-card";
    li.innerHTML = `
      <div>
        <div class="problem-id">${escapeHtml(problem.id)}</div>
        <div class="problem-sub">${escapeHtml(problem.topic || "未分類")}</div>
        <span class="type-chip">${escapeHtml(problem.type || "基本問題")}</span>
      </div>
      <div class="problem-sub">
        ${reasonText(problem, today)}<br />
        回数 ${problem.attempts}回 / 正答率 ${formatPercent(accuracy(problem))}
      </div>
      <span class="priority">${priorityLabel(problem, today)}</span>
    `;
    recommendationList.append(li);
  }

  recommendationMeta.textContent = `${picks.length}問`;
  renderTable();
}

function sortedByPriority(items, today) {
  return [...items].sort((a, b) => priorityScore(b, today) - priorityScore(a, today));
}

function priorityScore(problem, today) {
  const rate = accuracy(problem);
  const days = daysSince(problem.lastDate, today);
  const interval = reviewInterval(problem);
  const duePressure = problem.lastDate ? days / interval : 3;
  const weakness = 1 - rate;
  const novelty = problem.attempts === 0 ? 1.2 : Math.max(0, 0.75 - problem.attempts * 0.12);
  const relationBoost = prerequisiteWeakness(problem) * 18;
  const typeBoost = typeWeight(problem) * 10;
  return duePressure * 42 + weakness * 38 + novelty * 20 + relationBoost + typeBoost;
}

function reviewInterval(problem) {
  const rate = accuracy(problem);
  if (problem.attempts === 0) return 0;
  if (problem.attempts === 1) return rate >= 0.9 ? 3 : 1;
  if (rate < 0.5) return 1;
  if (rate < 0.75) return 3;
  if (problem.attempts < 4) return 7;
  return 14;
}

function accuracy(problem) {
  if (!problem.attempts) return 0;
  return problem.correct / problem.attempts;
}

function daysSince(dateString, todayString) {
  if (!dateString) return 999;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((new Date(todayString) - new Date(dateString)) / oneDay));
}

function nextDueLabel(problem, today) {
  if (!problem.lastDate) return "今日";
  const remaining = reviewInterval(problem) - daysSince(problem.lastDate, today);
  if (remaining <= 0) return "今日";
  return `${remaining}日後`;
}

function priorityLabel(problem, today) {
  const score = priorityScore(problem, today);
  if (score >= 120) return "最優先";
  if (score >= 82) return "優先";
  return "余裕があれば";
}

function reasonText(problem, today) {
  const weakPrereq = weakestPrerequisite(problem);
  if (weakPrereq) {
    return `${weakPrereq.id}が前提で、そこがまだ不安定です。つながりごと固めたい問題です。`;
  }
  if (!problem.lastDate) return "未着手なので先に一度触れておきたい問題です。";
  const due = nextDueLabel(problem, today) === "今日";
  const rate = accuracy(problem);
  if (due && rate < 0.7) return "復習タイミングで、正答率も低めです。";
  if (due) return "前回から十分日数が空いています。";
  if (rate < 0.5) return "まだ不安定なので短い間隔で確認します。";
  return "定着確認として軽く入れる候補です。";
}

function weakestPrerequisite(problem) {
  return relationIds(problem.prerequisites)
    .map((id) => problems.find((candidate) => candidate.id === id))
    .filter(Boolean)
    .filter((candidate) => candidate.attempts === 0 || accuracy(candidate) < 0.75)
    .sort((a, b) => accuracy(a) - accuracy(b))[0];
}

function prerequisiteWeakness(problem) {
  const prereqs = relationIds(problem.prerequisites)
    .map((id) => problems.find((candidate) => candidate.id === id))
    .filter(Boolean);
  if (prereqs.length === 0) return 0;
  return prereqs.reduce((sum, prereq) => sum + (1 - accuracy(prereq)), 0) / prereqs.length;
}

function typeWeight(problem) {
  const weights = {
    基礎CHECK: 0.6,
    基本例題: 1,
    基本問題: 0.9,
    応用問題: problem.attempts === 0 ? 0.4 : 0.7,
  };
  return weights[problem.type] ?? 0.8;
}

function stageForType(type) {
  return {
    基礎CHECK: 1,
    基本例題: 2,
    基本問題: 3,
    応用問題: 4,
  }[type] ?? 3;
}

function relationIds(value) {
  return String(value || "")
    .split(/[、,]/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function relationLabel(problem) {
  const prereq = relationIds(problem.prerequisites).join(" / ");
  const related = relationIds(problem.related).join(" / ");
  const parts = [];
  if (prereq) parts.push(`前提: ${escapeHtml(prereq)}`);
  if (related) parts.push(`関連: ${escapeHtml(related)}`);
  return parts.length ? parts.join("<br />") : "";
}

function parseCsv(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((row) => splitCsvRow(row));
  const [headers, ...body] = rows;
  const index = (name) => headers.findIndex((header) => header.trim() === name);

  return body
    .filter((row) => row.some(Boolean))
    .map((row) => ({
      id: row[index("問題番号")] || row[index("id")] || "",
      topic: row[index("分野")] || row[index("topic")] || "未分類",
      type: row[index("種類")] || row[index("type")] || "基本問題",
      stage: Number(row[index("段階")] || row[index("stage")] || 0),
      prerequisites: row[index("前提問題")] || row[index("prerequisites")] || "",
      related: row[index("関連問題")] || row[index("related")] || "",
      attempts: Number(row[index("回数")] || row[index("attempts")] || 0),
      correct: Number(row[index("正解数")] || row[index("correct")] || 0),
      lastDate: row[index("最終実施日")] || row[index("lastDate")] || "",
      note: row[index("メモ")] || row[index("note")] || "",
    }))
    .filter((problem) => problem.id);
}

function splitCsvRow(row) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    const next = row[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function exportCsv() {
  const csv = localStorage.getItem(csvBackupKey(activeUser)) || buildCsv(problems);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `lead-alpha-${activeUser}-${todayInput.value}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildCsv(items) {
  const headers = [
    "問題番号",
    "分野",
    "種類",
    "段階",
    "前提問題",
    "関連問題",
    "回数",
    "正解数",
    "最終実施日",
    "メモ",
  ];
  const rows = items.map((problem) => [
    problem.id,
    problem.topic,
    problem.type || "基本問題",
    problem.stage || stageForType(problem.type),
    problem.prerequisites || "",
    problem.related || "",
    problem.attempts,
    problem.correct,
    problem.lastDate,
    problem.note,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toDateInputValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
