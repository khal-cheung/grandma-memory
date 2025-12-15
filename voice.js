/* voice.js — 按住说话（发到同一个聊天框，防重复写入）
   需要：
   - #voiceBtn 按住说话按钮
   - chat.js 使用同一个 localStorage key：grandma_chat_diary_v1
*/

(function () {
  // ===== 防止脚本被加载两次 =====
  if (window.__GRANDMA_VOICE_INITED__) return;
  window.__GRANDMA_VOICE_INITED__ = true;

  const CHAT_KEY = "grandma_chat_diary_v1";
  const VOICE_BTN_ID = "voiceBtn";
  const MAX_SECONDS = 60;

  function loadChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveChat(list) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(list));
  }
  function uuid() {
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  }
  function secondsClamp(n) {
    const s = Math.max(1, Math.round(n || 1));
    return Math.min(MAX_SECONDS, s);
  }
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  function tryRerender() {
    if (typeof window.renderChat === "function") window.renderChat();
    window.dispatchEvent(new CustomEvent("grandma:chat-updated"));
  }

  function pickMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    for (const t of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
    }
    return "";
  }

  // ===== 状态 =====
  let stream = null;
  let recorder = null;
  let chunks = [];
  let startedAt = 0;
  let stopTimer = null;

  let isPressing = false;
  let isRecording = false;
  let stopLocked = false;

  function setBtnState(btn, state) {
    if (!btn) return;
    if (state === "recording") {
      btn.textContent = "松开 结束";
      btn.classList.add("is-recording");
      btn.dataset.state = "recording";
    } else {
      btn.textContent = "按住说话";
      btn.classList.remove("is-recording");
      btn.dataset.state = "idle";
    }
  }

  async function ensureStream() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  }

  async function startRecording(btn, pointerId) {
    if (isRecording) return;

    try {
      await ensureStream();
    } catch (e) {
      setBtnState(btn, "idle");
      alert("未获得麦克风权限：请在浏览器设置中允许麦克风。");
      return;
    }

    chunks = [];
    startedAt = Date.now();

    const mimeType = pickMimeType();
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (e) {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.start(100);
    isRecording = true;

    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => stopOnce(false), MAX_SECONDS * 1000);

    // 关键：捕获指针，这样就算手指移出按钮，pointerup 仍然会回来，不需要 pointerleave
    try { btn.setPointerCapture?.(pointerId); } catch {}
    setBtnState(btn, "recording");
  }

  async function stopRecordingAndSend(cancel) {
    if (!isRecording || !recorder) return;

    clearTimeout(stopTimer);

    const durationSec = secondsClamp((Date.now() - startedAt) / 1000);

    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    try { recorder.stop(); } catch (e) {}
    await stopped;

    isRecording = false;

    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    chunks = [];
    recorder = null;

    if (cancel) return;

    const dataUrl = await blobToDataURL(blob);

    const list = loadChat();
    list.push({
      id: uuid(),
      role: "me",
      kind: "voice",
      audio: dataUrl,
      dur: durationSec,
      ts: Date.now(),
    });
    saveChat(list);
    tryRerender();
  }

  async function stopOnce(cancel) {
    if (!isPressing) return;

    // 关键：同一次录音 stop 只允许执行一次
    if (stopLocked) return;
    stopLocked = true;

    isPressing = false;

    const btn = document.getElementById(VOICE_BTN_ID);
    setBtnState(btn, "idle");

    try {
      await stopRecordingAndSend(cancel);
    } finally {
      setTimeout(() => { stopLocked = false; }, 350);
    }
  }

  function onDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isPressing || isRecording) return;
    isPressing = true;
    stopLocked = false;

    const btn = e.currentTarget;
    startRecording(btn, e.pointerId);
  }

  function onUp(e) {
    e.preventDefault();
    e.stopPropagation();
    stopOnce(false);
  }

  function onCancel(e) {
    e.preventDefault();
    e.stopPropagation();
    stopOnce(true);
  }

  function init() {
    let btn = document.getElementById(VOICE_BTN_ID);
    if (!btn) {
      console.warn("[voice.js] 找不到 #voiceBtn");
      return;
    }

    // 必杀：克隆替换按钮，清掉旧的所有监听（避免你之前绑定了 touch/mouse 造成重复）
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    btn = fresh;

    setBtnState(btn, "idle");
    btn.style.touchAction = "none";
    btn.style.userSelect = "none";
    btn.style.webkitUserSelect = "none";

    // 只绑定 pointer 三件套（不绑定 pointerleave）
    btn.addEventListener("pointerdown", onDown, { passive: false });
    btn.addEventListener("pointerup", onUp, { passive: false });
    btn.addEventListener("pointercancel", onCancel, { passive: false });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopOnce(true);
    });
  }

  init();
})();