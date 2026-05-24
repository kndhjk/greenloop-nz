const renderQueue = (users) => {
  const target = document.getElementById("verification-list");
  if (!users.length) {
    target.innerHTML = '<p class="empty">No pending verification requests.</p>';
    return;
  }
  target.innerHTML = users
    .map(
      (user) => `
      <article class="data-row">
        <strong>${user.fullName}</strong>
        <span>${user.email} · ${user.schoolName} · ${user.studentId}</span>
        <div class="cta-row">
          <button class="queue-action" data-id="${user.id}" data-status="verified" type="button">Verify</button>
          <button class="ghost-button queue-action" data-id="${user.id}" data-status="rejected" type="button">Reject</button>
        </div>
      </article>
    `
    )
    .join("");

  document.querySelectorAll(".queue-action").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await GreenLoop.api(`/api/admin/users/${button.dataset.id}/verification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: button.dataset.status }),
        });
        GreenLoop.showToast(`User ${button.dataset.status}.`);
        await boot();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const boot = async () => {
  await GreenLoop.bootstrap({ protectedPage: true });
  const data = await GreenLoop.api("/api/admin/verification-queue");
  renderQueue(data.users || []);
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
