GreenLoop.bootstrap({ redirectAuthedTo: "/dashboard" });

GreenLoop.$("#forgot-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const data = await GreenLoop.api("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const allowLocalQaLink = Boolean(data.resetUrl) && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    document.getElementById("forgot-output").innerHTML = allowLocalQaLink
      ? `Reset email sent. Local QA link: <a href="${data.resetUrl}">${data.resetUrl}</a>`
      : (data.message || "If that account exists, a reset email is on the way.");
    GreenLoop.showToast("Reset email sent.");
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});
