GreenLoop.bootstrap({ redirectAuthedTo: "/dashboard" });

const registerState = {
  pendingPayload: null,
  image: null,
  imageUrl: "",
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
};

const stage = document.getElementById("avatar-stage");
const image = document.getElementById("avatar-image");
const zoomInput = document.getElementById("avatar-zoom");
const previewCanvas = document.getElementById("avatar-preview-canvas");
const previewContext = previewCanvas?.getContext("2d");
const registerForm = document.getElementById("register-form");
const verifyPanel = document.getElementById("verify-panel");
const verifyEmailLabel = document.getElementById("verify-email-label");
const codeInput = document.getElementById("verification-code");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const drawAvatarPreview = () => {
  if (!previewContext) return;
  const size = previewCanvas.width;
  previewContext.clearRect(0, 0, size, size);
  previewContext.save();
  previewContext.beginPath();
  previewContext.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  previewContext.closePath();
  previewContext.clip();
  previewContext.fillStyle = "#f3f3f3";
  previewContext.fillRect(0, 0, size, size);

  if (registerState.image) {
    const baseScale = Math.max(size / registerState.image.width, size / registerState.image.height);
    const drawWidth = registerState.image.width * baseScale * registerState.scale;
    const drawHeight = registerState.image.height * baseScale * registerState.scale;
    const dx = (size - drawWidth) / 2 + registerState.offsetX * (size / 280);
    const dy = (size - drawHeight) / 2 + registerState.offsetY * (size / 280);
    previewContext.drawImage(registerState.image, dx, dy, drawWidth, drawHeight);
  }

  previewContext.restore();
};

const renderStage = () => {
  if (!stage || !image) return;
  if (!registerState.image) {
    image.classList.add("hidden");
    drawAvatarPreview();
    return;
  }
  image.classList.remove("hidden");
  const stageSize = stage.clientWidth || 280;
  const baseScale = Math.max(stageSize / registerState.image.width, stageSize / registerState.image.height);
  const renderScale = baseScale * registerState.scale;
  image.style.width = `${registerState.image.width}px`;
  image.style.height = `${registerState.image.height}px`;
  image.style.transform = `translate(-50%, -50%) translate(${registerState.offsetX}px, ${registerState.offsetY}px) scale(${renderScale})`;
  drawAvatarPreview();
};

const exportAvatarDataUrl = () => {
  if (!registerState.image || !previewCanvas) return "";
  drawAvatarPreview();
  return previewCanvas.toDataURL("image/png", 0.92);
};

const setPendingState = (payload) => {
  registerState.pendingPayload = payload;
  verifyEmailLabel.textContent = payload.email;
  verifyPanel.classList.remove("hidden");
  codeInput.value = "";
  codeInput.focus();
};

const uploadAvatarFile = (file) =>
  new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, url: fileReader.result });
      img.onerror = () => reject(new Error("Could not load avatar image."));
      img.src = fileReader.result;
    };
    fileReader.onerror = () => reject(new Error("Could not read avatar file."));
    fileReader.readAsDataURL(file);
  });

const startRegistration = async () => {
  const form = new FormData(registerForm);
  const payload = Object.fromEntries(form.entries());
  if (payload.password !== payload.confirmPassword) {
    throw new Error("Passwords do not match.");
  }
  if (!payload.terms) {
    throw new Error("You must accept the onboarding terms.");
  }
  delete payload.confirmPassword;
  delete payload.terms;
  payload.avatarDataUrl = exportAvatarDataUrl();
  await GreenLoop.api("/api/auth/register/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  setPendingState(payload);
  GreenLoop.showToast(`Verification code sent to ${payload.email}.`);
};

const verifyRegistration = async () => {
  if (!registerState.pendingPayload) {
    throw new Error("Start registration first.");
  }
  const code = String(codeInput.value || "").trim();
  if (code.length !== 6) {
    throw new Error("Enter the 6-digit verification code.");
  }
  const data = await GreenLoop.api("/api/auth/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: registerState.pendingPayload.email,
      code,
    }),
  });
  GreenLoop.setSession(data);
  GreenLoop.showToast("Registration complete. Welcome email sent.");
  window.location.href = "/dashboard";
};

zoomInput?.addEventListener("input", () => {
  registerState.scale = Number(zoomInput.value || 1);
  renderStage();
});

document.getElementById("avatar-input")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const { img, url } = await uploadAvatarFile(file);
    registerState.image = img;
    registerState.imageUrl = url;
    registerState.scale = 1;
    registerState.offsetX = 0;
    registerState.offsetY = 0;
    zoomInput.value = "1";
    renderStage();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});

stage?.addEventListener("pointerdown", (event) => {
  if (!registerState.image) return;
  registerState.dragging = true;
  registerState.dragStartX = event.clientX - registerState.offsetX;
  registerState.dragStartY = event.clientY - registerState.offsetY;
  stage.setPointerCapture(event.pointerId);
});

stage?.addEventListener("pointermove", (event) => {
  if (!registerState.dragging) return;
  const nextX = event.clientX - registerState.dragStartX;
  const nextY = event.clientY - registerState.dragStartY;
  registerState.offsetX = clamp(nextX, -180, 180);
  registerState.offsetY = clamp(nextY, -180, 180);
  renderStage();
});

const stopDragging = (event) => {
  if (!registerState.dragging) return;
  registerState.dragging = false;
  if (event && stage?.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }
};

stage?.addEventListener("pointerup", stopDragging);
stage?.addEventListener("pointercancel", stopDragging);
window.addEventListener("resize", renderStage);

const regSubmitBtn = registerForm?.querySelector('button[type="submit"]');
registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (regSubmitBtn) { regSubmitBtn.disabled = true; regSubmitBtn.textContent = "Sending…"; }
  try {
    await startRegistration();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  } finally {
    if (regSubmitBtn) { regSubmitBtn.disabled = false; regSubmitBtn.textContent = "Register"; }
  }
});

const verifySubmitBtn = document.getElementById("verify-submit");
document.getElementById("verify-submit")?.addEventListener("click", async () => {
  if (verifySubmitBtn) { verifySubmitBtn.disabled = true; verifySubmitBtn.textContent = "Verifying…"; }
  try {
    await verifyRegistration();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  } finally {
    if (verifySubmitBtn) { verifySubmitBtn.disabled = false; verifySubmitBtn.textContent = "Verify"; }
  }
});

document.getElementById("verify-resend")?.addEventListener("click", async () => {
  try {
    if (!registerState.pendingPayload) {
      throw new Error("Fill the registration form first.");
    }
    await GreenLoop.api("/api/auth/register/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerState.pendingPayload),
    });
    GreenLoop.showToast("Verification code resent.");
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});

codeInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("verify-submit")?.click();
  }
});

drawAvatarPreview();
