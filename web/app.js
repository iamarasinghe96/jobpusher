/**
 * Job Pusher - Frontend App
 *
 * Reads jobs from ../output/jobs.json and renders a filterable, searchable
 * job board with AI match scores and a full JD modal.
 *
 * To serve locally:
 *   cd /path/to/jobpusher
 *   python -m http.server 8080
 *   Then open http://localhost:8080/web/
 */

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
const state = {
  jobs: [],
  filtered: [],
  minScore: 65,
  locationFilter: "all",
  sourceFilter: "all",
  searchQuery: "",
  sortBy: "match_score",
  selectedJob: null,
};

// ─────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────
const $grid        = document.getElementById("jobsGrid");
const $loading     = document.getElementById("loadingPanel");
const $empty       = document.getElementById("emptyPanel");
const $error       = document.getElementById("errorPanel");
const $noResults   = document.getElementById("noResultsPanel");
const $errorMsg    = document.getElementById("errorMessage");
const $slider      = document.getElementById("scoreSlider");
const $scoreDisp   = document.getElementById("scoreDisplay");
const $search      = document.getElementById("searchInput");
const $sort        = document.getElementById("sortSelect");
const $totalCount  = document.getElementById("totalCount");
const $matchedCount= document.getElementById("matchedCount");
const $lastUpdated = document.getElementById("lastUpdated");
const $backdrop    = document.getElementById("modalBackdrop");
const $modal       = document.getElementById("modal");
const $toast       = document.getElementById("toast");

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadJobs();
  setupEventListeners();
});

// ─────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────
async function loadJobs() {
  showPanel($loading);

  try {
    // Try relative path (serving from web/ folder)
    let response = await fetch("../output/jobs.json");
    if (!response.ok) {
      // Fallback: try same folder (if user copies jobs.json)
      response = await fetch("./jobs.json");
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    state.jobs = data.jobs || [];

    // Update header stats
    $totalCount.textContent  = state.jobs.length;
    $lastUpdated.textContent = data.meta?.last_updated_display || "—";

    if (state.jobs.length === 0) {
      showPanel($empty);
      return;
    }

    applyFilters();
  } catch (err) {
    $errorMsg.textContent = `Could not load jobs.json: ${err.message}. ` +
      "Run the pipeline first, then serve with: python -m http.server 8080";
    showPanel($error);
  }
}

// ─────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────
function setupEventListeners() {
  // Score slider
  $slider.addEventListener("input", () => {
    state.minScore = parseInt($slider.value, 10);
    updateSliderStyle();
    $scoreDisp.textContent = `${state.minScore}%`;
    applyFilters();
  });

  // Location tabs
  document.getElementById("locationTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    setActiveTab("locationTabs", btn);
    state.locationFilter = btn.dataset.location;
    applyFilters();
  });

  // Source tabs
  document.getElementById("sourceTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    setActiveTab("sourceTabs", btn);
    state.sourceFilter = btn.dataset.source;
    applyFilters();
  });

  // Search
  let searchTimer;
  $search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = $search.value.toLowerCase().trim();
      applyFilters();
    }, 250);
  });

  // Sort
  $sort.addEventListener("change", () => {
    state.sortBy = $sort.value;
    applyFilters();
  });

  // Refresh button
  document.getElementById("btnRefresh").addEventListener("click", () => {
    state.jobs = [];
    loadJobs();
  });

  // Modal close
  document.getElementById("modalClose").addEventListener("click", closeModal);
  $backdrop.addEventListener("click", (e) => {
    if (e.target === $backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Copy JD button
  document.getElementById("btnCopyJD").addEventListener("click", copyJD);
}

// ─────────────────────────────────────────────
// Filtering & sorting
// ─────────────────────────────────────────────
function applyFilters() {
  let jobs = [...state.jobs];

  // 1. Score filter
  jobs = jobs.filter(j => (j.match_score || 0) >= state.minScore);

  // 2. Location filter
  if (state.locationFilter !== "all") {
    jobs = jobs.filter(j => {
      const grp = (j.location_group || "").toLowerCase();
      if (state.locationFilter === "remote") {
        return grp === "remote" || (j.job_type || "").toLowerCase().includes("remote");
      }
      return grp === state.locationFilter;
    });
  }

  // 3. Source filter
  if (state.sourceFilter !== "all") {
    jobs = jobs.filter(j =>
      (j.source || "").toLowerCase().includes(state.sourceFilter)
    );
  }

  // 4. Search
  if (state.searchQuery) {
    const q = state.searchQuery;
    jobs = jobs.filter(j =>
      (j.title     || "").toLowerCase().includes(q) ||
      (j.company   || "").toLowerCase().includes(q) ||
      (j.location  || "").toLowerCase().includes(q) ||
      (j.description || "").toLowerCase().includes(q)
    );
  }

  // 5. Sort
  jobs.sort((a, b) => {
    if (state.sortBy === "match_score") {
      return (b.match_score || 0) - (a.match_score || 0);
    } else if (state.sortBy === "date_posted") {
      return new Date(b.date_posted || 0) - new Date(a.date_posted || 0);
    } else if (state.sortBy === "company") {
      return (a.company || "").localeCompare(b.company || "");
    }
    return 0;
  });

  state.filtered = jobs;
  $matchedCount.textContent = jobs.length;

  renderGrid();
}

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────
function renderGrid() {
  hideAllPanels();

  if (state.filtered.length === 0) {
    if (state.jobs.length === 0) {
      showPanel($empty);
    } else {
      showPanel($noResults);
    }
    return;
  }

  $grid.style.display = "";
  $grid.innerHTML = state.filtered.map(job => renderCard(job)).join("");

  // Attach click handlers
  $grid.querySelectorAll(".job-card").forEach(card => {
    card.addEventListener("click", () => {
      const jobId = card.dataset.jobId;
      const job = state.jobs.find(j => String(j.job_id) === jobId || j.url === jobId);
      if (job) openModal(job);
    });
  });
}

function renderCard(job) {
  const score     = job.match_score || 0;
  const scoreClass = scoreToClass(score);
  const scoreColor = scoreToColor(score);
  const sourceBadge = renderSourceBadge(job.source);
  const regionBadge = renderRegionBadge(job.location_group);
  const typeBadge   = job.job_type
    ? `<span class="badge badge--type">${escHtml(job.job_type)}</span>`
    : "";

  const matched = parseList(job.matched_skills);
  const kwChips = matched.slice(0, 4).map(s =>
    `<span class="kw-chip">${escHtml(s)}</span>`
  ).join("");

  const dateStr = formatDate(job.date_posted);

  // Use URL as fallback ID for lookup
  const lookupKey = job.job_id || job.url;

  return `
    <div class="job-card" data-job-id="${escHtml(String(lookupKey))}"
         style="--score-color: ${scoreColor}">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-title">${escHtml(job.title || "Untitled")}</div>
          <div class="card-company">${escHtml(job.company || "")}</div>
        </div>
        <div class="score-bubble ${scoreClass}">
          <span class="score-num">${score}</span>
          <span class="score-pct">%</span>
        </div>
      </div>
      <div class="card-meta">
        <span class="meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          ${escHtml(job.location || "—")}
        </span>
        ${dateStr ? `<span class="meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          ${dateStr}
        </span>` : ""}
        ${job.salary ? `<span class="meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          ${escHtml(job.salary)}
        </span>` : ""}
      </div>
      <div class="card-badges">
        ${sourceBadge}${regionBadge}${typeBadge}
      </div>
      ${kwChips ? `<div class="card-keywords">${kwChips}</div>` : ""}
    </div>
  `;
}

// ─────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────
function openModal(job) {
  state.selectedJob = job;

  const score = job.match_score || 0;
  const scoreClass = scoreToClass(score);
  const scoreColor = scoreToColor(score);

  // Header
  document.getElementById("modalTitle").textContent   = job.title || "Untitled";
  document.getElementById("modalCompany").textContent = job.company || "";
  document.getElementById("modalLocation").textContent= job.location || "";
  document.getElementById("modalDate").textContent    = formatDate(job.date_posted) || "";

  // Badges
  const badges = [
    renderSourceBadge(job.source),
    renderRegionBadge(job.location_group),
    job.job_type ? `<span class="badge badge--type">${escHtml(job.job_type)}</span>` : "",
  ].join("");
  document.getElementById("modalBadges").innerHTML = badges;

  // Score ring
  const ring = document.getElementById("modalScoreRing");
  ring.textContent = score;
  ring.className = `score-ring ${scoreClass}`;
  ring.style.color  = scoreColor;
  ring.style.borderColor = scoreColor;

  // Match details
  const matched  = parseList(job.matched_skills);
  const missing  = parseList(job.missing_skills);
  const summary  = job.match_summary || "";

  document.getElementById("matchedSkills").innerHTML = matched
    .map(s => `<span class="skill-chip skill-chip--match">${escHtml(s)}</span>`)
    .join("") || "<span style='color:var(--gray-400);font-size:.8rem'>—</span>";

  document.getElementById("missingSkills").innerHTML = missing
    .map(s => `<span class="skill-chip skill-chip--missing">${escHtml(s)}</span>`)
    .join("") || "<span style='color:var(--gray-400);font-size:.8rem'>—</span>";

  document.getElementById("matchSummary").textContent = summary;

  // Match details visibility
  const hasDetails = matched.length || missing.length || summary;
  document.getElementById("matchDetails").style.display = hasDetails ? "" : "none";

  // Job description
  document.getElementById("jdContent").innerHTML = renderDescription(job.description || "No description available.");

  // Apply link
  document.getElementById("btnApply").href = job.url || "#";

  // Reset copy button
  const $copyBtn = document.getElementById("btnCopyJD");
  $copyBtn.classList.remove("copied");
  $copyBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg> Copy JD`;

  $backdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $backdrop.classList.add("hidden");
  document.body.style.overflow = "";
  state.selectedJob = null;
}

function copyJD() {
  if (!state.selectedJob) return;

  const job   = state.selectedJob;
  const title = job.title || "";
  const company = job.company || "";
  const loc   = job.location || "";
  const url   = job.url || "";
  const desc  = job.description || "";

  const text = `${title}\n${company} — ${loc}\n${url}\n\n${desc}`;

  navigator.clipboard.writeText(text).then(() => {
    const $btn = document.getElementById("btnCopyJD");
    $btn.classList.add("copied");
    $btn.innerHTML = `✓ Copied!`;
    showToast("Job description copied to clipboard!");
    setTimeout(() => {
      $btn.classList.remove("copied");
      $btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg> Copy JD`;
    }, 2000);
  }).catch(() => {
    // Fallback for non-https contexts
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity  = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("Copied!");
  });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function scoreToClass(score) {
  if (score >= 85) return "score--excellent";
  if (score >= 70) return "score--good";
  if (score >= 50) return "score--moderate";
  return "score--low";
}

function scoreToColor(score) {
  if (score >= 85) return "#15803d";
  if (score >= 70) return "#1d4ed8";
  if (score >= 50) return "#c2410c";
  return "#9ca3af";
}

function renderSourceBadge(source) {
  const s = (source || "").toLowerCase();
  const labels = {
    linkedin: "LinkedIn",
    indeed: "Indeed",
    seek: "Seek",
    glassdoor: "Glassdoor",
  };
  const label = labels[s] || source || "Unknown";
  return `<span class="badge badge--source-${s}">${escHtml(label)}</span>`;
}

function renderRegionBadge(group) {
  const map = {
    albury_region:  ["Albury Region", "albury"],
    vline_corridor: ["Vline Corridor", "vline"],
    melbourne:      ["Melbourne", "melbourne"],
    remote:         ["Remote", "remote"],
  };
  const [label, cls] = map[group] || ["Other", "other"];
  return `<span class="badge badge--region-${cls}">${label}</span>`;
}

function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Comma-separated string fallback
    return String(val).split(",").map(s => s.trim()).filter(Boolean);
  }
}

function renderDescription(text) {
  if (!text) return "<em>No description available.</em>";

  // If it looks like HTML, render it
  if (/<[a-z][\s\S]*>/i.test(text)) {
    // Sanitise: strip script/style tags but keep formatting
    const clean = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");
    return clean;
  }

  // Plain text: convert newlines to <br> and basic markdown
  return escHtml(text)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/^<\/p><p>/, "")
    .replace(/<p>$/, "");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const now  = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff  < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setActiveTab(groupId, activeBtn) {
  document.getElementById(groupId).querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("tab-btn--active");
  });
  activeBtn.classList.add("tab-btn--active");
}

function updateSliderStyle() {
  const pct = state.minScore;
  $slider.style.background =
    `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--gray-200) ${pct}%, var(--gray-200) 100%)`;
}

function showPanel(panel) {
  hideAllPanels();
  panel.classList.remove("hidden");
  $grid.style.display = "none";
}

function hideAllPanels() {
  [$loading, $empty, $error, $noResults].forEach(p => p.classList.add("hidden"));
  $grid.style.display = "";
}

function showToast(message) {
  $toast.textContent = message;
  $toast.classList.remove("hidden");
  setTimeout(() => $toast.classList.add("hidden"), 2500);
}
