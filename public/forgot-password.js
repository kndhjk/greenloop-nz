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
    document.getElementById("forgot-output").innerHTML = data.resetUrl
      ? `Reset email sent. QA link: <a href="${data.resetUrl}">${data.resetUrl}</a>`
      : data.message;
    GreenLoop.showToast("Reset email sent.");
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});
