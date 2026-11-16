(function () {
  const STORAGE_KEYS = {
    RECORDS: "haneul_qt_records_v1",
    CUSTOM_PASSAGES: "haneul_qt_custom_passages_v1",
    SETTINGS: "haneul_qt_settings_v1"
  };

  // IndexedDB 이중 백업 저장소 (LocalStorage 삭제 시에도 자동 복구)
  const IDB_NAME = "qt_pyeonggang_vault_v1";
  const IDB_STORE = "kv_store";

  function openVaultDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("No IndexedDB"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function writeToVaultDB(key, value) {
    try {
      const db = await openVaultDB();
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
    } catch (e) {
      // IndexedDB 미지원 환경은 localStorage만 유지
    }
  }

  async function readFromVaultDB(key) {
    try {
      const db = await openVaultDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });
    } catch (e) {
      return undefined;
    }
  }

  async function initPersistentStorageAndRestore() {
    const statusEl = document.getElementById("storagePersistStatus");
    let persisted = false;
    try {
      if (navigator.storage && navigator.storage.persist) {
        persisted = await navigator.storage.persisted();
        if (!persisted) {
          persisted = await navigator.storage.persist();
        }
      }
    } catch (e) {}

    // LocalStorage가 비어있고 IndexedDB에 백업이 있으면 자동 복구
    let restoredAny = false;
    const idbRecords = await readFromVaultDB(STORAGE_KEYS.RECORDS);
    if (idbRecords && Object.keys(records).length === 0 && Object.keys(idbRecords).length > 0) {
      records = idbRecords;
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
      restoredAny = true;
    } else if (Object.keys(records).length > 0) {
      writeToVaultDB(STORAGE_KEYS.RECORDS, records);
    }

    const idbCustom = await readFromVaultDB(STORAGE_KEYS.CUSTOM_PASSAGES);
    if (idbCustom && Object.keys(customPassages).length === 0 && Object.keys(idbCustom).length > 0) {
      customPassages = idbCustom;
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PASSAGES, JSON.stringify(customPassages));
      restoredAny = true;
    } else if (Object.keys(customPassages).length > 0) {
      writeToVaultDB(STORAGE_KEYS.CUSTOM_PASSAGES, customPassages);
    }

    const idbSettings = await readFromVaultDB(STORAGE_KEYS.SETTINGS);
    if (idbSettings && !localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      settings = Object.assign(settings, idbSettings);
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      restoredAny = true;
    } else {
      writeToVaultDB(STORAGE_KEYS.SETTINGS, settings);
    }

    if (statusEl) {
      statusEl.textContent = persisted
        ? "🛡️ 영구 보존(Persistent) + 이중 안전 저장(LocalStorage · IndexedDB) 활성화됨"
        : "🛡️ 이중 안전 저장(LocalStorage + IndexedDB) 실시간 동기화 중";
    }
    if (restoredAny) {
      renderAll();
      showToast("내 기기 보조 저장소에서 묵상 기록을 자동 복구했습니다 🛡️");
    }
  }

  // 로컬 날짜 문자열 반환 (YYYY-MM-DD)
  function toDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateKey(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatKoreanDate(dateKey) {
    const date = parseDateKey(dateKey);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
  }

  // 상태 관리
  const todayKey = toDateKey(new Date());
  let currentDateKey = todayKey;
  let calendarYear = new Date().getFullYear();
  let calendarMonth = new Date().getMonth(); // 0-indexed
  let records = loadJSON(STORAGE_KEYS.RECORDS, {});
  let customPassages = loadJSON(STORAGE_KEYS.CUSTOM_PASSAGES, {});
  let settings = Object.assign(
    {
      theme: "light",
      pinCode: "",
      bookPin: "0000",
      unlockedBooks: ["창세기"],
      activeBook: "창세기",
      fontSize: 16,
      fontFamily: "gowun-batang",
      appShareUrl: ""
    },
    loadJSON(STORAGE_KEYS.SETTINGS, {})
  );
  if (!Array.isArray(settings.unlockedBooks) || !settings.unlockedBooks.length) {
    settings.unlockedBooks = ["창세기"];
  }
  if (!settings.bookPin) {
    settings.bookPin = "0000";
  }

  const LEGACY_FONT_SIZE_MAP = {
    small: 13,
    normal: 16,
    large: 18,
    xlarge: 21
  };
  if (typeof settings.fontSize === "string" && LEGACY_FONT_SIZE_MAP[settings.fontSize]) {
    settings.fontSize = LEGACY_FONT_SIZE_MAP[settings.fontSize];
  }
  if (typeof settings.fontSize !== "number" || Number.isNaN(settings.fontSize)) {
    settings.fontSize = 16;
  }

  const FONT_FAMILY_MAP = {
    "gowun-batang": '"Gowun Batang", "Nanum Myeongjo", "AppleMyungjo", Georgia, serif',
    "nanum-myeongjo": '"Nanum Myeongjo", "AppleMyungjo", Georgia, serif',
    "noto-serif": '"Noto Serif KR", "Nanum Myeongjo", Georgia, serif',
    hahmlet: '"Hahmlet", "Nanum Myeongjo", serif',
    "noto-sans": '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif',
    "nanum-gothic": '"Nanum Gothic", "Noto Sans KR", sans-serif',
    "ibm-plex": '"IBM Plex Sans KR", "Noto Sans KR", sans-serif',
    "gowun-dodum": '"Gowun Dodum", "Noto Sans KR", -apple-system, sans-serif',
    sunflower: '"Sunflower", "Noto Sans KR", sans-serif',
    jua: '"Jua", "Noto Sans KR", sans-serif',
    "nanum-pen": '"Nanum Pen Script", "Gowun Dodum", cursive',
    gaegu: '"Gaegu", "Gowun Dodum", cursive',
    system: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", sans-serif'
  };

  let pinBuffer = "";
  let pinMode = "unlock"; // "unlock" | "setup" | "book_unlock" | "book_pin_setup"
  let pendingBookUnlock = null; // { bookName, passageId, onSuccess }
  let pinFailCount = 0;
  let pinLockUntil = 0;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      writeToVaultDB(key, data);
    } catch (e) {
      writeToVaultDB(key, data);
      showToast("저장 공간이 부족하거나 브라우저 설정을 확인해 주세요.");
    }
  }

  function isBookUnlocked(bookName) {
    return Array.isArray(settings.unlockedBooks) && settings.unlockedBooks.includes(bookName);
  }

  // 날짜에 해당하는 말씀 가져오기 (직접 입력 > 날짜별 선택 본문 > 현재 열린 권 내 일차 순환)
  function getPassageForDate(dateKey) {
    if (customPassages[dateKey]) {
      return customPassages[dateKey];
    }
    const list = window.QT_PASSAGES || [];
    const books = window.QT_BOOKS || [];
    if (!list.length) return null;

    const rec = records[dateKey];
    if (rec && rec.passageId) {
      const found = list.find((p) => p.id === rec.passageId);
      if (found && isBookUnlocked(found.book)) {
        return found;
      }
    }

    const activeBookName = isBookUnlocked(settings.activeBook)
      ? settings.activeBook
      : settings.unlockedBooks[0] || "창세기";
    const bookObj = books.find((b) => b.id === activeBookName) || books[0];
    const pool = bookObj && bookObj.items.length ? bookObj.items : list;

    const dateObj = parseDateKey(dateKey);
    const dayOfYear = Math.floor(
      (dateObj - new Date(dateObj.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
    );
    return pool[(dayOfYear - 1) % pool.length];
  }

  let activeBookIndexTab = "창세기";

  // 연속 묵상(스트릭) 및 통계 계산
  function calculateStats() {
    const completedDates = Object.keys(records)
      .filter((k) => isRecordCompleted(records[k]))
      .sort();

    const completedSet = new Set(completedDates);

    // 연속 일수 계산 (오늘 또는 어제부터 역산)
    let streak = 0;
    let cursor = new Date();
    let cursorKey = toDateKey(cursor);

    if (!completedSet.has(cursorKey)) {
      const yesterday = new Date(cursor);
      yesterday.setDate(yesterday.getDate() - 1);
      if (completedSet.has(toDateKey(yesterday))) {
        cursor = yesterday;
      } else {
        cursor = null;
      }
    }

    while (cursor) {
      const k = toDateKey(cursor);
      if (completedSet.has(k)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    // 이번 달 묵상 일수
    const ymPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}`;
    const monthlyCount = completedDates.filter((d) => d.startsWith(ymPrefix)).length;

    // 적용 실천 완료 비율
    const totalCount = completedDates.length;
    const actionDoneCount = completedDates.filter((d) => records[d] && records[d].actionDone).length;
    const actionRate = totalCount > 0 ? Math.round((actionDoneCount / totalCount) * 100) : 0;

    return {
      streak,
      monthlyCount,
      totalCount,
      actionDoneCount,
      actionRate
    };
  }

  function isRecordCompleted(rec) {
    if (!rec) return false;
    return Boolean(
      (rec.observation && rec.observation.trim()) ||
      (rec.meditation && rec.meditation.trim()) ||
      (rec.application && rec.application.trim()) ||
      (rec.prayer && rec.prayer.trim())
    );
  }

  // 토스트 메시지 표시
  function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }

  // 테마 및 보기 설정(글자 크기·폰트) 적용
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.theme || "light");
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
      themeBtn.textContent = settings.theme === "dark" ? "☀️" : "🌙";
    }
  }

  function applyDisplaySettings() {
    const px = Math.min(26, Math.max(12, Number(settings.fontSize) || 16));
    settings.fontSize = px;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--verse-size", `${px}px`);
    rootStyle.setProperty("--note-size", `${Math.max(12, px - 1)}px`);
    rootStyle.setProperty("--guide-size", `${Math.max(12, px - 1.5)}px`);

    const badgeEl = document.getElementById("fontSizeValueBadge");
    if (badgeEl) badgeEl.textContent = `${px}px`;
    const rangeEl = document.getElementById("fontSizeRange");
    if (rangeEl) rangeEl.value = String(px);

    const fontKey = FONT_FAMILY_MAP[settings.fontFamily] ? settings.fontFamily : "gowun-batang";
    const fontStack = FONT_FAMILY_MAP[fontKey];
    rootStyle.setProperty("--font-passage", fontStack);
    if (fontKey === "gowun-batang" || fontKey === "nanum-myeongjo" || fontKey === "noto-serif" || fontKey === "hahmlet") {
      rootStyle.setProperty("--font-sans", FONT_FAMILY_MAP.system);
    } else {
      rootStyle.setProperty("--font-sans", fontStack);
    }

    document.querySelectorAll("#fontSizeOptions .option-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.getAttribute("data-size")) === px);
    });
    document.querySelectorAll("#fontFamilyOptions .option-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-font") === fontKey);
    });
  }

  // 화면 전체 렌더링
  function renderAll() {
    applyTheme();
    applyDisplaySettings();
    renderHeaderAndStreak();
    renderTodayPassageAndForm();
    renderCalendarAndStats();
    renderHistoryList();
    renderPrivacyStatus();
  }

  function renderHeaderAndStreak() {
    const stats = calculateStats();
    const streakCountEl = document.getElementById("headerStreakCount");
    const dateLabelEl = document.getElementById("currentDateLabel");
    if (streakCountEl) {
      streakCountEl.textContent = `${stats.streak}일 연속 묵상 중`;
    }
    if (dateLabelEl) {
      dateLabelEl.textContent =
        currentDateKey === todayKey
          ? `오늘 · ${formatKoreanDate(currentDateKey)}`
          : formatKoreanDate(currentDateKey);
    }
  }

  function renderDevotionalSection(containerEl, items, prefix, selectedSet) {
    containerEl.innerHTML = "";
    items.forEach((text, idx) => {
      const key = `${prefix}-${idx}`;
      const div = document.createElement("div");
      div.className = "verse-item" + (selectedSet.has(key) ? " selected" : "");
      const colonIdx = text.indexOf(":");
      if (colonIdx > 0 && colonIdx < 16) {
        const label = text.slice(0, colonIdx);
        const body = text.slice(colonIdx + 1).trim();
        div.innerHTML = `<span class="verse-num">${escapeHtml(label)}</span><span>${escapeHtml(body)}</span>`;
      } else {
        div.innerHTML = `<span>${escapeHtml(text)}</span>`;
      }
      div.addEventListener("click", () => {
        toggleVerseSelection(key);
      });
      containerEl.appendChild(div);
    });
  }

  function renderTodayPassageAndForm() {
    const passage = getPassageForDate(currentDateKey);
    const rec = records[currentDateKey] || {
      selectedVerses: [],
      summaryTitle: "",
      observation: "",
      meditation: "",
      application: "",
      actionDone: false,
      prayer: "",
      gratitude: ""
    };

    const allPassages = window.QT_PASSAGES || [];
    if (passage) {
      const bookLabel = passage.book ? `매일성경전집 · ${passage.book}` : (passage.theme || "오늘의 말씀");
      document.getElementById("passageThemeBadge").textContent = bookLabel;
      document.getElementById("passageTitle").textContent = passage.title;
      document.getElementById("passageRef").textContent = passage.reference;

      const summaryEl = document.getElementById("passageSummary");
      if (summaryEl) {
        summaryEl.textContent = passage.summary || "";
        summaryEl.style.display = passage.summary ? "block" : "none";
      }

      const selectedSet = new Set((rec.selectedVerses || []).map(String));
      const godWrap = document.getElementById("godSectionWrap");
      const godList = document.getElementById("godSectionList");
      const lessonWrap = document.getElementById("lessonSectionWrap");
      const lessonList = document.getElementById("lessonSectionList");

      if (passage.verses && passage.verses.length) {
        // 사용자 직접 입력 본문 호환
        godWrap.style.display = "block";
        godWrap.querySelector(".devotional-heading").textContent = "📖 말씀 본문";
        const formatted = passage.verses.map((v) => `${v.num}절: ${v.text}`);
        renderDevotionalSection(godList, formatted, "v", selectedSet);
        lessonWrap.style.display = "none";
      } else {
        const godItems = passage.godSection || [];
        const lessonItems = passage.lessonSection || [];
        godWrap.querySelector(".devotional-heading").textContent = "🌿 하나님은 어떤 분입니까?";
        if (godItems.length) {
          godWrap.style.display = "block";
          renderDevotionalSection(godList, godItems, "g", selectedSet);
        } else {
          godWrap.style.display = "none";
        }

        if (lessonItems.length) {
          lessonWrap.style.display = "block";
          renderDevotionalSection(lessonList, lessonItems, "l", selectedSet);
        } else {
          lessonWrap.style.display = "none";
        }
      }

      document.getElementById("guideQuestionText").textContent =
        passage.prayer || passage.guideQuestion || "";

      const idx = allPassages.findIndex((p) => p.id === passage.id);
      const progEl = document.getElementById("passageProgressText");
      if (progEl) {
        progEl.textContent = idx >= 0 ? `${idx + 1} / ${allPassages.length}` : "직접 입력 본문";
      }
    }

    // 입력 폼 값 채우기
    document.getElementById("qtSummaryTitle").value = rec.summaryTitle || "";
    document.getElementById("qtObservation").value = rec.observation || "";
    document.getElementById("qtMeditation").value = rec.meditation || "";
    document.getElementById("qtApplication").value = rec.application || "";
    document.getElementById("qtActionDone").checked = Boolean(rec.actionDone);
    document.getElementById("qtPrayer").value = rec.prayer || "";
    document.getElementById("qtGratitude").value = rec.gratitude || "";

    const statusBadge = document.getElementById("saveStatusText");
    if (statusBadge) {
      if (isRecordCompleted(rec)) {
        statusBadge.textContent = rec.updatedAt
          ? `✓ 내 기기에 안전하게 저장됨 (${rec.updatedAt})`
          : "✓ 내 기기에 안전하게 저장됨";
      } else {
        statusBadge.textContent = "아직 작성 전입니다 · 작성 내용은 내 기기에만 저장됩니다";
      }
    }
  }

  function toggleVerseSelection(verseKey) {
    const rec = getOrCreateCurrentRecord();
    const arr = Array.isArray(rec.selectedVerses) ? rec.selectedVerses.map(String) : [];
    const idx = arr.indexOf(String(verseKey));
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(String(verseKey));
    }
    rec.selectedVerses = arr;
    saveCurrentRecord(rec, false);
    renderTodayPassageAndForm();
    showToast(idx >= 0 ? "형광펜 표시가 해제되었습니다" : "마음에 와닿는 문단을 형광펜으로 표시했습니다");
  }

  function selectPassageForCurrentDate(passageId) {
    const found = (window.QT_PASSAGES || []).find((p) => p.id === passageId);
    if (found && !isBookUnlocked(found.book)) {
      openBookPinUnlock(found.book, passageId);
      return;
    }
    if (found && found.book) {
      settings.activeBook = found.book;
      saveJSON(STORAGE_KEYS.SETTINGS, settings);
    }
    const rec = getOrCreateCurrentRecord();
    rec.passageId = passageId;
    delete customPassages[currentDateKey];
    saveJSON(STORAGE_KEYS.CUSTOM_PASSAGES, customPassages);
    saveCurrentRecord(rec, false);
    renderAll();
  }

  function getOrCreateCurrentRecord() {
    if (!records[currentDateKey]) {
      records[currentDateKey] = {
        selectedVerses: [],
        summaryTitle: "",
        observation: "",
        meditation: "",
        application: "",
        actionDone: false,
        prayer: "",
        gratitude: "",
        updatedAt: ""
      };
    }
    return records[currentDateKey];
  }

  function collectFormIntoRecord() {
    const rec = getOrCreateCurrentRecord();
    rec.summaryTitle = document.getElementById("qtSummaryTitle").value;
    rec.observation = document.getElementById("qtObservation").value;
    rec.meditation = document.getElementById("qtMeditation").value;
    rec.application = document.getElementById("qtApplication").value;
    rec.actionDone = document.getElementById("qtActionDone").checked;
    rec.prayer = document.getElementById("qtPrayer").value;
    rec.gratitude = document.getElementById("qtGratitude").value;
    const now = new Date();
    rec.updatedAt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return rec;
  }

  function saveCurrentRecord(rec, notify = true) {
    const passage = getPassageForDate(currentDateKey);
    if (passage) {
      rec.passageTitle = passage.title;
      rec.passageRef = passage.reference;
    }
    records[currentDateKey] = rec;
    saveJSON(STORAGE_KEYS.RECORDS, records);
    renderHeaderAndStreak();
    renderCalendarAndStats();
    renderHistoryList();
    if (notify) {
      const statusBadge = document.getElementById("saveStatusText");
      if (statusBadge) {
        statusBadge.textContent = `✓ 내 기기에 안전하게 저장됨 (${rec.updatedAt})`;
      }
      showToast("오늘의 묵상 노트가 내 기기에 저장되었습니다 🌿");
    }
  }

  // 캘린더 & 통계 렌더링
  function renderCalendarAndStats() {
    const stats = calculateStats();
    document.getElementById("statStreak").textContent = stats.streak;
    document.getElementById("statMonthly").textContent = stats.monthlyCount;
    document.getElementById("statTotal").textContent = stats.totalCount;
    document.getElementById("statActionRate").textContent = stats.actionRate;

    document.getElementById("calendarMonthTitle").textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

    const grid = document.getElementById("calendarGrid");
    grid.innerHTML = "";

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const lastDate = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "cal-day empty";
      grid.appendChild(emptyCell);
    }

    for (let d = 1; d <= lastDate; d++) {
      const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rec = records[dateKey];
      const completed = isRecordCompleted(rec);
      const cell = document.createElement("div");
      let cls = "cal-day";
      if (dateKey === todayKey) cls += " today";
      if (completed) cls += " completed";
      if (dateKey === currentDateKey) cls += " selected";
      cell.className = cls;

      let stamp = "";
      if (completed) {
        stamp = rec.actionDone ? "🌿✨" : "🌿";
      }

      cell.innerHTML = `<span>${d}</span><span class="cal-stamp">${stamp}</span>`;
      cell.addEventListener("click", () => {
        currentDateKey = dateKey;
        renderAll();
        renderSelectedDatePreview(dateKey);
      });
      grid.appendChild(cell);
    }

    renderSelectedDatePreview(currentDateKey);
  }

  function renderSelectedDatePreview(dateKey) {
    const box = document.getElementById("calendarSelectedPreview");
    if (!box) return;
    const rec = records[dateKey];
    const passage = getPassageForDate(dateKey);
    const completed = isRecordCompleted(rec);

    if (!completed) {
      box.innerHTML = `
        <div class="card-header">
          <div>
            <span class="badge-tag">${formatKoreanDate(dateKey)}</span>
            <div class="passage-title">${passage ? escapeHtml(passage.title) : "말씀 묵상"}</div>
            <div class="passage-ref">${passage ? escapeHtml(passage.reference) : ""}</div>
          </div>
          <button class="small-btn" id="jumpToWriteBtn">이 날짜 묵상 쓰기 →</button>
        </div>
        <p style="font-size:13px;color:var(--text-muted);">이 날짜에는 아직 저장된 묵상 기록이 없습니다.</p>
      `;
    } else {
      box.innerHTML = `
        <div class="card-header">
          <div>
            <span class="badge-tag">${formatKoreanDate(dateKey)} ${rec.actionDone ? "· ✨ 적용 실천 완료" : "· 🌿 묵상 완료"}</span>
            <div class="passage-title">${escapeHtml(rec.summaryTitle || (passage && passage.title) || "묵상 노트")}</div>
            <div class="passage-ref">${escapeHtml((passage && passage.reference) || "")}</div>
          </div>
          <button class="small-btn" id="jumpToWriteBtn">노트 열기/수정 →</button>
        </div>
        <div style="font-size:13.5px;color:var(--text-secondary);display:flex;flex-direction:column;gap:6px;">
          ${rec.observation ? `<div><strong>[관찰]</strong> ${escapeHtml(rec.observation)}</div>` : ""}
          ${rec.meditation ? `<div><strong>[느낌]</strong> ${escapeHtml(rec.meditation)}</div>` : ""}
          ${rec.application ? `<div><strong>[적용]</strong> ${escapeHtml(rec.application)}</div>` : ""}
          ${rec.prayer ? `<div><strong>[기도]</strong> ${escapeHtml(rec.prayer)}</div>` : ""}
        </div>
      `;
    }

    const jumpBtn = document.getElementById("jumpToWriteBtn");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", () => {
        switchTab("tab-today");
      });
    }
  }

  // 지난 묵상 모아보기 및 검색
  function renderHistoryList() {
    const searchInput = document.getElementById("historySearchInput");
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const container = document.getElementById("historyListContainer");
    if (!container) return;

    const keys = Object.keys(records)
      .filter((k) => isRecordCompleted(records[k]))
      .sort((a, b) => (a < b ? 1 : -1));

    const filtered = keys.filter((k) => {
      if (!keyword) return true;
      const r = records[k];
      const text = [
        k,
        r.summaryTitle,
        r.passageTitle,
        r.passageRef,
        r.observation,
        r.meditation,
        r.application,
        r.prayer,
        r.gratitude
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(keyword);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:32px 18px;color:var(--text-muted);">
          <div style="font-size:28px;margin-bottom:8px;">📖</div>
          <div style="font-size:14px;font-weight:600;">저장된 묵상 기록이 없습니다</div>
          <div style="font-size:12px;margin-top:4px;">'오늘의 QT' 탭에서 첫 말씀묵상을 기록해 보세요.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    filtered.forEach((dateKey) => {
      const r = records[dateKey];
      const passage = getPassageForDate(dateKey);
      const item = document.createElement("div");
      item.className = "history-item";
      const previewText = r.meditation || r.observation || r.application || r.prayer || "";
      item.innerHTML = `
        <div class="history-meta">
          <span>${formatKoreanDate(dateKey)}</span>
          <span style="display:flex;align-items:center;gap:6px;">
            <span>${r.actionDone ? "✨ 적용 실천 완료" : "🌿 묵상 완료"}</span>
            <button type="button" class="small-btn history-share-btn" style="padding:3px 8px;font-size:11.5px;">📤 공유</button>
          </span>
        </div>
        <div class="history-title">${escapeHtml(r.summaryTitle || (passage && passage.title) || "오늘의 묵상")} <span style="font-size:12px;font-weight:600;color:var(--accent-primary);">(${escapeHtml((passage && passage.reference) || "")})</span></div>
        <div class="history-preview">${escapeHtml(previewText)}</div>
      `;
      const shareBtn = item.querySelector(".history-share-btn");
      if (shareBtn) {
        shareBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openShareModalForDate(dateKey);
        });
      }
      item.addEventListener("click", () => {
        currentDateKey = dateKey;
        renderAll();
        switchTab("tab-today");
      });
      container.appendChild(item);
    });
  }

  // 내 기기 보관함 / 프라이버시 & 권별 잠금 상태 렌더링
  function renderPrivacyStatus() {
    const pinStatusEl = document.getElementById("pinStatusText");
    const togglePinBtn = document.getElementById("togglePinSetupBtn");
    const lockNowBtn = document.getElementById("lockNowBtn");

    if (settings.pinCode) {
      pinStatusEl.textContent = "🔒 4자리 암호 잠금이 활성화되어 있습니다";
      togglePinBtn.textContent = "비밀번호 해제";
      lockNowBtn.style.display = "inline-block";
    } else {
      pinStatusEl.textContent = "🔓 현재 비밀번호 잠금이 설정되지 않았습니다";
      togglePinBtn.textContent = "4자리 암호 설정";
      lockNowBtn.style.display = "none";
    }

    const appShareUrlInput = document.getElementById("appShareUrlInput");
    if (appShareUrlInput && document.activeElement !== appShareUrlInput) {
      appShareUrlInput.value = getShareAppUrl();
    }

    const bookLockListEl = document.getElementById("bookLockStatusList");
    if (bookLockListEl) {
      const books = window.QT_BOOKS || [];
      bookLockListEl.innerHTML = "";
      books.forEach((b) => {
        const unlocked = isBookUnlocked(b.id);
        const span = document.createElement("span");
        span.className = "book-lock-chip" + (unlocked ? " unlocked" : "");
        span.textContent = unlocked ? `🔓 ${b.name}` : `🔒 ${b.name}`;
        bookLockListEl.appendChild(span);
      });
    }
  }

  // 탭 전환
  function switchTab(tabId) {
    document.querySelectorAll(".tab-panel").forEach((el) => {
      el.classList.toggle("active", el.id === tabId);
    });
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-target") === tabId);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // 외부 공유 텍스트 생성 & 공유 실행
  let shareTargetDateKey = null;

  function normalizeShareUrl(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function getShareAppUrl() {
    if (settings.appShareUrl && settings.appShareUrl.trim()) {
      return normalizeShareUrl(settings.appShareUrl);
    }
    if (location.protocol.startsWith("http")) {
      return location.href.split("#")[0];
    }
    return "";
  }

  function openShareModalForDate(dateKey) {
    shareTargetDateKey = dateKey || currentDateKey;
    updateSharePreview();
    const modal = document.getElementById("shareModal");
    if (modal) modal.classList.add("active");
  }

  function buildShareText(targetDateKey) {
    const dateKey = targetDateKey || shareTargetDateKey || currentDateKey;
    const passage = getPassageForDate(dateKey);
    const rec = dateKey === currentDateKey ? collectFormIntoRecord() : (records[dateKey] || {});
    const includePassage = document.getElementById("shareIncludePassage")?.checked ?? true;
    const includeNotes = document.getElementById("shareIncludeNotes")?.checked ?? true;
    const includeLink = document.getElementById("shareIncludeLink")?.checked ?? true;

    const lines = [`🌿 [날마다평강] ${formatKoreanDate(dateKey)}`];
    if (passage) {
      lines.push(`📖 ${passage.reference} · ${passage.title}`);
      if (includePassage) {
        if (passage.summary) lines.push(`\n${passage.summary}`);
        const prayerText = passage.prayer || passage.guideQuestion;
        if (prayerText) lines.push(`\n🙏 기도: ${prayerText}`);
      }
    }

    if (includeNotes) {
      const noteParts = [];
      if (rec.summaryTitle?.trim()) noteParts.push(`★ 한 줄 제목: ${rec.summaryTitle.trim()}`);
      if (rec.observation?.trim()) noteParts.push(`• 관찰: ${rec.observation.trim()}`);
      if (rec.meditation?.trim()) noteParts.push(`• 묵상: ${rec.meditation.trim()}`);
      if (rec.application?.trim()) noteParts.push(`• 적용: ${rec.application.trim()}`);
      if (rec.prayer?.trim()) noteParts.push(`• 나의 기도: ${rec.prayer.trim()}`);
      if (rec.gratitude?.trim()) noteParts.push(`• 감사: ${rec.gratitude.trim()}`);
      if (noteParts.length) {
        lines.push("\n--- 나의 묵상 나눔 ---");
        lines.push(...noteParts);
      }
    }

    const shareUrl = getShareAppUrl();
    if (includeLink && shareUrl) {
      lines.push(`\n🔗 날마다평강 열기: ${shareUrl}`);
    }
    return lines.join("\n");
  }

  function updateSharePreview() {
    const area = document.getElementById("sharePreviewText");
    if (area) area.value = buildShareText(shareTargetDateKey || currentDateKey);
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("클립보드에 복사되었습니다 📋");
        return true;
      }
    } catch (e) {}
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand("copy");
      showToast("클립보드에 복사되었습니다 📋");
      return true;
    } catch (e) {
      showToast("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
      return false;
    } finally {
      document.body.removeChild(temp);
    }
  }

  async function shareExternally(title, text, url) {
    if (navigator.share) {
      try {
        const payload = { title, text };
        if (url && /^https?:\/\//i.test(url)) payload.url = url;
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    await copyTextToClipboard(text);
  }

  async function shareStandaloneAppFile() {
    const isStandalone = !document.querySelector('script[src="app.js"]');
    if (!isStandalone) {
      const shareUrl = getShareAppUrl();
      if (shareUrl) {
        await shareExternally(
          "날마다평강 - 말씀 한 잎, 하루의 평강",
          `🌿 날마다평강 말씀묵상 앱에서 함께 묵상해요!\n${shareUrl}`,
          shareUrl
        );
      } else {
        showToast("웹 버전에서는 '앱 링크 공유하기'를 이용해 주세요");
      }
      return;
    }

    const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    const file = new File([htmlContent], "날마다평강-앱.html", { type: "text/html" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: "날마다평강 앱",
          text: "모세오경 묵상 앱입니다. Safari나 Chrome으로 열면 바로 사용하실 수 있습니다.",
          files: [file]
        });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "날마다평강-앱.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("날마다평강-앱.html 파일을 저장했습니다. 이 파일을 카톡·문자로 보내세요! 📲");
  }

  // 본문 직접 수정 모달
  function openCustomPassageModal() {
    const passage = getPassageForDate(currentDateKey);
    document.getElementById("customTitleInput").value = passage ? passage.title : "";
    document.getElementById("customRefInput").value = passage ? passage.reference : "";
    document.getElementById("customGuideInput").value = passage ? (passage.prayer || passage.guideQuestion || "") : "";
    let versesText = "";
    if (passage && passage.verses) {
      versesText = passage.verses.map((v) => `${v.num}. ${v.text}`).join("\n");
    }
    document.getElementById("customVersesInput").value = versesText;
    document.getElementById("customPassageModal").classList.add("active");
  }

  // 모세오경 목차 모달
  function openBookIndexModal() {
    const currentPassage = getPassageForDate(currentDateKey);
    if (currentPassage && currentPassage.book) {
      activeBookIndexTab = currentPassage.book;
    }
    document.getElementById("bookIndexSearch").value = "";
    renderBookIndexModal();
    document.getElementById("bookIndexModal").classList.add("active");
  }

  function renderBookIndexModal() {
    const books = window.QT_BOOKS || [];
    const tabsEl = document.getElementById("bookIndexTabs");
    const listEl = document.getElementById("bookIndexList");
    const keyword = document.getElementById("bookIndexSearch").value.trim().toLowerCase();
    const currentPassage = getPassageForDate(currentDateKey);

    tabsEl.innerHTML = "";
    books.forEach((b) => {
      const unlocked = isBookUnlocked(b.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "book-tab-btn" + (b.id === activeBookIndexTab && !keyword ? " active" : "");
      btn.textContent = `${unlocked ? "" : "🔒 "}${b.name} (${b.items.length})`;
      btn.addEventListener("click", () => {
        if (!isBookUnlocked(b.id)) {
          openBookPinUnlock(b.id, null, () => {
            activeBookIndexTab = b.id;
            document.getElementById("bookIndexSearch").value = "";
            renderBookIndexModal();
          });
          return;
        }
        activeBookIndexTab = b.id;
        document.getElementById("bookIndexSearch").value = "";
        renderBookIndexModal();
      });
      tabsEl.appendChild(btn);
    });

    let itemsToShow = [];
    if (keyword) {
      itemsToShow = (window.QT_PASSAGES || []).filter(
        (p) =>
          p.title.toLowerCase().includes(keyword) ||
          p.reference.toLowerCase().includes(keyword) ||
          (p.summary && p.summary.toLowerCase().includes(keyword))
      );
    } else {
      const activeBook = books.find((b) => b.id === activeBookIndexTab) || books[0];
      itemsToShow = activeBook ? activeBook.items : [];
    }

    listEl.innerHTML = "";
    if (!itemsToShow.length) {
      listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">검색 결과가 없습니다.</div>`;
      return;
    }

    itemsToShow.forEach((p) => {
      const row = document.createElement("div");
      const isCurrent = currentPassage && currentPassage.id === p.id;
      const unlocked = isBookUnlocked(p.book);
      row.className = "index-item" + (isCurrent ? " active" : "");
      row.innerHTML = `
        <div>
          <div class="index-item-title">${unlocked ? "" : "🔒 "}${escapeHtml(p.title)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(p.book)}</div>
        </div>
        <div class="index-item-ref">${escapeHtml(p.reference)}</div>
      `;
      row.addEventListener("click", () => {
        if (!isBookUnlocked(p.book)) {
          openBookPinUnlock(p.book, p.id, () => {
            document.getElementById("bookIndexModal").classList.remove("active");
            showToast(`${p.book} 잠금이 해제되어 ${p.reference} 말씀을 불러왔습니다`);
          });
          return;
        }
        selectPassageForCurrentDate(p.id);
        document.getElementById("bookIndexModal").classList.remove("active");
        showToast(`${p.reference} 말씀을 불러왔습니다`);
      });
      listEl.appendChild(row);
    });
  }

  function saveCustomPassage() {
    const title = document.getElementById("customTitleInput").value.trim() || "나만의 말씀 본문";
    const reference = document.getElementById("customRefInput").value.trim() || "성경 본문";
    const guideQuestion = document.getElementById("customGuideInput").value.trim();
    const rawLines = document
      .getElementById("customVersesInput")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const verses = rawLines.map((line, idx) => {
      const match = line.match(/^(\d+)[\.\:\s절]+(.*)$/);
      if (match) {
        return { num: Number(match[1]), text: match[2].trim() };
      }
      return { num: idx + 1, text: line };
    });

    customPassages[currentDateKey] = {
      title,
      reference,
      theme: "직접 입력한 본문",
      guideQuestion: guideQuestion || "이 말씀을 통해 오늘 나에게 주시는 하나님의 음성은 무엇인가요?",
      verses: verses.length ? verses : [{ num: 1, text: "말씀 본문을 입력해 주세요." }]
    };

    saveJSON(STORAGE_KEYS.CUSTOM_PASSAGES, customPassages);
    document.getElementById("customPassageModal").classList.remove("active");
    renderAll();
    showToast("오늘의 말씀 본문이 수정되었습니다");
  }

  // PIN 잠금 화면 처리
  function openBookPinUnlock(bookName, passageId, onSuccess) {
    pendingBookUnlock = { bookName, passageId, onSuccess };
    openPinLock("book_unlock");
  }

  function openPinLock(mode) {
    pinMode = mode;
    pinBuffer = "";
    const titleEl = document.getElementById("pinLockTitle");
    const descEl = document.getElementById("pinLockDesc");
    const cancelBtn = document.getElementById("pinCancelBtn");

    if (mode === "setup") {
      titleEl.textContent = "새 4자리 비밀번호 설정";
      descEl.textContent = "앱 실행 시 내 묵상 노트를 보호할 4자리 숫자를 입력해 주세요.";
      cancelBtn.style.display = "inline-block";
    } else if (mode === "book_unlock" && pendingBookUnlock) {
      titleEl.textContent = `🔒 ${pendingBookUnlock.bookName} 잠금 해제`;
      const hint = settings.bookPin === "0000" ? " (초기 기본 PIN: 0000)" : "";
      descEl.textContent = `다른 권으로 넘어가려면 4자리 권 이동 PIN을 입력해 주세요.${hint}`;
      cancelBtn.style.display = "inline-block";
    } else if (mode === "book_pin_setup") {
      titleEl.textContent = "권 이동 PIN 변경";
      descEl.textContent = "다른 권으로 넘어갈 때 사용할 새 4자리 숫자를 입력해 주세요.";
      cancelBtn.style.display = "inline-block";
    } else {
      titleEl.textContent = "날마다평강 잠금 해제";
      descEl.textContent = "설정하신 4자리 비밀번호를 입력해 주세요.";
      cancelBtn.style.display = "none";
    }
    updatePinDots();
    document.getElementById("pinLockOverlay").classList.add("active");
  }

  function updatePinDots() {
    const dots = document.querySelectorAll("#pinDots .pin-dot");
    dots.forEach((dot, i) => {
      dot.classList.toggle("filled", i < pinBuffer.length);
    });
  }

  function handlePinKey(key) {
    if (Date.now() < pinLockUntil) {
      const remain = Math.ceil((pinLockUntil - Date.now()) / 1000);
      showToast(`보안을 위해 ${remain}초 후 다시 시도해 주세요 🔒`);
      return;
    }
    if (key === "clear") {
      pinBuffer = "";
      updatePinDots();
      return;
    }
    if (key === "back") {
      pinBuffer = pinBuffer.slice(0, -1);
      updatePinDots();
      return;
    }
    if (pinBuffer.length < 4) {
      pinBuffer += key;
      updatePinDots();
    }
    if (pinBuffer.length === 4) {
      setTimeout(() => {
        if (pinMode === "setup") {
          settings.pinCode = pinBuffer;
          saveJSON(STORAGE_KEYS.SETTINGS, settings);
          document.getElementById("pinLockOverlay").classList.remove("active");
          renderPrivacyStatus();
          showToast("4자리 화면 잠금이 설정되었습니다 🔒");
        } else if (pinMode === "book_pin_setup") {
          settings.bookPin = pinBuffer;
          saveJSON(STORAGE_KEYS.SETTINGS, settings);
          document.getElementById("pinLockOverlay").classList.remove("active");
          renderPrivacyStatus();
          showToast("권 이동 PIN이 변경되었습니다 🔑");
        } else if (pinMode === "book_unlock" && pendingBookUnlock) {
          if (pinBuffer === settings.bookPin) {
            pinFailCount = 0;
            const { bookName, passageId, onSuccess } = pendingBookUnlock;
            pendingBookUnlock = null;
            if (!settings.unlockedBooks.includes(bookName)) {
              settings.unlockedBooks.push(bookName);
            }
            settings.activeBook = bookName;
            saveJSON(STORAGE_KEYS.SETTINGS, settings);
            document.getElementById("pinLockOverlay").classList.remove("active");
            if (passageId) {
              selectPassageForCurrentDate(passageId);
            } else {
              renderAll();
            }
            if (typeof onSuccess === "function") onSuccess();
            showToast(`🔓 ${bookName} 권이 잠금 해제되었습니다`);
          } else {
            pinFailCount++;
            pinBuffer = "";
            updatePinDots();
            if (pinFailCount >= 5) {
              pinLockUntil = Date.now() + 30000;
              pinFailCount = 0;
              showToast("5회 연속 오류로 30초간 입력이 잠깁니다 🔒");
            } else {
              showToast(`권 이동 PIN이 일치하지 않습니다 (${pinFailCount}/5)`);
            }
          }
        } else {
          if (pinBuffer === settings.pinCode) {
            pinFailCount = 0;
            document.getElementById("pinLockOverlay").classList.remove("active");
            showToast("잠금이 해제되었습니다");
          } else {
            pinFailCount++;
            pinBuffer = "";
            updatePinDots();
            if (pinFailCount >= 5) {
              pinLockUntil = Date.now() + 30000;
              pinFailCount = 0;
              showToast("5회 연속 오류로 30초간 입력이 잠깁니다 🔒");
            } else {
              showToast(`비밀번호가 일치하지 않습니다 (${pinFailCount}/5)`);
            }
          }
        }
      }, 120);
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 이벤트 바인딩
  function bindEvents() {
    // 하단 탭 이동
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.getAttribute("data-target"));
      });
    });

    // 상단 프라이버시 배지 클릭 시 보관함 탭으로 이동
    document.getElementById("privacyBadgeBtn").addEventListener("click", () => {
      switchTab("tab-privacy");
    });

    // 다크모드 토글
    document.getElementById("themeToggleBtn").addEventListener("click", () => {
      settings.theme = settings.theme === "dark" ? "light" : "dark";
      saveJSON(STORAGE_KEYS.SETTINGS, settings);
      applyTheme();
    });

    // 글자 크기 선택 (슬라이더 / +/- / 프리셋 숫자 버튼)
    function updateFontSize(nextPx, notify = false) {
      const clamped = Math.min(26, Math.max(12, Number(nextPx) || 16));
      settings.fontSize = clamped;
      saveJSON(STORAGE_KEYS.SETTINGS, settings);
      applyDisplaySettings();
      if (notify) showToast(`글자 크기: ${clamped}px`);
    }

    const fontSizeRange = document.getElementById("fontSizeRange");
    if (fontSizeRange) {
      fontSizeRange.addEventListener("input", (e) => {
        updateFontSize(e.target.value, false);
      });
    }

    const fontSizeMinusBtn = document.getElementById("fontSizeMinusBtn");
    if (fontSizeMinusBtn) {
      fontSizeMinusBtn.addEventListener("click", () => {
        updateFontSize((Number(settings.fontSize) || 16) - 1, true);
      });
    }

    const fontSizePlusBtn = document.getElementById("fontSizePlusBtn");
    if (fontSizePlusBtn) {
      fontSizePlusBtn.addEventListener("click", () => {
        updateFontSize((Number(settings.fontSize) || 16) + 1, true);
      });
    }

    document.querySelectorAll("#fontSizeOptions .option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateFontSize(btn.getAttribute("data-size"), true);
      });
    });

    // 글꼴 선택
    document.querySelectorAll("#fontFamilyOptions .option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        settings.fontFamily = btn.getAttribute("data-font");
        saveJSON(STORAGE_KEYS.SETTINGS, settings);
        applyDisplaySettings();
        showToast("글꼴이 변경되었습니다");
      });
    });

    // 날짜 이동 버튼
    document.getElementById("prevDateBtn").addEventListener("click", () => {
      const d = parseDateKey(currentDateKey);
      d.setDate(d.getDate() - 1);
      currentDateKey = toDateKey(d);
      renderAll();
    });

    document.getElementById("nextDateBtn").addEventListener("click", () => {
      const d = parseDateKey(currentDateKey);
      d.setDate(d.getDate() + 1);
      currentDateKey = toDateKey(d);
      renderAll();
    });

    document.getElementById("currentDateLabel").addEventListener("click", () => {
      currentDateKey = todayKey;
      renderAll();
      showToast("오늘 날짜로 이동했습니다");
    });

    // 묵상 폼 자동 임시저장 및 저장 버튼
    const formInputs = [
      "qtSummaryTitle",
      "qtObservation",
      "qtMeditation",
      "qtApplication",
      "qtActionDone",
      "qtPrayer",
      "qtGratitude"
    ];

    formInputs.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const rec = collectFormIntoRecord();
        saveCurrentRecord(rec, false);
        const statusBadge = document.getElementById("saveStatusText");
        if (statusBadge) {
          statusBadge.textContent = `✓ 자동 저장됨 (${rec.updatedAt}) · 오직 내 기기에만 보관됩니다`;
        }
      });
    });

    document.getElementById("saveQtBtn").addEventListener("click", () => {
      const rec = collectFormIntoRecord();
      saveCurrentRecord(rec, true);
    });

    // 외부 공유 모달 & 앱 링크/파일 공유
    const openShareBtn = document.getElementById("openShareModalBtn");
    if (openShareBtn) {
      openShareBtn.addEventListener("click", () => {
        openShareModalForDate(currentDateKey);
      });
    }
    const closeShareBtn = document.getElementById("closeShareModalBtn");
    if (closeShareBtn) {
      closeShareBtn.addEventListener("click", () => {
        document.getElementById("shareModal").classList.remove("active");
      });
    }
    ["shareIncludePassage", "shareIncludeNotes", "shareIncludeLink"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", updateSharePreview);
    });
    const copyShareBtn = document.getElementById("copyShareTextBtn");
    if (copyShareBtn) {
      copyShareBtn.addEventListener("click", () => {
        const text = document.getElementById("sharePreviewText").value;
        copyTextToClipboard(text);
      });
    }
    const nativeShareBtn = document.getElementById("nativeShareBtn");
    if (nativeShareBtn) {
      nativeShareBtn.addEventListener("click", () => {
        const text = document.getElementById("sharePreviewText").value;
        shareExternally("날마다평강 · 묵상 나눔", text, getShareAppUrl());
      });
    }
    const shareAppLinkBtn = document.getElementById("shareAppLinkBtn");
    if (shareAppLinkBtn) {
      shareAppLinkBtn.addEventListener("click", () => {
        const shareUrl = getShareAppUrl();
        if (shareUrl) {
          shareExternally(
            "날마다평강 - 말씀 한 잎, 하루의 평강",
            `🌿 날마다평강 말씀묵상 앱에서 함께 묵상해요!\n${shareUrl}`,
            shareUrl
          );
        } else {
          const input = document.getElementById("appShareUrlInput");
          if (input) input.focus();
          showToast("아래에 Netlify 웹 주소를 저장하거나 '앱 파일(.html) 공유'를 이용해 주세요");
        }
      });
    }
    const shareAppFileBtn = document.getElementById("shareAppFileBtn");
    if (shareAppFileBtn) {
      shareAppFileBtn.addEventListener("click", shareStandaloneAppFile);
    }
    const saveAppShareUrlBtn = document.getElementById("saveAppShareUrlBtn");
    if (saveAppShareUrlBtn) {
      saveAppShareUrlBtn.addEventListener("click", () => {
        const input = document.getElementById("appShareUrlInput");
        const normalized = normalizeShareUrl(input ? input.value : "");
        settings.appShareUrl = normalized;
        saveJSON(STORAGE_KEYS.SETTINGS, settings);
        if (input) input.value = normalized;
        showToast(normalized ? "공유용 웹 주소가 저장되었습니다 🌐" : "저장된 웹 주소를 비웠습니다");
      });
    }

    // 본문 수정 모달
    document.getElementById("editPassageBtn").addEventListener("click", openCustomPassageModal);
    document.getElementById("closeCustomModalBtn").addEventListener("click", () => {
      document.getElementById("customPassageModal").classList.remove("active");
    });
    document.getElementById("saveCustomPassageBtn").addEventListener("click", saveCustomPassage);

    // 모세오경 목차 모달 & 이전/다음 말씀 이동
    document.getElementById("openBookIndexBtn").addEventListener("click", openBookIndexModal);
    document.getElementById("closeBookIndexBtn").addEventListener("click", () => {
      document.getElementById("bookIndexModal").classList.remove("active");
    });
    document.getElementById("bookIndexSearch").addEventListener("input", renderBookIndexModal);

    document.getElementById("prevPassageBtn").addEventListener("click", () => {
      const list = window.QT_PASSAGES || [];
      if (!list.length) return;
      const cur = getPassageForDate(currentDateKey);
      const curIdx = cur ? list.findIndex((p) => p.id === cur.id) : 0;
      const nextIdx = (curIdx - 1 + list.length) % list.length;
      selectPassageForCurrentDate(list[nextIdx].id);
    });

    document.getElementById("nextPassageBtn").addEventListener("click", () => {
      const list = window.QT_PASSAGES || [];
      if (!list.length) return;
      const cur = getPassageForDate(currentDateKey);
      const curIdx = cur ? list.findIndex((p) => p.id === cur.id) : 0;
      const nextIdx = (curIdx + 1) % list.length;
      selectPassageForCurrentDate(list[nextIdx].id);
    });

    // 캘린더 이전/다음 달
    document.getElementById("calPrevMonthBtn").addEventListener("click", () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      renderCalendarAndStats();
    });

    document.getElementById("calNextMonthBtn").addEventListener("click", () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      renderCalendarAndStats();
    });

    // 검색 필터
    document.getElementById("historySearchInput").addEventListener("input", renderHistoryList);

    // 권 이동 PIN 변경 & 재잠금
    const changeBookPinBtn = document.getElementById("changeBookPinBtn");
    if (changeBookPinBtn) {
      changeBookPinBtn.addEventListener("click", () => {
        openPinLock("book_pin_setup");
      });
    }

    const relockBooksBtn = document.getElementById("relockBooksBtn");
    if (relockBooksBtn) {
      relockBooksBtn.addEventListener("click", () => {
        settings.unlockedBooks = ["창세기"];
        settings.activeBook = "창세기";
        saveJSON(STORAGE_KEYS.SETTINGS, settings);
        renderAll();
        showToast("창세기 외 다른 권이 모두 다시 잠겼습니다 🔒");
      });
    }

    // PIN 잠금 설정/해제
    document.getElementById("togglePinSetupBtn").addEventListener("click", () => {
      if (settings.pinCode) {
        settings.pinCode = "";
        saveJSON(STORAGE_KEYS.SETTINGS, settings);
        renderPrivacyStatus();
        showToast("비밀번호 잠금이 해제되었습니다");
      } else {
        openPinLock("setup");
      }
    });

    document.getElementById("lockNowBtn").addEventListener("click", () => {
      if (settings.pinCode) {
        openPinLock("unlock");
      }
    });

    document.getElementById("pinCancelBtn").addEventListener("click", () => {
      document.getElementById("pinLockOverlay").classList.remove("active");
    });

    document.querySelectorAll(".pin-key").forEach((btn) => {
      btn.addEventListener("click", () => {
        handlePinKey(btn.getAttribute("data-key"));
      });
    });

    // 백업 파일 내보내기 (JSON)
    document.getElementById("exportDataBtn").addEventListener("click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "날마다평강",
        records,
        customPassages
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qt-pyeonggang-backup-${todayKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("백업 파일이 내 기기에 다운로드되었습니다");
    });

    // 백업 파일 불러오기 (JSON)
    const fileInput = document.getElementById("importFileInput");
    document.getElementById("importDataBtn").addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (parsed && parsed.records) {
            records = { ...records, ...parsed.records };
            customPassages = { ...customPassages, ...(parsed.customPassages || {}) };
            saveJSON(STORAGE_KEYS.RECORDS, records);
            saveJSON(STORAGE_KEYS.CUSTOM_PASSAGES, customPassages);
            renderAll();
            showToast("백업 파일을 성공적으로 불러왔습니다 🌿");
          } else {
            showToast("올바른 백업 파일 형식이 아닙니다");
          }
        } catch (err) {
          showToast("파일을 읽는 중 오류가 발생했습니다");
        }
      };
      reader.readAsText(file);
    });
  }

  // 초기화
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    renderAll();
    initPersistentStorageAndRestore();
    if (settings.pinCode) {
      openPinLock("unlock");
    }
  });
})();
