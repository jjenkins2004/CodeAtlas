const apiBase = "/api/v1";

const output = document.querySelector("#output");
const healthText = document.querySelector("#healthText");
const repoPathInput = document.querySelector("#repoPath");
const reposList = document.querySelector("#reposList");
const symbolsList = document.querySelector("#symbolsList");
const searchResults = document.querySelector("#searchResults");

function writeOutput(label, payload) {
  const formatted = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  output.textContent = `[${new Date().toLocaleTimeString()}] ${label}\n${formatted}`;
}

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function normalizeOptional(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }

  return body;
}

function renderRepositories(repositories) {
  if (!repositories.length) {
    reposList.innerHTML = '<p class="muted">No repositories tracked yet.</p>';
    return;
  }

  reposList.innerHTML = repositories
    .map(
      (repo) => `
      <article class="repo-item">
        <strong>${repo.name}</strong>
        <div><small>ID: ${repo.id}</small></div>
        <div><small>Path: ${repo.path}</small></div>
        <div class="row">
          <button data-action="start" data-id="${repo.id}" data-name="${repo.name}">Start</button>
          <button data-action="reindex" data-id="${repo.id}">Reindex</button>
          <button data-action="symbols" data-id="${repo.id}">Load Symbols</button>
          <button data-action="delete" data-id="${repo.id}" data-delete="false">Untrack</button>
          <button data-action="delete" data-id="${repo.id}" data-delete="true">Untrack + Delete Symbols</button>
        </div>
      </article>
    `,
    )
    .join("");
}

function renderSymbols(symbols) {
  if (!symbols.length) {
    symbolsList.innerHTML = '<p class="muted">No symbols found.</p>';
    return;
  }

  symbolsList.innerHTML = symbols
    .map(
      (symbol) => `
      <article class="symbol-item">
        <strong>${symbol.symbol}</strong>
        <div><small>ID: ${symbol.id}</small></div>
        <div><small>Repository: ${symbol.repositoryId}</small></div>
        <div><small>Type: ${symbol.type} | Visibility: ${symbol.visibility}</small></div>
        <div><small>Tags: ${(symbol.tags || []).join(", ") || "none"}</small></div>
        <div><small>Blurb: ${symbol.blurb || "n/a"}</small></div>
      </article>
    `,
    )
    .join("");
}

function renderSearch(items) {
  if (!items.length) {
    searchResults.innerHTML = '<p class="muted">No matches.</p>';
    return;
  }

  searchResults.innerHTML = items
    .map(
      (item) => `
      <article class="search-item">
        <strong>${item.symbol}</strong>
        <div><small>Symbol ID: ${item.id}</small></div>
        <div><small>Repository: ${item.repositoryId}</small></div>
        <div><small>Score: ${Number(item.score).toFixed(4)}</small></div>
        <div><small>Tags: ${(item.tags || []).join(", ") || "none"}</small></div>
      </article>
    `,
    )
    .join("");
}

async function refreshRepositories() {
  const repositories = await request("/repositories", { method: "GET" });
  renderRepositories(repositories);
  writeOutput("Repositories loaded", repositories);
}

async function loadSymbols(repositoryId, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (repositoryId) {
    params.set("repositoryId", repositoryId);
  }

  const symbols = await request(`/symbols?${params.toString()}`, { method: "GET" });
  renderSymbols(symbols);
  writeOutput("Symbols loaded", symbols);
}

document.querySelector("#healthBtn").addEventListener("click", async () => {
  try {
    const response = await fetch("/health");
    const body = await response.json();
    healthText.textContent = body.status;
    writeOutput("Health check", body);
  } catch (error) {
    healthText.textContent = "error";
    writeOutput("Health check failed", String(error));
  }
});

document.querySelector("#chooseFolderBtn").addEventListener("click", async () => {
  try {
    const result = await request("/system/select-folder", { method: "GET" });
    repoPathInput.value = result.path;
    writeOutput("Folder selected", result);
  } catch (error) {
    writeOutput("Folder selection failed", String(error));
  }
});

document.querySelector("#refreshReposBtn").addEventListener("click", () => {
  refreshRepositories().catch((error) => writeOutput("Refresh failed", String(error)));
});

document.querySelector("#repoForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = getFormData(form);

  try {
    const repository = await request("/repositories", {
      method: "POST",
      body: JSON.stringify({ name: body.name, path: body.path }),
    });
    writeOutput("Repository tracked", repository);
    await refreshRepositories();
  } catch (error) {
    writeOutput("Track repository failed", String(error));
  }
});

reposList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const id = button.dataset.id;
  const name = button.dataset.name;

  try {
    if (action === "start") {
      const result = await request("/repositories/start", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      writeOutput("Tracking started", result);
    }

    if (action === "reindex") {
      const subpath = window.prompt("Optional subpath to reindex (leave blank for all):", "") || "";
      const result = await request(`/repositories/${id}/reindex`, {
        method: "POST",
        body: JSON.stringify({ subpath: normalizeOptional(subpath) }),
      });
      writeOutput("Reindex requested", result);
    }

    if (action === "delete") {
      const shouldDelete = button.dataset.delete === "true";
      await request(`/repositories/${id}?delete=${shouldDelete ? "true" : "false"}`, {
        method: "DELETE",
      });
      writeOutput("Repository untracked", { id, deleteSymbols: shouldDelete });
      await refreshRepositories();
    }

    if (action === "symbols") {
      await loadSymbols(id, 100);
    }
  } catch (error) {
    writeOutput("Repository action failed", String(error));
  }
});

document.querySelector("#symbolsListForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = getFormData(form);
  const repositoryId = normalizeOptional(body.repositoryId);
  const limit = Number(body.limit) || 50;

  try {
    await loadSymbols(repositoryId, limit);
  } catch (error) {
    writeOutput("Load symbols failed", String(error));
  }
});

document.querySelector("#symbolGetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = getFormData(form);

  try {
    const symbol = await request(`/symbols/${body.id}`, { method: "GET" });
    writeOutput("Symbol fetched", symbol);
  } catch (error) {
    writeOutput("Fetch symbol failed", String(error));
  }
});

document.querySelector("#symbolDeleteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = getFormData(form);

  try {
    await request(`/symbols/${body.id}`, { method: "DELETE" });
    writeOutput("Symbol deleted", { id: body.id });
  } catch (error) {
    writeOutput("Delete symbol failed", String(error));
  }
});

document.querySelector("#upsertForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = getFormData(form);

  const payload = {
    repositoryId: body.repositoryId,
    symbol: body.symbol,
    file: body.file,
    type: body.type,
    visibility: body.visibility,
    blurb: normalizeOptional(body.blurb),
    implementation: normalizeOptional(body.implementation),
    tags: normalizeOptional(body.tags)
      ? body.tags
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : undefined,
  };

  try {
    const symbol = await request("/symbols", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    writeOutput("Symbol upserted", symbol);
  } catch (error) {
    writeOutput("Upsert symbol failed", String(error));
  }
});

document.querySelector("#searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = getFormData(form);

  const params = new URLSearchParams({
    q: String(body.q),
    limit: String(Number(body.limit) || 10),
  });

  const repositoryId = normalizeOptional(body.repositoryId);
  if (repositoryId) {
    params.set("repositoryId", repositoryId);
  }

  try {
    const results = await request(`/search/meaning?${params.toString()}`, {
      method: "GET",
    });
    renderSearch(results);
    writeOutput("Search results", results);
  } catch (error) {
    writeOutput("Search failed", String(error));
  }
});

refreshRepositories().catch((error) => writeOutput("Initial load failed", String(error)));
