GreenLoop.bootstrap({ redirectAuthedTo: "/dashboard" });

const loginSubmitBtn = GreenLoop.$("#login-form")?.querySelector('button[type="submit"]');
GreenLoop.$("#login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginSubmitBtn) { loginSubmitBtn.disabled = true; loginSubmitBtn.textContent = "Logging in…"; }
  try {
    const form = new FormData(event.currentTarget);
    const data = await GreenLoop.api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    GreenLoop.setSession(data);
    GreenLoop.showToast("Login successful.");
    window.location.href = "/dashboard";
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  } finally {
    if (loginSubmitBtn) { loginSubmitBtn.disabled = false; loginSubmitBtn.textContent = "Log in"; }
  }
});
