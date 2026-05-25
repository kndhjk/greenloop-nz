let uploadedItemUrl = "";

const uploadFile = async (input) => {
  const file = input.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: GreenLoop.state.token ? { Authorization: `Bearer ${GreenLoop.state.token}` } : {},
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Upload failed.");
  uploadedItemUrl = data.url;
  GreenLoop.showToast("Image uploaded.");
  const preview = document.getElementById("sell-image-preview");
  if (preview && uploadedItemUrl) {
    preview.src = uploadedItemUrl;
    preview.style.display = "block";
    preview.style.maxWidth = "200px";
    preview.style.borderRadius = "8px";
    preview.style.marginTop = "8px";
  }
};

const boot = async () => {
  await GreenLoop.bootstrap({ protectedPage: true });
  GreenLoop.$("#item-upload")?.addEventListener("change", async (event) => {
    try {
      await uploadFile(event.currentTarget);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });

  const form = GreenLoop.$("#publish-form");
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    try {
      const formData = new FormData(formElement);
      const payload = Object.fromEntries(formData.entries());
      payload.title = String(payload.title || "").trim();
      payload.description = String(payload.description || "").trim();
      payload.location = String(payload.location || "").trim();
      payload.category = String(payload.category || "").trim().toLowerCase();
      payload.conditionStatus = String(payload.conditionStatus || "").trim().toLowerCase();
      payload.images = [uploadedItemUrl || String(payload.imageUrl || "").trim()].filter(Boolean);
      payload.deliveryOptions = String(payload.deliveryOptions || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      payload.donationAvailable = formData.get("donationAvailable") === "on";
      if (payload.title.length < 4) {
        throw new Error("Title needs at least 4 characters.");
      }
      if (payload.description.length < 20) {
        throw new Error("Description is too short. Add condition, defects, and pickup details.");
      }
      if (!payload.category) {
        throw new Error("Choose a category.");
      }
      if (!payload.images.length) {
        throw new Error("Add at least one product photo or image URL before publishing.");
      }
      if (!Number.isFinite(Number(payload.price)) || Number(payload.price) < 0) {
        throw new Error("Price must be zero or higher.");
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Publishing...";
      }
      const result = await GreenLoop.api("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      formElement.reset();
      uploadedItemUrl = "";
      const preview = document.getElementById("sell-image-preview");
      if (preview) { preview.style.display = "none"; }
      GreenLoop.showToast("Listing published.");
      setTimeout(() => { window.location.href = `/item?id=${result.id}`; }, 500);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Publish listing";
      }
    }
  });
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
