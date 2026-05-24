const PAGE_SIZE = 20;
let _allItems = [];
let _currentPage = 0;

const loadItems = async (params = {}) => {
  _currentPage = 0;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value) search.set(key, value); });
  const data = await GreenLoop.api("/api/items?" + search.toString());
  _allItems = data.items || [];
  GreenLoop.renderItems(_allItems.slice(0, PAGE_SIZE));
  _renderLoadMore();
};

const _renderLoadMore = () => {
  const oldBtn = document.getElementById("load-more-btn");
  if (oldBtn) oldBtn.remove();
  const remaining = _allItems.length - (_currentPage + 1) * PAGE_SIZE;
  if (remaining <= 0) return;
  const btn = document.createElement("button");
  btn.id = "load-more-btn";
  btn.className = "ghost-button";
  btn.type = "button";
  btn.style.cssText = "display:block;margin:16px auto;font-weight:700";
  btn.textContent = "Load more (" + remaining + " more)";
  btn.addEventListener("click", () => {
    _currentPage++;
    const nextItems = _allItems.slice(0, (_currentPage + 1) * PAGE_SIZE);
    GreenLoop.renderItems(nextItems);
    _renderLoadMore();
  });
  document.querySelector(".main-card")?.appendChild(btn);
};

const loadItems_ORIGINAL = async (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const data = await GreenLoop.api(`/api/items?${search.toString()}`);
  GreenLoop.renderItems(data.items || []);
};

const form = GreenLoop.$("#search-form");

const getInitialParams = () => {
  const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  if (params.cat && !params.category) params.category = params.cat;
  return params;
};

const applyParamsToForm = (params) => {
  if (!form) return;
  Object.entries(params).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
};

GreenLoop.bootstrap();
const initialParams = getInitialParams();
applyParamsToForm(initialParams);
loadItems(initialParams);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const params = Object.fromEntries(new FormData(event.currentTarget).entries());
    const nextSearch = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) nextSearch.set(key, value);
    });
    const nextUrl = nextSearch.toString() ? `${window.location.pathname}?${nextSearch.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
    await loadItems(params);
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});
