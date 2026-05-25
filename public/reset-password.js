const params = new URLSearchParams(window.location.search);
const presetToken = params.get("token");
if (presetToken) {
  const tokenInput = document.getElementById("token");
  if (tokenInput) {
    tokenInput.value = presetToken;
    tokenInput.type = "hidden";
  }
  document.getElementById("token-hint")?.classList.add("hidden");
}

GreenLoop.$("#reset-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (payload.password !== payload.confirmPassword) {
      throw new Error("Passwords do not match.");
    }
    delete payload.confirmPassword;
    await GreenLoop.api("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    GreenLoop.showToast("Password updated.");
    window.location.href = "/login";
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});
