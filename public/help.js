const supportBoot = async () => {
  let currentUser = null;
  try {
    currentUser = await GreenLoop.bootstrap();
  } catch (_) {}

  if (currentUser) {
    const fullName = document.getElementById("support-full-name");
    const email = document.getElementById("support-email");
    if (fullName) fullName.value = currentUser.fullName || "";
    if (email) email.value = currentUser.email || "";
  }

  document.getElementById("support-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = document.getElementById("support-submit");
    try {
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Sending...";
      }
      const payload = Object.fromEntries(new FormData(form).entries());
      const data = await GreenLoop.api("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      form.reset();
      GreenLoop.showToast(`Support request sent. If needed, follow up via ${data.supportEmail}.`);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Send support request";
      }
    }
  });
};

supportBoot().catch((error) => GreenLoop.showToast(error.message, true));
