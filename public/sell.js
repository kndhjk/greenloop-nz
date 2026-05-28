const mediaState = {
  imageFiles: [],
  videoFile: null,
};

const IMAGE_ONLY_LIMIT = 15;
const IMAGE_WITH_VIDEO_LIMIT = 3;

const validateMediaSelection = ({ imageFiles, videoFile, externalImageUrl = "" }) => {
  const imageCount = imageFiles.length + (externalImageUrl ? 1 : 0);
  if (videoFile && imageCount > IMAGE_WITH_VIDEO_LIMIT) {
    throw new Error("With a video attached, you can include up to 3 images.");
  }
  if (!videoFile && imageCount > IMAGE_ONLY_LIMIT) {
    throw new Error("You can upload up to 15 images.");
  }
};

const formatBytes = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const renderMediaPreview = () => {
  const preview = document.getElementById("item-media-preview");
  if (!preview) return;

  const cards = [
    ...mediaState.imageFiles.map(
      (file, index) => `
        <div class="item-media-card">
          <div class="item-media-thumb" style="background-image:url('${URL.createObjectURL(file)}')"></div>
          <div class="item-media-copy">
            <strong>Image ${index + 1}</strong>
            <span>${file.name}</span>
          </div>
        </div>
      `
    ),
  ];

  if (mediaState.videoFile) {
    cards.push(`
      <div class="item-media-card video">
        <div class="item-media-thumb item-media-thumb-video">VIDEO</div>
        <div class="item-media-copy">
          <strong>Video</strong>
          <span>${mediaState.videoFile.name} · ${formatBytes(mediaState.videoFile.size)}</span>
        </div>
      </div>
    `);
  }

  if (!cards.length) {
    preview.innerHTML = "";
    preview.classList.add("hidden");
    return;
  }

  preview.innerHTML = cards.join("");
  preview.classList.remove("hidden");
};

const uploadSingleFile = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const data = await GreenLoop.api("/api/uploads", {
    method: "POST",
    body: form,
  });
  return data.url;
};

const collectMediaUrls = async () => {
  const imageUrls = [];
  for (const file of mediaState.imageFiles) {
    imageUrls.push(await uploadSingleFile(file));
  }

  let videoUrls = [];
  if (mediaState.videoFile) {
    videoUrls = [await uploadSingleFile(mediaState.videoFile)];
  }

  return { imageUrls, videoUrls };
};

const boot = async () => {
  await GreenLoop.bootstrap({ protectedPage: true });

  document.getElementById("item-images")?.addEventListener("change", (event) => {
    mediaState.imageFiles = Array.from(event.currentTarget.files || []);
    try {
      validateMediaSelection({ imageFiles: mediaState.imageFiles, videoFile: mediaState.videoFile });
      renderMediaPreview();
    } catch (error) {
      event.currentTarget.value = "";
      mediaState.imageFiles = [];
      renderMediaPreview();
      GreenLoop.showToast(error.message, true);
    }
  });

  document.getElementById("item-video")?.addEventListener("change", (event) => {
    mediaState.videoFile = event.currentTarget.files?.[0] || null;
    try {
      validateMediaSelection({ imageFiles: mediaState.imageFiles, videoFile: mediaState.videoFile });
      renderMediaPreview();
    } catch (error) {
      event.currentTarget.value = "";
      mediaState.videoFile = null;
      renderMediaPreview();
      GreenLoop.showToast(error.message, true);
    }
  });

  GreenLoop.$("#publish-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submitButton = formElement.querySelector("button[type='submit']");

    try {
      const form = new FormData(formElement);
      const payload = Object.fromEntries(form.entries());
      validateMediaSelection({
        imageFiles: mediaState.imageFiles,
        videoFile: mediaState.videoFile,
        externalImageUrl: String(payload.imageUrl || "").trim(),
      });

      submitButton.disabled = true;
      submitButton.textContent = "Publishing...";

      const { imageUrls, videoUrls } = await collectMediaUrls();
      payload.images = [String(payload.imageUrl || "").trim(), ...imageUrls].filter(Boolean);
      payload.videos = videoUrls;
      payload.deliveryOptions = String(payload.deliveryOptions || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      payload.donationAvailable = form.get("donationAvailable") === "on";

      const result = await GreenLoop.api("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      formElement.reset();
      mediaState.imageFiles = [];
      mediaState.videoFile = null;
      renderMediaPreview();
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
