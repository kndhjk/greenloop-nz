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
    const title = document.getElementById("item-title")?.value?.trim();
    const description = document.getElementById("item-description")?.value?.trim();
    const category = document.getElementById("item-category")?.value;
    const price = document.getElementById("item-price")?.value;
    if (!title) { GreenLoop.showToast("Please enter a title.", true); return; }
    if (!description) { GreenLoop.showToast("Please enter a description.", true); return; }
    if (!category) { GreenLoop.showToast("Please select a category.", true); return; }
    if (!price || isNaN(price) || Number(price) < 0) { GreenLoop.showToast("Please enter a valid price.", true); return; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Publishing…"; }
    try {
      const formElement = event.currentTarget;
      const formData = new FormData(formElement);
      const payload = Object.fromEntries(formData.entries());
      payload.images = [uploadedItemUrl || payload.imageUrl].filter(Boolean);
      payload.deliveryOptions = String(payload.deliveryOptions || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      payload.donationAvailable = formData.get("donationAvailable") === "on";
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
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "List item"; }
    }
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "List item"; }
    }
  });
};

boot().catch((error) => GreenLoop.showToast(error.message, true));