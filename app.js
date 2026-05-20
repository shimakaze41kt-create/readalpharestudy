const USER_INDEX_KEY = "lead-alpha-user-index-v2:";
const PBKDF2_ITERATIONS = 210000;
const ADMIN_GITHUB = {
  owner: "shimakaze41kt-create",
  repo: "readalpharestudy",
  branch: "main",
  token: "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",
};

const toc = [
  { part: "1", field: "力学", chapter: "1", chapterName: "運動の表し方", page: "22-35" },
  { part: "1", field: "力学", chapter: "2", chapterName: "力と運動", page: "36-55" },
  { part: "1", field: "力学", chapter: "3", chapterName: "仕事とエネルギー", page: "56-73" },
  { part: "2", field: "熱", chapter: "5", chapterName: "熱とエネルギー", page: "90-105" },
  { part: "3", field: "波動", chapter: "6", chapterName: "波の性質", page: "106-125" },
  { part: "4", field: "電磁気", chapter: "8", chapterName: "電場と電位", page: "150-173" },
];

const seedProblems = [
  makeProblem({ part: "1", chapter: "2", type: "基礎CHECK", name: "基礎C-05", knowledge: 1, thinking: 0, related: "例題12", comment: "力のつり合い" }),
  makeProblem({ part: "1", chapter: "2", type: "基本例題", name: "例題12", knowledge: 1, thinking: 1, related: "基礎C-05,p42-3", comment: "力の分解で符号ミス" }),
  makeProblem({ part: "1", chapter: "2", type: "基本問題", name: "p42-3", knowledge: 0, thinking: 1, related: "例題12", comment: "次は時間を測る" }),
  makeProblem({ part: "3", chapter: "6", type: "基本問題", name: "p58-7", knowledge: 1, thinking: 1, related: "例題21", comment: "位相差の式を確認" }),
  makeProblem({ part: "2", chapter: "5", type: "基礎CHECK", name: "p91-4", knowledge: 1, thinking: 0, related: "", comment: "未着手" }),
];

let state = { problems: [], records: [] };
let activeUser = null;
let activeKey = null;
let activeSalt = null;
let autoSyncTimer = null;

const authScreen = document.querySelector("#authScreen");
const authForm = document.querySelector("#authForm");
const loginIdInput = document.querySelector("#loginIdInput");
const loginPasswordInput = document.querySelector("#loginPasswordInput");
const createUserButton = document.querySelector("#createUserButton");
const authMessage = document.querySelector("#authMessage");
const appShell = document.querySelector(".app-shell");
const currentUserLabel = document.querySelector("#currentUserLabel");
const syncStatus = document.querySelector("#syncStatus");
const todayInput = document.querySelector("#todayInput");
const countInput = document.querySelector("#countInput");
const fieldFilter = document.querySelector("#fieldFilter");
const chapterFilter = document.querySelector("#chapterFilter");
const knowledgeFilter = document.querySelector("#knowledgeFilter");
const thinkingFilter = document.querySelector("#thinkingFilter");
const pickButton = document.querySelector("#pickButton");
const recommendationList = document.querySelector("#recommendationList");
const recommendationMeta = document.querySelector("#recommendationMeta");
const problemTableBody = document.querySelector("#problemTableBody");
const resultForm = document.querySelector("#resultForm");
const logoutButton = document.querySelector("#logoutButton");

todayInput.value = toDateInputValue(new Date());
document.querySelector("#attemptDateInput").value = todayInput.value;

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
  activeSalt = null;
  state = { problems: [], records: [] };
  authForm.reset();
  appShell.classList.add("is-hidden");
  authScreen.classList.remove("is-hidden");
});

pickButton.addEventListener("click", pickRecommendations);

resultForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const problemPatch = {
    part: document.querySelector("#partInput").value.trim(),
    chapter: document.querySelector("#chapterInput").value.trim(),
    type: document.querySelector("#typeInput").value,
    name: document.querySelector("#problemNameInput").value.trim(),
    knowledge: Number(document.querySelector("#knowledgeInput").value),
    thinking: Number(document.querySelector("#thinkingInput").value),
    related: document.querySelector("#relatedInput").value.trim(),
  };
  const record = {
    problemKey: problemKey(problemPatch),
    correct: document.querySelector("#correctInput").value === "true",
    date: document.querySelector("#attemptDateInput").value,
    comment: document.querySelector("#commentInput").value.trim(),
    recordedAt: new Date().toISOString(),
  };

  upsertProblem(problemPatch, record);
  state.records.push(record);
  await saveCloud("記録をクラウドへ自動保存中...");
  renderAll();
  pickRecommendations();
  resultForm.reset();
  document.querySelector("#attemptDateInput").value = todayInput.value;
});

async function createUser() {
  setAuthMessage("");
  const userId = normalizeUserId(loginIdInput.value);
  const password = loginPasswordInput.value;
  if (!validateAuthInput(userId, password)) return;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  activeUser = userId;
  activeSalt = salt;
  activeKey = await deriveKey(password, salt);
  state = { problems: structuredClone(seedProblems), records: [] };
  await saveLocalIndex();
  showApp();
  await saveCloud("新規データをクラウドへ自動保存中...");
}

async function loginUser() {
  setAuthMessage("");
  const userId = normalizeUserId(loginIdInput.value);
  const password = loginPasswordInput.value;
  if (!validateAuthInput(userId, password)) return;

  const local = loadLocalIndex(userId);
  if (local) {
    try {
      activeUser = userId;
      activeSalt = base64ToBytes(local.salt);
      activeKey = await deriveKey(password, activeSalt);
      await loadFromCloud();
      showApp();
      return;
    } catch {
      setAuthMessage("IDまたは誕生日が違うか、クラウドから読み込めません。");
      return;
    }
  }

  try {
    activeUser = userId;
    await loadFromCloud(password);
    await saveLocalIndex();
    showApp();
  } catch {
    activeUser = null;
    setAuthMessage("クラウドにデータが見つかりません。初回は新規作成してください。");
  }
}

function showApp() {
  authScreen.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  currentUserLabel.textContent = `${activeUser} さんの復習データをクラウドで管理しています。`;
  renderAll();
  pickRecommendations();
}

async function saveCloud(message) {
  if (!hasCloudConfig()) {
    setSyncStatus("管理者側のクラウド設定が未設定です。", true);
    return;
  }
  clearTimeout(autoSyncTimer);
  setSyncStatus(message);
  autoSyncTimer = setTimeout(async () => {
    try {
      const vault = await encryptPayload(activeKey, { state });
      const payload = {
        version: 3,
        userId: activeUser,
        salt: bytesToBase64(activeSalt),
        vault,
        updatedAt: new Date().toISOString(),
      };
      await putGitHubJson(cloudPath(activeUser), payload, `Update ${activeUser} study data`);
      setSyncStatus("クラウドへ自動保存しました。");
    } catch (error) {
      setSyncStatus(`クラウド保存に失敗しました: ${error.message}`, true);
    }
  }, 500);
}

async function loadFromCloud(passwordForFirstDevice = null) {
  if (!hasCloudConfig()) throw new Error("cloud config missing");
  setSyncStatus("クラウドから読み込み中...");
  const remote = await getGitHubJson(cloudPath(activeUser));
  const payload = JSON.parse(base64ToUtf8(remote.content.replace(/\n/g, "")));
  activeSalt = base64ToBytes(payload.salt);
  if (passwordForFirstDevice) activeKey = await deriveKey(passwordForFirstDevice, activeSalt);
  const decrypted = await decryptPayload(activeKey, payload.vault);
  state = normalizeState(decrypted.state);
  setSyncStatus("クラウドから読み込みました。");
}

function renderAll() {
  renderFilters();
  renderTable();
}

function renderFilters() {
  const currentField = fieldFilter.value;
  fieldFilter.innerHTML = '<option value="">すべて</option>';
  for (const field of [...new Set(toc.map((row) => row.field))]) {
    fieldFilter.append(new Option(field, field));
  }
  fieldFilter.value = [...fieldFilter.options].some((option) => option.value === currentField) ? currentField : "";

  const currentChapter = chapterFilter.value;
  chapterFilter.innerHTML = '<option value="">すべて</option>';
  for (const row of toc) {
    chapterFilter.append(new Option(`${row.chapter} ${row.chapterName}`, row.chapter));
  }
  chapterFilter.value = [...chapterFilter.options].some((option) => option.value === currentChapter) ? currentChapter : "";
}

function renderTable() {
  problemTableBody.innerHTML = "";
  for (const problem of sortedByPriority(filteredProblems(), todayInput.value)) {
    const row = tocEntry(problem);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(problem.part)}</td>
      <td>${escapeHtml(problem.chapter)} ${escapeHtml(row?.chapterName || "")}</td>
      <td>${escapeHtml(row?.field || "")}</td>
      <td>${escapeHtml(problem.type)}</td>
      <td><strong>${escapeHtml(problem.name)}</strong></td>
      <td>${problem.knowledge}</td>
      <td>${problem.thinking}</td>
      <td>${problem.attempts}</td>
      <td class="${accuracy(problem) < 0.7 ? "rate-low" : "rate-good"}">${formatPercent(accuracy(problem))}</td>
      <td>${problem.lastDate || "未実施"}</td>
      <td>${escapeHtml(problem.comment || "")}</td>
    `;
    problemTableBody.append(tr);
  }
}

function pickRecommendations() {
  const picks = sortedByPriority(filteredProblems(), todayInput.value).slice(0, Number(countInput.value || 10));
  recommendationList.innerHTML = "";
  recommendationMeta.textContent = `${picks.length}問`;
  if (picks.length === 0) {
    recommendationList.innerHTML = '<div class="empty-state">条件に合う問題がありません。</div>';
    return;
  }
  for (const problem of picks) {
    const row = tocEntry(problem);
    const li = document.createElement("li");
    li.className = "problem-card";
    li.innerHTML = `
      <div>
        <div class="problem-id">${escapeHtml(problem.name)}</div>
        <div class="problem-sub">${escapeHtml(row?.field || "")} / ${escapeHtml(problem.chapter)} ${escapeHtml(row?.chapterName || "")}</div>
        <span class="type-chip">${escapeHtml(problem.type)} 知${problem.knowledge} 考${problem.thinking}</span>
      </div>
      <div class="problem-sub">${reasonText(problem, todayInput.value)}<br />回数 ${problem.attempts}回 / 正答率 ${formatPercent(accuracy(problem))}</div>
      <span class="priority">${priorityLabel(problem, todayInput.value)}</span>
    `;
    recommendationList.append(li);
  }
}

function filteredProblems() {
  return state.problems.filter((problem) => {
    const row = tocEntry(problem);
    return (
      (!fieldFilter.value || row?.field === fieldFilter.value) &&
      (!chapterFilter.value || problem.chapter === chapterFilter.value) &&
      (knowledgeFilter.value === "" || String(problem.knowledge) === knowledgeFilter.value) &&
      (thinkingFilter.value === "" || String(problem.thinking) === thinkingFilter.value)
    );
  });
}

function upsertProblem(patch, record) {
  const key = problemKey(patch);
  let problem = state.problems.find((item) => problemKey(item) === key);
  if (!problem) {
    problem = makeProblem(patch);
    state.problems.push(problem);
  }
  Object.assign(problem, patch);
  problem.attempts += 1;
  problem.correct += record.correct ? 1 : 0;
  problem.lastDate = record.date;
  problem.comment = record.comment || problem.comment || "";
}

function makeProblem(input) {
  return {
    part: String(input.part || ""),
    chapter: String(input.chapter || ""),
    type: input.type || "基本問題",
    name: input.name || "",
    knowledge: Number(input.knowledge || 0),
    thinking: Number(input.thinking || 0),
    related: input.related || "",
    attempts: Number(input.attempts || 0),
    correct: Number(input.correct || 0),
    lastDate: input.lastDate || "",
    comment: input.comment || "",
  };
}

function problemKey(problem) {
  return [problem.part, problem.chapter, problem.type, problem.name].map(String).join("__");
}

function tocEntry(problem) {
  return toc.find((row) => row.part === String(problem.part) && row.chapter === String(problem.chapter));
}

function sortedByPriority(items, today) {
  return [...items].sort((a, b) => priorityScore(b, today) - priorityScore(a, today));
}

function priorityScore(problem, today) {
  const days = problem.lastDate ? daysSince(problem.lastDate, today) : 999;
  const weakness = 1 - accuracy(problem);
  const marker = problem.knowledge + problem.thinking;
  return days * 7 + weakness * 45 + marker * 8 + (problem.attempts === 0 ? 40 : 0);
}

function reasonText(problem, today) {
  if (!problem.lastDate) return "未実施なので先に一度触れておきたい問題です。";
  if (accuracy(problem) < 0.7) return "正答率が低めなので優先します。";
  if (daysSince(problem.lastDate, today) >= 7) return "前回から日数が空いています。";
  return "定着確認の候補です。";
}

function priorityLabel(problem, today) {
  const score = priorityScore(problem, today);
  if (score >= 100) return "最優先";
  if (score >= 60) return "優先";
  return "余裕があれば";
}

function normalizeState(value) {
  return {
    problems: Array.isArray(value?.problems) ? value.problems.map(makeProblem) : structuredClone(seedProblems),
    records: Array.isArray(value?.records) ? value.records : [],
  };
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
  return true;
}

async function saveLocalIndex() {
  localStorage.setItem(`${USER_INDEX_KEY}${activeUser}`, JSON.stringify({ salt: bytesToBase64(activeSalt) }));
}

function loadLocalIndex(userId) {
  try {
    return JSON.parse(localStorage.getItem(`${USER_INDEX_KEY}${userId}`));
  } catch {
    return null;
  }
}

function hasCloudConfig() {
  return Boolean(ADMIN_GITHUB.owner && ADMIN_GITHUB.repo && ADMIN_GITHUB.token);
}

function cloudPath(userId) {
  return `data/users/${userId}.json`;
}

async function getGitHubJson(path) {
  const response = await fetch(githubContentUrl(path), { headers: githubHeaders() });
  if (!response.ok) throw new Error(`GitHub取得失敗: ${response.status}`);
  return response.json();
}

async function putGitHubJson(path, data, message) {
  const existing = await fetch(githubContentUrl(path), { headers: githubHeaders() });
  const body = {
    message,
    content: utf8ToBase64(JSON.stringify(data, null, 2)),
    branch: ADMIN_GITHUB.branch || "main",
  };
  if (existing.ok) body.sha = (await existing.json()).sha;
  const response = await fetch(githubWriteUrl(path), {
    method: "PUT",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub保存失敗: ${response.status}`);
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${ADMIN_GITHUB.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function githubContentUrl(path) {
  return `https://api.github.com/repos/${encodeURIComponent(ADMIN_GITHUB.owner)}/${encodeURIComponent(ADMIN_GITHUB.repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ADMIN_GITHUB.branch || "main")}`;
}

function githubWriteUrl(path) {
  return `https://api.github.com/repos/${encodeURIComponent(ADMIN_GITHUB.owner)}/${encodeURIComponent(ADMIN_GITHUB.repo)}/contents/${encodePath(path)}`;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptPayload(key, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { version: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function decryptPayload(key, vault) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.data));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function setAuthMessage(message) {
  authMessage.textContent = message;
}

function setSyncStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("is-error", isError);
}

function accuracy(problem) {
  return problem.attempts ? problem.correct / problem.attempts : 0;
}

function daysSince(dateString, todayString) {
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((new Date(todayString) - new Date(dateString)) / oneDay));
}

function toDateInputValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function normalizeUserId(value) {
  return value.trim();
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
