/* voice.js — 点击一次开始录音，再点一次停止（Safari 友好）
   需要：
   #voiceBtn
   #voiceStatus
   #voicePreview (audio)
*/

(function () {
  const btn = document.getElementById("voiceBtn");
  const statusEl = document.getElementById("voiceStatus");
  const preview = document.getElementById("voicePreview");

  if (!btn || !statusEl || !preview) {
    console.warn("[voice.js] 缺少元素：voiceBtn / voiceStatus / voicePreview");
    return;
  }

  let stream = null;
  let recorder = null;
  let chunks = [];
  let recording = false;

  function setStatus(t) {
    statusEl.textContent = t || "";
  }

  function cleanupStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function pickMimeType() {
    const candidates = [
      "audio/mp4",                 // Safari 常见
      "audio/webm;codecs=opus",    // Chrome 常见
      "audio/webm",
    ];
    for (const t of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
    }
    return "";
  }

  async function start() {
    if (recording) return;

    btn.disabled = true;
    try {
      preview.pause();
      preview.removeAttribute("src");
      preview.style.display = "none";

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();

      chunks = [];
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = (e) => {
        console.error("[voice.js] recorder error:", e);
        setStatus("录音出错了，请刷新后再试");
        recording = false;
        btn.textContent = "点一下开始录音";
        cleanupStream();
      };

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
          const url = URL.createObjectURL(blob);

          preview.src = url;
          preview.style.display = "block";
          setStatus("录音已停止：可播放预览（本地保存不上传）");
        } finally {
          // 关键：停止后释放麦克风，否则会一直“卡录音”
          cleanupStream();
          recorder = null;
          chunks = [];
        }
      };

      recorder.start();
      recording = true;
      btn.textContent = "停止录音";
      setStatus("正在录音…再次点击停止");
    } catch (err) {
      console.error("[voice.js] getUserMedia failed:", err);
      setStatus("无法打开麦克风：请在浏览器允许麦克风权限");
      cleanupStream();
    } finally {
      btn.disabled = false;
    }
  }

  function stop() {
    if (!recording) return;

    recording = false;
    btn.textContent = "点一下开始录音";
    setStatus("正在处理录音…");

    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      else cleanupStream();
    } catch (e) {
      console.error("[voice.js] stop error:", e);
      cleanupStream();
      setStatus("停止录音失败：请刷新再试");
    }
  }

  btn.addEventListener("click", () => {
    if (!recording) start();
    else stop();
  });

  window.addEventListener("beforeunload", () => {
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {}
    cleanupStream();
  });

  btn.textContent = "点一下开始录音";
  setStatus("");
})();