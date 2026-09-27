(() => {
  "use strict";

  const state = {
    files: {},
    data: null
  };

  const $ = (id) => document.getElementById(id);

  const upload = $("letterboxdUpload");
  const dropzone = $("dropzone");
  const status = $("uploadStatus");
  const emptyState = $("emptyState");
  const dashboard = $("dashboard");
  const resetButton = $("resetButton");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }

    if (cell.length || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }

    if (!rows.length) return [];

    const headers = rows[0].map(h => h.trim());
    return rows.slice(1)
      .filter(r => r.some(v => String(v).trim() !== ""))
      .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function number(value) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function year(value) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function average(values) {
    return values.length
      ? values.reduce((sum, n) => sum + n, 0) / values.length
      : 0;
  }

  function countBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function decade(y) {
    return Number.isFinite(y) ? `${Math.floor(y / 10) * 10}s` : null;
  }

  function topEntries(entries, limit = 8) {
    return entries.slice(0, limit);
  }

  function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }

  function formatRating(value) {
    return `${Number(value).toFixed(2)}★`;
  }

  function plural(value, singular, pluralForm = `${singular}s`) {
    return `${formatNumber(value)} ${value === 1 ? singular : pluralForm}`;
  }

  function makeRatingBuckets(ratings) {
    const values = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    return values.map(value => ({
      value,
      count: ratings.filter(r => r === value).length
    }));
  }

  function buildProfile(files) {
    const ratings = files.ratings || [];
    const watched = files.watched || [];
    const diary = files.diary || [];
    const reviews = files.reviews || [];
    const watchlist = files.watchlist || [];
    const profileRows = files.profile || [];
    const likesFilms = files.likesFilms || [];

    const ratingValues = ratings
      .map(r => number(r.Rating))
      .filter(Number.isFinite);

    const ratingFilms = ratings.map(r => ({
      title: r.Name,
      year: year(r.Year),
      rating: number(r.Rating),
      date: r.Date,
      uri: r["Letterboxd URI"]
    })).filter(f => f.title);

    const watchedFilms = watched.map(r => ({
      title: r.Name,
      year: year(r.Year),
      date: r.Date,
      uri: r["Letterboxd URI"]
    })).filter(f => f.title);

    const ratingByTitle = new Map(
      ratingFilms.map(f => [normalizeName(f.title), f])
    );

    const watchOnly = watchedFilms.filter(f => !ratingByTitle.has(normalizeName(f.title)));

    const yearCounts = countBy(ratingFilms.filter(f => f.year), f => String(f.year));
    const decadeCounts = countBy(ratingFilms.filter(f => f.year), f => decade(f.year));
    const decadeRatings = {};
    for (const film of ratingFilms) {
      if (!film.year || film.rating == null) continue;
      const d = decade(film.year);
      decadeRatings[d] ||= [];
      decadeRatings[d].push(film.rating);
    }

    const decadeStats = Object.entries(decadeRatings)
      .map(([name, values]) => ({ name, count: values.length, average: average(values) }))
      .sort((a, b) => b.count - a.count || b.average - a.average);

    const ratingDistribution = makeRatingBuckets(ratingValues);

    const watchDates = watchedFilms.map(f => parseDate(f.date)).filter(Boolean);
    const ratingDates = ratingFilms.map(f => parseDate(f.date)).filter(Boolean);
    const watchedYears = countBy(watchedFilms.map(f => parseDate(f.date)).filter(Boolean), d => String(d.getFullYear()));
    const ratedYears = countBy(ratingFilms.map(f => parseDate(f.date)).filter(Boolean), d => String(d.getFullYear()));

    const highRated = ratingFilms
      .filter(f => f.rating != null)
      .sort((a, b) => b.rating - a.rating || (b.year || 0) - (a.year || 0));

    const lowRated = [...highRated].sort((a, b) => a.rating - b.rating || (b.year || 0) - (a.year || 0));

    const profile = profileRows[0] || {};

    const stats = {
      watched: watchedFilms.length,
      rated: ratingFilms.length,
      average: average(ratingValues),
      median: median(ratingValues),
      fiveStar: ratingValues.filter(r => r === 5).length,
      fourFivePlus: ratingValues.filter(r => r >= 4.5).length,
      fourPlus: ratingValues.filter(r => r >= 4).length,
      threeFivePlus: ratingValues.filter(r => r >= 3.5).length,
      twoOrLess: ratingValues.filter(r => r <= 2).length,
      twoFiveOrLess: ratingValues.filter(r => r <= 2.5).length,
      oneOrLess: ratingValues.filter(r => r <= 1).length,
      watchlist: watchlist.length,
      diary: diary.length,
      reviews: reviews.length,
      likesFilms: likesFilms.length,
      watchOnly: watchOnly.length,
      uniqueRatedTitles: new Set(ratingFilms.map(f => normalizeName(f.title))).size,
      uniqueWatchedTitles: new Set(watchedFilms.map(f => normalizeName(f.title))).size
    };

    const dateRange = (dates) => {
      if (!dates.length) return null;
      const sorted = [...dates].sort((a, b) => a - b);
      return { first: sorted[0], last: sorted[sorted.length - 1] };
    };

    const insights = [];
    if (stats.rated) {
      const highShare = stats.fourFivePlus / stats.rated;
      const lowShare = stats.twoOrLess / stats.rated;
      if (highShare < 0.1) {
        insights.push(`You are selective with high ratings: only ${formatNumber(highShare * 100, 1)}% of rated films reached 4.5★ or higher.`);
      }
      if (lowShare >= 0.2) {
        insights.push(`You don't hesitate to rate films low: ${formatNumber(lowShare * 100, 1)}% of your rated films received 2★ or less.`);
      }
      if (stats.fiveStar <= 10) {
        insights.push(`Your 5★ club is small: only ${stats.fiveStar} films earned a perfect rating.`);
      }
    }

    if (decadeStats.length) {
      const mostWatched = decadeStats.slice().sort((a, b) => b.count - a.count)[0];
      const strongest = decadeStats.slice().sort((a, b) => b.average - a.average)[0];
      insights.push(`Your most-watched release era is the ${mostWatched.name}, with ${plural(mostWatched.count, "film")}.`);
      if (strongest && strongest.name !== mostWatched.name) {
        insights.push(`Your highest-average release era is the ${strongest.name}, at ${formatRating(strongest.average)} across ${plural(strongest.count, "film")}.`);
      }
    }

    if (watchedYears.length >= 2) {
      const busiest = watchedYears[0];
      insights.push(`Your busiest Letterboxd activity year in the export is ${busiest[0]}, with ${plural(busiest[1], "film")}.`);
    }

    if (watchlist.length) {
      insights.push(`You currently have ${plural(watchlist.length, "film")} on your Letterboxd watchlist.`);
    }

    const releaseYears = ratingFilms.map(f => f.year).filter(Number.isFinite).sort((a, b) => a - b);

    return {
      profile,
      stats,
      ratingFilms,
      watchedFilms,
      watchOnly,
      diary,
      reviews,
      watchlist,
      ratingDistribution,
      yearCounts,
      decadeCounts,
      decadeStats,
      watchedYears,
      ratedYears,
      highRated,
      lowRated,
      releaseRange: releaseYears.length ? { first: releaseYears[0], last: releaseYears[releaseYears.length - 1] } : null,
      activityRange: dateRange(watchDates.length ? watchDates : ratingDates),
      insights
    };
  }

  function renderMetric(id, value, label, suffix = "") {
    $(id).innerHTML = `<strong>${escapeHtml(value)}${escapeHtml(suffix)}</strong><span>${escapeHtml(label)}</span>`;
  }

  function renderDashboard(data) {
    const { stats } = data;

    renderMetric("metricFilms", formatNumber(stats.watched), "FILMS WATCHED");
    renderMetric("metricRated", formatNumber(stats.rated), "FILMS RATED");
    renderMetric("metricAverage", Number(stats.average).toFixed(2), "AVERAGE RATING", "★");
    renderMetric("metricElite", formatNumber(stats.fourFivePlus), "4.5★+ FILMS");

    $("dnaHeadline").textContent = data.profile.GivenName
      ? `${data.profile.GivenName}'s Film DNA`
      : "Your Film DNA";

    $("dnaSubline").textContent = stats.rated
      ? `Built locally from ${formatNumber(stats.rated)} rated films in your Letterboxd export.`
      : "Built locally from your Letterboxd export.";

    $("fiveStarCount").textContent = stats.fiveStar;
    $("fourPlusCount").textContent = stats.fourPlus;
    $("twoLessCount").textContent = stats.twoOrLess;
    $("watchlistCount").textContent = stats.watchlist;
    $("diaryCount").textContent = stats.diary;
    $("reviewCount").textContent = stats.reviews;

    renderRatingChart(data.ratingDistribution);
    renderDecades(data.decadeStats);
    renderYears(data.yearCounts);
    renderTopFilms(data.highRated.slice(0, 10), "topFilms");
    renderTopFilms(data.lowRated.slice(0, 8), "lowFilms");
    renderInsights(data.insights);
    renderRecords(data);

    emptyState.hidden = true;
    dashboard.hidden = false;
    dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderRatingChart(buckets) {
    const max = Math.max(...buckets.map(b => b.count), 1);
    $("ratingChart").innerHTML = buckets.map(b => `
      <div class="bar-row">
        <div class="bar-label">${b.value.toFixed(1)}★</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(b.count / max) * 100}%"></div></div>
        <div class="bar-count">${b.count}</div>
      </div>
    `).join("");
  }

  function renderDecades(decades) {
    const max = Math.max(...decades.map(d => d.count), 1);
    $("decadeChart").innerHTML = decades.map(d => `
      <div class="decade-row">
        <div class="decade-label">${escapeHtml(d.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.count / max) * 100}%"></div></div>
        <div class="decade-value">${d.count} · ${d.average.toFixed(2)}★</div>
      </div>
    `).join("");
  }

  function renderYears(years) {
    const entries = years.slice(0, 10);
    $("yearList").innerHTML = entries.map(([name, count], index) => `
      <div class="rank-item">
        <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="rank-name">${escapeHtml(name)}</span>
        <strong>${count}</strong>
      </div>
    `).join("");
  }

  function renderTopFilms(films, id) {
    $(id).innerHTML = films.map((film, index) => `
      <div class="film-row">
        <span class="film-rank">${String(index + 1).padStart(2, "0")}</span>
        <div class="film-main">
          <strong>${escapeHtml(film.title)}</strong>
          <span>${film.year ?? "—"}</span>
        </div>
        <span class="film-rating">${film.rating?.toFixed(1) ?? "—"}★</span>
      </div>
    `).join("");
  }

  function renderInsights(insights) {
    $("insights").innerHTML = insights.map(text => `
      <div class="insight-card">${escapeHtml(text)}</div>
    `).join("");
  }

  function renderRecords(data) {
    const release = data.releaseRange;
    const activity = data.activityRange;
    $("recordRelease").textContent = release ? `${release.first} → ${release.last}` : "—";
    $("recordActivity").textContent = activity
      ? `${activity.first.toLocaleDateString("en-GB", { month: "short", year: "numeric" })} → ${activity.last.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
      : "—";
    $("recordWatchOnly").textContent = formatNumber(data.watchOnly.length);
    $("recordUnique").textContent = formatNumber(data.stats.uniqueRatedTitles);
  }

  async function readZip(file) {
    if (!window.JSZip) {
      throw new Error("The ZIP reader is unavailable. Please reload the page and try again.");
    }

    const zip = await JSZip.loadAsync(file);
    const output = {};

    for (const path of Object.keys(zip.files)) {
      if (zip.files[path].dir) continue;
      const base = path.split("/").pop().toLowerCase();
      if (!base.endsWith(".csv")) continue;

      const text = await zip.files[path].async("text");
      const rows = parseCSV(text);

      if (path === "ratings.csv") output.ratings = rows;
      else if (path === "watched.csv") output.watched = rows;
      else if (path === "diary.csv") output.diary = rows;
      else if (path === "reviews.csv") output.reviews = rows;
      else if (path === "watchlist.csv") output.watchlist = rows;
      else if (path === "profile.csv") output.profile = rows;
      else if (path === "likes/films.csv") output.likesFilms = rows;
    }

    return output;
  }

  async function processFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".zip")) {
      setStatus("Please choose your Letterboxd .zip export.", true);
      return;
    }

    try {
      setStatus("Reading your Letterboxd export locally…");
      upload.disabled = true;
      const files = await readZip(file);

      if (!files.ratings && !files.watched) {
        throw new Error("This ZIP does not contain the expected Letterboxd ratings.csv or watched.csv file.");
      }

      state.files = files;
      state.data = buildProfile(files);
      renderDashboard(state.data);
      setStatus("Analysis complete — your data was processed in this browser.");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Something went wrong while reading the export.", true);
    } finally {
      upload.disabled = false;
    }
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function reset() {
    state.files = {};
    state.data = null;
    upload.value = "";
    dashboard.hidden = true;
    emptyState.hidden = false;
    setStatus("Your export is processed locally. Nothing is uploaded by this page.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  upload.addEventListener("change", () => processFile(upload.files[0]));
  resetButton.addEventListener("click", reset);

  ["dragenter", "dragover"].forEach(type => {
    dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach(type => {
    dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });

  dropzone.addEventListener("drop", event => {
    const file = event.dataTransfer.files[0];
    processFile(file);
  });
})();
