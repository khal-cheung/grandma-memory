/* voice.js — 稳定版录音（iOS/Android/PC）
   目标：
   - iOS 不再卡“正在录音”
   - 松手/离开按钮/切后台 都能 stop
   - 防重复点击导致状态错乱
   - 录音结束后写入 localStorage(grandma_chat_diary_v3)
   - 写入后触发 window 事件让 chat.js 立即 render（需要 chat.js 加 6 行监听）
*/

(function () {
  const CHAT_KEY = "grandma_chat_diary_v3";
  const voiceBtn = document.getElementById("voiceBtn");
  if (!voiceBtn) return;

  // --- 状态机 ---
  let state = "idle"; // idle | requesting | recording | stopping
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startAt = 0;
  let stopGuardTimer = null;

  const MIN_MS = 450;      // 太短丢弃
  const MAX_MS = 60_000;   // 最长 60s 自动停
  const STOP_GUARD = 1500; // iOS 有时 stop 不回调，用 guard 兜底

  function log(...args) { /* console.log("[voice]", ...args); */ }

  function safeId() {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch {}
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  function loadChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveChat(list) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(list));
  }

  function setBtnUI(mode) {
    // 不依赖 chat.js 的 setVoiceUI，直接控制按钮
    if (mode === "recording") {
      voiceBtn.classList.add("is-recording");
      voiceBtn.textContent = "松开结束";
    } else if (mode === "requesting") {
      voiceBtn.classList.add("is-recording");
      voiceBtn.textContent = "请求麦克风…";
    } else {
      voiceBtn.classList.remove("is-recording");
      voiceBtn.textContent = "按住说话";
    }
  }

  function pickMimeType() {
    // iOS Safari: audio/mp4 更稳；Chrome: webm/opus
    const cand = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    for (const t of cand) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function cleanup() {
    if (stopGuardTimer) {
      clearTimeout(stopGuardTimer);
      stopGuardTimer = null;
    }
    if (stream) {
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      stream = null;
    }
    recorder = null;
    chunks = [];
    startAt = 0;
    state = "idle";
    setBtnUI("idle");
  }

  async function blobToDataUrl(blob) {
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(String(fr.result || ""));
      fr.readAsDataURL(blob);
    });
  }

  function pushAudioMessage(dataUrl, durationMs) {
    const list = loadChat();
    const sec = Math.max(1, Math.round((durationMs || 0) / 1000));
    list.push({
      id: safeId(),
      role: "me",
      kind: "audio",
      dataUrl,
      durationMs: durationMs || 0,
      durationSec: sec,
      ts: Date.now()
    });
    saveChat(list);

    // 让 chat.js 立刻重绘（方案A需要 chat.js 加监听）
    try {
      window.dispatchEvent(new Event("grandma:chat:rerender"));
    } catch {}

    // 如果没加监听，也不至于丢；用户手动刷新也能看到
  }

  // --- 关键：统一 stop（多入口都能触发） ---
  async function stopRecording(reason) {
    if (state !== "recording") return;
    state = "stopping";
    log("stopRecording:", reason);

    // iOS 有时不会触发 onstop，做一个 guard
    stopGuardTimer = setTimeout(() => {
      log("stop guard fired");
      try {
        // 强行收尾：如果 recorder 还在，就尝试 stop；否则直接 cleanup
        if (recorder && recorder.state === "recording") recorder.stop();
        else cleanup();
      } catch {
        cleanup();
      }
    }, STOP_GUARD);

    try {
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      } else {
        cleanup();
      }
    } catch {
      cleanup();
    }
  }

  async function startRecording() {
    if (state !== "idle") return; // 防重复
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("当前浏览器不支持录音。建议用手机 Safari / Chrome，并确保 https。");
      return;
    }

    state = "requesting";
    setBtnUI("requesting");

    try {
      // iOS 建议加一些约束：echoCancellation 等
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      chunks = [];
      startAt = Date.now();

      const mimeType = pickMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = () => {
        cleanup();
        alert("录音出错了。请重试。");
      };

      recorder.onstop = async () => {
        // 这里是核心：无论任何 stop 入口，只要到 onstop 就结算
        if (stopGuardTimer) {
          clearTimeout(stopGuardTimer);
          stopGuardTimer = null;
        }

        const durationMs = Date.now() - startAt;
        const tooShort = durationMs < MIN_MS;

        try {
          if (!tooShort) {
            const type = recorder?.mimeType || "audio/mp4";
            const blob = new Blob(chunks, { type });
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl) pushAudioMessage(dataUrl, durationMs);
          }
        } finally {
          cleanup();
        }
      };

      recorder.start();
      state = "recording";
      setBtnUI("recording");

      // 最长自动停止，防卡死
      setTimeout(() => stopRecording("max-duration"), MAX_MS);
    } catch (err) {
      cleanup();
      alert("录音失败：请允许麦克风权限，并确保使用 https 或 localhost 打开网页。");
    }
  }

  // --- 事件绑定：iOS/PC 都稳 ---
  // 用 pointer 兼容鼠标 + 触屏
  voiceBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    // 防 iOS 长按弹菜单
    startRecording();
  });

  // 松手不在按钮上也要停：绑到 window
  window.addEventListener("pointerup", () => stopRecording("pointerup"), { passive: true });
  window.addEventListener("pointercancel", () => stopRecording("pointercancel"), { passive: true });

  // iOS 常见：页面切后台/锁屏导致卡住，必须停
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRecording("hidden");
  });

  // iOS：滚动/系统手势有时触发 touchend 不到 pointerup，再兜一层 touchend
  window.addEventListener("touchend", () => stopRecording("touchend"), { passive: true });
  window.addEventListener("touchcancel", () => stopRecording("touchcancel"), { passive: true });

  // 防止右键/长按菜单
  voiceBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  // 初始 UI
  setBtnUI("idle");
})();