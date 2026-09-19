const chatEl = document.getElementById("chat");
const emptyState = document.getElementById("emptyState");
const composer = document.getElementById("composer");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

const cameraBtn = document.getElementById("cameraBtn");
const fileInput = document.getElementById("fileInput");
const cameraOverlay = document.getElementById("cameraOverlay");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const cameraError = document.getElementById("cameraError");
const cameraShutter = document.getElementById("cameraShutter");
const cameraCancel = document.getElementById("cameraCancel");
const cameraSwitch = document.getElementById("cameraSwitch");

const previewBar = document.getElementById("imagePreviewBar");
const previewThumb = document.getElementById("imagePreviewThumb");
const removeImageBtn = document.getElementById("removeImageBtn");

let history = []; // { role: "user" | "assistant", content, image? }
let pendingImage = null; // { data, mimeType, previewUrl }
let cameraStream = null;
let facingMode = "environment";

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + "px";
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

newChatBtn.addEventListener("click", () => {
  history = [];
  chatEl.innerHTML = "";
  chatEl.appendChild(emptyState);
  emptyState.classList.remove("hidden");
  clearPendingImage();
});

function renderMessage(role, content, imageUrl, isError = false) {
  emptyState.classList.add("hidden");
  const div = document.createElement("div");
  div.className = `msg ${role}${isError ? " error" : ""}`;

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.className = "attached-photo";
    div.appendChild(img);
  }
  if (content) {
    const textNode = document.createElement("div");
    textNode.textContent = content;
    div.appendChild(textNode);
  }
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function renderTyping() {
  const div = document.createElement("div");
  div.className = "msg assistant typing";
  div.id = "typingIndicator";
  div.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text && !pendingImage) return;

  const imageForSend = pendingImage
    ? { data: pendingImage.data, mimeType: pendingImage.mimeType }
    : undefined;
  const previewUrl = pendingImage ? pendingImage.previewUrl : null;

  renderMessage("user", text, previewUrl);

  const userMsg = { role: "user", content: text };
  if (imageForSend) userMsg.image = imageForSend;
  history.push(userMsg);

  userInput.value = "";
  userInput.style.height = "auto";
  clearPendingImage();
  sendBtn.disabled = true;
  renderTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    removeTyping();

    if (!res.ok || data.error) {
      renderMessage("assistant", data.error || "Something went wrong.", null, true);
    } else {
      renderMessage("assistant", data.reply);
      history.push({ role: "assistant", content: data.reply });
    }
  } catch (err) {
    removeTyping();
    renderMessage("assistant", "Network error. Server run aaguthaa nu check pannu.", null, true);
  } finally {
    sendBtn.disabled = false;
  }
});

function setPendingImage(dataUrl, mimeType) {
  const base64 = dataUrl.split(",")[1];
  pendingImage = { data: base64, mimeType, previewUrl: dataUrl };
  previewThumb.src = dataUrl;
  previewBar.classList.remove("hidden");
}

function clearPendingImage() {
  pendingImage = null;
  previewBar.classList.add("hidden");
  previewThumb.src = "";
  fileInput.value = "";
}

removeImageBtn.addEventListener("click", clearPendingImage);

cameraBtn.addEventListener("click", openCamera);
cameraCancel.addEventListener("click", closeCamera);

async function openCamera() {
  cameraOverlay.classList.remove("hidden");
  cameraError.classList.add("hidden");
  await startStream();
}

async function startStream() {
  stopStream();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraFallback();
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    cameraVideo.classList.remove("hidden");
    cameraShutter.classList.remove("hidden");
    cameraSwitch.classList.remove("hidden");
  } catch (err) {
    showCameraFallback(err);
  }
}

function showCameraFallback(err) {
  cameraError.textContent =
    "Camera access panna mudiyala (permission illa / camera illa). Device camera app-a directly thirakkirom...";
  cameraError.classList.remove("hidden");
  cameraShutter.classList.add("hidden");
  cameraSwitch.classList.add("hidden");
  setTimeout(() => {
    closeCamera();
    fileInput.click();
  }, 900);
}

function stopStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

function closeCamera() {
  stopStream();
  cameraOverlay.classList.add("hidden");
}

cameraSwitch.addEventListener("click", () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  startStream();
});

cameraShutter.addEventListener("click", () => {
  const w = cameraVideo.videoWidth;
  const h = cameraVideo.videoHeight;
  if (!w || !h) return;
  cameraCanvas.width = w;
  cameraCanvas.height = h;
  const ctx = cameraCanvas.getContext("2d");
  ctx.drawImage(cameraVideo, 0, 0, w, h);
  const dataUrl = cameraCanvas.toDataURL("image/jpeg", 0.85);
  setPendingImage(dataUrl, "image/jpeg");
  closeCamera();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setPendingImage(reader.result, file.type || "image/jpeg");
  reader.readAsDataURL(file);
});
