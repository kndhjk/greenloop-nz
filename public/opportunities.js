const opportunityState = {
  currentUser: null,
  opportunities: [],
  selectedOpportunityId: null,
  uploadedCvUrl: "",
};

const opportunityEsc = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const uploadOpportunityCv = async (input) => {
  const file = input.files?.[0];
  if (!file) return "";
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: GreenLoop.state.token ? { Authorization: `Bearer ${GreenLoop.state.token}` } : {},
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "CV upload failed.");
  opportunityState.uploadedCvUrl = data.url || "";
  GreenLoop.showToast("CV uploaded.");
  return opportunityState.uploadedCvUrl;
};

const renderCampusOpportunities = (items) => {
  const target = document.getElementById("gl-opportunities");
  const countNode = document.getElementById("gl-count");
  if (!target) return;
  if (countNode) countNode.textContent = String(items.length);
  if (!items.length) {
    target.innerHTML = '<div class="empty-state"><h3>No listings yet</h3><p>Nothing has been posted yet.</p></div>';
    return;
  }

  target.innerHTML = items
    .map((item) => `
      <article class="gl-card">
        <div style="flex:1">
          <h3>${opportunityEsc(item.title || "Untitled")}</h3>
          <p>${opportunityEsc(item.org_name || "")} · ${opportunityEsc(item.opportunity_type || "")} · ${opportunityEsc(item.location || "")}</p>
          <p style="font-size:12px;color:#888;margin:4px 0">${opportunityEsc((item.summary || "").slice(0, 180))}</p>
          ${(item.skills || []).length ? `<p style="font-size:11px;color:#999">Skills: ${(item.skills || []).map(opportunityEsc).join(", ")}</p>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <button class="apply-btn opportunity-apply-trigger" data-id="${item.id}" type="button">Apply now</button>
          ${item.apply_url ? `<a href="${opportunityEsc(item.apply_url)}" target="_blank" rel="noopener" class="apply-link">External link ↗</a>` : ""}
        </div>
      </article>
    `)
    .join("");

  target.querySelectorAll(".opportunity-apply-trigger").forEach((button) => {
    button.addEventListener("click", () => openOpportunityApply(Number(button.dataset.id)));
  });
};

const loadCampusOpportunities = async () => {
  const data = await fetch("/api/opportunities").then((response) => response.json());
  opportunityState.opportunities = data.opportunities || [];
  renderCampusOpportunities(opportunityState.opportunities);
};

const openOpportunityApply = async (opportunityId) => {
  if (!GreenLoop.state.token) {
    window.location.href = "/login";
    return;
  }

  if (!opportunityState.currentUser) {
    opportunityState.currentUser = await GreenLoop.bootstrap({ protectedPage: true });
  }

  const dialog = document.getElementById("opportunity-apply-dialog");
  const titleNode = document.getElementById("opportunity-apply-title");
  const form = document.getElementById("opportunity-apply-form");
  if (!dialog || !titleNode || !form) return;

  const item = opportunityState.opportunities.find((entry) => Number(entry.id) === Number(opportunityId));
  opportunityState.selectedOpportunityId = opportunityId;
  titleNode.textContent = item?.title || "Opportunity";
  form.applicantName.value = opportunityState.currentUser?.fullName || "";
  form.applicantEmail.value = opportunityState.currentUser?.email || "";
  form.applicantPhone.value = "";
  form.coverMessage.value = "";
  opportunityState.uploadedCvUrl = "";
  const cvInput = document.getElementById("opportunity-cv-upload");
  if (cvInput) cvInput.value = "";
  dialog.showModal();
};

const wireOpportunityPostForm = () => {
  const panel = document.getElementById("opportunity-admin-panel");
  const form = document.getElementById("opportunity-post-form");
  const button = document.getElementById("opportunity-post-button");
  if (!panel || !form || !button) return;

  if (opportunityState.currentUser?.isAdmin) {
    panel.style.display = "block";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Posting...";
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.skills = String(payload.skills || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await GreenLoop.api("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      form.reset();
      GreenLoop.showToast("Opportunity posted.");
      await loadCampusOpportunities();
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Post opportunity";
    }
  });
};

const wireOpportunityApplyForm = () => {
  const form = document.getElementById("opportunity-apply-form");
  const button = document.getElementById("opportunity-apply-button");
  const uploadInput = document.getElementById("opportunity-cv-upload");
  const dialog = document.getElementById("opportunity-apply-dialog");
  const closeButton = document.getElementById("opportunity-apply-close");
  if (!form || !button) return;

  uploadInput?.addEventListener("change", async (event) => {
    try {
      await uploadOpportunityCv(event.currentTarget);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Sending...";
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.opportunityId = opportunityState.selectedOpportunityId;
      payload.cvUrl = opportunityState.uploadedCvUrl;
      await GreenLoop.api("/api/opportunity-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      GreenLoop.showToast("Application sent.");
      dialog?.close();
      form.reset();
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Send application";
    }
  });

  closeButton?.addEventListener("click", () => dialog?.close());
};

(async () => {
  try {
    opportunityState.currentUser = await GreenLoop.bootstrap();
  } catch (_) {}

  wireOpportunityPostForm();
  wireOpportunityApplyForm();

  try {
    await loadCampusOpportunities();
  } catch (_) {}
})();
