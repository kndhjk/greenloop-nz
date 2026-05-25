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

  GreenLoop.$("#publish-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submitButton = document.getElementById("publish-button");
    try {
      const form = new FormData(formElement);
      const payload = Object.fromEntries(form.entries());
      payload.title = String(payload.title || "").trim();
      payload.location = String(payload.location || "").trim();
      payload.category = String(payload.category || "").trim().toLowerCase();
      payload.conditionStatus = String(payload.conditionStatus || "").trim().toLowerCase();
      payload.images = [uploadedItemUrl || String(payload.imageUrl || "").trim()].filter(Boolean);
      payload.deliveryOptions = String(payload.deliveryOptions || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      payload.donationAvailable = form.get("donationAvailable") === "on";
      if (payload.title.length < 4) {
        throw new Error("Title needs at least 4 characters.");
      }
      if (String(payload.description || "").trim().length < 20) {
        throw new Error("Description is too short. Add condition, defects, and pickup details.");
      }
      if (!payload.images.length) {
        throw new Error("Add at least one product photo or image URL before publishing.");
      }
      if (!Number.isFinite(Number(payload.price)) || Number(payload.price) < 0) {
        throw new Error("Price must be zero or higher.");
      }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Publishing...";
      }
      const result = await GreenLoop.api("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (formElement && typeof formElement.reset === "function") {
        formElement.reset();
      }
      uploadedItemUrl = "";
      GreenLoop.showToast("Listing published.");
      setTimeout(() => {
        window.location.href = `/item?id=${result.id}`;
      }, 500);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Publish listing";
      }
    }
  });
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
