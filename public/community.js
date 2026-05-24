const formatCommunityTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const escapeCommunityHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderCommunityAuthor = (author) => GreenLoop.renderSellerBadge({
  fullName: author.fullName,
  schoolName: author.schoolName,
  verificationStatus: author.verificationStatus,
  avatarUrl: author.avatarUrl || "",
});

const renderCommunityFeed = (posts, currentUser) => {
  const target = document.getElementById("community-feed");
  document.getElementById("community-stat-posts").textContent = String(posts.length);
  if (!posts.length) {
    target.innerHTML = '<div class="chat-empty-panel"><h3>No posts yet.</h3><p>The first useful post sets the tone. Make it specific.</p></div>';
    return;
  }

  target.innerHTML = posts
    .map((post) => {
      const canDelete = currentUser && (Number(currentUser.id) === Number(post.author.id) || currentUser.isAdmin);
      return `
        <article class="data-row community-post-card">
          <div class="community-post-head">
            <div>${renderCommunityAuthor(post.author)}</div>
            <div class="community-post-meta">
              ${post.topic ? `<span class="pill">${escapeCommunityHtml(post.topic)}</span>` : ""}
              <small>${formatCommunityTime(post.createdAt)}</small>
            </div>
          </div>
          <p class="community-post-body">${escapeCommunityHtml(post.body)}</p>
          ${post.imageUrl ? `<img class="community-post-image" src="${escapeCommunityHtml(post.imageUrl)}" alt="Community post image" />` : ""}
          <div class="community-post-actions">
            <a class="ghost-link" href="/chat">Reply in chat</a>
            <a class="ghost-link" href="/marketplace">Browse listings</a>
            ${canDelete ? `<button class="ghost-button community-delete" data-id="${post.id}" type="button">Delete</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  target.querySelectorAll(".community-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await GreenLoop.api(`/api/community/posts/${button.dataset.id}`, { method: "DELETE" });
        GreenLoop.showToast("Post deleted.");
        await bootCommunity();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const bootCommunity = async () => {
  const currentUser = await GreenLoop.bootstrap();
  const data = await GreenLoop.api("/api/community/posts");
  renderCommunityFeed(data.posts || [], currentUser);
  if (currentUser) {
    GreenLoop.api("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "community_feed_view", entityType: "page", metadata: { path: "/community" } }),
    }).catch(() => {});
  }
};

document.getElementById("community-compose")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await GreenLoop.requireAuth();
    await GreenLoop.api("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: document.getElementById("post-topic").value,
        imageUrl: document.getElementById("post-image").value,
        body: document.getElementById("post-body").value,
      }),
    });
    document.getElementById("post-topic").value = "";
    document.getElementById("post-image").value = "";
    document.getElementById("post-body").value = "";
    GreenLoop.showToast("Posted to community.");
    await bootCommunity();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});

bootCommunity().catch((error) => GreenLoop.showToast(error.message, true));
