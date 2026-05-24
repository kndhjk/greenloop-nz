const initCarousel = () => {
  const track = document.getElementById("carousel-track");
  const dotsWrap = document.getElementById("carousel-dots");
  const slides = Array.from(document.querySelectorAll(".carousel-slide"));
  const nextButton = document.getElementById("carousel-next");
  const prevButton = document.getElementById("carousel-prev");
  if (!track || !dotsWrap || !slides.length) return;

  let index = 0;
  let timer = null;

  const render = () => {
    track.style.transform = `translateX(-${index * 100}%)`;
    dotsWrap.querySelectorAll(".carousel-dot").forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
    });
  };

  const goTo = (nextIndex) => {
    index = (nextIndex + slides.length) % slides.length;
    render();
  };

  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => goTo(index + 1), 5200);
  };

  slides.forEach((_, dotIndex) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `carousel-dot${dotIndex === 0 ? " active" : ""}`;
    dot.setAttribute("aria-label", `Go to slide ${dotIndex + 1}`);
    dot.addEventListener("click", () => {
      goTo(dotIndex);
      restart();
    });
    dotsWrap.appendChild(dot);
  });

  nextButton?.addEventListener("click", () => {
    goTo(index + 1);
    restart();
  });

  prevButton?.addEventListener("click", () => {
    goTo(index - 1);
    restart();
  });

  render();
  restart();
};

const loadHomeData = async () => {
  try {
    const [itemsData, statsData] = await Promise.all([
      GreenLoop.api("/api/items"),
      fetch("/api/stats").then((response) => response.json()).catch(() => ({})),
    ]);

    GreenLoop.renderItems((itemsData.items || []).slice(0, 3), "home-featured-items");

    const cards = [
      { id: "metric-market-items", value: String((itemsData.items || []).length).padStart(2, "0") },
      { id: "metric-seek-jobs", value: statsData.total || 0 },
      { id: "metric-top-location", value: statsData.top_locations?.[0]?.location || "NZ-wide" },
      { id: "metric-top-company", value: statsData.top_companies?.[0]?.company || "Campus sellers" },
    ];

    cards.forEach(({ id, value }) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    });
  } catch (error) {
    const featured = document.getElementById("home-featured-items");
    if (featured) {
      featured.innerHTML = '<p class="empty">Featured picks will appear here once the feed refreshes.</p>';
    }
  }
};

GreenLoop.bootstrap();
initCarousel();
loadHomeData();
